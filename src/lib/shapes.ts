import type { Drawing, Pt } from './drawing';

/*
 * Idées de dessins à partir d'une phrase (« un diamant », « 2027 », « Romain », « un chat ») : une
 * bibliothèque de formes dessinées d'un trait, pensées pour la course (silhouettes simples, pas de détail plus
 * petit qu'un pâté de maisons), et une police au trait pour les lettres et les chiffres. Tout est sur
 * l'appareil, sans réseau. Quand l'IA est branchée (voir supabase/functions/dessin), ses idées s'ajoutent.
 */

export interface Idea {
  name: string;
  drawing: Drawing;
  /** proposée par l'IA */
  ai?: boolean;
}

type Stroke = Pt[];
const M = 0.12;

/** Recadre des traits dans le carnet (marge M), sans déformer. */
export function fit(strokes: Stroke[], margin = M): Stroke[] {
  const all = strokes.flat();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of all) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const s = (1 - 2 * margin) / Math.max(x1 - x0, y1 - y0, 1e-9);
  const ox = 0.5 - ((x0 + x1) / 2) * s;
  const oy = 0.5 - ((y0 + y1) / 2) * s;
  return strokes.map((st) => st.map(([x, y]) => [x * s + ox, y * s + oy] as Pt));
}

const close = (s: Stroke): Stroke => [...s, s[0]];
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Stroke =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });
const param = (f: (t: number) => Pt, t0: number, t1: number, n = 96): Stroke => Array.from({ length: n + 1 }, (_, i) => f(t0 + ((t1 - t0) * i) / n));
const PI = Math.PI;

/* ------------------------------------ Formes ------------------------------------ */

const heart = (): Stroke => param((t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))], PI, 3 * PI);
const star = (n: number, inner: number): Stroke =>
  close(Array.from({ length: 2 * n }, (_, i) => {
    const a = (i / (2 * n)) * 2 * PI;
    const r = i % 2 ? inner : 1;
    return [r * Math.sin(a), -r * Math.cos(a)] as Pt;
  }));

interface Entry {
  words: string[];
  ideas: () => { name: string; strokes: Stroke[] }[];
}

const LIBRARY: Entry[] = [
  { words: ['coeur', 'heart', 'amour', 'love', 'saint valentin', 'valentin'], ideas: () => [
    { name: 'Cœur', strokes: [heart()] },
    { name: 'Cœur pointu', strokes: [close([...arc(-0.5, 0, 0.5, 0.5, PI, 2 * PI, 18), ...arc(0.5, 0, 0.5, 0.5, PI, 2 * PI, 18), [0, 1.3]])] },
  ] },
  { words: ['etoile', 'star'], ideas: () => [
    { name: 'Étoile', strokes: [star(5, 0.42)] },
    { name: 'Étoile filante', strokes: [star(5, 0.42).map(([x, y]) => [x * 0.6 + 0.7, y * 0.6 - 0.5] as Pt), [[0.3, -0.25], [-1, 0.6]]] },
    { name: 'Scintillement', strokes: [star(4, 0.28)] },
  ] },
  { words: ['diamant', 'diamond', 'gemme', 'bijou', 'brillant', 'cristal'], ideas: () => [
    // D'abord la forme d'un seul trait (la plus lisible une fois courue), puis la version à facettes.
    { name: 'Diamant', strokes: [close([[-0.6, -0.55], [0.6, -0.55], [1, -0.15], [0, 1], [-1, -0.15]])] },
    { name: 'Diamant à facettes', strokes: [close([[-0.6, -0.55], [0.6, -0.55], [1, -0.15], [0, 1], [-1, -0.15]]), [[-1, -0.15], [1, -0.15]], [[-0.6, -0.55], [-0.3, -0.15], [0, -0.55], [0.3, -0.15], [0.6, -0.55]], [[-0.3, -0.15], [0, 1], [0.3, -0.15]]] },
    { name: 'Losange', strokes: [close([[0, -1], [0.62, 0], [0, 1], [-0.62, 0]])] },
  ] },
  { words: ['losange', 'rhombus'], ideas: () => [{ name: 'Losange', strokes: [close([[0, -1], [0.62, 0], [0, 1], [-0.62, 0]])] }] },
  { words: ['carre', 'square', 'cube'], ideas: () => [{ name: 'Carré', strokes: [close([[0, 0], [1, 0], [1, 1], [0, 1]])] }] },
  { words: ['rectangle'], ideas: () => [{ name: 'Rectangle', strokes: [close([[0, 0], [1.6, 0], [1.6, 1], [0, 1]])] }] },
  { words: ['rond', 'cercle', 'circle', 'anneau'], ideas: () => [{ name: 'Rond', strokes: [arc(0, 0, 1, 1, PI / 2, PI / 2 + 2 * PI, 72)] }] },
  { words: ['ovale', 'oval', 'oeuf', 'egg'], ideas: () => [{ name: 'Ovale', strokes: [arc(0, 0, 0.7, 1, PI / 2, PI / 2 + 2 * PI, 72)] }] },
  { words: ['triangle', 'pyramide'], ideas: () => [{ name: 'Triangle', strokes: [close([[0, -1], [0.95, 0.65], [-0.95, 0.65]])] }] },
  { words: ['eclair', 'foudre', 'lightning', 'orage', 'flash'], ideas: () => [
    { name: 'Éclair', strokes: [close([[0.2, -1], [-0.45, 0.12], [-0.02, 0.12], [-0.25, 1], [0.48, -0.2], [0.05, -0.2], [0.35, -1]])] },
  ] },
  { words: ['maison', 'house', 'home', 'cabane'], ideas: () => [
    { name: 'Maison', strokes: [close([[-0.8, 1], [-0.8, 0], [0, -0.8], [0.8, 0], [0.8, 1]])] },
    { name: 'Maison et porte', strokes: [close([[-0.8, 1], [-0.8, 0], [0, -0.8], [0.8, 0], [0.8, 1], [0.2, 1], [0.2, 0.45], [-0.2, 0.45], [-0.2, 1]])] },
  ] },
  { words: ['sapin', 'arbre', 'noel', 'tree', 'pin'], ideas: () => [
    { name: 'Sapin', strokes: [close([[0, -1], [0.45, -0.45], [0.25, -0.45], [0.65, 0.05], [0.4, 0.05], [0.85, 0.6], [0.12, 0.6], [0.12, 1], [-0.12, 1], [-0.12, 0.6], [-0.85, 0.6], [-0.4, 0.05], [-0.65, 0.05], [-0.25, -0.45], [-0.45, -0.45]])] },
  ] },
  { words: ['lune', 'croissant', 'moon'], ideas: () => [
    { name: 'Croissant de lune', strokes: [close([...arc(0, 0, 1, 1, 0.895, 2 * PI - 0.895, 40), ...arc(0.45, 0, 0.8, 0.8, 2 * PI - 1.35, 1.35, 30)])] },
  ] },
  { words: ['soleil', 'sun', 'ete'], ideas: () => [{ name: 'Soleil', strokes: [star(12, 0.72)] }] },
  { words: ['goutte', 'drop', 'pluie'], ideas: () => [
    { name: 'Goutte', strokes: [close([[0, -1.2], ...arc(0, 0.3, 0.7, 0.7, -PI / 2 + 0.95, PI + PI / 2 - 0.95, 40)])] },
  ] },
  { words: ['feuille', 'leaf', 'automne'], ideas: () => [
    { name: 'Feuille', strokes: [[...arc(0.55, 0, 1, 1.1, PI * 0.72, PI * 1.28, 24), ...arc(-0.55, 0, 1, 1.1, -PI * 0.28, PI * 0.28, 24), [-0.2, 1.25]]] },
  ] },
  { words: ['poisson', 'fish', 'poisson d avril'], ideas: () => [
    { name: 'Poisson', strokes: [close([...arc(0, 0, 1, 0.55, PI * 0.12, PI * 1.88, 36), [1.45, -0.45], [1.45, 0.45]])] },
  ] },
  { words: ['chat', 'cat', 'chaton', 'minou'], ideas: () => [
    { name: 'Tête de chat', strokes: [close([[-0.25, -0.6], [-0.7, -1.05], ...arc(0, 0.1, 0.85, 0.72, 3.77, -0.63, 30), [0.7, -1.05], [0.25, -0.6]])] },
  ] },
  { words: ['smiley', 'sourire', 'visage', 'tete', 'face', 'emoji', 'content'], ideas: () => [
    { name: 'Smiley', strokes: [arc(0, 0, 1, 1, -PI / 2, PI * 1.5, 56), arc(-0.36, -0.28, 0.12, 0.16, 0, 2 * PI, 12), arc(0.36, -0.28, 0.12, 0.16, 0, 2 * PI, 12), arc(0, 0.05, 0.55, 0.5, 0.25, PI - 0.25, 18)] },
  ] },
  { words: ['fleche', 'arrow', 'direction'], ideas: () => [
    { name: 'Flèche', strokes: [close([[-1, -0.22], [0.25, -0.22], [0.25, -0.6], [1, 0], [0.25, 0.6], [0.25, 0.22], [-1, 0.22]])] },
  ] },
  { words: ['couronne', 'crown', 'roi', 'reine', 'king', 'queen'], ideas: () => [
    { name: 'Couronne', strokes: [close([[-1, 0.7], [-1, -0.5], [-0.5, 0.05], [0, -0.8], [0.5, 0.05], [1, -0.5], [1, 0.7]])] },
  ] },
  { words: ['montagne', 'mountain', 'sommet', 'alpes', 'pic'], ideas: () => [
    { name: 'Montagnes', strokes: [close([[-1.3, 0.8], [-0.55, -0.4], [-0.2, 0.15], [0.35, -0.9], [1.3, 0.8]])] },
  ] },
  { words: ['vague', 'wave', 'mer', 'ocean', 'surf'], ideas: () => [
    { name: 'Vague', strokes: [close([...param((t) => [t, -0.3 * Math.sin(t * 2.6)], -1.6, 1.6, 48), [1.6, 0.6], [-1.6, 0.6]])] },
  ] },
  { words: ['infini', 'infinity', 'huit couche'], ideas: () => [
    { name: 'Infini', strokes: [param((t) => [Math.cos(t) / (1 + Math.sin(t) ** 2), (Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2)], 0, 2 * PI, 96)] },
  ] },
  { words: ['note', 'musique', 'music', 'melodie'], ideas: () => [
    { name: 'Note de musique', strokes: [[...arc(-0.35, 0.75, 0.38, 0.28, -0.4, 2 * PI - 0.4, 24), [-0.02, 0.62], [-0.02, -1], [0.55, -0.7], [0.55, -0.45], [-0.02, -0.72]]] },
  ] },
  { words: ['nuage', 'cloud'], ideas: () => [
    { name: 'Nuage', strokes: [close([...arc(-0.62, 0.1, 0.38, 0.38, PI / 2, PI * 1.5, 12), ...arc(-0.15, -0.25, 0.48, 0.48, PI * 1.05, PI * 1.85, 14), ...arc(0.42, -0.08, 0.4, 0.4, PI * 1.25, PI * 2.1, 12), ...arc(0.75, 0.2, 0.28, 0.28, -PI / 2, PI / 2, 10), [-0.62, 0.48]])] },
  ] },
  { words: ['fleur', 'flower', 'marguerite', 'rose', 'printemps'], ideas: () => [
    { name: 'Fleur', strokes: [param((t) => { const r = 0.45 + 0.55 * Math.abs(Math.cos(2.5 * t)); return [r * Math.sin(t), -r * Math.cos(t)]; }, 0, 2 * PI, 160)] },
  ] },
  { words: ['spirale', 'spiral', 'escargot', 'snail', 'tourbillon'], ideas: () => [
    { name: 'Spirale', strokes: [param((t) => [(t / (5 * PI)) * Math.cos(t), (t / (5 * PI)) * Math.sin(t)], 0.6, 5 * PI, 120)] },
  ] },
  { words: ['cadeau', 'gift', 'paquet', 'present'], ideas: () => [
    { name: 'Cadeau', strokes: [close([[-0.8, -0.2], [0.8, -0.2], [0.8, 1], [-0.8, 1]]), [[0, -0.2], [0, 1]], [[0, -0.2], ...arc(-0.32, -0.42, 0.32, 0.2, 0, 2 * PI, 14)], [[0, -0.2], ...arc(0.32, -0.42, 0.32, 0.2, PI, 3 * PI, 14)]] },
  ] },
  { words: ['trefle', 'clover', 'chance', 'irlande'], ideas: () => [
    { name: 'Trèfle', strokes: [[...param((t) => { const r = Math.abs(Math.sin(2 * t)) * 0.9 + 0.1; return [r * Math.cos(t), -r * Math.sin(t)]; }, -PI * 0.75, PI * 1.25, 140), [0.25, 1.2]]] },
  ] },
  { words: ['papillon', 'butterfly'], ideas: () => [
    { name: 'Papillon', strokes: [param((t) => { const r = Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t); return [r * Math.cos(t) * 0.3, -r * Math.sin(t) * 0.3]; }, 0, 2 * PI, 200)] },
  ] },
  { words: ['oiseau', 'bird', 'mouette', 'hirondelle'], ideas: () => [
    { name: 'Oiseau', strokes: [[...arc(-0.5, 0.3, 0.5, 0.5, PI, PI * 1.85, 16), ...arc(0.5, 0.3, 0.5, 0.5, PI * 1.15, 2 * PI, 16)]] },
  ] },
  { words: ['pomme', 'apple'], ideas: () => [
    { name: 'Pomme', strokes: [close([[0, -0.5], ...arc(0.4, 0.12, 0.6, 0.72, -2.1, 1.45, 18), ...arc(-0.4, 0.12, 0.6, 0.72, 1.69, 5.24, 18)]), [[0, -0.5], [0.1, -1]], arc(0.36, -0.86, 0.26, 0.12, 0, 2 * PI, 12)] },
  ] },
  { words: ['basket', 'chaussure', 'shoe', 'sneaker', 'running', 'course'], ideas: () => [
    { name: 'Basket', strokes: [close([[-1, 0.35], [-0.95, -0.35], [-0.55, -0.38], [-0.2, -0.05], [0.25, 0.05], [0.8, 0.15], [1, 0.38], [0.98, 0.55], [-0.98, 0.55]])] },
  ] },
  { words: ['velo', 'bike', 'bicyclette', 'cyclisme'], ideas: () => [
    { name: 'Vélo', strokes: [arc(-0.65, 0.35, 0.42, 0.42, 0, 2 * PI, 24), [[-0.65, 0.35], [-0.2, -0.35], [0.45, -0.35], [0.65, 0.35], [0.15, 0.35], [-0.65, 0.35]], arc(0.65, 0.35, 0.42, 0.42, PI, 3 * PI, 24)] },
  ] },
  { words: ['lapin', 'rabbit', 'paques', 'bunny'], ideas: () => [
    { name: 'Lapin', strokes: [close([...arc(0, 0.4, 0.62, 0.55, 4.08, -0.94, 30), ...arc(0.27, -0.5, 0.15, 0.5, 1.3, -4.44, 20), ...arc(-0.27, -0.5, 0.15, 0.5, 1.3, -4.44, 20)])] },
  ] },
  { words: ['pizza'], ideas: () => [{ name: 'Part de pizza', strokes: [close([[0, 1], ...arc(0, -0.35, 0.9, 0.35, PI * 1.05, PI * 1.95, 16)])] }] },
  { words: ['ballon', 'foot', 'football', 'soccer', 'ballon de foot'], ideas: () => [{ name: 'Ballon', strokes: [arc(0, 0, 1, 1, -PI / 2, PI * 1.5, 56), close(Array.from({ length: 5 }, (_, i) => [0.38 * Math.sin((i / 5) * 2 * PI), -0.38 * Math.cos((i / 5) * 2 * PI)] as Pt))] }] },
  { words: ['paix', 'peace'], ideas: () => [{ name: 'Paix', strokes: [arc(0, 0, 1, 1, -PI / 2, PI * 1.5, 56), [[0, -1], [0, 1]], [[-0.7, 0.7], [0, 0.1], [0.7, 0.7]]] }] },
];

/* ------------------------------ Police au trait ------------------------------ */

/** Lettres et chiffres en capitales d'un ou deux traits, dans une case de 0,6 de large sur 1 de haut. */
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 28): Stroke => arc(cx, cy, rx, ry, -PI / 2, PI * 1.5, n);
const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.12, 0.62], [0.48, 0.62]]],
  B: [[[0, 1], [0, 0], [0.4, 0], [0.55, 0.12], [0.55, 0.36], [0.4, 0.48], [0, 0.48], [0.42, 0.48], [0.6, 0.6], [0.6, 0.88], [0.45, 1], [0, 1]]],
  C: [arc(0.33, 0.5, 0.33, 0.5, -PI * 0.28, -PI * 1.72, 20)],
  D: [[[0, 0], [0, 1], [0.3, 1], [0.55, 0.8], [0.6, 0.5], [0.55, 0.2], [0.3, 0], [0, 0]]],
  E: [[[0.6, 0], [0, 0], [0, 1], [0.6, 1]], [[0, 0.5], [0.45, 0.5]]],
  F: [[[0.6, 0], [0, 0], [0, 1]], [[0, 0.5], [0.45, 0.5]]],
  G: [[...arc(0.33, 0.5, 0.33, 0.5, -PI * 0.3, -PI * 1.95, 20), [0.62, 0.58], [0.36, 0.58]]],
  H: [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.5], [0.6, 0.5]]],
  I: [[[0.1, 0], [0.5, 0]], [[0.3, 0], [0.3, 1]], [[0.1, 1], [0.5, 1]]],
  J: [[[0.6, 0], [0.6, 0.75], [0.45, 0.98], [0.2, 0.98], [0.02, 0.78]]],
  K: [[[0, 0], [0, 1]], [[0.6, 0], [0, 0.58]], [[0.18, 0.42], [0.6, 1]]],
  L: [[[0, 0], [0, 1], [0.55, 1]]],
  M: [[[0, 1], [0, 0], [0.35, 0.6], [0.7, 0], [0.7, 1]]],
  N: [[[0, 1], [0, 0], [0.6, 1], [0.6, 0]]],
  O: [ellipse(0.32, 0.5, 0.32, 0.5)],
  P: [[[0, 1], [0, 0], [0.4, 0], [0.58, 0.12], [0.58, 0.38], [0.4, 0.5], [0, 0.5]]],
  Q: [ellipse(0.32, 0.5, 0.32, 0.5), [[0.38, 0.7], [0.68, 1.04]]],
  R: [[[0, 1], [0, 0], [0.4, 0], [0.58, 0.12], [0.58, 0.38], [0.4, 0.5], [0, 0.5], [0.25, 0.5], [0.6, 1]]],
  S: [[[0.58, 0.12], [0.42, 0.01], [0.15, 0.02], [0.02, 0.18], [0.06, 0.38], [0.3, 0.5], [0.54, 0.62], [0.6, 0.82], [0.45, 0.98], [0.15, 0.98], [0, 0.86]]],
  T: [[[0, 0], [0.6, 0]], [[0.3, 0], [0.3, 1]]],
  U: [[[0, 0], [0, 0.75], [0.12, 0.95], [0.3, 1], [0.48, 0.95], [0.6, 0.75], [0.6, 0]]],
  V: [[[0, 0], [0.3, 1], [0.6, 0]]],
  W: [[[0, 0], [0.18, 1], [0.38, 0.4], [0.58, 1], [0.76, 0]]],
  X: [[[0, 0], [0.6, 1]], [[0.6, 0], [0, 1]]],
  Y: [[[0, 0], [0.3, 0.5], [0.6, 0]], [[0.3, 0.5], [0.3, 1]]],
  Z: [[[0, 0], [0.6, 0], [0, 1], [0.6, 1]]],
  '0': [ellipse(0.3, 0.5, 0.3, 0.5)],
  '1': [[[0.1, 0.22], [0.36, 0], [0.36, 1]], [[0.1, 1], [0.6, 1]]],
  '2': [[[0.04, 0.22], [0.2, 0.03], [0.45, 0.02], [0.6, 0.2], [0.58, 0.4], [0, 1], [0.6, 1]]],
  '3': [[[0.02, 0.1], [0.2, 0], [0.45, 0.02], [0.58, 0.18], [0.52, 0.38], [0.3, 0.48], [0.52, 0.56], [0.6, 0.78], [0.48, 0.96], [0.2, 1], [0, 0.9]]],
  '4': [[[0.48, 1], [0.48, 0], [0, 0.68], [0.62, 0.68]]],
  '5': [[[0.58, 0], [0.08, 0], [0.04, 0.45], [0.3, 0.38], [0.52, 0.46], [0.62, 0.7], [0.52, 0.92], [0.28, 1], [0.02, 0.9]]],
  '6': [[[0.55, 0.06], [0.32, 0], [0.1, 0.15], [0.02, 0.5], [0.06, 0.82], [0.28, 1], [0.5, 0.95], [0.6, 0.75], [0.52, 0.52], [0.3, 0.45], [0.08, 0.55]]],
  '7': [[[0, 0], [0.6, 0], [0.22, 1]]],
  '8': [[...arc(0.3, 0.25, 0.24, 0.23, PI / 2, PI * 2.5, 20), ...arc(0.3, 0.72, 0.29, 0.27, -PI / 2, PI * 1.5, 22)]],
  '9': [[[0.52, 0.5], [0.3, 0.58], [0.08, 0.48], [0, 0.25], [0.1, 0.05], [0.32, 0], [0.52, 0.06], [0.6, 0.3], [0.56, 0.62], [0.4, 0.92], [0.12, 1]]],
  '&': [[[0.6, 1], [0.1, 0.4], [0.12, 0.15], [0.3, 0.02], [0.45, 0.15], [0.42, 0.32], [0.05, 0.62], [0.05, 0.85], [0.25, 1], [0.45, 0.92], [0.62, 0.62]]],
  '+': [[[0.3, 0.2], [0.3, 0.8]], [[0, 0.5], [0.6, 0.5]]],
};

/** Un mot ou un nombre écrit d'un trait par lettre, centré dans le carnet (au plus 10 caractères). */
export function lettering(text: string): Stroke[] | null {
  const chars = [...text.toUpperCase()].filter((c) => GLYPHS[c] || c === ' ').slice(0, 10);
  if (!chars.some((c) => GLYPHS[c])) return null;
  const out: Stroke[] = [];
  let x = 0;
  for (const c of chars) {
    if (c === ' ') {
      x += 0.45;
      continue;
    }
    const g = GLYPHS[c];
    const w = Math.max(...g.flat().map((p) => p[0]));
    for (const s of g) out.push(s.map(([px, py]) => [px + x, py] as Pt));
    x += w + 0.28;
  }
  return fit(out, 0.08);
}


/* ------------------------------ Silhouettes (Phosphor) ------------------------------ */

/*
 * Les silhouettes des icônes Phosphor (licence MIT), tirées par scripts/silhouettes.mjs : animaux, véhicules,
 * objets, nourriture… « vache » donne une vache, et non le mot écrit. Chargées à la demande (silhouettes.json).
 */
const SILHOUETTES: [icon: string, name: string, words: string[]][] = [
  ['cow', 'Vache', ['vache', 'veau', 'taureau', 'boeuf', 'cow', 'meuh', 'bovin', 'vachette']],
  ['horse', 'Cheval', ['cheval', 'chevaux', 'poney', 'jument', 'etalon', 'horse', 'equitation', 'cavalier']],
  ['dog', 'Chien', ['chien', 'chienne', 'chiot', 'toutou', 'dog', 'puppy', 'wouf']],
  ['cat', 'Chat', ['chat', 'chatte', 'chaton', 'minou', 'cat', 'miaou']],
  ['bird', 'Oiseau', ['oiseau', 'bird', 'mouette', 'hirondelle', 'pigeon', 'moineau', 'merle', 'mesange']],
  ['fish', 'Poisson', ['poisson', 'fish', 'poisson d avril', 'truite', 'saumon']],
  ['fish-simple', 'Poisson', ['poisson', 'fish']],
  ['butterfly', 'Papillon', ['papillon', 'butterfly']],
  ['rabbit', 'Lapin', ['lapin', 'lievre', 'rabbit', 'paques', 'bunny']],
  ['shrimp', 'Crevette', ['crevette', 'shrimp', 'gambas']],
  ['bug-beetle', 'Scarabée', ['scarabee', 'insecte', 'coccinelle', 'beetle']],
  ['bug', 'Insecte', ['insecte', 'bug', 'punaise', 'fourmi']],
  ['paw-print', 'Patte', ['patte', 'empreinte', 'paw', 'animal']],
  ['piggy-bank', 'Cochon', ['cochon', 'porc', 'cochonnet', 'tirelire', 'pig', 'truie']],
  ['alien', 'Extraterrestre', ['extraterrestre', 'alien', 'martien', 'ovni']],
  ['ghost', 'Fantôme', ['fantome', 'ghost', 'halloween', 'spectre']],
  ['skull', 'Tête de mort', ['crane', 'tete de mort', 'skull', 'pirate']],
  ['rocket', 'Fusée', ['fusee', 'rocket', 'espace', 'spatial', 'decollage']],
  ['airplane', 'Avion', ['avion', 'plane', 'aeroport', 'airplane', 'vol']],
  ['airplane-tilt', 'Avion', ['avion', 'plane', 'voyage']],
  ['car-profile', 'Voiture', ['voiture', 'auto', 'car', 'automobile', 'bagnole']],
  ['boat', 'Bateau', ['bateau', 'boat', 'navire', 'paquebot', 'peniche']],
  ['sailboat', 'Voilier', ['voilier', 'voile', 'sailboat', 'bateau', 'regate']],
  ['anchor', 'Ancre', ['ancre', 'marin', 'anchor', 'port', 'marine']],
  ['bicycle', 'Vélo', ['velo', 'bike', 'bicyclette', 'cyclisme']],
  ['motorcycle', 'Moto', ['moto', 'motocyclette', 'motorbike', 'motard']],
  ['scooter', 'Trottinette', ['trottinette', 'trotinette']],
  ['tractor', 'Tracteur', ['tracteur', 'tractor', 'ferme', 'agriculteur']],
  ['train', 'Train', ['train', 'tgv', 'locomotive', 'metro', 'tram', 'tramway']],
  ['bus', 'Bus', ['bus', 'autobus', 'autocar']],
  ['truck', 'Camion', ['camion', 'truck', 'poids lourd', 'livraison']],
  ['van', 'Van', ['van', 'camionnette', 'combi', 'fourgon']],
  ['tree', 'Arbre', ['arbre', 'tree', 'chene', 'foret', 'bois']],
  ['tree-palm', 'Palmier', ['palmier', 'palm', 'plage', 'tropiques', 'vacances']],
  ['tree-evergreen', 'Sapin', ['sapin', 'noel', 'pin', 'conifere']],
  ['flower-tulip', 'Tulipe', ['tulipe', 'fleur', 'tulip', 'bouquet']],
  ['flower-lotus', 'Lotus', ['lotus', 'nenuphar', 'yoga', 'zen']],
  ['cactus', 'Cactus', ['cactus', 'desert', 'mexique']],
  ['plant', 'Pousse', ['plante', 'pousse', 'plant', 'jardin', 'graine']],
  ['acorn', 'Gland', ['gland', 'ecureuil', 'acorn']],
  ['leaf', 'Feuille', ['feuille', 'leaf', 'automne', 'nature']],
  ['carrot', 'Carotte', ['carotte', 'carrot', 'legume', 'potager']],
  ['avocado', 'Avocat', ['avocat', 'avocado', 'guacamole']],
  ['pepper', 'Piment', ['piment', 'poivron', 'pepper', 'chili']],
  ['orange', 'Orange', ['orange', 'mandarine', 'clementine', 'agrume', 'fruit']],
  ['cherries', 'Cerises', ['cerise', 'cherry', 'fruit']],
  ['pizza', 'Pizza', ['pizza', 'italie']],
  ['ice-cream', 'Glace', ['glace', 'cornet', 'ice cream', 'creme glacee', 'sorbet']],
  ['popsicle', 'Esquimau', ['esquimau', 'glace a l eau', 'popsicle']],
  ['coffee', 'Café', ['cafe', 'tasse', 'coffee', 'the', 'expresso']],
  ['beer-stein', 'Bière', ['biere', 'beer', 'chope', 'pinte']],
  ['wine', 'Verre de vin', ['vin', 'verre', 'wine', 'apero']],
  ['cake', 'Gâteau', ['gateau', 'anniversaire', 'cake', 'bougie']],
  ['cookie', 'Cookie', ['cookie', 'biscuit', 'gouter']],
  ['bread', 'Pain', ['pain', 'tartine', 'bread', 'boulangerie', 'toast']],
  ['hamburger', 'Burger', ['burger', 'hamburger', 'cheeseburger']],
  ['egg', 'Œuf', ['oeuf', 'egg']],
  ['cheese', 'Fromage', ['fromage', 'cheese', 'gruyere', 'emmental']],
  ['guitar', 'Guitare', ['guitare', 'guitar', 'rock', 'concert']],
  ['music-notes', 'Notes de musique', ['note', 'musique', 'music', 'melodie', 'chanson']],
  ['headphones', 'Casque audio', ['casque', 'ecouteurs', 'headphones', 'musique']],
  ['crown', 'Couronne', ['couronne', 'crown', 'roi', 'reine', 'king', 'queen', 'princesse', 'prince']],
  ['key', 'Clé', ['cle', 'clef', 'key', 'serrure']],
  ['bell', 'Cloche', ['cloche', 'bell', 'sonnette', 'clocher']],
  ['umbrella', 'Parapluie', ['parapluie', 'umbrella', 'pluie', 'ombrelle']],
  ['snowflake', 'Flocon', ['flocon', 'neige', 'snowflake', 'hiver', 'ski']],
  ['lighthouse', 'Phare', ['phare', 'lighthouse', 'bretagne']],
  ['castle-turret', 'Château', ['chateau', 'castle', 'forteresse', 'donjon', 'chateau fort']],
  ['tent', 'Tente', ['tente', 'camping', 'tent', 'bivouac']],
  ['tipi', 'Tipi', ['tipi', 'teepee']],
  ['windmill', 'Moulin', ['moulin', 'eolienne', 'windmill']],
  ['house', 'Maison', ['maison', 'house', 'home', 'cabane', 'chez moi']],
  ['barn', 'Grange', ['grange', 'ferme', 'barn', 'etable']],
  ['trophy', 'Trophée', ['trophee', 'coupe', 'victoire', 'champion', 'trophy', 'gagner']],
  ['medal', 'Médaille', ['medaille', 'medal', 'podium', 'finisher']],
  ['boot', 'Botte', ['botte', 'boot', 'bottine']],
  ['t-shirt', 'T-shirt', ['tshirt', 't shirt', 'tee shirt', 'maillot']],
  ['dress', 'Robe', ['robe', 'dress', 'mariage']],
  ['sunglasses', 'Lunettes de soleil', ['lunettes', 'sunglasses', 'lunettes de soleil']],
  ['game-controller', 'Manette', ['manette', 'jeu video', 'console', 'gaming', 'jeux video']],
  ['basketball', 'Ballon de basket', ['basketball', 'basket ball', 'ballon de basket', 'nba']],
  ['tennis-ball', 'Balle de tennis', ['tennis', 'balle de tennis', 'roland garros']],
  ['volleyball', 'Ballon de volley', ['volley', 'volleyball', 'beach volley']],
  ['barbell', 'Haltères', ['haltere', 'musculation', 'muscu', 'barbell', 'crossfit', 'salle de sport']],
  ['bone', 'Os', ['os', 'bone']],
  ['tooth', 'Dent', ['dent', 'tooth', 'dentiste']],
  ['brain', 'Cerveau', ['cerveau', 'brain', 'intelligence']],
  ['hand', 'Main', ['main', 'hand', 'coucou', 'salut']],
  ['hand-peace', 'Main en V', ['peace and love', 'v de la victoire', 'signe v']],
  ['thumbs-up', 'Pouce levé', ['pouce', 'like', 'top', 'thumbs up', 'bravo']],
  ['puzzle-piece', 'Pièce de puzzle', ['puzzle', 'piece de puzzle']],
  ['lightbulb', 'Ampoule', ['ampoule', 'idee', 'lampe', 'lumiere']],
  ['magnet', 'Aimant', ['aimant', 'magnet']],
  ['scissors', 'Ciseaux', ['ciseaux', 'scissors', 'coiffeur']],
  ['paper-plane', 'Avion en papier', ['avion en papier', 'paper plane', 'message']],
  ['planet', 'Planète', ['planete', 'saturne', 'planet', 'univers']],
  ['moon-stars', 'Lune et étoiles', ['nuit', 'lune', 'etoiles', 'reve']],
  ['cloud-lightning', 'Orage', ['orage', 'storm', 'tempete']],
  ['rainbow', 'Arc-en-ciel', ['arc en ciel', 'rainbow']],
  ['flame', 'Flamme', ['flamme', 'feu', 'fire', 'flame']],
  ['campfire', 'Feu de camp', ['feu de camp', 'campfire', 'bivouac', 'feu']],
  ['hourglass', 'Sablier', ['sablier', 'hourglass']],
  ['watch', 'Montre', ['montre', 'watch', 'chrono', 'chronometre']],
  ['compass-rose', 'Rose des vents', ['boussole', 'rose des vents', 'compass', 'orientation']],
  ['shield', 'Bouclier', ['bouclier', 'shield', 'blason']],
  ['sword', 'Épée', ['epee', 'sword', 'chevalier', 'escrime']],
  ['axe', 'Hache', ['hache', 'axe', 'bucheron']],
  ['spade', 'Pique', ['pique', 'cartes', 'poker']],
  ['club', 'Trèfle', ['trefle', 'chance', 'cartes']],
  ['person-simple-run', 'Coureur', ['coureur', 'coureuse', 'runner', 'courir', 'running', 'jogging', 'marathon']],
  ['footprints', 'Empreintes de pas', ['empreintes', 'empreintes de pas', 'pieds', 'footprints']],
  ['balloon', 'Ballon', ['baudruche', 'ballon de baudruche', 'balloon', 'fete']],
  ['gift', 'Cadeau', ['cadeau', 'gift', 'paquet', 'present', 'surprise']],
  ['heartbeat', 'Cœur qui bat', ['cardio', 'pouls', 'battement', 'heartbeat', 'frequence cardiaque']],
  ['flag', 'Drapeau', ['drapeau', 'flag', 'fanion', 'arrivee']],
  ['drop', 'Goutte', ['goutte', 'drop', 'eau']],
  ['sun', 'Soleil', ['soleil', 'sun', 'ete']],
  ['moon', 'Lune', ['lune', 'croissant', 'moon']],
  ['cloud', 'Nuage', ['nuage', 'cloud']],
  ['lightning', 'Éclair', ['eclair', 'foudre', 'lightning', 'flash']],
  ['star', 'Étoile', ['etoile', 'star']],
  ['heart', 'Cœur', ['coeur', 'heart', 'amour', 'love']],
  ['diamond', 'Losange', ['losange', 'diamant']],
  ['mountains', 'Montagnes', ['montagne', 'mountain', 'sommet', 'alpes']],
];

let silLoad: Promise<Record<string, Stroke[]>> | null = null;
const silhouettes = () => (silLoad ??= import('./silhouettes.json').then((m) => m.default as unknown as Record<string, Stroke[]>));

/** Une faute de frappe (une lettre de plus, de moins ou changée) dans un mot d'au moins 5 lettres. */
function near(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Le mot (ou l'expression) est-il dans la phrase ? Pluriels et petites fautes compris. */
function says(t: string, words: string[], w: string, fuzzy: boolean): boolean {
  if (w.includes(' ')) return ` ${t} `.includes(` ${w} `);
  if (words.includes(w) || words.includes(w + 's') || words.includes(w + 'x')) return true;
  return fuzzy && words.some((x) => near(x, w));
}

/* ------------------------------------ Idées ------------------------------------ */

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9& +]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set(['un', 'une', 'le', 'la', 'les', 'des', 'du', 'de', 'd', 'l', 'mon', 'ma', 'en', 'forme', 'dessin', 'dessine', 'dessiner', 'fais', 'moi', 'je', 'veux', 'voudrais', 'a', 'the', 'an']);

/**
 * Idées de dessins pour une phrase : d'abord les silhouettes (« vache » donne une vache), puis les formes de la
 * bibliothèque, puis le nombre ou le mot écrit au trait, seulement si rien d'autre ne correspond.
 */
export async function localIdeas(text: string): Promise<Idea[]> {
  const t = normalize(text);
  if (!t) return [];
  const words = t.split(' ').filter((w) => w && !STOP.has(w));
  const ideas: Idea[] = [];
  const seen = new Set<string>();
  const add = (name: string, strokes: Stroke[]) => {
    if (seen.has(name) && ideas.length >= 2) return;
    seen.add(name);
    ideas.push({ name, drawing: { strokes: fit(strokes) } });
  };
  // Mot exact d'abord ; à défaut, une petite faute de frappe.
  for (const fuzzy of [false, true]) {
    if (ideas.length) break;
    const sil = SILHOUETTES.filter(([, , ws]) => ws.some((w) => says(t, words, w, fuzzy)));
    if (sil.length) {
      const all = await silhouettes();
      for (const [icon, name] of sil) if (all[icon]) add(name, all[icon]);
    }
    for (const e of LIBRARY) {
      if (!e.words.some((w) => says(t, words, w, fuzzy))) continue;
      for (const i of e.ideas()) add(i.name, i.strokes);
    }
  }
  // Un nombre (une année, une distance), sinon un mot court : écrit au trait.
  const num = t.match(/\d[\d ]{0,9}/)?.[0].replace(/ /g, '');
  if (num) {
    const s = lettering(num);
    if (s) ideas.unshift({ name: num, drawing: { strokes: s } });
  }
  if (!ideas.length && words.length) {
    const word = words.slice(0, 2).join(' ').slice(0, 10);
    const s = lettering(word);
    if (s) ideas.push({ name: word.toUpperCase(), drawing: { strokes: s } });
    const initials = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : null;
    const si = initials ? lettering(initials) : null;
    if (si && initials) ideas.push({ name: initials.toUpperCase(), drawing: { strokes: si } });
  }
  return ideas.slice(0, 4);
}

/** Pour montrer des exemples quand on ouvre la discussion. */
export const EXAMPLES = ['une vache', 'une fusée', '2027', 'un cœur'];
