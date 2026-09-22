// Force-directed edge bundling (Holten & van Wijk, 2009).
//
// Straight edges that run roughly the same way are pulled together into
// shared cables, then fan out to their own endpoints — the way a tidy
// wiring loom or a transit map treats parallel routes. Each edge is
// subdivided, and every subdivision point feels a spring toward its
// neighbours along its own edge and an attraction toward the matching
// point of every compatible edge. Compatibility is the product of four
// measures (angle, length, position and visibility) so edges that cross
// at right angles, or sit far apart, leave each other alone.
//
// bundleEdges([[x0,y0,x1,y1], ...], opts) -> [[[x,y], ...], ...]
// with the endpoints kept exactly where they were.

const len = (e) => Math.hypot(e[2] - e[0], e[3] - e[1]);
const mid = (e) => [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2];
const vec = (e) => [e[2] - e[0], e[3] - e[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function project(p, e) {
  // p projected onto the line through e
  const [vx, vy] = vec(e), L2 = vx * vx + vy * vy || 1;
  const t = ((p[0] - e[0]) * vx + (p[1] - e[1]) * vy) / L2;
  return [e[0] + t * vx, e[1] + t * vy];
}
function visibility(P, Q) {
  const i0 = project([Q[0], Q[1]], P), i1 = project([Q[2], Q[3]], P);
  const im = [(i0[0] + i1[0]) / 2, (i0[1] + i1[1]) / 2];
  const d = dist(i0, i1);
  return d ? Math.max(1 - (2 * dist(mid(P), im)) / d, 0) : 0;
}
function compatibility(P, Q) {
  const lp = len(P), lq = len(Q), lavg = (lp + lq) / 2;
  const [px, py] = vec(P), [qx, qy] = vec(Q);
  const angle = Math.abs((px * qx + py * qy) / (lp * lq || 1));
  const scale = 2 / (lavg / Math.min(lp, lq) + Math.max(lp, lq) / lavg);
  const position = lavg / (lavg + dist(mid(P), mid(Q)));
  const vis = Math.min(visibility(P, Q), visibility(Q, P));
  return { c: angle * scale * position * vis, flip: px * qx + py * qy < 0 };
}

export function bundleEdges(edges, opts = {}) {
  const K = opts.stiffness ?? 0.1;         // global spring constant
  const meanLen = edges.reduce((s, e) => s + len(e), 0) / (edges.length || 1);
  let S = opts.step ?? 0.004 * meanLen;    // initial step size, in the edges' own units
  let I = opts.iterations ?? 90;           // iterations in the first cycle
  const C = opts.cycles ?? 6;
  const threshold = opts.threshold ?? 0.6;
  let P = opts.subdivisions ?? 1;
  const n = edges.length;
  // compatible pairs
  const compat = edges.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const { c, flip } = compatibility(edges[i], edges[j]);
    if (c >= threshold) { compat[i].push({ j, flip }); compat[j].push({ j: i, flip }); }
  }
  // subdivision points, endpoints included
  let pts = edges.map((e) => [[e[0], e[1]], [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2], [e[2], e[3]]]);
  const resample = (line, count) => {
    // count interior points, evenly spaced along the polyline
    const total = line.reduce((s, p, i) => (i ? s + dist(line[i - 1], p) : 0), 0);
    const out = [line[0]];
    let seg = 0, acc = 0;
    for (let k = 1; k <= count; k++) {
      const target = (total * k) / (count + 1);
      while (seg < line.length - 2 && acc + dist(line[seg], line[seg + 1]) < target) { acc += dist(line[seg], line[seg + 1]); seg++; }
      const d = dist(line[seg], line[seg + 1]) || 1, t = (target - acc) / d;
      out.push([line[seg][0] + (line[seg + 1][0] - line[seg][0]) * t, line[seg][1] + (line[seg + 1][1] - line[seg][1]) * t]);
    }
    out.push(line[line.length - 1]);
    return out;
  };
  for (let cycle = 0; cycle < C; cycle++) {
    for (let it = 0; it < I; it++) {
      const next = pts.map((line) => line.map((p) => p.slice()));
      for (let e = 0; e < n; e++) {
        const line = pts[e], kP = K / ((len(edges[e]) || 1) * (P + 1));
        for (let i = 1; i <= P; i++) {
          const p = line[i];
          let fx = kP * (line[i - 1][0] - p[0] + line[i + 1][0] - p[0]);
          let fy = kP * (line[i - 1][1] - p[1] + line[i + 1][1] - p[1]);
          for (const { j, flip } of compat[e]) {
            const q = pts[j][flip ? P + 1 - i : i];
            const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
            if (d > 1e-6) { fx += dx / d; fy += dy / d; }
          }
          next[e][i][0] = p[0] + S * fx; next[e][i][1] = p[1] + S * fy;
        }
      }
      pts = next;
    }
    if (cycle < C - 1) { P *= 2; S /= 2; I = Math.ceil((I * 2) / 3); pts = pts.map((line) => resample(line, P)); }
  }
  return pts;
}

// Group bundled edges that ride together: the mean distance from one line's
// sampled points to the nearest point of the other stays below `within`.
// Returns an array of member-index arrays, so a renderer can spread the
// members of a cable side by side.
export function bundleGroups(lines, within, samples = 12) {
  const n = lines.length, parent = lines.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const at = (line, t) => {
    const k = t * (line.length - 1), i = Math.min(Math.floor(k), line.length - 2), f = k - i;
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f];
  };
  const toLine = (p, line) => {
    let best = Infinity;
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i], [bx, by] = line[i + 1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / L2));
      best = Math.min(best, Math.hypot(p[0] - ax - t * vx, p[1] - ay - t * vy));
    }
    return best;
  };
  const apart = (a, b) => { let s = 0; for (let k = 0; k < samples; k++) s += toLine(at(a, (k + 0.5) / samples), b); return s / samples; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if ((apart(lines[i], lines[j]) + apart(lines[j], lines[i])) / 2 < within) parent[find(i)] = find(j);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()];
}
