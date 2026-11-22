import type { LngLat, Shape, Sport } from '../types';
import type { SerialRoute } from '../persist';

/** Niveau déclaré dans le profil. */
export type Level = 'debut' | 'regular' | 'confirmed' | 'expert';

export const LEVELS: Record<Level, string> = {
  debut: 'Débutant',
  regular: 'Régulier',
  confirmed: 'Confirmé',
  expert: 'Expert',
};

/** Profil public : ce que la communauté voit. */
export interface Profile {
  id: string;
  firstName: string;
  city: string | null;
  sports: Sport[];
  level: Level;
  practiceYears: number | null;
  bio: string | null;
  /** photo de profil (adresse de l'image), sinon l'initiale */
  avatar: string | null;
  createdAt: number;
}

/** Ce que seul l'intéressé voit. */
export interface PrivateProfile {
  birthYear: number;
}

export interface ProfileStats {
  routes: number;
  followers: number;
  following: number;
  likes: number;
  followedByMe: boolean;
}

/** Un parcours publié dans la communauté. */
export interface CommunityRoute {
  id: string;
  authorId: string;
  authorName: string;
  authorLevel: Level;
  authorCity: string | null;
  authorAvatar: string | null;
  name: string;
  description: string | null;
  sport: Sport;
  shape: Shape;
  distanceM: number;
  ascentM: number;
  /** premier point visible (le départ réel, souvent chez soi, est masqué) */
  start: LngLat;
  data: SerialRoute;
  likes: number;
  comments: number;
  uses: number;
  /** photos de sorties ajoutées au parcours */
  photos: number;
  /** vignette de la première photo */
  cover: string | null;
  likedByMe: boolean;
  createdAt: number;
}

/** Une photo de sortie, sur un parcours publié. */
export interface RoutePhoto {
  id: string;
  routeId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  url: string;
  thumb: string;
  /** position sur le tracé publié (jamais dans la zone privée) */
  at: LngLat | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface PhotoInput {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  at: LngLat | null;
  caption: string | null;
}

export type ReportTarget = { routeId?: string; commentId?: string; profileId?: string; photoId?: string };

export interface Comment {
  id: string;
  routeId: string;
  authorId: string;
  authorName: string;
  authorLevel: Level;
  authorAvatar: string | null;
  body: string;
  createdAt: number;
}

export type FeedKind = 'nearby' | 'following' | 'popular';

export interface FeedQuery {
  kind: FeedKind;
  /** autour de ce point (fil « Autour de toi ») */
  center?: LngLat | null;
  sport?: Sport | null;
}

export interface Session {
  userId: string;
  email: string;
}

export interface PublishInput {
  name: string;
  description: string | null;
  sport: Sport;
  shape: Shape;
  distanceM: number;
  ascentM: number;
  start: LngLat;
  data: SerialRoute;
}

export type ProfileInput = Omit<Profile, 'id' | 'createdAt'>;

/** Ce que la fonction « strava » renvoie (chiffres de Strava, résumés). */
export interface StravaTotals {
  count: number;
  distance: number;
  time: number;
  elevation: number;
}
export interface StravaData {
  connected: boolean;
  revoked?: boolean;
  athlete?: string | null;
  ytd?: { run: StravaTotals; ride: StravaTotals };
  recent?: { run: StravaTotals; ride: StravaTotals };
  activities?: { id: number; name: string; type: string; distance: number; time: number; elevation: number; date: string }[];
}

/** Une sortie lue dans Santé (iPhone) ou Health Connect (Android). */
export interface HealthWorkout {
  sport: 'run' | 'ride' | 'walk' | 'other';
  distance: number;
  time: number;
  start: string;
  source: string | null;
  /** énergie dépensée, si l'app de la montre ou du téléphone la donne */
  kcal?: number | null;
}
/** Une journée de santé, envoyée par l'app du téléphone, lue par le profil partout. */
export interface HealthDay {
  /** AAAA-MM-JJ */
  day: string;
  steps: number | null;
  restingHr: number | null;
  vo2max: number | null;
  /** distance des sorties du jour (m) */
  distance: number;
  workouts: HealthWorkout[];
  source: 'ios' | 'android';
  /** marche et course du jour (m), énergie active (kcal), temps d'exercice (min) */
  walkM?: number | null;
  activeKcal?: number | null;
  exerciseMin?: number | null;
  /** dernier envoi reçu par le serveur pour ce jour */
  updatedAt?: string;
}

export class CommunityError extends Error {}

/**
 * Ce que l'app attend d'un serveur de communauté. Deux réalisations : Supabase (en ligne) et une
 * démonstration sur l'appareil (rien ne quitte le téléphone ; membres et parcours fictifs).
 */
export interface CommunityBackend {
  readonly demo: boolean;
  session(): Promise<Session | null>;
  onSession(cb: (s: Session | null) => void): void;
  /** envoie un code à 6 chiffres par e-mail (création de compte ou connexion) */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<Session>;
  /** connexion par mot de passe (choisi avec le profil, à la création du compte) */
  signInWithPassword(email: string, password: string): Promise<Session>;
  /** choisit ou change le mot de passe du compte connecté */
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** supprime le compte et tout ce qui en dépend (parcours, j'aime, commentaires, abonnements) */
  deleteAccount(): Promise<void>;
  myProfile(): Promise<{ profile: Profile; priv: PrivateProfile | null } | null>;
  saveProfile(p: ProfileInput, priv: PrivateProfile): Promise<Profile>;
  profile(id: string): Promise<{ profile: Profile; stats: ProfileStats } | null>;
  routesBy(authorId: string): Promise<CommunityRoute[]>;
  feed(q: FeedQuery): Promise<CommunityRoute[]>;
  route(id: string): Promise<CommunityRoute | null>;
  publish(r: PublishInput): Promise<CommunityRoute>;
  unpublish(id: string): Promise<void>;
  like(routeId: string, on: boolean): Promise<void>;
  comments(routeId: string): Promise<Comment[]>;
  comment(routeId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  follow(userId: string, on: boolean): Promise<void>;
  /** personnes suivies (identifiants) */
  following(): Promise<string[]>;
  blocked(): Promise<string[]>;
  block(userId: string, on: boolean): Promise<void>;
  report(target: ReportTarget, reason: string): Promise<void>;
  /** dépose une photo de profil (carrée) et renvoie son adresse ; elle s'applique à l'enregistrement du profil */
  uploadAvatar(image: Blob): Promise<string>;
  photos(routeId: string): Promise<RoutePhoto[]>;
  photosBy(authorId: string): Promise<RoutePhoto[]>;
  addPhoto(routeId: string, p: PhotoInput): Promise<RoutePhoto>;
  deletePhoto(id: string): Promise<void>;
  /** santé : mes journées (28 derniers jours), envoyées par l'app du téléphone */
  healthDays(): Promise<HealthDay[]>;
  saveHealth(days: HealthDay[]): Promise<void>;
  clearHealth(): Promise<void>;
  /** nouvelle clé pour le raccourci « Boucle Santé » de l'iPhone (l'ancienne cesse de marcher) */
  healthKey(): Promise<string>;
  /** lien avec Strava (serveur en ligne seulement) */
  strava?(action: 'connect' | 'stats' | 'disconnect', code?: string): Promise<StravaData>;
  /** un parcours de la communauté vient d'être repris (favori, suivi, GPX) */
  used(routeId: string): Promise<void>;
}
