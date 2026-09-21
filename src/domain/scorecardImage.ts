import { formatShareScorecard, type ShareScorecardHole } from './spectator';

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const WIDTH = 640;
const PAD = 28;
const LINE_H = 28;
const SCALE = 3;
const BG = { r: 11, g: 26, b: 18 };
const CREAM = { r: 244, g: 241, b: 232 };
const LIME = { r: 200, g: 245, b: 66 };
const MUTED = { r: 138, g: 154, b: 142 };

type Rgb = { r: number; g: number; b: number };

/** 5×7 columns, LSB at the top. Space and a few share glyphs only. */
const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  '-': [0, 8, 8, 8, 0],
  '.': [0, 64, 0, 0, 0],
  ':': [0, 20, 0, 0, 0],
  '+': [8, 8, 62, 8, 8],
  '·': [0, 8, 0, 0, 0],
  '—': [8, 8, 8, 8, 8],
  '0': [62, 65, 65, 65, 62],
  '1': [0, 66, 127, 64, 0],
  '2': [98, 81, 73, 69, 66],
  '3': [34, 65, 73, 73, 54],
  '4': [24, 20, 18, 127, 16],
  '5': [47, 73, 73, 73, 49],
  '6': [62, 73, 73, 73, 48],
  '7': [1, 113, 9, 5, 3],
  '8': [54, 73, 73, 73, 54],
  '9': [6, 73, 73, 73, 62],
  A: [126, 17, 17, 17, 126],
  B: [127, 73, 73, 73, 54],
  C: [62, 65, 65, 65, 34],
  D: [127, 65, 65, 65, 62],
  E: [127, 73, 73, 73, 65],
  F: [127, 9, 9, 9, 1],
  G: [62, 65, 73, 73, 58],
  H: [127, 8, 8, 8, 127],
  I: [65, 65, 127, 65, 65],
  J: [32, 64, 64, 64, 63],
  K: [127, 8, 20, 34, 65],
  L: [127, 64, 64, 64, 64],
  M: [127, 2, 12, 2, 127],
  N: [127, 2, 4, 8, 127],
  O: [62, 65, 65, 65, 62],
  P: [127, 9, 9, 9, 6],
  Q: [62, 65, 81, 33, 94],
  R: [127, 9, 25, 41, 70],
  S: [38, 73, 73, 73, 50],
  T: [1, 1, 127, 1, 1],
  U: [63, 64, 64, 64, 63],
  V: [31, 32, 64, 32, 31],
  W: [127, 32, 24, 32, 127],
  X: [99, 20, 8, 20, 99],
  Y: [3, 4, 120, 4, 3],
  Z: [97, 81, 73, 69, 67],
  "'": [0, 1, 2, 0, 0],
  '°': [6, 9, 9, 6, 0],
};

export function scorecardImageIncludesGps(): false {
  return false;
}

export function scorecardImageIncludesSpectatorUrl(): false {
  return false;
}

export function planScorecardImageLines(args: {
  courseName?: string | null;
  holes: ShareScorecardHole[];
  lastClubYards?: string | null;
}): string[] {
  return formatShareScorecard(args).split('\n');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const tag = Uint8Array.from([...type].map((ch) => ch.charCodeAt(0)));
  const body = concat([tag, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  let offset = 0;
  while (offset < data.length) {
    const size = Math.min(65535, data.length - offset);
    const last = offset + size >= data.length ? 1 : 0;
    const slice = data.subarray(offset, offset + size);
    blocks.push(
      Uint8Array.from([last, size & 0xff, (size >>> 8) & 0xff, ~size & 0xff, (~size >>> 8) & 0xff]),
      slice,
    );
    offset += size;
  }
  blocks.push(u32(adler32(data)));
  return concat(blocks);
}

function glyph(ch: string): number[] {
  if (FONT[ch]) return FONT[ch];
  const upper = ch.toUpperCase();
  if (FONT[upper]) return FONT[upper];
  if (ch === '–' || ch === '−') return FONT['—'];
  if (ch === '•') return FONT['·'];
  return FONT[' '] ?? [0, 0, 0, 0, 0];
}

function drawText(
  pixels: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  text: string,
  color: Rgb,
): void {
  let x = x0;
  for (const ch of text) {
    const cols = glyph(ch);
    for (let cx = 0; cx < cols.length; cx += 1) {
      const col = cols[cx] ?? 0;
      for (let cy = 0; cy < 7; cy += 1) {
        if (((col >> cy) & 1) === 0) continue;
        for (let sy = 0; sy < SCALE; sy += 1) {
          for (let sx = 0; sx < SCALE; sx += 1) {
            const px = x + cx * SCALE + sx;
            const py = y0 + cy * SCALE + sy;
            if (px < 0 || py < 0 || px >= width) continue;
            const i = (py * width + px) * 3;
            pixels[i] = color.r;
            pixels[i + 1] = color.g;
            pixels[i + 2] = color.b;
          }
        }
      }
    }
    x += (cols.length + 1) * SCALE;
  }
}

function fill(pixels: Uint8Array, color: Rgb): void {
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = color.r;
    pixels[i + 1] = color.g;
    pixels[i + 2] = color.b;
  }
}

/** Simple readable PNG. No GPS, no spectator token, no map. */
export function renderScorecardPng(lines: string[]): Uint8Array {
  const safe = lines.filter((line) => line.length > 0);
  const height = Math.max(PAD * 2 + LINE_H, PAD * 2 + safe.length * LINE_H);
  const pixels = new Uint8Array(WIDTH * height * 3);
  fill(pixels, BG);
  safe.forEach((line, index) => {
    const color = index === 0 ? LIME : index === 1 ? CREAM : MUTED;
    const ink = /^Last:/i.test(line) ? LIME : color;
    drawText(pixels, WIDTH, PAD, PAD + index * LINE_H, line, ink);
  });
  const raw = new Uint8Array((WIDTH * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (WIDTH * 3 + 1);
    raw[dest] = 0;
    raw.set(pixels.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), dest + 1);
  }
  const ihdr = concat([
    u32(WIDTH),
    u32(height),
    Uint8Array.from([8, 2, 0, 0, 0]),
  ]);
  return concat([
    Uint8Array.from(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

export function scorecardPngHasSignature(bytes: Uint8Array): boolean {
  return PNG_SIG.every((value, i) => bytes[i] === value);
}
