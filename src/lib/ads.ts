/*
 * Publicités ciblées, en SIMULATION : aucune régie, aucune donnée envoyée, des marques inventées. Le but est de
 * montrer à quoi ressemblerait une publicité choisie d'après le profil sportif (sport, volume, heure des
 * sorties, milieux préférés, météo du départ), et d'expliquer pourquoi elle est là.
 *
 * Les signaux sont lus sur l'appareil. Une version réelle demanderait un accord explicite (RGPD) avant toute
 * publicité personnalisée ; sans accord, seule une publicité « contextuelle » (le parcours affiché) resterait.
 */
import type { EnvClass, Sport } from './types';

export type AdCategory = 'vetements' | 'nourriture' | 'chaussures' | 'recup' | 'equipement' | 'montre';

export const AD_CATEGORY_LABEL: Record<AdCategory, string> = {
  vetements: 'Vêtements',
  nourriture: 'Nourriture',
  chaussures: 'Chaussures',
  recup: 'Récupération',
  equipement: 'Équipement',
  montre: 'Montres',
};

/** Ce que l'app sait du sportif, sur l'appareil. */
export interface AdSignals {
  sport: Sport;
  /** km par semaine, moyenne des 28 derniers jours */
  weekKm: number;
  /** part des sorties commencées après 18 h ou avant 7 h (0 à 1) */
  darkShare: number;
  /** distance du parcours affiché ou réglé (km) */
  distanceKm: number;
  /** dénivelé par km du parcours affiché (m/km) */
  climbPerKm: number;
  envs: EnvClass[];
  /** température au départ (°C), si connue */
  temp: number | null;
  /** pluie au départ */
  rain: boolean;
  /** km parcourus au total (historique) */
  totalKm: number;
}

export interface Ad {
  id: string;
  category: AdCategory;
  /** marque inventée */
  brand: string;
  emoji: string;
  /** deux couleurs du visuel */
  colors: [string, string];
  title: string;
  text: string;
  cta: string;
  /** pourquoi cette publicité, en clair (affiché sous « Pourquoi ? ») */
  why: (s: AdSignals) => string;
  /** pertinence pour ce profil (0 : jamais) */
  score: (s: AdSignals) => number;
}

const run = (s: AdSignals) => s.sport === 'run' || s.sport === 'trail';
const bike = (s: AdSignals) => s.sport === 'road' || s.sport === 'gravel';
const sportWord = (s: AdSignals) => ({ run: 'cours', trail: 'fais du trail', walk: 'marches', road: 'roules', gravel: 'roules en gravel' })[s.sport];

export const ADS: Ad[] = [
  {
    id: 'veste-nuit',
    category: 'vetements',
    brand: 'Lumen Wear',
    emoji: '🦺',
    colors: ['#2B2F8F', '#F5C400'],
    title: 'Vu de loin, même à 19 h',
    text: 'Veste légère à bandes réfléchissantes 360°, 140 g.',
    cta: 'Voir la veste',
    why: (s) => `Tu ${sportWord(s)} souvent tôt le matin ou le soir (${Math.round(s.darkShare * 100)} % de tes sorties).`,
    score: (s) => (s.darkShare >= 0.3 ? 3 + s.darkShare * 2 : 0),
  },
  {
    id: 'thermique',
    category: 'vetements',
    brand: 'Brume',
    emoji: '🧣',
    colors: ['#1F3A4D', '#7FB7D9'],
    title: 'Une deuxième peau pour l’hiver',
    text: 'Maillot thermique respirant, sèche en 20 minutes.',
    cta: 'Découvrir',
    why: (s) => `Il fait ${Math.round(s.temp ?? 0)} °C au départ de ta sortie.`,
    score: (s) => (s.temp != null && s.temp < 10 ? 2.5 + (10 - s.temp) * 0.15 : 0),
  },
  {
    id: 'pluie',
    category: 'vetements',
    brand: 'Averse',
    emoji: '🌧️',
    colors: ['#24384A', '#5FA8D3'],
    title: 'La pluie ne t’arrête pas',
    text: 'Coupe-vent imperméable qui tient dans une poche.',
    cta: 'Voir',
    why: () => 'Il pleut au départ de ta sortie.',
    score: (s) => (s.rain ? 3.5 : 0),
  },
  {
    id: 'gels',
    category: 'nourriture',
    brand: 'Carbo Lab',
    emoji: '⚡',
    colors: ['#6A1B4D', '#FF6B6B'],
    title: 'Tiens jusqu’au bout de la boucle',
    text: 'Gels énergétiques aux fruits, 25 g de glucides, sans arôme artificiel.',
    cta: 'Goûter le pack',
    why: (s) => `Ta sortie fait ${Math.round(s.distanceKm)} km : au-delà d'une heure d'effort, on recharge.`,
    score: (s) => (s.distanceKm >= 14 ? 2 + Math.min(3, (s.distanceKm - 14) / 6) : 0),
  },
  {
    id: 'porridge',
    category: 'nourriture',
    brand: 'Matin Clair',
    emoji: '🥣',
    colors: ['#7A4B1E', '#F2C894'],
    title: 'Le petit-déjeuner des sorties du matin',
    text: 'Flocons d’avoine, amandes et miel, prêts en 3 minutes.',
    cta: 'Voir les recettes',
    why: (s) => `Tu ${sportWord(s)} ${Math.round(s.weekKm)} km par semaine en moyenne.`,
    score: (s) => (s.weekKm >= 10 ? 1.6 : 0.6),
  },
  {
    id: 'barres-velo',
    category: 'nourriture',
    brand: 'Roue Libre',
    emoji: '🍫',
    colors: ['#3B2416', '#E0A15E'],
    title: 'Une barre par heure de selle',
    text: 'Barres dattes-cacahuète, qui ne fondent pas dans la poche du maillot.',
    cta: 'Commander',
    why: () => 'Tu fais surtout du vélo.',
    score: (s) => (bike(s) ? 3 : 0),
  },
  {
    id: 'chaussures',
    category: 'chaussures',
    brand: 'Foulée',
    emoji: '👟',
    colors: ['#0E4D45', '#3FD0A8'],
    title: 'Tes chaussures ont fait leur temps ?',
    text: 'Une paire de course dure 600 à 800 km. Amorti neuf, retour gratuit 30 jours.',
    cta: 'Trouver ma paire',
    why: (s) => `Tu as couru ${Math.round(s.totalKm)} km avec Boucle.`,
    score: (s) => (run(s) && s.totalKm >= 300 ? 3 + Math.min(2, (s.totalKm - 300) / 300) : run(s) ? 1.2 : 0),
  },
  {
    id: 'trail',
    category: 'chaussures',
    brand: 'Sentier Nord',
    emoji: '🥾',
    colors: ['#2F3B1F', '#9CC25A'],
    title: 'L’accroche qu’il faut dans les sous-bois',
    text: 'Chaussures de trail à crampons de 5 mm, légères et stables.',
    cta: 'Voir le modèle',
    why: (s) => (s.sport === 'trail' ? 'Tu fais du trail.' : 'Tu demandes souvent des parcours en forêt ou dans les parcs.'),
    score: (s) => (s.sport === 'trail' ? 3.2 : s.envs.includes('forest') || s.envs.includes('park') ? 2.2 : 0),
  },
  {
    id: 'marche',
    category: 'chaussures',
    brand: 'Pas à Pas',
    emoji: '🚶',
    colors: ['#4A3A5C', '#C7A8E8'],
    title: 'Marcher loin, sans ampoules',
    text: 'Chaussures de marche respirantes, semelle en mousse recyclée.',
    cta: 'Découvrir',
    why: () => 'Tu marches avec Boucle.',
    score: (s) => (s.sport === 'walk' ? 3.2 : 0),
  },
  {
    id: 'recup',
    category: 'recup',
    brand: 'Détente',
    emoji: '🧘',
    colors: ['#3A2C5C', '#8E7CF0'],
    title: 'Les jambes lourdes après les côtes ?',
    text: 'Rouleau de massage et séances guidées de 10 minutes.',
    cta: 'Essayer',
    why: (s) => `Ton parcours monte de ${Math.round(s.climbPerKm)} m par km.`,
    score: (s) => (s.climbPerKm >= 12 ? 2.5 + Math.min(1.5, (s.climbPerKm - 12) / 10) : 0),
  },
  {
    id: 'gourde',
    category: 'equipement',
    brand: 'Source',
    emoji: '💧',
    colors: ['#0D3B66', '#4CC9F0'],
    title: 'L’eau à portée de main',
    text: 'Gourde souple 500 ml qui se plie une fois vide.',
    cta: 'Voir',
    why: (s) => `Tu prépares une sortie de ${Math.round(s.distanceKm)} km.`,
    score: (s) => (s.distanceKm >= 10 ? 1.4 : 0.5),
  },
  {
    id: 'velo-eclairage',
    category: 'equipement',
    brand: 'Phare',
    emoji: '🔦',
    colors: ['#1C1C2E', '#FFB703'],
    title: 'Voir et être vu à vélo',
    text: 'Éclairage avant 800 lumens, 6 h d’autonomie.',
    cta: 'Découvrir',
    why: () => 'Tu roules souvent quand il fait sombre.',
    score: (s) => (bike(s) && s.darkShare >= 0.25 ? 3.4 : 0),
  },
  {
    id: 'montre',
    category: 'montre',
    brand: 'Cadence',
    emoji: '⌚',
    colors: ['#222831', '#00ADB5'],
    title: 'Ton allure au poignet',
    text: 'Montre GPS légère, 14 jours d’autonomie, cartes hors ligne.',
    cta: 'Voir la montre',
    why: (s) => `${Math.round(s.weekKm)} km par semaine : de quoi suivre tes progrès de près.`,
    score: (s) => (s.weekKm >= 20 ? 2.3 : 0.8),
  },
];

/** Publicité sans profil (pas d'accord pour la personnalisation) : seulement d'après la sortie affichée. */
export function contextual(s: AdSignals): AdSignals {
  return { ...s, weekKm: 0, darkShare: 0, envs: [], totalKm: 0 };
}

/** Les publicités pour ce profil, la plus pertinente d'abord (celles qu'on a masquées en sont retirées). */
export function pickAds(s: AdSignals, hidden: string[] = []): Ad[] {
  return ADS.filter((a) => !hidden.includes(a.id))
    .map((a) => ({ a, k: a.score(s) }))
    .filter((x) => x.k > 0)
    .sort((x, y) => y.k - x.k)
    .map((x) => x.a);
}

/** Le profil en quelques mots, pour la page de réglages (« ce que Boucle déduit de toi »). */
export function profileWords(s: AdSignals): string[] {
  const out: string[] = [];
  out.push({ run: '🏃 Coureur', trail: '⛰️ Traileur', walk: '🚶 Marcheur', road: '🚴 Cycliste route', gravel: '🚵 Gravel' }[s.sport]);
  if (s.weekKm >= 1) out.push(`📈 ${Math.round(s.weekKm)} km/sem.`);
  if (s.darkShare >= 0.3) out.push('🌙 Sorties tôt ou tard');
  if (s.envs.length) out.push(`🌳 Aime : ${s.envs.length} milieu${s.envs.length > 1 ? 'x' : ''}`);
  if (s.distanceKm >= 14) out.push('🔋 Longues sorties');
  return out;
}
