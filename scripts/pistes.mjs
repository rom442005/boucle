// Index des pistes d'athlétisme de France (public/data/pistes.json), tiré d'OpenStreetMap.
//
// Usage : node scripts/pistes.mjs <dossier des réponses Overpass> [sortie]
//
// Les réponses Overpass (une par carré de 2°) contiennent les leisure=track avec leur géométrie, puis les
// stades et complexes sportifs nommés (centre). Une piste d'athlétisme est gardée si elle en a la forme :
// un ovale plein de 80 à 230 m (étiquetée sport=athletics/running : de 60 à 260 m). Hippodromes, karting,
// BMX, vélodromes, roller sont écartés. Chaque piste garde son centre, sa longueur, sa largeur, son
// orientation, son nombre de couloirs et son revêtement s'ils sont connus, et le nom de son stade.
// Données © les contributeurs d'OpenStreetMap, licence ODbL.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] ?? 'public/data/pistes.json';
if (!dir) {
  console.error('Usage : node scripts/pistes.mjs <dossier> [sortie]');
  process.exit(1);
}

const NOT_RUNNING = /horse|equestrian|kart|motor|moto|bmx|cycling|bicycle|dog|roller|skat|ice|car|auto|speedway|rc_|model|trotting|harness|greyhound|toboggan|bobsleigh|camel/i;
const RUNNING = /athletics|running|multi/i;
const GENERIC = /^(piste|piste d['’]athl[ée]tisme|anneau|track|running track|athletics track|piste d['’]athl[ée])$/i;
/** Un bâtiment ou un autre sport (piscine, gymnase, club de combat…) ne donne pas son nom à une piste. */
const NOT_A_GROUND = /piscine|gymnase|salle|dojo|club|tennis|patinoire|skate|golf|bowling|squash|padel|escalade|boulodrome|centre aquatique|aqua|pool|swimming|gym|hall|fitness|karting|[ée]questre|hippodrome|v[ée]lodrome|jjb|jiu|judo|karat|boxe|boxing|crossfit|danse|dance|yoga|muscu|billard|ping|badminton/i;

const tracks = [];
const venues = [];
const seen = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  let d;
  try {
    d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  } catch {
    console.warn(`${f} illisible : ignoré`);
    continue;
  }
  for (const e of d.elements ?? []) {
    const key = `${e.type}/${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = e.tags ?? {};
    if (t.leisure === 'track') tracks.push(e);
    else if (t.name && !NOT_A_GROUND.test(t.name) && (e.center || e.lat != null)) venues.push({ c: e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat], name: t.name, kind: t.leisure });
  }
}

/** Contour d'une piste : le chemin fermé, ou les membres extérieurs d'une relation mis bout à bout. */
function ringOf(e) {
  if (e.type === 'way') {
    const g = (e.geometry ?? []).filter(Boolean).map((p) => [p.lon, p.lat]);
    if (g.length < 5) return null;
    const gap = dist(g[0], g[g.length - 1]);
    return gap < 15 ? g : null;
  }
  const outer = (e.members ?? []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry);
  const pts = outer.flatMap((m) => m.geometry.filter(Boolean).map((p) => [p.lon, p.lat]));
  return pts.length >= 5 ? hull(pts) : null;
}

function dist(a, b) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110540);
}

/** Longueur, largeur, remplissage et orientation (degrés, sens trigonométrique depuis l'est) du rectangle le plus serré. */
function shapeOf(ring) {
  const c0 = ring[0];
  const kx = 111320 * Math.cos((c0[1] * Math.PI) / 180);
  const P = ring.map((p) => [(p[0] - c0[0]) * kx, (p[1] - c0[1]) * 110540]);
  let area = 0;
  for (let k = 1; k < P.length; k++) area += P[k - 1][0] * P[k][1] - P[k][0] * P[k - 1][1];
  area = Math.abs(area) / 2;
  let best = { ar: Infinity };
  for (let a = 0; a < 180; a += 1) {
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const [px, py] of P) {
      const u = px * c + py * s;
      const v = -px * s + py * c;
      if (u < mnx) mnx = u;
      if (u > mxx) mxx = u;
      if (v < mny) mny = v;
      if (v > mxy) mxy = v;
    }
    const ar = (mxx - mnx) * (mxy - mny);
    if (ar < best.ar) {
      const du = mxx - mnx;
      const dv = mxy - mny;
      // Centre du rectangle, ramené en coordonnées.
      const cu = (mxx + mnx) / 2;
      const cv = (mxy + mny) / 2;
      const cx = cu * c - cv * s;
      const cy = cu * s + cv * c;
      best = { ar, L: Math.max(du, dv), W: Math.min(du, dv), angle: du >= dv ? a : (a + 90) % 180, center: [c0[0] + cx / kx, c0[1] + cy / 110540] };
    }
  }
  return { ...best, area, fill: best.ar > 0 ? area / best.ar : 0 };
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...h, h[0]];
}

const SURF = { tartan: 't', synthetic: 't', 'artificial_turf': 't', rubber: 't', acrylic: 't', cinder: 'c', clay: 'c', dirt: 'c', ground: 'c', gravel: 'c', fine_gravel: 'c', compacted: 'c', grass: 'g', asphalt: 'a', paved: 'a', concrete: 'a' };

const kept = [];
let refused = 0;
for (const e of tracks) {
  const t = e.tags;
  const sport = t.sport ?? '';
  const running = RUNNING.test(sport);
  if (!running && NOT_RUNNING.test(sport)) {
    refused++;
    continue;
  }
  const ring = ringOf(e);
  if (!ring) continue;
  const s = shapeOf(ring);
  const ok = running
    ? s.L >= 60 && s.L <= 260 && s.W >= 25 && s.W <= 130 && s.L / s.W <= 3 && s.fill >= 0.6
    : s.L >= 80 && s.L <= 230 && s.W >= 40 && s.W <= 115 && s.L / s.W <= 2.6 && s.fill >= 0.7;
  if (!ok) continue;
  const lanes = parseInt(t.lanes ?? '', 10);
  kept.push({
    c: s.center,
    L: s.L,
    W: s.W,
    a: s.angle,
    lanes: lanes >= 1 && lanes <= 12 ? lanes : 0,
    name: t.name && !GENERIC.test(t.name.trim()) ? t.name.trim() : null,
    surf: SURF[t.surface] ?? '',
    area: s.area,
  });
}

// Une même piste dessinée deux fois (anneau et surface) : la plus grande reste, avec ce que l'autre savait.
kept.sort((a, b) => b.area - a.area);
const final = [];
for (const k of kept) {
  const twin = final.find((f) => dist(f.c, k.c) < 45);
  if (twin) {
    twin.lanes ||= k.lanes;
    twin.name ??= k.name;
    twin.surf ||= k.surf;
    continue;
  }
  final.push(k);
}

// Nom du stade ou du complexe le plus proche (moins de 350 m), quand la piste n'a pas le sien.
const grid = new Map();
const cell = (c) => `${Math.floor(c[0] * 100)}:${Math.floor(c[1] * 100)}`;
for (const v of venues) {
  const k = cell(v.c);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(v);
}
for (const k of final) {
  if (k.name) continue;
  const [cx, cy] = [Math.floor(k.c[0] * 100), Math.floor(k.c[1] * 100)];
  let best = null;
  let bd = 300;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const v of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        // Un stade compte plus qu'un grand complexe (son centre peut être loin de la piste).
        const d = dist(k.c, v.c) * (v.kind === 'stadium' ? 0.7 : 1);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
  if (best) k.name = best.name;
}

const names = [];
const nameIdx = new Map();
const rows = final
  .sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0])
  .map((k) => {
    let ni = -1;
    if (k.name) {
      if (!nameIdx.has(k.name)) {
        nameIdx.set(k.name, names.length);
        names.push(k.name);
      }
      ni = nameIdx.get(k.name);
    }
    return [Math.round(k.c[0] * 1e5), Math.round(k.c[1] * 1e5), Math.round(k.L), Math.round(k.W), Math.round(k.a), k.lanes, ni, k.surf];
  });

const doc = { v: 1, at: new Date().toISOString().slice(0, 10), src: '© OpenStreetMap (ODbL)', t: rows, n: names };
writeFileSync(out, JSON.stringify(doc));
console.log(`${tracks.length} pistes OSM, ${refused} d'autres sports, ${rows.length} pistes d'athlétisme gardées, ${rows.filter((r) => r[6] >= 0).length} nommées → ${out}`);
