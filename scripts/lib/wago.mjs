// wago.tools client: the datamined client database tables (DB2, as CSV) and
// raw client files (by FileDataID) of a given World of Warcraft build, with
// every download cached on disk so a rebuild only refetches what is missing.

import fs from "node:fs";
import path from "node:path";

const UA = "peligaming data build (https://github.com/peligwen/peligaming)";

export class Wago {
  constructor(build, cacheDir) {
    this.build = build;
    this.cacheDir = cacheDir;
    fs.mkdirSync(path.join(cacheDir, "db2"), { recursive: true });
    fs.mkdirSync(path.join(cacheDir, "casc"), { recursive: true });
  }

  async fetchWithRetry(url, tries = 4) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw lastErr;
  }

  // One table as an array of row objects keyed by column name.
  async table(name) {
    const file = path.join(this.cacheDir, "db2", `${name}.${this.build}.csv`);
    if (!fs.existsSync(file)) {
      const buf = await this.fetchWithRetry(`https://wago.tools/db2/${name}/csv?build=${this.build}`);
      const text = buf.toString("utf8");
      if (text.startsWith("{")) throw new Error(`wago.tools has no table ${name} for build ${this.build}: ${text.slice(0, 120)}`);
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
