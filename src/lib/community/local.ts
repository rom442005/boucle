import type { LngLat, Sport } from '../types';
import type { SerialRoute } from '../persist';
import { decodePolyline, haversine } from '../geo';
import {
  CommunityError,
  type Comment,
  type CommunityBackend,
  type CommunityRoute,
  type FeedQuery,
  type Level,
  type PrivateProfile,
  type Profile,
  type PhotoInput,
  type ProfileInput,
  type PublishInput,
  type RoutePhoto,
  type Session,
  type HealthDay,
} from './types';
import { blobToDataUrl } from '../images';

/*
 * Démonstration sur l'appareil (?demo=communaute) : toute la Communauté fonctionne, mais rien ne quitte
 * le téléphone. Trois membres fictifs (marqués « démo ») y ont publié de vrais parcours autour de Nantes.
 * Sert aussi aux tests. Le code de connexion de la démonstration est 123456.
 */

export const DEMO_CODE = '123456';
const KEY = 'boucle.demo.communaute.v1';

type StoredRoute = Omit<CommunityRoute, 'authorName' | 'authorLevel' | 'authorCity' | 'authorAvatar' | 'likes' | 'comments' | 'photos' | 'cover' | 'likedByMe'>;
type StoredPhoto = Omit<RoutePhoto, 'authorName' | 'authorAvatar'>;
interface StoredComment {
  id: string;
  routeId: string;
  authorId: string;
  body: string;
  createdAt: number;
}
interface Db {
  /** pass : empreinte SHA-256 du mot de passe (jamais le mot de passe lui-même) */
  users: { id: string; email: string; pass?: string }[];
  profiles: Record<string, Profile>;
  priv: Record<string, PrivateProfile>;
  routes: StoredRoute[];
  likes: [string, string][];
  comments: StoredComment[];
  photos?: StoredPhoto[];
  health?: Record<string, HealthDay[]>;
  follows: [string, string][];
  blocks: [string, string][];
  reports: { by: string; target: string; reason: string; at: number }[];
  session: Session | null;
  pending: string | null;
}

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const wait = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const digest = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const DAY = 86400000;

function member(uid: string, firstName: string, city: string, sports: Sport[], level: Level, years: number, bio: string, age: number): Profile {
  return { id: uid, firstName, city, sports, level, practiceYears: years, bio, avatar: null, createdAt: Date.now() - age * DAY };
}

async function seed(): Promise<Db> {
  const demo = (await import('./demo-routes.json')).default as { name: string; desc: string; data: SerialRoute }[];
  const lea = member('demo-lea', 'Léa', 'Rezé', ['run', 'trail'], 'confirmed', 6, 'Membre de démonstration. Trail le week-end, course en semaine.', 300);
  const hugo = member('demo-hugo', 'Hugo', 'Nantes', ['road', 'gravel'], 'expert', 12, 'Membre de démonstration. Vélo de route et gravel.', 500);
  const ines = member('demo-ines', 'Inès', 'Nantes', ['run'], 'regular', 2, 'Membre de démonstration. Je prépare mon premier 10 km.', 90);
  const authors = [lea.id, lea.id, lea.id, hugo.id, hugo.id, ines.id];
  const routes: StoredRoute[] = demo.map((d, i) => {
    const coords = decodePolyline(d.data.p, d.data.q);
    let length = 0;
    for (let k = 1; k < coords.length; k++) length += haversine(coords[k - 1], coords[k]);
    let ascent = 0;
    for (let k = 1; k < d.data.e.length; k++) ascent += Math.max(0, d.data.e[k] - d.data.e[k - 1]);
    return {
      id: `demo-route-${i}`,
      authorId: authors[i],
      name: d.name,
      description: d.desc,
      sport: d.data.s,
      shape: d.data.h,
      distanceM: Math.round(length),
      ascentM: Math.round(ascent * 0.8),
      start: coords[0],
      data: { ...d.data, id: `demo-route-${i}` },
      uses: [12, 31, 7, 18, 9, 4][i] ?? 0,
      createdAt: Date.now() - [2, 9, 15, 4, 26, 1][i] * DAY - i * 3600000,
    };
  });
  const comments: StoredComment[] = [
    { id: 'demo-c1', routeId: 'demo-route-1', authorId: ines.id, body: 'Superbe au lever du soleil, merci pour le parcours !', createdAt: Date.now() - 6 * DAY },
    { id: 'demo-c2', routeId: 'demo-route-1', authorId: hugo.id, body: 'Fait dimanche, attention au passage étroit vers la Jonelière.', createdAt: Date.now() - 4 * DAY },
    { id: 'demo-c3', routeId: 'demo-route-3', authorId: lea.id, body: 'Les petites routes après Vertou sont très calmes.', createdAt: Date.now() - 3 * DAY },
    { id: 'demo-c4', routeId: 'demo-route-5', authorId: lea.id, body: 'Parfait pour reprendre doucement.', createdAt: Date.now() - DAY / 2 },
  ];
  const likes: [string, string][] = [
    ['demo-route-0', hugo.id],
    ['demo-route-0', ines.id],
    ['demo-route-1', hugo.id],
    ['demo-route-1', ines.id],
    ['demo-route-3', lea.id],
    ['demo-route-4', lea.id],
    ['demo-route-5', lea.id],
    ['demo-route-5', hugo.id],
  ];
  return {
    users: [],
    profiles: { [lea.id]: lea, [hugo.id]: hugo, [ines.id]: ines },
    priv: {},
    routes,
    likes,
    comments,
    photos: [],
    follows: [[ines.id, lea.id]],
    blocks: [],
    reports: [],
    session: null,
    pending: null,
  };
}

export async function createLocalBackend(): Promise<CommunityBackend> {
  let db: Db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? (JSON.parse(raw) as Db) : await seed();
  } catch {
    db = await seed();
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* mémoire pleine : la démonstration continue sans être gardée */
    }
  };
  db.photos ??= [];
  const photosOf = () => db.photos!;
  save();
  const listeners: ((s: Session | null) => void)[] = [];
  const setSession = (s: Session | null) => {
    db.session = s;
    save();
    for (const cb of listeners) cb(s);
  };
  const me = () => db.session?.userId ?? null;
  const need = () => {
    const u = me();
    if (!u) throw new CommunityError('Connecte-toi pour continuer.');
    if (!db.profiles[u]) throw new CommunityError('Termine ton profil pour continuer.');
    return u;
  };
  const view = (r: StoredRoute): CommunityRoute => {
    const a = db.profiles[r.authorId];
    return {
      ...r,
      authorName: a?.firstName ?? 'Membre',
      authorLevel: a?.level ?? 'regular',
      authorCity: a?.city ?? null,
      authorAvatar: a?.avatar ?? null,
      likes: db.likes.filter(([rid]) => rid === r.id).length,
      comments: db.comments.filter((c) => c.routeId === r.id).length,
      photos: photosOf().filter((p) => p.routeId === r.id).length,
      cover: photosOf().find((p) => p.routeId === r.id)?.thumb ?? null,
      likedByMe: !!me() && db.likes.some(([rid, u]) => rid === r.id && u === me()),
    };
  };
  const viewComment = (c: StoredComment): Comment => {
    const a = db.profiles[c.authorId];
    return { ...c, authorName: a?.firstName ?? 'Membre', authorLevel: a?.level ?? 'regular', authorAvatar: a?.avatar ?? null };
  };
  const viewPhoto = (p: StoredPhoto): RoutePhoto => {
    const a = db.profiles[p.authorId];
    return { ...p, authorName: a?.firstName ?? 'Membre', authorAvatar: a?.avatar ?? null };
  };

  return {
    demo: true,
    async session() {
      return db.session;
    },
    onSession(cb) {
      listeners.push(cb);
    },
    async sendCode(email) {
      await wait();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new CommunityError('Adresse e-mail invalide.');
      db.pending = email.toLowerCase();
      save();
    },
    async verifyCode(email, code) {
      await wait();
      if (code.trim() !== DEMO_CODE || db.pending !== email.toLowerCase()) throw new CommunityError('Code incorrect ou expiré. Demande un nouveau code.');
      let u = db.users.find((x) => x.email === email.toLowerCase());
      if (!u) {
        u = { id: `moi-${id()}`, email: email.toLowerCase() };
        db.users.push(u);
      }
      db.pending = null;
      const s = { userId: u.id, email: u.email };
      setSession(s);
      return s;
    },
    async signInWithPassword(email, password) {
      await wait();
      const u = db.users.find((x) => x.email === email.toLowerCase());
      if (!u?.pass || u.pass !== (await digest(password))) throw new CommunityError('E-mail ou mot de passe incorrect.');
      const s = { userId: u.id, email: u.email };
      setSession(s);
      return s;
    },
    async signInWithDevice() {
      await wait();
      const u = { id: `moi-${id()}`, email: '' };
      db.users.push(u);
      const s = { userId: u.id, email: '', device: true };
      setSession(s);
      return s;
    },
    async setPassword(password) {
      await wait();
      const u = db.users.find((x) => x.id === db.session?.userId);
      if (!u) throw new CommunityError('Connecte-toi pour continuer.');
      if (password.length < 8) throw new CommunityError('Mot de passe trop court : 8 caractères au moins.');
      u.pass = await digest(password);
      save();
    },
    async signOut() {
      setSession(null);
    },
    async deleteAccount() {
      await wait();
      const u = me();
      if (!u) return;
      const mine = new Set(db.routes.filter((r) => r.authorId === u).map((r) => r.id));
      db.users = db.users.filter((x) => x.id !== u);
      delete db.profiles[u];
      delete db.priv[u];
      db.routes = db.routes.filter((r) => r.authorId !== u);
      db.likes = db.likes.filter(([rid, x]) => x !== u && !mine.has(rid));
      db.comments = db.comments.filter((c) => c.authorId !== u && !mine.has(c.routeId));
      db.photos = photosOf().filter((p) => p.authorId !== u && !mine.has(p.routeId));
      db.follows = db.follows.filter(([a, b]) => a !== u && b !== u);
      db.blocks = db.blocks.filter(([a, b]) => a !== u && b !== u);
      setSession(null);
    },
    async myProfile() {
      const u = me();
      if (!u || !db.profiles[u]) return null;
      return { profile: db.profiles[u], priv: db.priv[u] ?? null };
    },
    async saveProfile(p: ProfileInput, priv: PrivateProfile) {
      await wait();
      const u = me();
      if (!u) throw new CommunityError('Connecte-toi pour continuer.');
      if (new Date().getFullYear() - priv.birthYear < 15) throw new CommunityError('Boucle est réservé aux personnes de 15 ans et plus.');
      const prev = db.profiles[u];
      db.profiles[u] = { ...p, id: u, createdAt: prev?.createdAt ?? Date.now() };
      db.priv[u] = priv;
      save();
      return db.profiles[u];
    },
    async profile(uid) {
      await wait(80);
      const p = db.profiles[uid];
      if (!p) return null;
      const mine = db.routes.filter((r) => r.authorId === uid);
      return {
        profile: p,
        stats: {
          routes: mine.length,
          followers: db.follows.filter(([, b]) => b === uid).length,
          following: db.follows.filter(([a]) => a === uid).length,
          likes: db.likes.filter(([rid]) => mine.some((r) => r.id === rid)).length,
          followedByMe: !!me() && db.follows.some(([a, b]) => a === me() && b === uid),
        },
      };
    },
    async routesBy(authorId) {
      await wait(80);
      return db.routes.filter((r) => r.authorId === authorId).sort((a, b) => b.createdAt - a.createdAt).map(view);
    },
    async feed(q: FeedQuery) {
      await wait();
      const base = db.routes.filter((r) => !q.sport || r.sport === q.sport);
      const byDate = (a: StoredRoute, b: StoredRoute) => b.createdAt - a.createdAt;
      if (q.kind === 'following') {
        const ids = new Set(db.follows.filter(([a]) => a === me()).map(([, b]) => b));
        return base.filter((r) => ids.has(r.authorId)).sort(byDate).map(view);
      }
      if (q.kind === 'popular') return base.map(view).sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
      if (q.center) {
        const c: LngLat = q.center;
        return base.filter((r) => haversine(c, r.start) < 40000).sort((a, b) => haversine(c, a.start) - haversine(c, b.start)).map(view);
      }
      return base.sort(byDate).map(view);
    },
    async route(rid) {
      await wait(60);
      const r = db.routes.find((x) => x.id === rid);
      return r ? view(r) : null;
    },
    async publish(r: PublishInput) {
      await wait(220);
      const u = need();
      const rid = `pub-${id()}`;
      const stored: StoredRoute = { ...r, id: rid, authorId: u, data: { ...r.data, id: rid }, uses: 0, createdAt: Date.now() };
      db.routes.unshift(stored);
      save();
      return view(stored);
    },
    async unpublish(rid) {
      await wait();
      const u = need();
      db.routes = db.routes.filter((r) => !(r.id === rid && r.authorId === u));
      db.likes = db.likes.filter(([x]) => x !== rid);
      db.comments = db.comments.filter((c) => c.routeId !== rid);
      db.photos = photosOf().filter((p) => p.routeId !== rid);
      save();
    },
    async like(rid, on) {
      await wait(60);
      const u = need();
      db.likes = db.likes.filter(([x, y]) => !(x === rid && y === u));
      if (on) db.likes.push([rid, u]);
      save();
    },
    async comments(rid) {
      await wait(80);
      return db.comments.filter((c) => c.routeId === rid).sort((a, b) => a.createdAt - b.createdAt).map(viewComment);
    },
    async comment(rid, body) {
      await wait();
      const u = need();
      const c: StoredComment = { id: `c-${id()}`, routeId: rid, authorId: u, body, createdAt: Date.now() };
      db.comments.push(c);
      save();
      return viewComment(c);
    },
    async deleteComment(cid) {
      await wait();
      const u = need();
      const c = db.comments.find((x) => x.id === cid);
      const route = c && db.routes.find((r) => r.id === c.routeId);
      if (c && (c.authorId === u || route?.authorId === u)) db.comments = db.comments.filter((x) => x.id !== cid);
      save();
    },
    async follow(uid, on) {
      await wait(60);
      const u = need();
      if (uid === u) return;
      db.follows = db.follows.filter(([a, b]) => !(a === u && b === uid));
      if (on) db.follows.push([u, uid]);
      save();
    },
    async following() {
      const u = me();
      return u ? db.follows.filter(([a]) => a === u).map(([, b]) => b) : [];
    },
    async blocked() {
      const u = me();
      return u ? db.blocks.filter(([a]) => a === u).map(([, b]) => b) : [];
    },
    async block(uid, on) {
      await wait(60);
      const u = need();
      db.blocks = db.blocks.filter(([a, b]) => !(a === u && b === uid));
      if (on) db.blocks.push([u, uid]);
      save();
    },
    async report(target, reason) {
      await wait();
      const u = need();
      db.reports.push({ by: u, target: target.routeId ?? target.commentId ?? target.profileId ?? '', reason, at: Date.now() });
      save();
    },
    async used(rid) {
      const r = db.routes.find((x) => x.id === rid);
      if (r && r.authorId !== me()) {
        r.uses++;
        save();
      }
    },
    async healthDays() {
      const u = me();
      return u ? (db.health?.[u] ?? []) : [];
    },
    async saveHealth(days) {
      const u = need();
      db.health ??= {};
      const byDay = new Map((db.health[u] ?? []).map((d) => [d.day, d]));
      for (const d of days) byDay.set(d.day, d);
      db.health[u] = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-60);
      save();
    },
    async clearHealth() {
      const u = need();
      if (db.health) delete db.health[u];
      save();
    },
    async healthKey() {
      need();
      // Démonstration : rien ne part de l'appareil, la clé ne sert à rien hors ligne.
      return `demo-${Math.random().toString(36).slice(2, 10)}`;
    },
    async uploadAvatar(image) {
      await wait();
      if (!me()) throw new CommunityError('Connecte-toi pour continuer.');
      return blobToDataUrl(image);
    },
    async photos(rid) {
      await wait(60);
      return photosOf().filter((p) => p.routeId === rid).map(viewPhoto);
    },
    async photosBy(authorId) {
      await wait(60);
      return photosOf().filter((p) => p.authorId === authorId).sort((a, b) => b.createdAt - a.createdAt).map(viewPhoto);
    },
    async addPhoto(rid, p: PhotoInput) {
      await wait(200);
      const u = need();
      const [url, thumb] = await Promise.all([blobToDataUrl(p.full), blobToDataUrl(p.thumb)]);
      const stored: StoredPhoto = { id: `ph-${id()}`, routeId: rid, authorId: u, url, thumb, at: p.at, caption: p.caption, width: p.width, height: p.height, createdAt: Date.now() };
      photosOf().push(stored);
      save();
      return viewPhoto(stored);
    },
    async deletePhoto(pid) {
      await wait();
      const u = need();
      const p = photosOf().find((x) => x.id === pid);
      const route = p && db.routes.find((r) => r.id === p.routeId);
      if (p && (p.authorId === u || route?.authorId === u)) db.photos = photosOf().filter((x) => x.id !== pid);
      save();
    },
  };
}
