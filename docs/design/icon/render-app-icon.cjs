// Renders app-icon.html into every icon file under assets/images.
// Run from the repo root with Playwright available:
//   node docs/design/icon/render-app-icon.cjs
// Opaque files (iOS, watch, favicon, Android background) are written as RGB
// with no alpha channel, which App Store Connect requires for the 1024 icon.
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = path.resolve(__dirname, '../../..');
const out = (p) => path.join(root, 'assets/images', p);
const page = 'file://' + path.join(__dirname, 'app-icon.html');

// --- minimal PNG decode (8-bit RGBA, non-interlaced) and RGB re-encode ---
function decodeRgba(buf) {
  let pos = 8, w, h, ct, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const typ = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (typ === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png'); }
    if (typ === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('color type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) { for (let k = 0; k < 3; k++) px[(y * w + x) * 4 + k] = line[x * bpp + k]; px[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * 4 + 3] : 255; }
    prev = line;
  }
  return { w, h, px };
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function encodeRgb({ w, h, px }) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) raw[y * (w * 3 + 1) + 1 + x * 3 + k] = px[(y * w + x) * 4 + k];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const JOBS = [
  ['icon.png', 1024, 'full', 'rgb'],
  ['ios/icon-1024.png', 1024, 'full', 'rgb'],
  ['ios/icon-20@2x.png', 40, 'full', 'rgb'],
  ['ios/icon-20@3x.png', 60, 'full', 'rgb'],
  ['ios/icon-29@2x.png', 58, 'full', 'rgb'],
  ['ios/icon-29@3x.png', 87, 'full', 'rgb'],
  ['ios/icon-40@2x.png', 80, 'full', 'rgb'],
  ['ios/icon-40@3x.png', 120, 'full', 'rgb'],
  ['ios/icon-60@2x.png', 120, 'full', 'rgb'],
  ['ios/icon-60@3x.png', 180, 'full', 'rgb'],
  ['ios/icon-76.png', 76, 'full', 'rgb'],
  ['ios/icon-76@2x.png', 152, 'full', 'rgb'],
  ['ios/icon-83.5@2x.png', 167, 'full', 'rgb'],
  ['favicon.png', 48, 'full', 'rgb'],
  ['android-icon-background.png', 1024, 'bg', 'rgb'],
  ['android-icon-foreground.png', 1024, 'fg', 'rgba'],
  ['android-icon-monochrome.png', 1024, 'mono', 'rgba'],
];

(async () => {
  const browser = await chromium.launch();
  for (const [file, size, layer, mode] of JOBS) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.goto(`${page}?size=${size}&layer=${layer}`);
    const png = await p.locator('#icon svg').screenshot({ omitBackground: mode === 'rgba' });
    fs.writeFileSync(out(file), mode === 'rgb' ? encodeRgb(decodeRgba(png)) : png);
    await p.close();
    console.log(file, size, layer, mode);
  }
  await browser.close();
})();
