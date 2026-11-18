// Génère les icônes PNG de l'app à partir d'un SVG dessiné ici : node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const LOOP =
  'M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z';

function svg({ full, scale = 1 }) {
  const glyph = `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
      <path d="${LOOP}" fill="none" stroke="#fff" stroke-width="70" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="318" cy="688" r="84" fill="#fff"/>
      <circle cx="318" cy="688" r="40" fill="#FF2D55"/>
    </g>`;
  const defs = `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5F80"/><stop offset="1" stop-color="#E0123E"/></linearGradient>
      <radialGradient id="sheen" cx="0.28" cy="0" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>`;
  if (full) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
      <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#sheen)"/>${glyph}</svg>`;
  }
  // Grille macOS : carré arrondi de 824 px centré, marges transparentes.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
    <g transform="translate(100 100) scale(0.8047)">
      <rect width="1024" height="1024" rx="230" fill="url(#bg)"/><rect width="1024" height="1024" rx="230" fill="url(#sheen)"/>
      <rect x="2" y="2" width="1020" height="1020" rx="228" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/>${glyph}
    </g></svg>`;
}

const out = [
  ['public/apple-touch-icon.png', 180, svg({ full: true })],
  ['public/icons/icon-192.png', 192, svg({ full: false })],
  ['public/icons/icon-512.png', 512, svg({ full: false })],
  ['public/icons/maskable-512.png', 512, svg({ full: true, scale: 0.78 })],
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const [path, size, markup] of out) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path, omitBackground: true });
  await page.close();
  console.log('écrit', path);
}
await browser.close();

// Favicon : même dessin, en vectoriel.
writeFileSync('public/favicon.svg', svg({ full: false }).replace('<svg ', '<svg width="32" height="32" '));
console.log('écrit public/favicon.svg');
