/* Parcours complets dans un vrai navigateur, contre les services publics (réseau requis). */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('./');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
}

async function createLoop(page: Page) {
  await page.getByRole('button', { name: /Créer la boucle/ }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible({ timeout: 60_000 });
}

test('créer une boucle, comparer les propositions, parcourir le profil', async ({ page }) => {
  await open(page);
  await createLoop(page);
  const options = page.getByRole('option');
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  // La liste détaillée dit ce que la proposition tient de la demande (les cartes en ont une version courte).
  await expect(page.getByRole('list', { name: 'Respect de ta demande' }).getByText(/^Distance/)).toBeVisible();
  const profile = page.getByRole('slider', { name: /Profil d’altitude/ });
  await profile.focus();
  await page.keyboard.press('PageUp');
  await expect(page.locator('.mk-lens')).toBeVisible();
  await expect(profile).toHaveAttribute('aria-valuetext', /kilomètre, altitude/);
});

test('changer de sport adapte les réglages', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Vélo' }).click();
  await expect(page.locator('#distance')).toHaveValue('50');
  await expect(page.getByRole('heading', { name: 'Sol' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Gravel' }).click();
  await expect(page.getByRole('radio', { name: 'VTT' })).toBeVisible();
  await page.getByRole('radio', { name: 'Course' }).click();
  await expect(page.locator('#distance')).toHaveValue('10');
  // Le dénivelé passe d'« indifférent » à une valeur précise au premier geste.
  await page.locator('#elevation').fill('150');
  await expect(page.getByRole('button', { name: /Remettre dénivelé positif sur indifférent/ })).toBeVisible();
});

test('chercher un point de départ par adresse', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Départ/ }).first().click();
  await page.getByRole('searchbox').fill('Parc de Procé Nantes');
  await page.getByRole('button', { name: /Parc de Procé/ }).first().click();
  await expect(page.getByRole('button', { name: /Départ : Parc de Procé/ }).first()).toBeVisible();
});

test('enregistrer, retrouver dans Mes parcours et exporter en GPX', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Sur iPhone le GPX passe par la feuille de partage du système.');
  await open(page);
  await createLoop(page);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistré' })).toBeVisible();
  await page.getByRole('button', { name: /Mes parcours/ }).first().click();
  const items = page.getByRole('list', { name: 'Parcours enregistrés' }).getByRole('button');
  await expect(items).toHaveCount(1);
  await items.first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'GPX' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
});

test('partager un lien puis le rouvrir sur un autre appareil', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Presse-papiers testé sous Chromium.');
  await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write']);
  await open(page);
  await createLoop(page);
  const name = (await page.getByRole('option', { selected: true }).locator('.c-name').textContent())!.trim();
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByText(/Lien copié/)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('#r=');
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole('heading', { name })).toBeVisible({ timeout: 20_000 });
  await expect(other.getByText(/Parcours reçu/)).toBeVisible();
});

test('suivre le parcours en direct', async ({ page }) => {
  await open(page);
  await createLoop(page);
  await page.getByRole('button', { name: /Suivre ce parcours/ }).click();
  await expect(page.getByText('restants')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible();
});
