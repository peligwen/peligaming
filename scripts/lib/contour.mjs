// Outlines of a binary mask as polygons: marching squares over the cell
// grid, joined into closed loops, then Douglas–Peucker simplified. Used to
// turn the world map's "explored subzone" overlay textures into the zone
// and subzone shapes the map draws and hit-tests.

// mask: Uint8Array of width*height, non-zero = inside. Returns an array of
// rings, each an array of [x, y] in pixel coordinates (x right, y down),
// outer rings counter-clockwise in screen space and holes clockwise.
export function traceMask(mask, width, height) {
  // Edge segments between inside and outside cells, keyed by start vertex.
  // Walking cells in raster order, emit the boundary edges of each inside
  // cell whose neighbour is outside, oriented so the inside is on the left.
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] !== 0;
  const segs = new Map(); // "x,y" -> [[x2,y2], ...]
  const add = (x1, y1, x2, y2) => {
    const k = x1 + "," + y1;
    let a = segs.get(k);
    if (!a) segs.set(k, (a = []));
    a.push([x2, y2]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);           // top edge, left to right
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);   // right edge, down
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);   // bottom edge, right to left
      if (!inside(x - 1, y)) add(x, y + 1, x, y);           // left edge, up
    }
  }
  const rings = [];
  for (const [k, list] of segs) {
    while (list.length) {
      const start = k.split(",").map(Number);
      const ring = [start];
      let cur = list.pop();
      let guard = 0;
      while (cur && (cur[0] !== start[0] || cur[1] !== start[1]) && guard++ < 10_000_000) {
        ring.push(cur);
        const nk = cur[0] + "," + cur[1];
        const nl = segs.get(nk);
        if (!nl || !nl.length) break;
        // prefer turning consistently when several edges leave a vertex
        cur = nl.pop();
      }
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
}

// Douglas–Peucker on a closed ring.
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  const stack = [[0, ring.length - 1]];
  // split the ring at the point farthest from the first point so DP has two open chains
  let far = 0, farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  keep[far] = 1;
  stack.length = 0;
  stack.push([0, far], [far, ring.length - 1]);
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bestD = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD > sq) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Morphological close (dilate then erode) with a square kernel, to bridge
// the one-pixel seams between adjacent overlay textures.
export function closeMask(mask, width, height, radius) {
  const dil = dilate(mask, width, height, radius);
  return erode(dil, width, height, radius);
}

function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1; }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; }
    out[y * w + x] = v;
  }
  return out;
}

function erode(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let k = -r; k <= r && v; k++) { const xx = x + k; if (xx < 0 || xx >= w || !mask[y * w + xx]) v = 0; }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let k = -r; k <= r && v; k++) { const yy = y + k; if (yy < 0 || yy >= h || !tmp[yy * w + x]) v = 0; }
    out[y * w + x] = v;
  }
  return out;
}
