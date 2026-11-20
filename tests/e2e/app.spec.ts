/* Parcours complets dans un vrai navigateur, contre les services publics (réseau requis). */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('./');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
}

async function createLoop(page: Page) {
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
  await page.getByRole('button', { name: /Mes parcours/ }).first().click();
  await page.getByRole('radio', { name: /Historique/ }).click();
  await expect(page.getByText(/^En /)).toBeVisible();
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
  await expect(page.getByText('restants')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible();
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
  await expect(page.getByText('restants')).toBeVisible({ timeout: 20_000 });
  // On avance pas à pas jusqu'au quart du parcours (environ 2,5 km).
  const quarter = Math.floor(pts.length / 4);
  for (let i = 0; i <= quarter; i += Math.max(1, Math.floor(quarter / 12))) {
    await context.setGeolocation(pts[i]);
    await page.waitForTimeout(250);
  }
  await context.setGeolocation(pts[quarter]);
  await expect(page.getByText(/faits/)).toContainText(/[1-9],\d\s?km/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByText(/Sortie ajoutée à l’historique/)).toBeVisible();
});

test('ouvrir Boucle sur l’iPhone : bandeau et QR code', async ({ page, browserName }) => {
  await open(page);
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
  // Masqué pour de bon ; le bouton téléphone de l'en-tête garde l'accès au QR code.
  await page.reload();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Sur ton iPhone' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Installer Boucle sur l’iPhone' }).click();
  await expect(page.getByRole('dialog', { name: 'Installer Boucle sur l’iPhone' }).locator('.qr svg')).toBeVisible();
});

test('choisir la destination en touchant la carte', async ({ page, browserName }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Vers un lieu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choisir la destination' });
  await expect(dialog).toBeVisible();
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  if (browserName === 'chromium') {
    // Sur Mac, la recherche laisse la carte cliquable à côté ; au survol, un aperçu montre où le point sera posé.
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 4 });
    await expect(page.locator('.aim-label')).toHaveText(/^à \d+,\d\s?km du départ$/);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.35);
  } else {
    await dialog.getByRole('button', { name: /Choisir sur la carte/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Touche la carte' })).toBeVisible();
    await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.3);
  }
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Destination placée ici')).toBeVisible();
  const flag = page.locator('.mk-dest');
  await expect(flag).toBeVisible();
  await expect(page.getByRole('button', { name: /^Destination :/ })).not.toHaveAccessibleName(/Choisir une destination/);
  if (browserName !== 'chromium') return;
  // En mode « Vers un lieu », un clic ailleurs la déplace.
  const before = (await flag.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await expect.poll(async () => (await flag.boundingBox())!.y - before.y).toBeGreaterThan(100);
  await page.getByRole('button', { name: /Créer l’itinéraire/ }).click();
  await expect(page.getByRole('heading', { name: /propositions?$/ })).toBeVisible({ timeout: 60_000 });
});

test('imposer un point de passage dans une boucle', async ({ page, browserName }) => {
  await open(page);
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  if (browserName === 'chromium') {
    // Sur Mac, le bouton est en haut de la colonne, sous le départ, toujours visible.
    await page.getByRole('button', { name: /Passer par un lieu/ }).click();
    await expect(page.getByRole('dialog', { name: 'Choisir un point de passage' })).toBeVisible();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.3, { steps: 4 });
    await expect(page.locator('.aim-label')).toHaveText('Passer par ici');
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.3);
  } else {
    // Sur iPhone, dans la section Forme du panneau.
    await page.getByRole('button', { name: /Passer par un lieu/ }).click();
    await page.getByRole('dialog', { name: 'Choisir un point de passage' }).getByRole('button', { name: /Choisir sur la carte/ }).click();
    await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.3);
  }
  await expect(page.getByText('Point de passage placé ici')).toBeVisible();
  await expect(page.locator('.mk-via')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Passer par :/ })).not.toHaveAccessibleName(/Choisir un lieu/);
  await createLoop(page);
  await expect(page.getByRole('list', { name: 'Respect de ta demande' }).getByText(/^Passe (par|près de)/)).toBeVisible();
  await expect(page.locator('.mk-via')).toBeVisible();
  // Retour aux réglages : on peut le retirer.
  await page.getByRole('button', { name: 'Retour aux réglages' }).click();
  await page.getByRole('button', { name: /Retirer le point de passage/ }).click();
  await expect(page.getByRole('button', { name: /Passer par un lieu/ })).toBeVisible();
});

test('la 3D met la ville en volume, avec sa légende', async ({ page }) => {
  await open(page);
  const btn = page.getByRole('button', { name: 'Relief et bâtiments en 3D' });
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  // Comme dans Plans, le bouton annonce la vue vers laquelle il bascule.
  await expect(btn).toHaveText('2D');
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
    await expect(page.getByText('Pas de côte notable')).toBeVisible();
  }
});

test('fond de carte Plan ou Satellite, gardé au prochain lancement', async ({ page }) => {
  await open(page);
  const type = page.getByRole('button', { name: /^Type de carte/ });
  await expect(type).toHaveAccessibleName('Type de carte : Plan');
  await type.click();
  await expect(page.getByRole('group', { name: 'Type de carte' })).toBeVisible();
  // Les photos aériennes de l'IGN se chargent dès que l'on passe en Satellite.
  const ortho = page.waitForRequest(/data\.geopf\.fr\/wmts/, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Satellite' }).click();
  await ortho;
  await expect(type).toHaveAccessibleName('Type de carte : Satellite');
  await expect(page.getByRole('group', { name: 'Type de carte' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Type de carte : Satellite' })).toBeVisible();
});

test('vu de loin, la Terre est un globe, et on revient au départ', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: /^Départ : / }).first()).toBeVisible({ timeout: 20_000 });
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
  await expect(page.getByRole('button', { name: /^Départ : / }).first()).toBeVisible({ timeout: 20_000 });
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
  await page.goto('./?demo=communaute');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  if (browserName === 'chromium') await page.getByRole('button', { name: 'Communauté', exact: true }).click();
  else await page.getByRole('button', { name: /Communauté : parcours publiés/ }).click();
  const feed = page.getByRole('list', { name: 'Parcours publiés' });
  await expect(feed).toBeVisible({ timeout: 15_000 });
  // Aimer sans compte : la connexion s'ouvre dans le panneau, puis le j'aime est fait.
  await feed.getByRole('button', { name: /^J’aime/ }).first().click();
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('test@exemple.fr');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await page.getByRole('textbox', { name: /Code à 6 chiffres/ }).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByRole('textbox', { name: 'Prénom' }).fill('Camille');
  await page.getByRole('spinbutton', { name: 'Année de naissance' }).fill('1998');
  await page.getByRole('group', { name: 'Sports pratiqués' }).getByRole('button', { name: 'Course' }).click();
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
  await page.locator('.author .who').click();
  const profile = page.getByRole('region', { name: /^Profil de / });
  await expect(profile).toBeVisible();
  await page.getByRole('button', { name: /^Suivre / }).click();
  await expect(page.getByRole('button', { name: /^Ne plus suivre / })).toBeVisible();
  // Publier un parcours créé.
  await page.getByRole('button', { name: /Retour à la Communauté/ }).click();
  await page.getByRole('button', { name: /Retour aux réglages/ }).click();
  await createLoop(page);
  await page.getByRole('button', { name: 'Publier' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Ma boucle de test');
  await page.locator('form').getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText('Publié dans la Communauté')).toBeVisible();
});
