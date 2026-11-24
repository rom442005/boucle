/* Parcours complets dans un vrai navigateur, contre les services publics (réseau requis). */
import { expect, test, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/** Une petite image PNG (dégradé), pour les photos de profil et de sorties. */
function png(w = 64, h = 48): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 255;
      raw[o + 1] = (x * 4) & 255;
      raw[o + 2] = (y * 5) & 255;
    }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** L'app déjà ouverte une fois (l'accueil « Créer un compte » est passé) : la carte seule. */
async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('boucle.bienvenue', '1'));
  await page.goto('./');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
}

/** Les réglages : sur iPhone, « Faire une boucle » les fait monter ; sur Mac, « Créer un parcours » les ouvre à gauche. */
async function compose(page: Page) {
  const go = page.getByRole('button', { name: /^(Faire une boucle|Créer un parcours)$/ });
  await expect(go.or(page.getByRole('heading', { name: 'Nouveau parcours' })).first()).toBeVisible();
  if (await go.count()) await go.first().click();
  await expect(page.getByRole('heading', { name: 'Nouveau parcours' })).toBeVisible();
}

/**
 * iPhone, « Choisir sur la carte » : on touche la carte une fois le panneau replié. Sur une machine lente
 * (contrôle du lundi sur GitHub), le premier toucher peut tomber pendant le mouvement : on réessaie.
 */
async function tapMap(page: Page, x: number, y: number, placed: () => Promise<boolean>) {
  await expect(page.getByRole('button', { name: /Taille du panneau : réduit/ })).toBeAttached({ timeout: 5000 }).catch(() => {});
  await expect(async () => {
    await page.waitForTimeout(500);
    if (await placed()) return;
    await page.touchscreen.tap(x, y);
    await expect.poll(placed, { timeout: 2500 }).toBe(true);
  }).toPass({ timeout: 20_000 });
}

async function createLoop(page: Page) {
  if (await page.getByRole('button', { name: /^(Faire une boucle|Créer un parcours)$/ }).count()) await compose(page);
  await page.getByRole('button', { name: /Créer la boucle/ }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible({ timeout: 60_000 });
  // La première proposition s'affiche tout de suite ; on attend que les autres l'aient rejointe.
  await expect(page.locator('.card.ghost')).toHaveCount(0, { timeout: 30_000 });
  // Sur iPhone, le panneau descend pour montrer tout le parcours, avec un résumé chiffré ; on le remonte pour le détail.
  const folded = page.getByRole('button', { name: /Taille du panneau : réduit/ });
  if (await folded.count()) {
    await expect(page.locator('.sum-stats')).toContainText(/km/);
    await folded.click();
    await expect(page.getByRole('button', { name: /Taille du panneau : moyen/ })).toBeVisible();
  }
}

test('créer une boucle, comparer les propositions, parcourir le profil', async ({ page }) => {
  await open(page);
  await createLoop(page);
  const options = page.getByRole('option');
  expect(await options.count()).toBeGreaterThanOrEqual(2);
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  // La liste détaillée dit ce que la proposition tient de la demande (les cartes en ont une version courte).
  await expect(page.getByRole('list', { name: 'Respect de ta demande' }).getByText(/Distance (tenue|à)/)).toBeVisible();
  const profile = page.getByRole('slider', { name: /Profil d’altitude/ });
  await profile.focus();
  await page.keyboard.press('PageUp');
  await expect(page.locator('.mk-lens')).toBeVisible();
  await expect(profile).toHaveAttribute('aria-valuetext', /kilomètre, altitude/);
});

test('changer de sport adapte les réglages', async ({ page }) => {
  await open(page);
  await compose(page);
  const distance = page.getByRole('slider', { name: 'Distance' });
  await page.getByRole('radio', { name: 'Vélo' }).click();
  await expect(distance).toHaveAttribute('aria-valuenow', '50');
  // Plus de rubrique « Sol » : le sol suit le sport.
  await expect(page.getByRole('heading', { name: 'Sol' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Course' }).click();
  await expect(distance).toHaveAttribute('aria-valuenow', '10');
  // Règle graduée : au dixième de kilomètre près, au clavier comme au doigt.
  await distance.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(distance).toHaveAttribute('aria-valuenow', '10.2');
  const box = (await distance.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // 45 px vers la gauche = 5 graduations (0,5 km) ; le doigt s'arrête avant de se lever : pas d'élan.
  await page.mouse.move(box.x + box.width / 2 - 45, box.y + box.height / 2, { steps: 10 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect(distance).toHaveAttribute('aria-valuenow', '10.7');
  // Le dénivelé passe d'« indifférent » à une valeur précise au premier geste.
  const dplus = page.getByRole('slider', { name: 'Dénivelé positif' });
  await dplus.focus();
  await page.keyboard.press('PageUp');
  await expect(dplus).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('button', { name: /Remettre dénivelé positif sur indifférent/ })).toBeVisible();
});

test('dessiner le parcours : la boucle suit le dessin', async ({ page }) => {
  await open(page);
  await compose(page);
  // Replié tant qu'on ne le touche pas.
  const toggle = page.getByRole('button', { name: 'Dessiner le parcours' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.pad')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Un trait à main levée (souris ou doigt), avec son point de départ…
  const pad = page.locator('.pad');
  await pad.scrollIntoViewIfNeeded();
  const b = (await pad.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.35, { steps: 8 });
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(pad.locator('circle.start')).toHaveCount(1);
  await page.getByRole('button', { name: 'Annuler le dernier trait' }).click();
  await expect(pad.locator('circle.start')).toHaveCount(0);
  // Une idée de dessin à partir d'une phrase (bibliothèque de l'app, IA si elle est branchée).
  await page.getByRole('textbox', { name: /Décris la forme/ }).fill('un diamant');
  await page.getByRole('button', { name: 'Proposer des dessins' }).click();
  await page.getByRole('button', { name: /^Courir ce dessin : Diamant$/ }).click();
  await expect(pad.locator('circle.start')).toHaveCount(1);
  // Le dessin peut aller chercher le meilleur endroit autour du départ.
  await expect(page.getByRole('slider', { name: 'Lieu du dessin' })).toBeVisible();
  // … ou une forme toute prête. Le relief et le milieu ne comptent plus : grisés.
  await page.getByRole('button', { name: 'Étoile' }).click();
  await expect(page.getByRole('button', { name: 'Étoile' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fold.muted')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tracer mon dessin' }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible({ timeout: 60_000 });
  const folded = page.getByRole('button', { name: /Taille du panneau : réduit/ });
  if (await folded.count()) await folded.click();
  await expect(page.getByRole('list', { name: 'Respect de ta demande' }).getByText(/Ressemblance au dessin : \d+/)).toBeVisible();
  // Les propositions portent le nom de la forme.
  // « Étoile » seule, ou « Étoile par … » quand le tracé a des noms de rues.
  await expect(page.getByRole('option').first()).toContainText(/^\s*Étoile\b/);
});

test('lieux sur la carte : six icônes sans défiler, mise au point sur le plus proche', async ({ page }) => {
  await open(page);
  const bar = page.getByRole('group', { name: 'Lieux à voir sur la carte' });
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  for (const name of ['Pistes d’athlétisme', 'Parcs et jardins publics', 'Lacs, étangs et rivières', 'Bois et forêts', 'Fontaines d’eau potable', 'Toilettes publiques']) {
    const btn = bar.getByRole('button', { name: new RegExp('^' + name) });
    const r = (await btn.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  const parks = bar.getByRole('button', { name: /^Parcs et jardins/ });
  await parks.click();
  await expect(parks).toHaveAttribute('aria-pressed', 'true');
  // La carte montre les plus proches et la fiche du plus proche s'ouvre ; ‹ › passent aux suivants.
  const card = page.getByRole('region', { name: /^Fiche du lieu/ });
  await expect(card).toContainText(/1\/\d+/, { timeout: 20_000 });
  await card.getByRole('button', { name: 'Lieu suivant' }).click();
  await expect(card).toContainText(/2\/\d+/);
  await parks.click();
  await expect(card).toHaveCount(0);
});

test('pistes : toutes sur la carte, fiche avec photos, enregistrer dans Mes lieux', async ({ page }) => {
  await open(page);
  const bar = page.getByRole('group', { name: 'Lieux à voir sur la carte' });
  await bar.getByRole('button', { name: /^Pistes d’athlétisme/ }).click();
  // Les plus proches d'un coup d'œil, et la fiche de la plus proche (photos, ‹ ›).
  const card = page.getByRole('region', { name: /^Fiche du lieu/ });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/\d+ m · \d couloirs/);
  await expect(card.getByRole('button', { name: 'Agrandir la vue du ciel' })).toBeVisible();
  await card.getByRole('button', { name: 'Enregistrer' }).click();
  const sheet = page.getByRole('dialog', { name: 'Enregistrer le lieu' });
  // Le nom de la piste est déjà écrit ; le lieu prend l'émoji de sa liste.
  await expect(sheet.getByRole('textbox', { name: 'Nom du lieu' })).not.toHaveValue('');
  await expect(sheet.getByRole('radio', { name: /Favoris/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Enregistré' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Fermer la fiche' }).click();
  await expect(card).toHaveCount(0);
});

test('mes lieux : une liste, Domicile par adresse, puis choisi comme départ', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Mes parcours/ }).first().click();
  await page.getByRole('button', { name: /Lieux/ }).click();
  await page.getByRole('button', { name: 'Ajouter Domicile' }).click();
  await page.getByRole('searchbox').fill('Place Royale Nantes');
  await page.getByRole('button', { name: /Place Royale/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Enregistrer le lieu' });
  await expect(sheet.getByRole('textbox', { name: 'Nom du lieu' })).toHaveValue('Domicile');
  await expect(sheet.getByRole('radio', { name: /Mes adresses/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lieux de la liste Mes adresses' })).toContainText('Domicile');
  // Une nouvelle liste.
  await page.getByRole('button', { name: 'Nouvelle liste' }).click();
  await page.getByRole('textbox', { name: 'Nom de la nouvelle liste' }).fill('Proches');
  await page.getByRole('button', { name: 'Créer la liste' }).click();
  await expect(page.getByRole('tab', { name: /Proches/ })).toHaveAttribute('aria-selected', 'true');
  // Domicile, en tête de la recherche du départ.
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Créer', exact: true }).click();
  await compose(page);
  await page.getByRole('button', { name: /^Départ/ }).first().click();
  await page.getByRole('button', { name: /^Domicile/ }).click();
  await expect(page.getByRole('button', { name: /Départ : Domicile/ }).first()).toBeVisible();
});

test('onglets au doigt (iPhone) : chaque toucher change d’onglet', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'Écran tactile : iPhone seulement.');
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  for (const t of ['Communauté', 'Mes parcours', 'Profil', 'Créer', 'Mes parcours']) {
    await nav.getByRole('button', { name: t, exact: true }).tap();
    await expect(nav.getByRole('button', { name: t, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('enregistrer un lieu depuis Créer : bouton de la carte, adresse, Mes lieux', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Enregistrer un lieu' }).click();
  await page.getByRole('searchbox').fill('Place Royale Nantes');
  await page.getByRole('button', { name: /Place Royale/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Enregistrer le lieu' });
  // La fiche se réduit au nom et aux listes : plus d'émojis ni de noms proposés.
  await expect(sheet.getByRole('radiogroup', { name: 'Émoji du lieu' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /^École$|🎓/ })).toHaveCount(0);
  await sheet.getByRole('textbox', { name: 'Nom du lieu' }).fill('Travail');
  // L'émoji d'une liste se change depuis sa pastille crayon.
  await sheet.getByRole('button', { name: /Changer l’émoji de la liste Favoris/ }).click();
  await sheet.getByRole('radiogroup', { name: 'Émoji de la liste Favoris' }).getByRole('radio', { name: '⭐' }).click();
  await expect(sheet.getByRole('button', { name: /Changer l’émoji de la liste Favoris \(⭐\)/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/Travail : enregistré dans ⭐ Favoris/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer un lieu' })).toBeVisible();
});

test('chercher un point de départ par adresse', async ({ page }) => {
  await open(page);
  await compose(page);
  await page.getByRole('button', { name: /^Départ/ }).first().click();
  await page.getByRole('searchbox').fill('Parc de Procé Nantes');
  await page.getByRole('button', { name: /Parc de Procé/ }).first().click();
  await expect(page.getByRole('button', { name: /Départ : Parc de Procé/ }).first()).toBeVisible();
});

test('mettre en favori, retrouver dans Mes parcours et exporter en GPX', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Sur iPhone le GPX passe par la feuille de partage du système.');
  await open(page);
  await createLoop(page);
  const fav = page.getByRole('button', { name: 'Favori' });
  await fav.click();
  await expect(fav).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Mes parcours/ }).first().click();
  const items = page.getByRole('list', { name: 'Parcours favoris' }).getByRole('button');
  await expect(items).toHaveCount(1);
  await items.first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'GPX' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
});

test('marquer un parcours comme fait puis le retrouver dans l’historique', async ({ page }) => {
  await open(page);
  await createLoop(page);
  const done = page.getByRole('button', { name: 'Fait', exact: true });
  await done.click();
  await expect(page.getByText('Ajouté à l’historique')).toBeVisible();
  await expect(done).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Retour aux réglages' }).click();
  // Sur iPhone, les réglages couvrent l'écran : on redescend vers la carte, d'où s'ouvrent Mes parcours.
  if (!(await page.getByRole('button', { name: /Mes parcours/ }).first().isVisible())) await page.getByRole('button', { name: 'Fermer les réglages' }).click();
  await page.getByRole('button', { name: /Mes parcours/ }).first().click();
  await page.getByRole('button', { name: /^Sorties/ }).click();
  await expect(page.getByRole('region', { name: 'Ce mois-ci' })).toBeVisible();
  const rows = page.getByRole('list', { name: 'Historique des sorties' }).getByRole('button');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(page.getByText(/^Fait le /)).toBeVisible();
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
  const hud = page.getByRole('region', { name: 'Suivi en direct' });
  await expect(hud).toBeVisible({ timeout: 20_000 });
  // Distance, chrono, allure, moyenne, restant, D+, arrivée.
  for (const k of ['Distance', 'Durée', 'Allure', 'Moyenne', 'Restant', 'D+', 'Arrivée']) await expect(hud.getByText(k, { exact: true })).toBeVisible();
  // Pause : le chrono s'arrête ; Reprendre le relance.
  await hud.getByRole('button', { name: 'Pause' }).click();
  await expect(hud.getByText('En pause')).toBeVisible();
  await hud.getByRole('button', { name: 'Reprendre' }).click();
  await expect(hud.getByText('Durée', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible();
});

test('une sortie suivie en direct rejoint l’historique', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Lecture du GPX téléchargé sous Chromium.');
  await open(page);
  await createLoop(page);
  // Coordonnées du tracé, lues dans le GPX exporté.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'GPX' }).click()]);
  const fs = await import('node:fs/promises');
  const gpx = await fs.readFile((await download.path())!, 'utf8');
  const pts = [...gpx.matchAll(/<trkpt lat="([\d.-]+)" lon="([\d.-]+)"/g)].map((m) => ({ latitude: +m[1], longitude: +m[2] }));
  expect(pts.length).toBeGreaterThan(20);
  await page.getByRole('button', { name: /Suivre ce parcours/ }).click();
  await expect(page.getByRole('region', { name: 'Suivi en direct' })).toBeVisible({ timeout: 20_000 });
  // On avance pas à pas jusqu'au quart du parcours (environ 2,5 km).
  const quarter = Math.floor(pts.length / 4);
  for (let i = 0; i <= quarter; i += Math.max(1, Math.floor(quarter / 12))) {
    await context.setGeolocation(pts[i]);
    await page.waitForTimeout(250);
  }
  await context.setGeolocation(pts[quarter]);
  await expect(page.getByRole('region', { name: 'Suivi en direct' }).locator('.roll .visually-hidden').first()).toHaveText(/^[1-9],\d$/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByText(/Sortie ajoutée à l’historique/)).toBeVisible();
});

test('ouvrir Boucle sur l’iPhone : bandeau et QR code', async ({ page, browserName }) => {
  await open(page);
  await compose(page);
  if (browserName !== 'chromium') {
    // Dans Safari sur iPhone : le rappel d'installation, pas le QR code.
    await expect(page.getByRole('note').filter({ hasText: 'Comme une app' })).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'Sur ton iPhone' })).toHaveCount(0);
    return;
  }
  const banner = page.getByRole('note').filter({ hasText: 'Sur ton iPhone' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'QR code' }).click();
  const card = page.getByRole('group', { name: 'Installer Boucle sur l’iPhone' });
  await expect(card.locator('.qr svg')).toBeVisible();
  await card.getByRole('button', { name: 'Fermer le QR code' }).click();
  await banner.getByRole('button', { name: 'Masquer ce conseil' }).click();
  await expect(banner).toBeHidden();
  // Masqué pour de bon (le bouton téléphone de l'en-tête a été retiré à la demande de Romain).
  await page.reload();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await compose(page);
  await expect(page.getByRole('note').filter({ hasText: 'Sur ton iPhone' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Installer Boucle sur l’iPhone' })).toHaveCount(0);
});

test('aller simple : arrivée libre, ou placée en touchant la carte', async ({ page, browserName }) => {
  await open(page);
  await compose(page);
  await page.getByRole('radio', { name: 'Aller simple' }).click();
  const arrival = page.getByRole('button', { name: /^Arrivée :/ });
  await expect(arrival).toHaveAccessibleName(/Libre/);
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  if (browserName === 'chromium') {
    // Sur Mac, un clic sur la carte place l'arrivée ; au survol, un aperçu montre où elle sera posée.
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 4 });
    await expect(page.locator('.aim-label')).toHaveText(/^à \d+,\d\s?km du départ$/);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.35);
  } else {
    await arrival.click();
    const dialog = page.getByRole('dialog', { name: 'Choisir l’arrivée' });
    await dialog.getByRole('button', { name: /Choisir sur la carte/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Touche la carte' })).toBeVisible();
    await tapMap(page, box.x + box.width * 0.7, box.y + box.height * 0.3, async () => (await page.locator('.mk-dest').count()) > 0);
  }
  await expect(page.getByText('Arrivée placée ici')).toBeVisible();
  const flag = page.locator('.mk-dest');
  await expect(flag).toBeVisible();
  await expect(arrival).not.toHaveAccessibleName(/Libre/);
  if (browserName === 'chromium') {
    // Un clic ailleurs la déplace.
    const before = (await flag.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.6);
    await expect.poll(async () => (await flag.boundingBox())!.y - before.y).toBeGreaterThan(100);
  }
  // Arrivée libre : le parcours s'arrête là où la distance est atteinte.
  await page.getByRole('button', { name: 'Arrivée libre' }).click();
  await expect(arrival).toHaveAccessibleName(/Libre/);
  await page.getByRole('button', { name: /Créer l’aller simple/ }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible({ timeout: 60_000 });
});

test('imposer plusieurs points de passage dans une boucle', async ({ page, browserName }) => {
  await open(page);
  await compose(page);
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const add = page.getByRole('button', { name: /^Point de passage$/ });
  const place = async (fx: number, fy: number) => {
    await add.click();
    const dialog = page.getByRole('dialog', { name: 'Choisir un point de passage' });
    await expect(dialog).toBeVisible();
    if (browserName === 'chromium') {
      // Sur Mac, la recherche laisse la carte cliquable à côté.
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
      await expect(page.locator('.aim-label')).toHaveText('Passer par ici');
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    } else {
      await dialog.getByRole('button', { name: /Choisir sur la carte/ }).click();
      const before = await page.locator('.mk-via').count();
      await tapMap(page, box.x + box.width * fx, box.y + box.height * fy, async () => (await page.locator('.mk-via').count()) > before);
    }
    await expect(page.getByText('Point de passage placé ici').last()).toBeVisible();
  };
  await place(0.72, 0.3);
  await place(0.6, 0.62);
  await expect(page.locator('.mk-via')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Passer par :/ })).toHaveCount(2);
  await createLoop(page);
  await expect(page.getByRole('list', { name: 'Respect de ta demande' }).getByText(/Passe (par|près de)/)).toHaveCount(2);
  await expect(page.locator('.mk-via.many b')).toHaveText(['1', '2']);
  // Retour aux réglages : on peut en retirer un.
  await page.getByRole('button', { name: 'Retour aux réglages' }).click();
  await page.getByRole('button', { name: /Retirer le point de passage/ }).first().click();
  await expect(page.locator('.mk-via')).toHaveCount(1);
});

test('la 3D met la ville en volume, avec sa légende', async ({ page, browserName }) => {
  await open(page);
  // Sur iPhone, l'accueil ne garde que « Me localiser » : la 3D se trouve avec un parcours affiché.
  if (browserName !== 'chromium') await createLoop(page);
  const btn = page.getByRole('button', { name: 'Relief et bâtiments en 3D' });
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  // Comme dans Plans, le bouton annonce la vue vers laquelle il bascule.
  await expect(btn).toHaveText('2D');
  // La légende vient avec les volumes, à partir du zoom de la ville.
  const canvas = page.locator('.maplibregl-canvas');
  for (let i = 0; i < 4 && !(await page.getByRole('note', { name: /Bâtiments en volume/ }).count()); i++) {
    await canvas.focus();
    await page.keyboard.press('Equal');
    await page.waitForTimeout(700);
  }
  await expect(page.getByRole('note', { name: /Bâtiments en volume/ })).toContainText('Immeuble');
  await btn.click();
  await expect(btn).toHaveText('3D');
  await expect(page.getByRole('note', { name: /Bâtiments en volume/ })).toHaveCount(0);
});

test('côtes et descentes : liste, carte et profil', async ({ page }) => {
  await open(page);
  await createLoop(page);
  await expect(page.getByRole('heading', { name: 'Côtes et descentes' })).toBeAttached();
  await expect(page.getByRole('img', { name: /Couleur de la pente/ }).first()).toBeAttached();
  const list = page.getByRole('list', { name: 'Côtes et descentes du parcours' });
  if (await list.count()) {
    // Toucher une côte la met en avant : pastille sur la carte, bande sur le profil.
    const first = list.getByRole('button').first();
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mk-climb.on')).toHaveCount(1);
    await expect(page.locator('.profile rect.focus').first()).toBeAttached();
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
  } else {
    await expect(page.locator('.climb-list')).toHaveCount(0);
  }
});

test('fond de carte : Paysage par défaut, Plan clair ou Satellite, gardé au prochain lancement', async ({ page, browserName }) => {
  await open(page);
  if (browserName !== 'chromium') await createLoop(page);
  const type = page.getByRole('button', { name: /^Type de carte/ });
  // Fil rouge : la carte Paysage, et l'interface en verre fumé comme sur les photos.
  await expect(type).toHaveAccessibleName('Type de carte : Paysage');
  expect(await page.evaluate(() => document.documentElement.classList.contains('on-photo'))).toBe(true);
  await type.click();
  await expect(page.getByRole('group', { name: 'Type de carte' })).toBeVisible();
  // Le plan clair rend l'interface claire.
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(type).toHaveAccessibleName('Type de carte : Plan');
  expect(await page.evaluate(() => document.documentElement.classList.contains('on-photo'))).toBe(false);
  await type.click();
  // Les photos aériennes de l'IGN se chargent dès que l'on passe en Satellite.
  const ortho = page.waitForRequest(/data\.geopf\.fr\/wmts/, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Satellite' }).click();
  await ortho;
  await expect(type).toHaveAccessibleName('Type de carte : Satellite');
  await expect(page.getByRole('group', { name: 'Type de carte' })).toHaveCount(0);
  await page.reload();
  if (browserName === 'chromium') await expect(page.getByRole('button', { name: 'Type de carte : Satellite' })).toBeVisible();
  else expect(await page.evaluate(() => localStorage.getItem('boucle.indicateurs.v1'))).toContain('"satellite":true');
});

test('vu de loin, la Terre est un globe, et on revient au départ', async ({ page }) => {
  await open(page);
  await expect(page.locator('.mk-start')).toBeVisible({ timeout: 20_000 });
  // Dézoom au clavier jusqu'à quitter le plan : la carte file seule jusqu'à la planète entière.
  await page.locator('.maplibregl-canvas').focus();
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Minus');
    await page.waitForTimeout(260);
  }
  await expect(page.locator('.map.space')).toBeAttached({ timeout: 10_000 });
  await expect(page.locator('.map.orbit')).toBeAttached({ timeout: 10_000 });
  const back = page.getByRole('button', { name: 'Revenir au départ' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.map.space')).toHaveCount(0);
});

test('sur Mac, le bouton Dézoomer mène à la Terre entière, comme dans Plans', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Boutons + et − affichés sur Mac.');
  await open(page);
  await expect(page.locator('.mk-start')).toBeVisible({ timeout: 20_000 });
  const out = page.getByRole('button', { name: 'Dézoomer' });
  for (let i = 0; i < 10 && !(await page.locator('.map.orbit').count()); i++) {
    await out.click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator('.map.orbit')).toBeAttached({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(page.locator('.map.orbit')).toHaveCount(0, { timeout: 5_000 });
});

test('si tu pars maintenant : lumière du jour au retour', async ({ page }) => {
  await open(page);
  await createLoop(page);
  await expect(page.getByRole('heading', { name: 'Si tu pars maintenant' })).toBeAttached();
  await expect(page.locator('.conds').getByText(/^(Retour vers .+, (de jour|au crépuscule|de nuit)|Départ de nuit)/)).toBeAttached();
});

test('Communauté (démonstration) : compte par code, j’aime, commentaire, abonnement, publication', async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem('boucle.bienvenue', '1'));
  await page.goto('./?demo=communaute');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  void browserName;
  await page.getByRole('button', { name: /^Communauté/ }).click();
  const feed = page.getByRole('list', { name: 'Parcours publiés' });
  await expect(feed).toBeVisible({ timeout: 15_000 });
  // Aimer sans compte : la connexion s'ouvre dans le panneau, puis le j'aime est fait.
  await feed.getByRole('button', { name: /^J’aime/ }).first().click();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('test@exemple.fr');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await page.getByRole('textbox', { name: /Code à 6 chiffres/ }).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.locator('.ph input[type=file]').setInputFiles({ name: 'moi.png', mimeType: 'image/png', buffer: png(80, 80) });
  await expect(page.locator('.ph-btn img')).toBeVisible();
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Camille');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('1998');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Course' }).click();
  await page.getByLabel('Mot de passe', { exact: true }).fill('Camille-2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await expect(feed.getByRole('button', { name: /^J’aime/ }).first()).toHaveAttribute('aria-pressed', 'true');
  // Un parcours en détail : commentaire, puis l'auteur suivi.
  await feed.getByRole('button', { name: /Jardin des Plantes|Tour de l’île/ }).first().click();
  const fold = page.getByRole('button', { name: /Taille du panneau : réduit/ });
  if (await fold.count()) await fold.click();
  await page.getByRole('textbox', { name: 'Ton commentaire' }).fill('Fait ce matin, superbe.');
  await page.getByRole('button', { name: 'Envoyer le commentaire' }).click();
  await expect(page.getByText('Fait ce matin, superbe.')).toBeVisible();
  // Photos de la sortie : elles rejoignent la bande du parcours et s'ouvrent en plein écran.
  await page.locator('.photos input[type=file]').setInputFiles([
    { name: 'sortie1.png', mimeType: 'image/png', buffer: png() },
    { name: 'sortie2.png', mimeType: 'image/png', buffer: png(48, 64) },
  ]);
  await expect(page.getByText('2 photos ajoutées')).toBeVisible();
  await page.getByRole('button', { name: /^Photo de Camille/ }).first().click();
  const lb = page.getByRole('dialog', { name: /^Photo 1 sur 2/ });
  await expect(lb).toBeVisible();
  await lb.getByRole('button', { name: 'Retirer' }).click();
  await lb.getByRole('button', { name: 'Retirer pour de bon' }).click();
  await expect(page.getByText('Photo retirée')).toBeVisible();
  await page.getByRole('dialog', { name: /^Photo 1 sur 1/ }).getByRole('button', { name: 'Fermer' }).click();
  await page.locator('.author .who').click();
  const profile = page.getByRole('region', { name: /^Profil de / });
  await expect(profile).toBeVisible();
  await page.getByRole('button', { name: /^Suivre / }).click();
  await expect(page.getByRole('button', { name: /^Ne plus suivre / })).toBeVisible();
  // Publier un parcours créé.
  await page.getByRole('button', { name: /Retour à la Communauté/ }).click();
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  // Le changement d'onglet passe par un fondu : on attend l'écran Créer.
  await expect(page.getByRole('button', { name: /^(Faire une boucle|Créer un parcours)$/ }).or(page.getByRole('heading', { name: 'Nouveau parcours' })).first()).toBeVisible();
  await createLoop(page);
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Ma boucle de test');
  await page.locator('form').getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText('Publié dans la Communauté')).toBeVisible();
});

test('premier lancement : créer un compte, puis les quatre onglets', async ({ page, browserName }) => {
  await page.goto('./');
  await expect(page.getByRole('dialog', { name: 'Boucle' })).toBeVisible();
  // Seul l'accueil est à l'écran : le panneau de création attend derrière (Mac compris).
  await expect(page.getByRole('heading', { name: 'Nouveau parcours' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('nouveau@exemple.fr');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await page.getByRole('textbox', { name: /Code à 6 chiffres/ }).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Sam');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('2000');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Vélo' }).click();
  await page.getByLabel('Mot de passe', { exact: true }).fill('Sam-velo-2026');
  await page.locator('.welcome').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await expect(page.getByRole('dialog', { name: 'Boucle' })).toHaveCount(0);
  // Quatre onglets : en bas sur iPhone, en haut du panneau sur Mac.
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  for (const t of ['Créer', 'Communauté', 'Mes parcours', 'Profil']) await expect(tabs.getByRole('button', { name: t, exact: true })).toBeVisible();
  await tabs.getByRole('button', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('region', { name: /^Profil de Sam/ })).toBeVisible();
  // iPhone : les onglets sur la photo prennent tout l'écran, sans poignée à faire glisser.
  if (browserName !== 'chromium') await expect(page.getByRole('button', { name: /^Taille du panneau/ })).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Créer', exact: true }).click();
  if (browserName !== 'chromium') {
    // iPhone : la carte, la bulle « Faire une boucle » à côté des onglets ; les réglages montent puis redescendent.
    const go = page.getByRole('button', { name: 'Faire une boucle' });
    await expect(go).toBeVisible();
    await compose(page);
    await expect(tabs).toHaveCount(0);
    await page.getByRole('button', { name: 'Fermer les réglages' }).click();
    await expect(go).toBeVisible();
  } else {
    // Mac : la carte seule ; « Créer un parcours » ouvre les réglages à gauche, la croix les referme.
    const make = page.getByRole('button', { name: 'Créer un parcours' });
    await make.click();
    await expect(page.getByRole('heading', { name: 'Nouveau parcours' })).toBeVisible();
    await page.getByRole('button', { name: 'Fermer les réglages' }).click();
    await expect(make).toBeVisible();
  }
  // Au lancement suivant, plus de question.
  await page.reload();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog', { name: 'Boucle' })).toHaveCount(0);
});

test('app du téléphone : se connecter en autorisant Santé, sans e-mail ni mot de passe', async ({ page }) => {
  // Faux Santé (comme dans l'app iPhone) : l'accord est donné, une journée de pas à lire.
  await page.addInitScript(() => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (globalThis as { __boucleHealth?: unknown }).__boucleHealth = {
      platform: 'ios',
      days: [{ day, steps: 8421, restingHr: 54, vo2max: 48, distance: 0, workouts: [], source: 'ios' }],
    };
  });
  await page.goto('./?demo=communaute');
  const welcome = page.getByRole('dialog', { name: 'Boucle' });
  await welcome.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByRole('button', { name: 'Continuer avec Apple Santé' }).click();
  // Le profil, sans mot de passe à choisir.
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Sam');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('2000');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Course' }).click();
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveCount(0);
  await page.locator('.welcome').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await expect(welcome).toHaveCount(0);
  // Connecté : le profil montre les pas lus dans Santé ; le compte vit sur ce téléphone (pas de déconnexion).
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await tabs.getByRole('button', { name: 'Profil', exact: true }).click();
  await expect(page.getByText(/8\s?421/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Modifier le profil' }).click();
  await expect(page.getByText('Compte de ce téléphone, ouvert avec Santé')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
});

test('Santé en détail : toucher une donnée ouvre ses 7 ou 28 jours', async ({ page }) => {
  await page.addInitScript(() => {
    const days = Array.from({ length: 28 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 27 + i);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const run = i % 3 === 0;
      return {
        day,
        steps: 6000 + i * 150,
        restingHr: 52 - (i % 4),
        vo2max: 49 + i * 0.05,
        distance: run ? 8000 : 0,
        workouts: run ? [{ sport: 'run', distance: 8000, time: 2580, start: `${day}T07:00:00.000Z`, source: 'Strava', kcal: 500 }] : [],
        source: 'ios',
        walkM: 4500,
        activeKcal: 420,
        exerciseMin: 34,
      };
    });
    (globalThis as { __boucleHealth?: unknown }).__boucleHealth = { platform: 'ios', days };
  });
  await page.goto('./?demo=communaute');
  await page.getByRole('dialog', { name: 'Boucle' }).getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByRole('button', { name: 'Continuer avec Apple Santé' }).click();
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Sam');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('2000');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Course' }).click();
  await page.locator('.welcome').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Profil', exact: true }).click();
  // La fréquence au repos s'ouvre en détail : courbe, repères, jour par jour.
  await page.getByRole('button', { name: /Fréquence cardiaque au repos : voir le détail/ }).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('tablist', { name: 'Donnée de Santé' }) });
  await expect(sheet.getByRole('heading', { name: /Fréquence au repos/ })).toBeVisible();
  await expect(sheet.getByText('Dernière mesure')).toBeVisible();
  await expect(sheet.getByRole('img', { name: /Fréquence au repos, 7 derniers jours/ })).toBeVisible();
  await sheet.getByRole('radio', { name: '28 jours' }).click();
  await expect(sheet.getByRole('img', { name: /28 derniers jours/ })).toBeVisible();
  // Une autre donnée, puis un jour touché sur le graphique.
  await sheet.getByRole('tab', { name: /Sorties/ }).click();
  await expect(sheet.getByText('Sorties reçues de Santé')).toBeVisible();
  await expect(sheet.getByText(/8,0\s?km/).first()).toBeVisible();
  await sheet.getByRole('tab', { name: 'Pas', exact: true }).click();
  await sheet.locator('.hit').last().click();
  await expect(sheet.getByText(/% de l’objectif/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Fermer' }).first().click();
  await expect(sheet).toHaveCount(0);
});

test('mot de passe : reconnexion sans code, puis mot de passe oublié', async ({ page }) => {
  await page.goto('./?demo=communaute');
  const welcome = page.getByRole('dialog', { name: 'Boucle' });
  await welcome.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('lea@exemple.fr');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await page.getByRole('textbox', { name: /Code à 6 chiffres/ }).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Léa');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('1999');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Trail' }).click();
  // Trop court : refusé, avec la raison.
  await page.getByLabel('Mot de passe', { exact: true }).fill('court');
  await page.locator('.welcome').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await expect(page.getByText('Mot de passe trop court : 8 caractères au moins.')).toBeVisible();
  // L'œil montre le mot de passe en clair.
  await page.getByLabel('Mot de passe', { exact: true }).fill('Lea-trail-2026');
  await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Créer mon profil' }).click();
  await expect(welcome).toHaveCount(0);
  // Déconnexion, puis retour par l'onglet Profil : e-mail et mot de passe, sans e-mail à attendre.
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  const signOut = async () => {
    await tabs.getByRole('button', { name: 'Profil', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier le profil' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await tabs.getByRole('button', { name: 'Profil', exact: true }).click();
    // Sans compte, l'onglet Profil reste allumé : la connexion est sa page (pas celle de la Communauté).
    await expect(tabs.getByRole('button', { name: 'Profil', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  };
  await signOut();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('lea@exemple.fr');
  await page.getByLabel('Mot de passe', { exact: true }).fill('pas-le-bon-1');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
  await page.getByLabel('Mot de passe', { exact: true }).fill('Lea-trail-2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('region', { name: /^Profil de Léa/ })).toBeVisible();
  // Mot de passe oublié : un code, et le nouveau dans la foulée.
  await signOut();
  await page.getByRole('button', { name: 'Mot de passe oublié' }).click();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('lea@exemple.fr');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await page.getByRole('textbox', { name: /Code à 6 chiffres/ }).fill('123456');
  await page.getByLabel('Nouveau mot de passe').fill('Lea-trail-2027');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByRole('region', { name: /^Profil de Léa/ })).toBeVisible();
  // Le nouveau mot de passe sert à la connexion suivante.
  await signOut();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('lea@exemple.fr');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Lea-trail-2027');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('region', { name: /^Profil de Léa/ })).toBeVisible();
});

// Garde-fou des mises à jour (MapLibre 6 a d'abord laissé la carte vide et décalé le cadrage) : la carte
// se dessine sans erreur (ni service bloqué par les règles de sécurité de la page), et un parcours trouvé
// tient dans la partie visible, hors panneau.
test('carte : aucune erreur, parcours cadré dans la partie visible', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && /worker|webgl|maplibre|content security policy|refused to/i.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  // Sans remonter le panneau : sur iPhone, il se replie pour montrer tout le parcours.
  await compose(page);
  await page.getByRole('button', { name: /Créer la boucle/ }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('.card.ghost')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const start = (await page.locator('.mk-start').boundingBox())!;
  const panel = (await page.locator('section.panel').boundingBox())!;
  const view = page.viewportSize()!;
  expect(start.x).toBeGreaterThan(0);
  expect(start.x + start.width).toBeLessThan(view.width);
  expect(start.y).toBeGreaterThan(0);
  if (browserName === 'chromium') expect(start.x).toBeGreaterThan(panel.x + panel.width);
  else expect(start.y + start.height).toBeLessThan(panel.y);
  expect(errors).toEqual([]);
});
