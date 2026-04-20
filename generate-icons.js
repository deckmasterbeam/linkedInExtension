// Generates src/icons/icon16.png, icon48.png, icon128.png
// Design: LinkedIn-blue rounded square, white person silhouette,
//         yellow highlight bar (48px+) representing the highlighting feature.
// No dependencies — uses only Node.js built-ins.

const zlib = require("zlib");
const fs = require("fs");

// ── PNG encoder ───────────────────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type);
  const l = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  const cv = Buffer.alloc(4);
  cv.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, cv]);
}
function makePNG(size, draw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // 8-bit RGBA
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + RGBA per pixel
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      row[1 + x * 4] = r;
      row[2 + x * 4] = g;
      row[3 + x * 4] = b;
      row[4 + x * 4] = a;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Signed distance fields ────────────────────────────────────────────────────

const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

const sdRoundBox = (px, py, cx, cy, hw, hh, r) => {
  const dx = Math.abs(px - cx) - hw + r;
  const dy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

// ── Icon design ───────────────────────────────────────────────────────────────
//
//  Layers (bottom to top):
//   1. LinkedIn-blue rounded square background
//   2. Yellow highlight bar  [48px+ only]  — represents the highlighting feature
//   3. White person silhouette (head + shoulder arc)

function drawIcon(x, y, s) {
  // Normalise to [0,1] using pixel centres
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  const aa = 1.5 / s; // antialiasing half-width in normalised coords
  const smooth = (d) => Math.min(1, Math.max(0, -d / aa + 0.5));

  // ── Layer 1: background ───────────────────────────────────────────────────
  const bgA = smooth(sdRoundBox(nx, ny, 0.5, 0.5, 0.48, 0.48, 0.18));
  if (bgA === 0) return [0, 0, 0, 0];

  let r = 10,
    g = 102,
    b = 194; // #0a66c2  LinkedIn blue

  // ── Layer 2: yellow highlight bar (48px+) ─────────────────────────────────
  // Sits just below the shoulder clip line so it peeks out under the silhouette
  if (s >= 32) {
    const barA = smooth(sdRoundBox(nx, ny, 0.5, 0.795, 0.32, 0.06, 0.06));
    if (barA > 0) {
      r = Math.round(245 * barA + r * (1 - barA)); // #f5c842
      g = Math.round(200 * barA + g * (1 - barA));
      b = Math.round(66 * barA + b * (1 - barA));
    }
  }

  // ── Layer 3: white person silhouette ──────────────────────────────────────
  // Head: small circle in upper half
  const headA = smooth(sdCircle(nx, ny, 0.5, 0.355, 0.15));
  // Body: larger circle clipped at a horizontal line to form shoulder arc
  const bodyA = ny <= 0.685 ? smooth(sdCircle(nx, ny, 0.5, 0.795, 0.27)) : 0;
  const personA = Math.max(headA, bodyA);

  if (personA > 0) {
    r = Math.round(255 * personA + r * (1 - personA));
    g = Math.round(255 * personA + g * (1 - personA));
    b = Math.round(255 * personA + b * (1 - personA));
  }

  return [r, g, b, Math.round(bgA * 255)];
}

// ── Generate ──────────────────────────────────────────────────────────────────

for (const size of [16, 48, 128]) {
  const buf = makePNG(size, drawIcon);
  const dest = `src/icons/icon${size}.png`;
  fs.writeFileSync(dest, buf);
  console.log(`${dest}  (${buf.length} bytes)`);
}
console.log("Done.");
