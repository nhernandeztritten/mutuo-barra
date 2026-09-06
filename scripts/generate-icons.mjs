// Generates the PWA icons as plain PNGs from an inline SVG (no fonts needed:
// the "M." wordmark is drawn as vector strokes so rendering is deterministic).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/icons');

const BONE = '#f5f4f3';
const INK = '#262625';

/** @param {number} size @param {number} pad inner padding as a 0-1 fraction */
function svg(size, pad) {
  const inset = size * pad;
  const box = size - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BONE}"/>
  <g transform="translate(${inset} ${inset}) scale(${box / 100})">
    <path d="M 12 78 L 12 26 L 40 60 L 68 26 L 68 78"
          fill="none" stroke="${INK}" stroke-width="11"
          stroke-linejoin="miter" stroke-miterlimit="6" stroke-linecap="butt"/>
    <circle cx="81" cy="72" r="6" fill="${INK}"/>
  </g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0.08 },
  { file: 'icon-512.png', size: 512, pad: 0.08 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.18 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.1 },
  { file: 'favicon-32.png', size: 32, pad: 0.06 },
];

await mkdir(OUT, { recursive: true });
for (const { file, size, pad } of targets) {
  const png = await sharp(Buffer.from(svg(size, pad))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(OUT, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} B`);
}
