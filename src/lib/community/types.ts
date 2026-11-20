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
  likedByMe: boolean;
  createdAt: number;
}

export interface Comment {
  id: string;
  routeId: string;
  authorId: string;
  authorName: string;
  authorLevel: Level;
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
  report(target: { routeId?: string; commentId?: string; profileId?: string }, reason: string): Promise<void>;
  /** un parcours de la communauté vient d'être repris (favori, suivi, GPX) */
  used(routeId: string): Promise<void>;
}
