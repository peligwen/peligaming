// wago.tools client: the datamined client database tables (DB2, as CSV) and
// raw client files (by FileDataID) of a given World of Warcraft build, with
// every download cached on disk so a rebuild only refetches what is missing.

import fs from "node:fs";
import path from "node:path";

// The site's rules for automated clients are its robots.txt and llms.txt:
// take data from the structured routes — the CSV export of a table
// (/db2/{table}/csv), the API (/api/...) — and never from its web pages
// (the DB2 browser, its paginated tables and its diff pages are closed to
// crawlers); pin an exact version; reuse a download rather than ask for it
// again; and record the product and version with the results. This client
// uses only those routes. Beyond the rules it behaves like a considerate
// one: it says who it is, fetches one thing at a time, leaves a gap between
// requests, backs off on 429/5xx, and caches every download so a rebuild of
// the same build touches the network only for what is missing.
const UA = "peligaming-map-build/1.0 (+https://github.com/peligwen/peligaming)";
const GAP_MS = 250;
let lastRequest = 0;

export class Wago {
  // `agent` names the build that is asking, when it is not the map's
  constructor(build, cacheDir, agent = UA) {
    this.build = build;
    this.cacheDir = cacheDir;
    this.agent = agent;
    fs.mkdirSync(path.join(cacheDir, "db2"), { recursive: true });
    fs.mkdirSync(path.join(cacheDir, "casc"), { recursive: true });
  }

  async fetchWithRetry(url, tries = 4) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      const wait = lastRequest + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequest = Date.now();
      try {
        const res = await fetch(url, { headers: { "User-Agent": this.agent } });
        if (res.status === 429 || res.status >= 500) {
          const after = Number(res.headers.get("retry-after")) || 0;
          throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { backoff: Math.max(after * 1000, 4000 * (i + 1)) });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, e.backoff || 1500 * (i + 1)));
      }
    }
    throw lastErr;
  }

  // The product (release channel) a build belongs to — "wowf" is Forever,
  // "wow_classic_era" Classic Era — from the site's build list, which is
  // refetched only when it does not know the build.
  async product(build = this.build) {
    const file = path.join(this.cacheDir, "builds.json");
    const find = () => {
      if (!fs.existsSync(file)) return null;
      for (const [product, list] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) if (list.some((b) => b.version === build)) return product;
      return null;
    };
    let product = find();
    if (!product) { fs.writeFileSync(file, await this.fetchWithRetry("https://wago.tools/api/builds")); product = find(); }
    return product;
  }

  // One table as an array of row objects keyed by column name; `build`
  // reads the same table from another build (a Classic Era one, to compare).
  async table(name, build = this.build) {
    const file = path.join(this.cacheDir, "db2", `${name}.${build}.csv`);
    if (!fs.existsSync(file)) {
      const buf = await this.fetchWithRetry(`https://wago.tools/db2/${name}/csv?build=${build}`);
      const text = buf.toString("utf8");
      if (text.startsWith("{")) throw new Error(`wago.tools has no table ${name} for build ${build}: ${text.slice(0, 120)}`);
      fs.writeFileSync(file, text);
    }
    return parseCsv(fs.readFileSync(file, "utf8"));
  }

  // One client file by FileDataID, as a Buffer.
  async file(fdid) {
    const file = path.join(this.cacheDir, "casc", `${fdid}.blp`);
    if (!fs.existsSync(file)) {
      const buf = await this.fetchWithRetry(`https://wago.tools/api/casc/${fdid}?version=${this.build}`);
      if (buf.length < 16) throw new Error(`empty file ${fdid}`);
      fs.writeFileSync(file, buf);
    }
    return fs.readFileSync(file);
  }
}

// RFC 4180-ish CSV: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {};
    header.forEach((k, i) => { o[k] = r[i]; });
    return o;
  });
}
