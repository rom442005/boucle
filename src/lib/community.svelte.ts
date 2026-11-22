import type { LngLat, Route, Sport } from './types';
import { deserialize, serialize } from './persist';
import { hidePrivateZone } from './community/privacy';
import { checkText } from './community/moderation';
import { communityConfigured } from './community/config';
import {
  CommunityError,
  type Comment,
  type CommunityBackend,
  type CommunityRoute,
  type FeedKind,
  type PrivateProfile,
  type Profile,
  type ProfileInput,
  type ProfileStats,
  type ReportTarget,
  type RoutePhoto,
  type Session,
  type StravaData,
  type HealthDay,
} from './community/types';
import { app } from './state.svelte';
import { haptic } from './haptics';
import { cumulative, nearestOnRoute, pointAt } from './geo';
import { prepareAvatar, preparePhoto } from './images';
import { elevationStats } from './elevation';

/*
 * La Communauté, comme sur Strava : un compte (code reçu par e-mail, puis un profil), un fil des parcours
 * publiés autour de soi, de ses abonnements ou les plus aimés, des j'aime, des commentaires, des profils
 * à suivre, et des parcours à reprendre (suivre, favori, GPX, mêmes réglages). Modération : signaler,
 * masquer une personne, retirer ce qu'on a publié, supprimer son compte.
 */

const DEMO_FLAG = 'boucle.demo';
const PUBLISHED_KEY = 'boucle.publies.v1';

/** Écran du panneau qui remplace le contenu habituel le temps d'une action (sans fenêtre par-dessus). */
export type Sheet =
  | { kind: 'auth'; reason: string; then?: () => void; tab?: 'profile' }
  | { kind: 'publish' }
  | { kind: 'edit' }
  | { kind: 'health' }
  | { kind: 'report'; target: ReportTarget; label: string };

export type CommunityView = 'feed' | 'profile';

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* sans mémoire */
  }
}

/** Démonstration demandée (?demo=communaute), gardée d'une visite à l'autre jusqu'à « Quitter la démo ». */
function demoRequested(): boolean {
  if (typeof location !== 'undefined' && /[?&]demo=communaute\b/.test(location.search)) writeFlag(DEMO_FLAG, '1');
  return readFlag(DEMO_FLAG) === '1';
}

class CommunityState {
  /** la Communauté est disponible (serveur configuré, ou démonstration) */
  available = $state(false);
  demo = $state(false);
  /** serveur en ligne configuré (sinon, tout reste sur l'appareil) */
  configured = false;
  ready = $state(false);
  session = $state.raw<Session | null>(null);
  me = $state.raw<Profile | null>(null);
  myPrivate = $state.raw<PrivateProfile | null>(null);

  view = $state<CommunityView>('feed');
  sheet = $state.raw<Sheet | null>(null);

  feedKind = $state<FeedKind>('nearby');
  sport = $state<Sport | null>(null);
  feed = $state.raw<CommunityRoute[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** parcours de la communauté ouvert en détail */
  current = $state.raw<CommunityRoute | null>(null);
  comments = $state.raw<Comment[]>([]);
  commentsLoading = $state(false);

  /** photos de sorties du parcours ouvert */
  photos = $state.raw<RoutePhoto[]>([]);
  /** photos en cours d'envoi */
  uploading = $state(0);
  /** visionneuse plein écran */
  lightbox = $state.raw<{ list: RoutePhoto[]; index: number } | null>(null);
  /** photo à montrer sur la carte (depuis la visionneuse) */
  photoFocus = $state.raw<{ id: string; at: LngLat; tick: number } | null>(null);

  /** profil affiché */
  viewing = $state.raw<{ profile: Profile; stats: ProfileStats; routes: CommunityRoute[]; photos: RoutePhoto[] } | null>(null);
  following = $state.raw<string[]>([]);
  blocked = $state.raw<string[]>([]);
  /** parcours publiés depuis cet appareil : identifiant local → identifiant dans la communauté */
  published = $state<Record<string, string>>({});

  private backend: CommunityBackend | null = null;
  private starting: Promise<CommunityBackend | null> | null = null;

  constructor() {
    try {
      this.published = JSON.parse(readFlag(PUBLISHED_KEY) ?? '{}');
    } catch {
      this.published = {};
    }
    // Tant que le serveur n'est pas branché, les comptes vivent sur l'appareil (démonstration).
    this.configured = communityConfigured();
    this.demo = typeof window !== 'undefined' && (demoRequested() || !this.configured);
    this.available = this.demo || this.configured;
    app.onCommunityUse = (id) => this.used(id);
  }

  get signedIn() {
    return !!this.session && !!this.me;
  }

  /** Démarre la Communauté (chargée à la demande) et reprend la session. */
  start(): Promise<CommunityBackend | null> {
    this.starting ??= (async () => {
      if (!this.available) return null;
      try {
        const b = this.demo ? await (await import('./community/local')).createLocalBackend() : await (await import('./community/supabase')).createSupabaseBackend();
        this.backend = b;
        b.onSession((s) => {
          const fresh = !!s && s.userId !== this.session?.userId;
          this.session = s;
          if (!s) {
            this.me = null;
            this.myPrivate = null;
          } else if (fresh && this.ready && !this.verifying) void this.arrived();
        });
        this.linkError();
        this.session = await b.session();
        if (this.session) await this.loadMe();
        this.ready = true;
        // Revenu par le lien de l'e-mail sans profil : dernière étape, le profil.
        if (this.session && !this.me) this.sheet ??= { kind: 'auth', reason: 'Dernière étape : ton profil.' };
        return b;
      } catch (e) {
        console.error(e);
        this.error = 'Communauté indisponible pour le moment.';
        this.starting = null;
        return null;
      }
    })();
    return this.starting;
  }

  private async api(): Promise<CommunityBackend> {
    const b = this.backend ?? (await this.start());
    if (!b) throw new CommunityError('La Communauté arrive bientôt.');
    return b;
  }

  private async loadMe() {
    const b = await this.api();
    const mine = await b.myProfile();
    this.me = mine?.profile ?? null;
    this.myPrivate = mine?.priv ?? null;
    [this.following, this.blocked] = await Promise.all([b.following(), b.blocked()]);
  }

  /** Erreur lisible, en bandeau. */
  private say(e: unknown, fallback = 'Action impossible pour le moment.') {
    const msg = e instanceof CommunityError ? e.message : fallback;
    if (!(e instanceof CommunityError)) console.error(e);
    app.showToast(msg);
    haptic('warn');
  }

  /**
   * Une action qui demande un compte : faite tout de suite si l'on est connecté (profil complet),
   * sinon après la connexion, qui s'ouvre dans le panneau.
   */
  async requireAccount(reason: string, then: () => void, tab?: 'profile') {
    await this.start();
    if (this.signedIn) then();
    else this.sheet = { kind: 'auth', reason, then, tab };
  }

  /* ------------------------------------------ Compte ------------------------------------------ */

  async sendCode(email: string) {
    await (await this.api()).sendCode(email.trim());
  }

  /** connexion en cours (code ou mot de passe) : le profil n'est pas encore chargé, rien ne doit s'ouvrir */
  verifying = $state(false);

  /**
   * Connecté par le lien de l'e-mail (dans cet onglet ou un autre) : l'action en attente reprend,
   * ou le profil s'ouvre s'il n'existe pas encore.
   */
  private async arrived() {
    try {
      await this.loadMe();
    } catch (e) {
      return this.say(e);
    }
    if (this.me) {
      if (this.sheet?.kind === 'auth') this.finishAuth();
      else haptic('success');
    } else this.sheet ??= { kind: 'auth', reason: 'Dernière étape : ton profil.' };
  }

  /** Lien de l'e-mail périmé ou déjà utilisé : on le dit, et l'adresse redevient propre. */
  private linkError() {
    if (typeof location === 'undefined' || !/[#&]error(_code)?=/.test(location.hash)) return;
    app.showToast(/otp_expired/.test(location.hash) ? 'Lien expiré ou déjà utilisé : redemande un e-mail.' : 'Connexion impossible avec ce lien : redemande un e-mail.');
    history.replaceState(null, '', location.pathname + location.search);
  }

  /**
   * Code reçu : connecté ; reste le profil à remplir s'il n'existe pas encore. Mot de passe oublié : le
   * nouveau est enregistré dans la foulée, avant de reprendre.
   */
  async verifyCode(email: string, code: string, newPassword?: string): Promise<'done' | 'profile'> {
    const b = await this.api();
    return this.enter(async () => {
      const s = await b.verifyCode(email.trim(), code.trim());
      if (newPassword) await b.setPassword(newPassword);
      return s;
    });
  }

  /** Connexion par mot de passe, sans e-mail à attendre. */
  async signInWithPassword(email: string, password: string): Promise<'done' | 'profile'> {
    const b = await this.api();
    return this.enter(() => b.signInWithPassword(email.trim(), password));
  }

  async setPassword(password: string) {
    await (await this.api()).setPassword(password);
  }

  private async enter(signIn: () => Promise<Session>): Promise<'done' | 'profile'> {
    this.verifying = true;
    try {
      this.session = await signIn();
    } finally {
      this.verifying = false;
    }
    await this.loadMe();
    if (this.me) {
      this.finishAuth();
      return 'done';
    }
    return 'profile';
  }

  async saveProfile(p: ProfileInput, priv: PrivateProfile) {
    for (const t of [p.firstName, p.city ?? '', p.bio ?? '']) {
      const bad = checkText(t);
      if (bad) throw new CommunityError(bad);
    }
    const b = await this.api();
    this.me = await b.saveProfile(p, priv);
    this.myPrivate = priv;
    if (this.viewing?.profile.id === this.me.id) this.viewing = { ...this.viewing, profile: this.me };
  }

  /** Après la connexion (et le profil) : l'action qui l'avait demandée reprend. */
  finishAuth() {
    const s = this.sheet;
    this.sheet = null;
    haptic('success');
    if (s?.kind === 'auth') s.then?.();
  }

  async signOut() {
    await (await this.api()).signOut();
    this.myView = null;
    this.session = null;
    this.me = null;
    this.myPrivate = null;
    this.following = [];
    this.blocked = [];
    this.view = 'feed';
    app.showToast('Déconnecté');
  }

  async deleteAccount() {
    try {
      await (await this.api()).deleteAccount();
      this.myView = null;
      this.session = null;
      this.me = null;
      this.myPrivate = null;
      this.published = {};
      writeFlag(PUBLISHED_KEY, null);
      this.view = 'feed';
      this.sheet = null;
      app.showToast('Compte supprimé, avec tout ce que tu avais publié.');
      void this.loadFeed();
    } catch (e) {
      this.say(e, 'Suppression impossible pour le moment. Réessaie.');
    }
  }

  quitDemo() {
    writeFlag(DEMO_FLAG, null);
    writeFlag('boucle.demo.communaute.v1', null);
    location.replace(location.pathname);
  }

  /* ------------------------------------------- Fil ------------------------------------------- */

  /** Point de référence du fil « Autour de toi » : ta position, sinon le départ choisi. */
  private center(): LngLat | null {
    return app.userPos ?? app.start?.coord ?? null;
  }

  /**
   * Les trois fils (Autour de toi, Abonnements, Populaires), gardés pour le filtre de sport en cours : leurs
   * chiffres s'affichent sur les blocs-onglets et changer d'onglet montre tout de suite le fil, rafraîchi ensuite.
   */
  private feeds: Partial<Record<FeedKind, CommunityRoute[]>> = {};
  feedCounts = $state<Record<FeedKind, number | null>>({ nearby: null, following: null, popular: null });

  private async fetchKind(kind: FeedKind) {
    const b = await this.api();
    const list = (await b.feed({ kind, center: this.center(), sport: this.sport })).filter((r) => !this.blocked.includes(r.authorId));
    this.feeds[kind] = list;
    this.feedCounts = { ...this.feedCounts, [kind]: list.length };
    return list;
  }

  /** Une modification d'un parcours (j'aime, retrait, publication, blocage) vaut pour tous les fils gardés. */
  private patchFeeds(change: (list: CommunityRoute[]) => CommunityRoute[]) {
    this.feed = change(this.feed);
    for (const k of Object.keys(this.feeds) as FeedKind[]) {
      this.feeds[k] = change(this.feeds[k]!);
      this.feedCounts = { ...this.feedCounts, [k]: this.feeds[k]!.length };
    }
  }

  async loadFeed() {
    const kind = this.feedKind;
    const kept = this.feeds[kind];
    if (kept) this.feed = kept;
    this.loading = true;
    this.error = null;
    try {
      const list = await this.fetchKind(kind);
      if (kind === this.feedKind) this.feed = list;
    } catch (e) {
      if (kind === this.feedKind) {
        this.error = e instanceof CommunityError ? e.message : 'Communauté indisponible pour le moment.';
        this.feed = [];
      }
    } finally {
      this.loading = false;
    }
    // Les deux autres fils, sans attendre : leurs chiffres arrivent, leur onglet s'ouvrira déjà rempli.
    for (const k of ['nearby', 'following', 'popular'] as const) if (k !== kind) void this.fetchKind(k).catch(() => {});
  }

  setFeedKind(k: FeedKind) {
    if (k === this.feedKind) return;
    this.feedKind = k;
    void this.loadFeed();
  }

  setSport(s: Sport | null) {
    this.sport = this.sport === s ? null : s;
    this.feeds = {};
    this.feedCounts = { nearby: null, following: null, popular: null };
    void this.loadFeed();
  }

  /** En arrière-plan, au calme : le fil est prêt avant qu'on ouvre l'onglet (puis rafraîchi à l'ouverture). */
  async prefetch() {
    const b = await this.start();
    if (!b) return;
    if (!this.feed.length && !this.loading) await this.loadFeed();
    // Mon profil aussi : l'onglet Profil s'ouvre déjà rempli.
    const me = this.me;
    if (me && !this.myView) {
      try {
        const [p, routes, photos] = await Promise.all([b.profile(me.id), b.routesBy(me.id), b.photosBy(me.id).catch(() => [])]);
        if (p) this.myView = { ...p, routes, photos };
      } catch {
        /* il se chargera à l'ouverture */
      }
    }
  }

  /** Ouvre la Communauté (onglet ou bouton). */
  open() {
    app.openCommunity();
    this.view = 'feed';
    void this.start().then(() => this.loadFeed());
  }

  /* ---------------------------------------- Un parcours ---------------------------------------- */

  /** Un parcours de la communauté en détail : la carte le trace, comme les tiens. */
  async openRoute(id: string, from?: CommunityRoute) {
    try {
      const b = await this.api();
      const r = from ?? (await b.route(id));
      if (!r) {
        app.showToast('Ce parcours n’est plus publié.');
        return;
      }
      this.current = r;
      this.comments = [];
      this.photos = [];
      app.showCommunityRoute(this.toRoute(r));
      void this.loadComments(r.id);
      void this.loadPhotos(r.id);
      // À jour (j'aime, commentaires) sans attendre pour afficher.
      if (from) void b.route(id).then((fresh) => fresh && this.current?.id === id && (this.current = fresh));
    } catch (e) {
      this.say(e);
    }
  }

  toRoute(r: CommunityRoute): Route {
    const route = deserialize({ ...r.data, id: `c-${r.id}`, n: r.name }, app.settings);
    return { ...route, communityId: r.id };
  }

  async loadComments(routeId: string) {
    this.commentsLoading = true;
    try {
      const list = await (await this.api()).comments(routeId);
      if (this.current?.id === routeId) this.comments = list.filter((c) => !this.blocked.includes(c.authorId));
    } catch {
      /* les commentaires attendront */
    } finally {
      this.commentsLoading = false;
    }
  }

  async loadPhotos(routeId: string) {
    try {
      const list = await (await this.api()).photos(routeId);
      if (this.current?.id === routeId) this.photos = list.filter((p) => !this.blocked.includes(p.authorId));
    } catch {
      /* les photos attendront */
    }
  }

  /**
   * Photos d'une sortie sur un parcours publié : réduites sur l'appareil (sans leurs métadonnées), placées sur
   * le tracé publié si elles ont été prises à moins de 200 m de lui (jamais dans la zone privée du départ).
   */
  async addPhotos(files: File[], r: CommunityRoute | null = this.current) {
    if (!r || !files.length) return;
    const route = r;
    await this.requireAccount('Connecte-toi pour ajouter tes photos.', async () => {
      const list = files.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)).slice(0, 10);
      if (files.length > 10) app.showToast('10 photos au plus à la fois.');
      const coords = this.toRoute(route).coords;
      const cum = cumulative(coords);
      const b = await this.api();
      let added = 0;
      this.uploading += list.length;
      for (const f of list) {
        try {
          const prep = await preparePhoto(f);
          let at = null;
          if (prep.at && coords.length > 1) {
            const near = nearestOnRoute(coords, cum, prep.at);
            if (near.dist < 200) at = pointAt(coords, cum, near.s).coord;
          }
          const photo = await b.addPhoto(route.id, { full: prep.full, thumb: prep.thumb, width: prep.width, height: prep.height, at, caption: null });
          added++;
          if (this.current?.id === route.id) this.photos = [...this.photos, photo];
          const base = this.current?.id === route.id ? this.current : route;
          this.patchRoute({ ...base, photos: base.photos + 1, cover: base.cover ?? photo.thumb });
          if (this.viewing?.profile.id === photo.authorId) this.viewing = { ...this.viewing, photos: [photo, ...this.viewing.photos] };
        } catch (e) {
          this.say(e, 'Cette photo n’a pas pu être ajoutée.');
        } finally {
          this.uploading--;
        }
      }
      if (added) {
        haptic('success');
        app.showToast(added > 1 ? `${added} photos ajoutées` : 'Photo ajoutée');
      }
    });
  }

  async deletePhoto(p: RoutePhoto) {
    try {
      await (await this.api()).deletePhoto(p.id);
      this.photos = this.photos.filter((x) => x.id !== p.id);
      const r = this.current?.id === p.routeId ? this.current : this.feed.find((x) => x.id === p.routeId);
      if (r) this.patchRoute({ ...r, photos: Math.max(0, r.photos - 1), cover: r.cover === p.thumb ? (this.photos[0]?.thumb ?? null) : r.cover });
      if (this.viewing) this.viewing = { ...this.viewing, photos: this.viewing.photos.filter((x) => x.id !== p.id) };
      const lb = this.lightbox;
      if (lb) {
        const list = lb.list.filter((x) => x.id !== p.id);
        this.lightbox = list.length ? { list, index: Math.min(lb.index, list.length - 1) } : null;
      }
      app.showToast('Photo retirée');
    } catch (e) {
      this.say(e);
    }
  }

  openPhotos(list: RoutePhoto[], index: number) {
    if (!list.length) return;
    haptic('tap');
    this.lightbox = { list, index: Math.max(0, Math.min(index, list.length - 1)) };
  }

  /** Photo de profil : carrée, déposée, puis gardée à l'enregistrement du profil. */
  async uploadAvatar(file: File): Promise<string> {
    const img = await prepareAvatar(file);
    return (await this.api()).uploadAvatar(img);
  }

  /** Changer sa photo de profil directement depuis son profil. */
  async changeAvatar(file: File | null) {
    const me = this.me;
    const priv = this.myPrivate;
    if (!me || !priv) return;
    try {
      const avatar = file ? await this.uploadAvatar(file) : null;
      const { id: _id, createdAt: _c, ...input } = me;
      await this.saveProfile({ ...input, avatar }, priv);
      if (this.viewing?.profile.id === me.id) this.viewing = { ...this.viewing, profile: this.me! };
      haptic('success');
      app.showToast(file ? 'Photo de profil mise à jour' : 'Photo de profil retirée');
    } catch (e) {
      this.say(e, 'Envoi de la photo impossible pour le moment.');
    }
  }

  /** J'aime : immédiat à l'écran, envoyé ensuite (annulé si l'envoi échoue). */
  toggleLike(r: CommunityRoute) {
    void this.requireAccount('Connecte-toi pour aimer ce parcours.', async () => {
      const on = !r.likedByMe;
      const next = { ...r, likedByMe: on, likes: Math.max(0, r.likes + (on ? 1 : -1)) };
      this.patchRoute(next);
      haptic(on ? 'success' : 'tap');
      try {
        await (await this.api()).like(r.id, on);
      } catch (e) {
        this.patchRoute(r);
        this.say(e);
      }
    });
  }

  private patchRoute(r: CommunityRoute) {
    if (this.current?.id === r.id) this.current = r;
    this.patchFeeds((list) => list.map((x) => (x.id === r.id ? r : x)));
    if (this.viewing) this.viewing = { ...this.viewing, routes: this.viewing.routes.map((x) => (x.id === r.id ? r : x)) };
  }

  async addComment(body: string): Promise<boolean> {
    const r = this.current;
    if (!r) return false;
    const text = body.trim();
    if (!text) return false;
    const bad = checkText(text);
    if (bad) {
      app.showToast(bad);
      haptic('warn');
      return false;
    }
    let ok = false;
    await this.requireAccount('Connecte-toi pour commenter.', async () => {
      try {
        const c = await (await this.api()).comment(r.id, text);
        this.comments = [...this.comments, c];
        this.patchRoute({ ...r, comments: r.comments + 1 });
        haptic('success');
        ok = true;
      } catch (e) {
        this.say(e, 'Envoi impossible pour le moment.');
      }
    });
    return ok;
  }

  async deleteComment(c: Comment) {
    try {
      await (await this.api()).deleteComment(c.id);
      this.comments = this.comments.filter((x) => x.id !== c.id);
      const r = this.current;
      if (r) this.patchRoute({ ...r, comments: Math.max(0, r.comments - 1) });
      app.showToast('Commentaire retiré');
    } catch (e) {
      this.say(e);
    }
  }

  /** Un parcours de la communauté repris (favori, suivi, GPX) : compté pour son auteur. */
  used(routeId?: string) {
    if (!routeId || !this.backend) return;
    void this.backend.used(routeId).catch(() => {});
  }

  /** Mêmes réglages que ce parcours, depuis ton départ : sport, distance, dénivelé, forme. */
  reuseSettings(r: CommunityRoute) {
    const route = this.toRoute(r);
    app.reuseSettings(route);
    this.used(r.id);
  }

  async unpublish(r: CommunityRoute) {
    try {
      await (await this.api()).unpublish(r.id);
      this.patchFeeds((list) => list.filter((x) => x.id !== r.id));
      for (const [local, remote] of Object.entries(this.published)) if (remote === r.id) delete this.published[local];
      writeFlag(PUBLISHED_KEY, JSON.stringify(this.published));
      if (this.viewing) this.viewing = { ...this.viewing, routes: this.viewing.routes.filter((x) => x.id !== r.id) };
      app.showToast('Parcours retiré de la Communauté');
      if (app.detailFrom?.kind === 'communaute') app.back();
    } catch (e) {
      this.say(e);
    }
  }

  /* ---------------------------------------- Publier ---------------------------------------- */

  /** Publier le parcours affiché : compte d'abord, puis le formulaire dans le panneau. */
  startPublish() {
    void this.requireAccount('Connecte-toi pour publier ce parcours.', () => (this.sheet = { kind: 'publish' }));
  }

  async publish(route: Route, opts: { name: string; description: string; hideStart: boolean; photos?: File[] }): Promise<boolean> {
    const name = opts.name.trim().slice(0, 80) || route.name;
    const description = opts.description.trim().slice(0, 500);
    for (const t of [name, description]) {
      const bad = checkText(t);
      if (bad) {
        app.showToast(bad);
        haptic('warn');
        return false;
      }
    }
    try {
      // Zone privée : le parcours publié commence et finit à 300 m de ton départ.
      const t = opts.hideStart ? hidePrivateZone(route.coords, route.profile, 300) : { coords: route.coords, profile: route.profile, removed: 0 };
      const cum = cumulative(t.coords);
      const lengthM = cum[cum.length - 1] ?? route.lengthM;
      const shown: Route = { ...route, name, coords: t.coords, profile: t.profile, lengthM, vias: undefined };
      const data = { ...serialize(shown, true), pr: undefined };
      const out = await (await this.api()).publish({
        name,
        description: description || null,
        sport: route.sport,
        shape: route.shape,
        distanceM: lengthM,
        ascentM: elevationStats(t.profile).ascent,
        start: t.coords[0],
        data,
      });
      this.published = { ...this.published, [route.id]: out.id };
      writeFlag(PUBLISHED_KEY, JSON.stringify(this.published));
      this.sheet = null;
      this.feed = [out, ...this.feed.filter((x) => x.id !== out.id)];
      this.feeds = {};
      haptic('success');
      app.showToast('Publié dans la Communauté');
      if (opts.photos?.length) void this.addPhotos(opts.photos, out);
      return true;
    } catch (e) {
      this.say(e, 'Publication impossible pour le moment.');
      return false;
    }
  }

  /* ---------------------------------------- Profils ---------------------------------------- */

  async openProfile(id: string) {
    try {
      const b = await this.api();
      const [p, routes, photos] = await Promise.all([b.profile(id), b.routesBy(id), b.photosBy(id).catch(() => [])]);
      if (!p) {
        app.showToast('Ce profil n’existe plus.');
        return;
      }
      this.viewing = { ...p, routes, photos };
      if (id === this.me?.id) this.myView = this.viewing;
      if (app.phase !== 'community') app.openCommunity();
      this.view = 'profile';
    } catch (e) {
      this.say(e);
    }
  }

  /** Santé : mes journées (serveur), envoi depuis le téléphone, effacement. */
  async healthDays() {
    return (await this.api()).healthDays();
  }
  async saveHealth(days: HealthDay[]) {
    await (await this.api()).saveHealth(days);
  }
  async clearHealth() {
    await (await this.api()).clearHealth();
  }
  /** Clé du raccourci « Boucle Santé » (iPhone sans l'app). */
  async healthKey() {
    return (await this.api()).healthKey();
  }

  /** Lien avec Strava, par la fonction du serveur (le compte Boucle doit être connecté). */
  async strava(action: 'connect' | 'stats' | 'disconnect', code?: string): Promise<StravaData> {
    const b = await this.api();
    if (!b.strava) throw new CommunityError('Strava n’est disponible qu’avec la Communauté en ligne.');
    return b.strava(action, code);
  }

  /** Onglet Profil : ton profil, ou la connexion d'abord (dans le panneau de la Communauté). */
  /** Mon profil tel qu'il a été vu la dernière fois : l'onglet Profil l'affiche sans attendre. */
  myView = $state.raw<{ profile: Profile; stats: ProfileStats; routes: CommunityRoute[]; photos: RoutePhoto[] } | null>(null);

  openMe() {
    this.sheet = null;
    const me = this.me;
    if (this.signedIn && me) {
      // Tout de suite, ce que l'on sait déjà ; les chiffres se mettent à jour ensuite, sans changer d'écran.
      this.viewing = this.myView ?? { profile: me, stats: { routes: 0, followers: 0, following: 0, likes: 0, followedByMe: false }, routes: [], photos: [] };
      this.view = 'profile';
      if (app.phase !== 'community') app.openCommunity();
      void this.openProfile(me.id);
      return;
    }
    if (app.phase !== 'community') this.open();
    void this.openMyProfile();
  }

  async openMyProfile() {
    await this.requireAccount('Connecte-toi pour retrouver ton profil.', () => void this.openProfile(this.me!.id), 'profile');
  }

  toggleFollow(userId: string) {
    void this.requireAccount('Connecte-toi pour suivre cette personne.', async () => {
      const on = !this.following.includes(userId);
      this.following = on ? [...this.following, userId] : this.following.filter((x) => x !== userId);
      const v = this.viewing;
      if (v && v.profile.id === userId) this.viewing = { ...v, stats: { ...v.stats, followedByMe: on, followers: Math.max(0, v.stats.followers + (on ? 1 : -1)) } };
      haptic(on ? 'success' : 'tap');
      try {
        await (await this.api()).follow(userId, on);
      } catch (e) {
        this.following = on ? this.following.filter((x) => x !== userId) : [...this.following, userId];
        this.say(e);
      }
    });
  }

  /** Masquer une personne : ses parcours et commentaires disparaissent pour toi. */
  toggleBlock(userId: string, name: string) {
    void this.requireAccount('Connecte-toi pour masquer cette personne.', async () => {
      const on = !this.blocked.includes(userId);
      try {
        await (await this.api()).block(userId, on);
        this.blocked = on ? [...this.blocked, userId] : this.blocked.filter((x) => x !== userId);
        if (on) {
          this.patchFeeds((list) => list.filter((r) => r.authorId !== userId));
          this.comments = this.comments.filter((c) => c.authorId !== userId);
          this.photos = this.photos.filter((p) => p.authorId !== userId);
          if (this.following.includes(userId)) await (await this.api()).follow(userId, false);
          this.following = this.following.filter((x) => x !== userId);
        }
        app.showToast(on ? `${name} est masqué : tu ne verras plus ses parcours ni ses commentaires.` : `${name} n’est plus masqué.`);
        if (on && app.detailFrom?.kind === 'communaute' && this.current?.authorId === userId) app.back();
      } catch (e) {
        this.say(e);
      }
    });
  }

  startReport(target: ReportTarget, label: string) {
    void this.requireAccount('Connecte-toi pour signaler un contenu.', () => (this.sheet = { kind: 'report', target, label }));
  }

  async report(target: ReportTarget, reason: string) {
    try {
      await (await this.api()).report(target, reason);
      this.sheet = null;
      haptic('success');
      app.showToast('Merci : le signalement est transmis, il sera examiné sous 24 h.');
    } catch (e) {
      this.say(e, 'Signalement impossible pour le moment.');
    }
  }
}

export const community = new CommunityState();
