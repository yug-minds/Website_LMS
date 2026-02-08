#!/usr/bin/env node
/**
 * Generates a circular favicon from the YUGMINDS logo.
 * Output: src/app/icon.png, apple-icon.png, favicon.ico
 * Run: node scripts/generate-favicon.mjs
 * Optional: npm i -D png-to-ico for favicon.ico generation
 */

import sharp from 'sharp';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sizes = [32, 192]; // 32 for favicon, 192 for PWA/apple-touch
const appDir = path.join(root, 'src', 'app');

// Prefer public logo (YUGMINDS), then project assets if present
const possibleSources = [
  path.join(root, 'public', 'Yugminds_Official_Logo-preview.png'),
  path.join(root, 'assets', 'Yugminds_Official_Logo-4daf9a02-5361-49dc-82d7-dcb396e1e450.png'),
];

let sourcePath = possibleSources.find((p) => existsSync(p));
if (!sourcePath) {
  console.error('Favicon script: No logo source found. Tried:', possibleSources);
  process.exit(1);
}

async function createCircularIcon(size) {
  const buffer = readFileSync(sourcePath);
  const half = size / 2;
  const circleSvg = `
    <svg width="${size}" height="${size}">
      <circle cx="${half}" cy="${half}" r="${half}" fill="white"/>
    </svg>
  `;

  const rounded = await sharp(buffer)
    .resize(size, size)
    .composite([{
      input: Buffer.from(circleSvg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  return rounded;
}

async function main() {
  // Primary favicon: 32x32 (browser tab)
  const icon32 = await createCircularIcon(32);
  await sharp(icon32)
    .png()
    .toFile(path.join(appDir, 'icon.png'));
  console.log('Wrote src/app/icon.png (32x32 circular)');

  // Apple-touch-icon size
  const icon192 = await createCircularIcon(192);
  await sharp(icon192)
    .png()
    .toFile(path.join(appDir, 'apple-icon.png'));
  console.log('Wrote src/app/apple-icon.png (192x192 circular)');

  // favicon.ico for legacy/Vercel requests (optional: npm i -D png-to-ico)
  try {
    const pngToIco = (await import('png-to-ico')).default;
    const ico = await pngToIco(icon32);
    writeFileSync(path.join(appDir, 'favicon.ico'), ico);
    console.log('Wrote src/app/favicon.ico');
  } catch (_) {
    console.log('Skip favicon.ico (install png-to-ico: npm i -D png-to-ico)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
