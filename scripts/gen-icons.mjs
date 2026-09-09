#!/usr/bin/env node
/*
 * Generates the PWA icons with zero dependencies: raw RGBA pixels deflated
 * into a minimal PNG. Run: npm run gen:icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = new URL("../public/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [11, 15, 20];
const BRAND = [59, 163, 242];
const INK = [232, 238, 245];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A dumbbell: two plates and a bar, centred. */
function dumbbell(x, y, size, maskable) {
  const s = size;
  const inset = maskable ? 0.21 : 0.12; // maskable icons need a safe zone
  const cx = s / 2;
  const cy = s / 2;

  const barHalfW = s * (0.5 - inset - 0.02);
  const barHalfH = s * 0.045;
  const plateHalfW = s * 0.055;
  const plateHalfH = s * 0.16;
  const innerPlateHalfH = s * 0.115;

  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);

  // Bar
  if (dx <= barHalfW * 0.62 && dy <= barHalfH) return [...INK, 255];
  // Outer plates
  if (dx >= barHalfW - plateHalfW * 2 && dx <= barHalfW && dy <= plateHalfH) {
    return [...BRAND, 255];
  }
  // Inner plates
  if (
    dx >= barHalfW - plateHalfW * 3.6 &&
    dx <= barHalfW - plateHalfW * 2.2 &&
    dy <= innerPlateHalfH
  ) {
    return [...INK, 255];
  }
  return null;
}

function makeIcon(size, { maskable = false, rounded = true } = {}) {
  return png(size, (x, y) => {
    const glyph = dumbbell(x, y, size, maskable);

    if (rounded && !maskable) {
      // Rounded-square background, transparent outside.
      const r = size * 0.22;
      const dx = Math.max(r - x, 0, x - (size - r));
      const dy = Math.max(r - y, 0, y - (size - r));
      if (Math.hypot(dx, dy) > r) return [0, 0, 0, 0];
    }

    return glyph ?? [...BG, 255];
  });
}

const files = [
  ["icon-192.png", makeIcon(192)],
  ["icon-512.png", makeIcon(512)],
  ["maskable-512.png", makeIcon(512, { maskable: true })],
  ["badge-72.png", makeIcon(72)],
];

for (const [name, buffer] of files) {
  writeFileSync(new URL(name, OUT), buffer);
  console.log(
    `${name}  ${(buffer.length / 1024).toFixed(1)} KB  ${createHash("sha1")
      .update(buffer)
      .digest("hex")
      .slice(0, 8)}`,
  );
}
