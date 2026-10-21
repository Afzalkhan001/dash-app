// Turns a drawn signature (finger strokes) into a PNG data URL without any native module.
//
// The website's SignaturePad draws on a 600x200 <canvas> (ink #0f172a, 2.4px round strokes,
// transparent background) and sends canvas.toDataURL('image/png'). Expo Go has no canvas and no
// view-shot, so the strokes are rasterised here in plain JS (anti-aliased by distance to each
// segment, which also gives round caps and joins) and written out as an 8-bit palette PNG whose
// palette index IS the alpha level: one ink colour, 256 transparency steps. The deflate stream uses
// stored (uncompressed) blocks — ~120 KB for 600x200, far under the server's 2 MB signature cap.

export type Point = { x: number; y: number };

type RenderOptions = { width: number; height: number; lineWidth: number; color: string };

export function renderSignaturePng(strokes: Point[][], { width, height, lineWidth, color }: RenderOptions): string {
  const coverage = rasterise(strokes, width, height, lineWidth / 2);
  const png = encodePalettePng(coverage, width, height, hexToRgb(color));
  return `data:image/png;base64,${base64(png)}`;
}

// ── Rasterising ──────────────────────────────────────────────────────────────
function rasterise(strokes: Point[][], w: number, h: number, r: number): Uint8Array {
  const cov = new Uint8Array(w * h);
  const stamp = (x0: number, y0: number, x1: number, y1: number) => {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r - 1));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r - 1));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r + 1));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x0 + t * dx - cx;
        const ey = y0 + t * dy - cy;
        const c = r + 0.5 - Math.sqrt(ex * ex + ey * ey);
        if (c <= 0) continue;
        const a = c >= 1 ? 255 : Math.round(c * 255);
        const i = py * w + px;
        if (a > cov[i]!) cov[i] = a;
      }
    }
  };
  for (const s of strokes) {
    if (!s.length) continue;
    if (s.length === 1) stamp(s[0]!.x, s[0]!.y, s[0]!.x, s[0]!.y);
    for (let i = 1; i < s.length; i++) stamp(s[i - 1]!.x, s[i - 1]!.y, s[i]!.x, s[i]!.y);
  }
  return cov;
}

// ── PNG encoding ─────────────────────────────────────────────────────────────
function encodePalettePng(alpha: Uint8Array, w: number, h: number, [r, g, b]: [number, number, number]): Uint8Array {
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, w);
  writeU32(ihdr, 4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: palette
  // compression, filter and interlace stay 0

  const plte = new Uint8Array(256 * 3);
  const trns = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
    trns[i] = i;
  }

  const raw = new Uint8Array(h * (w + 1)); // each scanline: filter byte 0 + one index per pixel
  for (let y = 0; y < h; y++) raw.set(alpha.subarray(y * w, y * w + w), y * (w + 1) + 1);

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

// zlib wrapper around stored deflate blocks (max 65535 bytes each).
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / MAX));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let p = 0;
  out[p++] = 0x78;
  out[p++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * MAX;
    const len = Math.min(MAX, raw.length - start);
    out[p++] = i === blocks - 1 ? 1 : 0;
    out[p++] = len & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = ~len & 0xff;
    out[p++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), p);
    p += len;
  }
  writeU32(out, p, adler32(raw));
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  let i = 0;
  while (i < buf.length) {
    const n = Math.min(5552, buf.length - i);
    for (let j = 0; j < n; j++, i++) {
      a += buf[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32(buf: Uint8Array, at: number, v: number) {
  buf[at] = (v >>> 24) & 0xff;
  buf[at + 1] = (v >>> 16) & 0xff;
  buf[at + 2] = (v >>> 8) & 0xff;
  buf[at + 3] = v & 0xff;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [15, 23, 42];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let line = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1]! : 0;
    const c = hasC ? bytes[i + 2]! : 0;
    line +=
      B64[a >> 2]! +
      B64[((a & 3) << 4) | (b >> 4)]! +
      (hasB ? B64[((b & 15) << 2) | (c >> 6)]! : '=') +
      (hasC ? B64[c & 63]! : '=');
    if (line.length >= 4096) {
      parts.push(line);
      line = '';
    }
  }
  parts.push(line);
  return parts.join('');
}
