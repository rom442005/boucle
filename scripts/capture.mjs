// Captures de contrôle : node scripts/capture.mjs [url]   (par défaut l'aperçu de production sur le port 4173)
import { chromium, webkit, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173/boucle/';
const OUT = '.impeccable/review';
mkdirSync(OUT, { recursive: true });
const NANTES = { latitude: 47.2184, longitude: -1.5536 };

async function session(name, browserType, ctxOpts, steps) {
  // Chrome complet (channel) : le shell Chromium sans écran rend mal backdrop-filter au-dessus du canevas WebGL.
  const browser = await browserType.launch(browserType === chromium ? { channel: 'chrome' } : {});
  const ctx = await browser.newContext({ ...ctxOpts, geolocation: NANTES, permissions: ['geolocation'], locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push(`échec ${r.url().slice(0, 90)} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  try {
    await steps(page);
  } catch (e) {
    errors.push('ÉTAPE: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: `${OUT}/${name}-erreur.png` }).catch(() => {});
  }
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${errors.length} erreur(s)`);
  for (const e of errors.slice(0, 12)) console.log('   ', e.slice(0, 220));
  await browser.close();
}

const idle = (page) => page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30000 }).catch(() => {});

async function flow(page, prefix, shots) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${prefix}-compose.png` });
  await page.getByRole('button', { name: /Créer la boucle/ }).click();
  await page.waitForSelector('text=/propositions?$/', { timeout: 60000 });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/${shots.results}` });
  const prof = page.locator('.profile svg').first();
  const box = await prof.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
    if (shots.touch) await prof.dispatchEvent('pointerdown', { clientX: box.x + box.width * 0.42, clientY: box.y + box.height * 0.5, pointerType: 'touch' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${prefix}-scrub.png` });
  }
}

await session('desktop', chromium, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, (p) =>
  flow(p, 'desktop', { results: 'desktop.png' }),
);
// WebKit sans écran ne rend pas backdrop-filter : contrôle fonctionnel sous WebKit, rendu visuel sous Chromium.
// Taille de l'app installée sur l'écran d'accueil (iPhone 14 : 390 x 844), pas celle d'un onglet Safari.
const PWA = { width: 390, height: 844 };
await session('mobile-webkit', webkit, { ...devices['iPhone 14'], viewport: PWA }, (p) => flow(p, 'webkit', { results: 'webkit-mobile.png', touch: true }));
const { defaultBrowserType: _b, ...tab } = devices['iPhone 14'];
const iphone = { ...tab, viewport: PWA };
await session('mobile', chromium, iphone, (p) => flow(p, 'mobile', { results: 'mobile.png', touch: true }));
await session('mobile-sombre', chromium, { ...iphone, colorScheme: 'dark' }, async (page) => {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/mobile-dark-compose.png` });
  await page.getByRole('button', { name: /Créer la boucle/ }).click();
  await page.waitForSelector('text=/propositions?$/', { timeout: 60000 });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/mobile-dark.png` });
});
