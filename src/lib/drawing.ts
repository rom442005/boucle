/*
 * Dessins à courir (« GPS art ») : ce que l'on trace du doigt ou à la souris dans le carnet du mode Dessin,
 * puis la géométrie qui en fait un parcours. Les traits sont en coordonnées du carnet (x vers la droite,
 * y vers le bas, de 0 à 1) ; ils s'enchaînent dans l'ordre où ils ont été tracés, et un dernier segment
 * ramène au point de départ (un parcours dessiné est toujours une boucle).
 */

export type Pt = [number, number];

export type DrawPreset = 'circle' | 'square' | 'heart' | 'star';

export interface Drawing {
  strokes: Pt[][];
  /** forme toute prête choisie (sert au nom du parcours), absente pour un dessin à main levée */
  preset?: DrawPreset;
  /** nom d'une idée choisie dans la discussion (« Diamant », « 2027 »), pour le nom du parcours */
  name?: string;
}

export const PRESET_NAMES: Record<DrawPreset, string> = {
  circle: 'Rond',
  square: 'Carré',
  heart: 'Cœur',
  star: 'Étoile',
};

const M = 0.14;

/** Formes toutes prêtes : un trait fermé, centré dans le carnet, qui commence en bas ou en haut. */
export function presetDrawing(kind: DrawPreset): Drawing {
  const c = 0.5;
  const r = 0.5 - M;
  let pts: Pt[] = [];
  if (kind === 'circle') {
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * 2 * Math.PI;
      pts.push([c + r * Math.sin(a), c + r * Math.cos(a)]);
    }
  } else if (kind === 'square') {
    const a = M + 0.02;
    const b = 1 - M - 0.02;
    pts = [
      [c, b],
      [a, b],
      [a, a],
      [b, a],
      [b, b],
      [c, b],
    ];
  } else if (kind === 'heart') {
    // Courbe classique du cœur, la pointe en bas ; départ à la pointe.
    const raw: Pt[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = Math.PI + (i / 96) * 2 * Math.PI;
      raw.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
    }
    pts = fitBox(raw, M);
  } else {
    // Étoile à cinq branches, pointe en haut ; départ à cette pointe.
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * 2 * Math.PI;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push([c + rr * Math.sin(a), c - rr * Math.cos(a)]);
    }
    pts = fitBox(pts, M);
  }
  return { strokes: [pts], preset: kind };
}

/** Recadre des points dans le carnet (marge `m`), sans déformer. */
function fitBox(pts: Pt[], m: number): Pt[] {
  const b = boundsOf(pts);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const s = (1 - 2 * m) / Math.max(w, h, 1e-9);
  const ox = 0.5 - ((b.x0 + b.x1) / 2) * s;
  const oy = 0.5 - ((b.y0 + b.y1) / 2) * s;
  return pts.map(([x, y]) => [x * s + ox, y * s + oy]);
}

export function boundsOf(pts: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export const lengthOf = (pts: Pt[]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas-Peucker sur des points plans. */
export function simplifyPts(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > dmax) {
        dmax = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Lissage léger d'un trait tracé à la main (moyenne glissante), extrémités gardées. */
export function smoothStroke(pts: Pt[], passes = 2): Pt[] {
  let cur = pts;
  for (let k = 0; k < passes; k++) {
    if (cur.length < 3) return cur;
    const out: Pt[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      out.push([(cur[i - 1][0] + 2 * cur[i][0] + cur[i + 1][0]) / 4, (cur[i - 1][1] + 2 * cur[i][1] + cur[i + 1][1]) / 4]);
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Un trait assez long pour compter (un simple toucher n'en est pas un). */
export const isStroke = (s: Pt[]) => s.length >= 2 && lengthOf(s) >= 0.02;

export const hasDrawing = (d: Drawing | null | undefined): d is Drawing => !!d && d.strokes.some(isStroke);

/**
 * Le tour complet du dessin : les traits dans l'ordre, reliés en ligne droite, puis le retour au premier
 * point. Rend une ligne fermée (le dernier point est le premier), simplifiée sans perdre les angles.
 */
export function cycleOf(d: Drawing): Pt[] {
  const out: Pt[] = [];
  for (const s of d.strokes) {
    if (!isStroke(s)) continue;
    for (const p of simplifyPts(s, 0.0025)) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) out.push(p);
    }
  }
  if (out.length < 2) return out;
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-4) out.push([first[0], first[1]]);
  else out[out.length - 1] = [first[0], first[1]];
  return out;
}

/** Point à l'abscisse curviligne `s` d'une ligne (avec ses longueurs cumulées). */
export function pointAlong(pts: Pt[], cum: Float64Array, s: number): { p: Pt; i: number } {
  const total = cum[cum.length - 1];
  const x = Math.max(0, Math.min(total, s));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= x) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (x - cum[lo]) / seg : 0;
  return { p: [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t], i: lo };
}

export function cumulativePts(pts: Pt[]): Float64Array {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return cum;
}

/** Points régulièrement espacés le long d'une ligne (pas `step`), en gardant ses sommets (les angles). */
export function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/**
 * Le tour qui commence à l'abscisse `a` (0 à 1 du tour) : même figure, autre point de départ. Les sommets
 * sont gardés, le point de départ est ajouté au début et à la fin.
 */
export function rotateCycle(cycle: Pt[], cum: Float64Array, a: number): Pt[] {
  const total = cum[cum.length - 1];
  const s = (((a % 1) + 1) % 1) * total;
  const { p, i } = pointAlong(cycle, cum, s);
  // cycle[0] === cycle[n-1] : on parcourt i+1 … n-1, puis 1 … i.
  const n = cycle.length;
  const out: Pt[] = [p];
  for (let k = i + 1; k < n; k++) out.push(cycle[k]);
  for (let k = 1; k <= i; k++) out.push(cycle[k]);
  out.push([p[0], p[1]]);
  return out.filter((q, k) => k === 0 || Math.hypot(q[0] - out[k - 1][0], q[1] - out[k - 1][1]) > 1e-9);
}

/** Pointes du dessin (virage de plus de 110°) : les pointes d'une étoile, le bas d'un cœur… */
export function tipsOf(pts: Pt[], minTurn = 110): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  const closed = n > 2 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 1e-6;
  const at = (i: number) => pts[(i + n - 1) % (n - 1)];
  for (let i = closed ? 0 : 1; i < (closed ? n - 1 : n - 1); i++) {
    const a = closed ? at(i - 1) : pts[i - 1];
    const b = pts[i];
    const c = closed ? at(i + 1) : pts[i + 1];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const turn = Math.abs(((((h2 - h1) * 180) / Math.PI + 540) % 360) - 180);
    if (turn >= minTurn) out.push(b);
  }
  return out;
}

/** Diamètre (plus grand écart entre deux points), pour mettre l'écart à l'échelle du dessin. */
export function diameterOf(pts: Pt[]): number {
  let m = 0;
  const step = Math.max(1, Math.floor(pts.length / 120));
  for (let i = 0; i < pts.length; i += step) for (let j = i + step; j < pts.length; j += step) m = Math.max(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return m;
}

/** Écart moyen de chaque point de `a` à la ligne `b` (mêmes unités). */
export function meanDistance(a: Pt[], b: Pt[]): number {
  const d = distancesTo(a, b);
  if (!d.length) return Infinity;
  let sum = 0;
  for (const x of d) sum += x;
  return sum / d.length;
}

/** Écart de chaque point de `a` à la ligne `b` (mêmes unités). */
export function distancesTo(a: Pt[], b: Pt[]): Float64Array {
  const out = new Float64Array(a.length);
  if (!a.length || b.length < 2) return out.fill(Infinity);
  // Grille de cases pour ne tester que les segments proches.
  const bb = boundsOf(b);
  const span = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 1e-9);
  const cell = span / 40;
  const grid = new Map<string, number[]>();
  for (let i = 1; i < b.length; i++) {
    const x0 = Math.floor(Math.min(b[i - 1][0], b[i][0]) / cell);
    const x1 = Math.floor(Math.max(b[i - 1][0], b[i][0]) / cell);
    const y0 = Math.floor(Math.min(b[i - 1][1], b[i][1]) / cell);
    const y1 = Math.floor(Math.max(b[i - 1][1], b[i][1]) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x}:${y}`;
        const l = grid.get(k);
        if (l) l.push(i);
        else grid.set(k, [i]);
      }
  }
  a.forEach((p, k) => {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    let best = Infinity;
    for (let r = 0; r < 60 && best > (r - 1) * cell; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++) {
          if (r > 0 && x > cx - r && x < cx + r && y > cy - r && y < cy + r) continue;
          const l = grid.get(`${x}:${y}`);
          if (!l) continue;
          for (const i of l) best = Math.min(best, segDist(p, b[i - 1], b[i]));
        }
    }
    if (!Number.isFinite(best)) for (let i = 1; i < b.length; i++) best = Math.min(best, segDist(p, b[i - 1], b[i]));
    out[k] = best;
  });
  return out;
}

/** Version compacte d'un dessin pour le stockage (3 décimales). */
export function packDrawing(d: Drawing): Drawing {
  return {
    strokes: d.strokes.filter(isStroke).map((s) => simplifyPts(s, 0.0015).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as Pt)),
    ...(d.preset ? { preset: d.preset } : {}),
    ...(d.name ? { name: d.name.slice(0, 40) } : {}),
  };
}
