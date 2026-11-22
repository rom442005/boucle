import type { LngLat } from './types';

/*
 * Pistes d'athlétisme de France et des pays voisins, tirées d'OpenStreetMap une fois pour toutes
 * (scripts/pistes-telecharger.sh puis scripts/pistes.mjs, fichier public/data/pistes.json, ~5 300 pistes,
 * 100 Ko compressé) : toutes visibles d'un coup, à n'importe quel zoom, sans relire les tuiles. Plus loin, la
 * carte les reconnaît encore dans ses tuiles (zones.ts).
 *
 * Chaque piste est redessinée comme sur le terrain, à sa taille et dans son orientation : anneau brique,
 * couloirs blancs, ligne d'arrivée, pelouse et terrain au centre.
 */

export interface TrackRec {
  /** rang dans l'index (les pistes reconnues dans les tuiles, hors de France, à partir d'un million) */
  id: number;
  c: LngLat;
  /** longueur et largeur hors tout (m) */
  L: number;
  W: number;
  /** orientation du grand axe (degrés, sens trigonométrique depuis l'est) */
  a: number;
  /** couloirs (0 : inconnu) */
  lanes: number;
  name: string | null;
  /** revêtement : t synthétique, c cendrée/terre, g herbe, a enrobé, '' inconnu */
  surf: string;
}

/** Emprise couverte par le fichier : la France métropolitaine, la Corse et les pays voisins jusqu'au bord du rectangle. */
export const TRACKS_BOUNDS: [number, number, number, number] = [-6, 41, 10, 51];

export const inTracksArea = (c: LngLat) => c[0] >= TRACKS_BOUNDS[0] && c[0] <= TRACKS_BOUNDS[2] && c[1] >= TRACKS_BOUNDS[1] && c[1] <= TRACKS_BOUNDS[3];

let loading: Promise<TrackRec[]> | null = null;
let all: TrackRec[] = [];

/** Toutes les pistes (chargées une fois). */
export function loadTracks(): Promise<TrackRec[]> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/pistes.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { t: [number, number, number, number, number, number, number, string][]; n: string[] } | null) => {
      all = (d?.t ?? []).map(([x, y, L, W, a, lanes, ni, surf], id) => ({ id, c: [x / 1e5, y / 1e5] as LngLat, L, W, a, lanes, name: ni >= 0 ? (d!.n[ni] ?? null) : null, surf }));
      return all;
    })
    .catch(() => {
      loading = null;
      return [];
    });
  return loading;
}

/** Pistes déjà chargées dans une emprise [ouest, sud, est, nord]. */
export function tracksIn(b: [number, number, number, number], list = all): TrackRec[] {
  return list.filter((t) => t.c[0] >= b[0] && t.c[0] <= b[2] && t.c[1] >= b[1] && t.c[1] <= b[3]);
}

/** Longueur d'un tour à la corde (couloir 1), arrondie aux longueurs habituelles (400, 300, 250, 200 m). */
export function lapLength(t: Pick<TrackRec, 'L' | 'W' | 'lanes'>): number {
  const g = geometryOf(t);
  const lap = 2 * g.S + 2 * Math.PI * (g.Rin + 0.3);
  for (const std of [400, 300, 250, 200]) if (Math.abs(lap - std) / std < 0.12) return std;
  return Math.round(lap / 10) * 10;
}

/** Couloirs dessinés : ceux de la carte, sinon selon la largeur (8 sur une grande piste, 6, puis 4). */
export function lanesOf(t: Pick<TrackRec, 'W' | 'lanes'>): number {
  if (t.lanes) return t.lanes;
  return t.W >= 86 ? 8 : t.W >= 66 ? 6 : 4;
}

/** Proportions d'une piste : lignes droites, rayon extérieur et intérieur de l'anneau (m). */
function geometryOf(t: Pick<TrackRec, 'L' | 'W' | 'lanes'>) {
  const W = Math.max(30, t.W);
  const L = Math.max(W, t.L);
  const lanes = lanesOf({ W, lanes: t.lanes });
  const Rout = W / 2;
  const S = L - W;
  const ring = Math.min(lanes * 1.22 + 0.4, Rout * 0.45);
  return { S, Rout, Rin: Rout - ring, lanes, lane: (ring - 0.4) / lanes };
}

type XY = [number, number];

/** Contour d'un « stade » (deux demi-cercles reliés par deux droites) de rayon r, en mètres, fermé. */
function stadium(S: number, r: number, n = 28): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push([S / 2 + r * Math.cos(t), r * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / n;
    pts.push([-S / 2 + r * Math.cos(t), r * Math.sin(t)]);
  }
  pts.push(pts[0]);
  return pts;
}

function rect(cx: number, hl: number, hw: number): XY[] {
  return [
    [cx - hl, -hw],
    [cx + hl, -hw],
    [cx + hl, hw],
    [cx - hl, hw],
    [cx - hl, -hw],
  ];
}

function circle(cx: number, r: number, n = 24): XY[] {
  return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as XY);
}

/**
 * La piste redessinée, en morceaux à styler : 'infield' (pelouse), 'ring' (anneau brique, avec son trou),
 * 'edge' (bords de l'anneau), 'lane' (lignes de couloir), 'finish' (ligne d'arrivée), 'pitch' (lignes du
 * terrain), 'hit' (toute la piste, pour la toucher). `id` relie les morceaux à leur piste.
 */
export function trackFeatures(t: TrackRec): GeoJSON.Feature[] {
  const id = t.id;
  const g = geometryOf(t);
  const a = (t.a * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const kx = 111320 * Math.cos((t.c[1] * Math.PI) / 180);
  const ky = 110540;
  const geo = (pts: XY[]) => pts.map(([x, y]) => [t.c[0] + (x * ca - y * sa) / kx, t.c[1] + (x * sa + y * ca) / ky]);
  const poly = (part: string, rings: XY[][]): GeoJSON.Feature => ({ type: 'Feature', properties: { part, id }, geometry: { type: 'Polygon', coordinates: rings.map(geo) } });
  const line = (part: string, lines: XY[][]): GeoJSON.Feature => ({ type: 'Feature', properties: { part, id }, geometry: { type: 'MultiLineString', coordinates: lines.map(geo) } });

  const outer = stadium(g.S, g.Rout);
  const inner = stadium(g.S, g.Rin);
  const out: GeoJSON.Feature[] = [poly('hit', [outer]), poly('infield', [inner]), poly('ring', [outer, [...inner].reverse()]), line('edge', [outer, inner])];
  const lanes: XY[][] = [];
  for (let k = 1; k < g.lanes; k++) lanes.push(stadium(g.S, g.Rin + 0.2 + k * g.lane));
  if (lanes.length) out.push(line('lane', lanes));
  // Ligne d'arrivée : au bout de la ligne droite d'en bas, en travers de tous les couloirs.
  out.push(line('finish', [[[g.S / 2, -g.Rin], [g.S / 2, -g.Rout]]]));
  // Terrain au centre (grande piste) : contour, ligne médiane, rond central, surfaces de réparation.
  const IL = g.S + 2 * g.Rin;
  if (g.Rin >= 26 && IL >= 100) {
    const hl = Math.min(52, 0.31 * IL);
    const hw = Math.min(33, 0.41 * 2 * g.Rin);
    const box = Math.min(16.5, hl * 0.32);
    const bw = Math.min(20.15, hw * 0.6);
    out.push(
      line('pitch', [
        rect(0, hl, hw),
        [
          [0, -hw],
          [0, hw],
        ],
        circle(0, Math.min(9.15, hw * 0.28)),
        rect(-hl + box / 2, box / 2, bw),
        rect(hl - box / 2, box / 2, bw),
      ]),
    );
  }
  return out;
}

/** Repère d'une piste (pour les grappes et les pastilles). */
export function trackPoint(t: TrackRec): GeoJSON.Feature {
  return { type: 'Feature', properties: { id: t.id, kind: 'track' }, geometry: { type: 'Point', coordinates: t.c } };
}

/** Emprise d'une piste [ouest, sud, est, nord]. */
export function trackBounds(t: TrackRec): [number, number, number, number] {
  const r = t.L / 2;
  const dx = r / (111320 * Math.cos((t.c[1] * Math.PI) / 180));
  const dy = r / 110540;
  return [t.c[0] - dx, t.c[1] - dy, t.c[0] + dx, t.c[1] + dy];
}

const SURFACE: Record<string, string> = { t: 'synthétique', c: 'cendrée', g: 'herbe', a: 'enrobé' };

/** Ce qu'on sait d'une piste, en quelques mots : « 400 m · 8 couloirs · synthétique ». */
export function trackFacts(t: TrackRec): string {
  return [`${lapLength(t)} m`, `${lanesOf(t)} couloirs`, SURFACE[t.surf]].filter(Boolean).join(' · ');
}

/** Clé d'une piste (pour la reconnaître d'une liste à l'autre). */
export const trackKey = (t: Pick<TrackRec, 'c'>) => `${Math.round(t.c[0] * 2000)}:${Math.round(t.c[1] * 2000)}`;
