// BLP2 texture decoder — the format Blizzard's game clients keep their
// textures in (map tiles included). Returns RGBA pixels for mip level 0.
//
// Handles the three encodings the World of Warcraft clients use:
//   1  palettised 8-bit indices into a 256-colour BGRA palette, with an
//      optional separate 0/1/4/8-bit alpha plane
//   2  DXT-compressed (DXT1, DXT3 or DXT5 by alphaEncoding)
//   3  raw BGRA8888
//
// Reference: the BLP article on wowdev.wiki.

export function decodeBLP(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 148 || b.toString("latin1", 0, 4) !== "BLP2") throw new Error("not a BLP2 file");
  const type = b.readUInt32LE(4);
  if (type !== 1) throw new Error(`unsupported BLP type ${type} (only type 1 is handled)`);
  const encoding = b[8];
  const alphaSize = b[9];
  const alphaEncoding = b[10];
  const width = b.readUInt32LE(12);
  const height = b.readUInt32LE(16);
  const mipOffset = b.readUInt32LE(20);
  const mipLength = b.readUInt32LE(84);
  const palette = new Uint8Array(1024);
  b.copy(palette, 0, 148, 148 + 1024);
  const data = b.subarray(mipOffset, mipOffset + mipLength);
  const out = new Uint8Array(width * height * 4);

  if (encoding === 1) {
    const n = width * height;
    for (let i = 0; i < n; i++) {
      const p = data[i] * 4;
      out[i * 4] = palette[p + 2];
      out[i * 4 + 1] = palette[p + 1];
      out[i * 4 + 2] = palette[p];
      out[i * 4 + 3] = 255;
    }
    if (alphaSize === 8) {
      for (let i = 0; i < n; i++) out[i * 4 + 3] = data[n + i];
    } else if (alphaSize === 1) {
      for (let i = 0; i < n; i++) out[i * 4 + 3] = (data[n + (i >> 3)] >> (i & 7)) & 1 ? 255 : 0;
    } else if (alphaSize === 4) {
      for (let i = 0; i < n; i++) {
        const v = (data[n + (i >> 1)] >> ((i & 1) * 4)) & 15;
        out[i * 4 + 3] = v * 17;
      }
    }
  } else if (encoding === 2) {
    const fmt = alphaSize === 0 ? "dxt1" : alphaEncoding === 7 ? "dxt5" : alphaEncoding === 1 ? "dxt3" : "dxt1";
    decodeDXT(data, width, height, fmt, out);
  } else if (encoding === 3) {
    const n = width * height;
    for (let i = 0; i < n; i++) {
      out[i * 4] = data[i * 4 + 2];
      out[i * 4 + 1] = data[i * 4 + 1];
      out[i * 4 + 2] = data[i * 4];
      out[i * 4 + 3] = alphaSize ? data[i * 4 + 3] : 255;
    }
  } else {
    throw new Error(`unsupported BLP encoding ${encoding}`);
  }
  return { width, height, data: out, encoding, alphaSize, alphaEncoding };
}

function rgb565(v) {
  return [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31];
}

function decodeDXT(data, width, height, fmt, out) {
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4);
  const blockSize = fmt === "dxt1" ? 8 : 16;
  let off = 0;
  const colors = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const alphas = new Uint8Array(16);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const base = off;
      off += blockSize;
      // alpha block first for DXT3/5
      alphas.fill(255);
      let cOff = base;
      if (fmt === "dxt3") {
        for (let i = 0; i < 16; i++) {
          const v = (data[base + (i >> 1)] >> ((i & 1) * 4)) & 15;
          alphas[i] = v * 17;
        }
        cOff = base + 8;
      } else if (fmt === "dxt5") {
        const a0 = data[base], a1 = data[base + 1];
        const table = [a0, a1, 0, 0, 0, 0, 0, 0];
        if (a0 > a1) {
          for (let i = 1; i <= 6; i++) table[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
        } else {
          for (let i = 1; i <= 4; i++) table[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
          table[6] = 0; table[7] = 255;
        }
        // 16 3-bit indices packed little-endian across 6 bytes
        let bits = 0n;
        for (let i = 5; i >= 0; i--) bits = (bits << 8n) | BigInt(data[base + 2 + i]);
        for (let i = 0; i < 16; i++) alphas[i] = table[Number((bits >> BigInt(i * 3)) & 7n)];
        cOff = base + 8;
      }
      const c0 = data[cOff] | (data[cOff + 1] << 8);
      const c1 = data[cOff + 2] | (data[cOff + 3] << 8);
      const [r0, g0, b0] = rgb565(c0);
      const [r1, g1, b1] = rgb565(c1);
      colors[0] = [r0, g0, b0]; colors[1] = [r1, g1, b1];
      let transparent3 = false;
      if (fmt !== "dxt1" || c0 > c1) {
        colors[2] = [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3];
        colors[3] = [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3];
      } else {
        colors[2] = [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2];
        colors[3] = [0, 0, 0];
        transparent3 = true;
      }
      for (let py = 0; py < 4; py++) {
        const row = data[cOff + 4 + py];
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= width || y >= height) continue;
          const idx = (row >> (px * 2)) & 3;
          const c = colors[idx];
          const o = (y * width + x) * 4;
          out[o] = Math.round(c[0]); out[o + 1] = Math.round(c[1]); out[o + 2] = Math.round(c[2]);
          out[o + 3] = transparent3 && idx === 3 ? 0 : alphas[py * 4 + px];
        }
      }
    }
  }
}
