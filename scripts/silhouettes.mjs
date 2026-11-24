// Silhouettes des idées de dessins : le contour des icônes Phosphor « fill » (licence MIT), mis à plat en
// traits simples (le contour extérieur, plus les détails assez grands : yeux, museau, roues…). Sortie :
// src/lib/silhouettes.json, que shapes.ts relie aux mots (« vache », « cheval », « fusée »…).
// Usage : node scripts/silhouettes.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ICONS = [
  'cow', 'horse', 'dog', 'cat', 'bird', 'fish', 'fish-simple', 'butterfly', 'rabbit', 'shrimp', 'bug-beetle', 'bug', 'paw-print',
  'piggy-bank', 'alien', 'ghost', 'skull', 'rocket', 'airplane', 'airplane-tilt', 'car-profile', 'boat', 'sailboat', 'anchor',
  'bicycle', 'motorcycle', 'scooter', 'tractor', 'train', 'bus', 'truck', 'van', 
  'tree', 'tree-palm', 'tree-evergreen', 'flower-tulip', 'flower-lotus', 'cactus', 'plant', 'acorn', 'leaf',
  'carrot', 'avocado', 'pepper', 'orange', 'cherries', 'pizza', 'ice-cream', 'popsicle', 'coffee', 'beer-stein', 'wine', 'cake',
  'cookie', 'bread', 'hamburger', 'egg', 'cheese', 
  'guitar', 'music-notes', 'headphones', 'crown', 'key', 'bell', 'umbrella', 'snowflake', 'lighthouse', 'castle-turret', 'tent',
  'tipi', 'windmill', 'house', 'barn', 'trophy', 'medal', 'boot', 't-shirt', 'dress', 'sunglasses', 'game-controller',
  'basketball', 'tennis-ball', 'volleyball', 'barbell', 'bone', 'tooth', 'brain', 'hand', 'hand-peace', 'thumbs-up',
  'puzzle-piece', 'lightbulb', 'magnet', 'scissors', 'paper-plane', 'planet', 'moon-stars', 'cloud-lightning', 'rainbow',
  'flame', 'hourglass', 'watch', 'compass-rose', 'shield', 'sword', 'axe', 'spade', 'club', 'person-simple-run',
  'footprints', 'balloon', 'gift', 'heartbeat', 'flag', 'drop',
  'sun', 'moon', 'cloud', 'lightning', 'star', 'heart', 'diamond', 'mountains', 'campfire', 'hamburger',
];

const SRC = 'node_modules/@phosphor-icons/core/assets/fill';

/* ------------------------------ Chemins SVG ------------------------------ */

function tokens(d) {
  return d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
}

/** Arc SVG (spec F.6.5) en points. */
function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const p = (phi * Math.PI) / 180;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy;
  const y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2;
  const cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
  return out;
}

/** Un chemin SVG en sous-chemins (listes de points). */
function flatten(d) {
  const tk = tokens(d);
  const subs = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let lastC = null;
  let lastQ = null;
  let i = 0;
  const num = () => parseFloat(tk[i++]);
  const isNum = () => i < tk.length && !/[A-Za-z]/.test(tk[i]);
  while (i < tk.length) {
    if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      if (cur) cur.push([sx, sy]);
      x = sx;
      y = sy;
      lastC = lastQ = null;
      continue;
    }
    if (C === 'M') {
      x = (rel ? x : 0) + num();
      y = (rel ? y : 0) + num();
      sx = x;
      sy = y;
      cur = [[x, y]];
      subs.push(cur);
      cmd = rel ? 'l' : 'L';
      lastC = lastQ = null;
      continue;
    }
    if (C === 'L') {
      x = (rel ? x : 0) + num();
      y = (rel ? y : 0) + num();
      cur.push([x, y]);
      lastC = lastQ = null;
    } else if (C === 'H') {
      x = (rel ? x : 0) + num();
      cur.push([x, y]);
      lastC = lastQ = null;
    } else if (C === 'V') {
      y = (rel ? y : 0) + num();
      cur.push([x, y]);
      lastC = lastQ = null;
    } else if (C === 'C' || C === 'S') {
      let x1;
      let y1;
      if (C === 'C') {
        x1 = (rel ? x : 0) + num();
        y1 = (rel ? y : 0) + num();
      } else {
        x1 = lastC ? 2 * x - lastC[0] : x;
        y1 = lastC ? 2 * y - lastC[1] : y;
      }
      const x2 = (rel ? x : 0) + num();
      const y2 = (rel ? y : 0) + num();
      const ex = (rel ? x : 0) + num();
      const ey = (rel ? y : 0) + num();
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        const u = 1 - t;
        cur.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
      }
      lastC = [x2, y2];
      lastQ = null;
      x = ex;
      y = ey;
    } else if (C === 'Q' || C === 'T') {
      let qx;
      let qy;
      if (C === 'Q') {
        qx = (rel ? x : 0) + num();
        qy = (rel ? y : 0) + num();
      } else {
        qx = lastQ ? 2 * x - lastQ[0] : x;
        qy = lastQ ? 2 * y - lastQ[1] : y;
      }
      const ex = (rel ? x : 0) + num();
      const ey = (rel ? y : 0) + num();
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        cur.push([u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey]);
      }
      lastQ = [qx, qy];
      lastC = null;
      x = ex;
      y = ey;
    } else if (C === 'A') {
      const rx = num();
      const ry = num();
      const phi = num();
      const fa = num();
      const fs = num();
      const ex = (rel ? x : 0) + num();
      const ey = (rel ? y : 0) + num();
      cur.push(...arcPoints(x, y, rx, ry, phi, fa, fs, ex, ey));
      x = ex;
      y = ey;
      lastC = lastQ = null;
    } else {
      throw new Error(`commande ${cmd} inconnue`);
    }
    // Commande répétée sans lettre : on continue avec la même.
    if (!isNum()) continue;
  }
  return subs.filter((s) => s.length > 2);
}

const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return a / 2;
};

/** Douglas-Peucker. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let idx = -1;
  let dmax = 0;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = L < 1e-9 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

const out = {};
for (const name of [...new Set(ICONS)]) {
  let svg;
  try {
    svg = readFileSync(`${SRC}/${name}-fill.svg`, 'utf8');
  } catch {
    console.warn('absente :', name);
    continue;
  }
  const ds = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);
  const subs = ds.flatMap(flatten).map((s) => ({ s, a: Math.abs(area(s)) }));
  const max = Math.max(...subs.map((x) => x.a));
  // Le contour, puis les parties ou détails assez grands pour se voir une fois courus (au plus 5 traits).
  const keep = subs
    .filter((x) => x.a >= max * 0.035)
    .sort((p, q) => q.a - p.a)
    .slice(0, 5)
    .map((x) => simplify(x.s, 1.6));
  const all = keep.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = 2 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  out[name] = keep.map((s) => s.map(([px, py]) => [Math.round((px - cx) * k * 1000) / 1000, Math.round((py - cy) * k * 1000) / 1000]));
}
writeFileSync('src/lib/silhouettes.json', JSON.stringify(out));
const pts = Object.values(out).flat(2).length;
console.log(`${Object.keys(out).length} silhouettes, ${pts} points, ${(JSON.stringify(out).length / 1024).toFixed(0)} Ko`);
