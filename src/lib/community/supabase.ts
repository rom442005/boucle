import type { SupabaseClient } from '@supabase/supabase-js';
import type { LngLat, Sport } from '../types';
import type { SerialRoute } from '../persist';
import { haversine } from '../geo';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import {
  CommunityError,
  type Comment,
  type CommunityBackend,
  type CommunityRoute,
  type FeedQuery,
  type Level,
  type PrivateProfile,
  type Profile,
  type ProfileInput,
  type PhotoInput,
  type ProfileStats,
  type PublishInput,
  type RoutePhoto,
  type Session,
  type StravaData,
  type HealthDay,
} from './types';

/* Communauté en ligne : Supabase (base PostgreSQL, comptes par code e-mail). Chargé à la demande. */

interface RouteRow {
  id: string;
  author_id: string;
  author_name: string;
  author_level: Level;
  author_city: string | null;
  author_avatar: string | null;
  name: string;
  description: string | null;
  sport: Sport;
  shape: CommunityRoute['shape'];
  distance_m: number;
  ascent_m: number;
  start_lat: number;
  start_lng: number;
  data: SerialRoute;
  likes_count: number;
  comments_count: number;
  uses_count: number;
  photos_count: number | null;
  cover_path: string | null;
  liked_by_me: boolean | null;
  created_at: string;
}
interface ProfileRow {
  id: string;
  first_name: string;
  city: string | null;
  sports: Sport[];
  level: Level;
  practice_years: number | null;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
}
interface PhotoRow {
  id: string;
  route_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  path: string;
  thumb_path: string;
  lat: number | null;
  lng: number | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}
interface CommentRow {
  id: string;
  route_id: string;
  author_id: string;
  author_name: string;
  author_level: Level;
  author_avatar: string | null;
  body: string;
  created_at: string;
}

/** Adresse publique d'une image du stockage (les dossiers « avatars » et « photos » sont publics). */
const publicUrl = (bucket: 'avatars' | 'photos', path: string | null) => (path ? `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` : null);
const avatarPrefix = () => `${SUPABASE_URL}/storage/v1/object/public/avatars/`;

const toRoute = (r: RouteRow): CommunityRoute => ({
  id: r.id,
  authorId: r.author_id,
  authorName: r.author_name,
  authorLevel: r.author_level,
  authorCity: r.author_city,
  authorAvatar: publicUrl('avatars', r.author_avatar),
  name: r.name,
  description: r.description,
  sport: r.sport,
  shape: r.shape,
  distanceM: r.distance_m,
  ascentM: r.ascent_m,
  start: [r.start_lng, r.start_lat],
  data: r.data,
  likes: r.likes_count,
  comments: r.comments_count,
  uses: r.uses_count,
  photos: r.photos_count ?? 0,
  cover: publicUrl('photos', r.cover_path),
  likedByMe: !!r.liked_by_me,
  createdAt: Date.parse(r.created_at),
});
const toProfile = (p: ProfileRow): Profile => ({
  id: p.id,
  firstName: p.first_name,
  city: p.city,
  sports: p.sports ?? [],
  level: p.level,
  practiceYears: p.practice_years,
  bio: p.bio,
  avatar: publicUrl('avatars', p.avatar_path),
  createdAt: Date.parse(p.created_at),
});
const toPhoto = (p: PhotoRow): RoutePhoto => ({
  id: p.id,
  routeId: p.route_id,
  authorId: p.author_id,
  authorName: p.author_name,
  authorAvatar: publicUrl('avatars', p.author_avatar),
  url: publicUrl('photos', p.path)!,
  thumb: publicUrl('photos', p.thumb_path)!,
  at: p.lat != null && p.lng != null ? [p.lng, p.lat] : null,
  caption: p.caption,
  width: p.width,
  height: p.height,
  createdAt: Date.parse(p.created_at),
});
const toComment = (c: CommentRow): Comment => ({
  id: c.id,
  routeId: c.route_id,
  authorId: c.author_id,
  authorName: c.author_name,
  authorLevel: c.author_level,
  authorAvatar: publicUrl('avatars', c.author_avatar),
  body: c.body,
  createdAt: Date.parse(c.created_at),
});

/** Message lisible pour une erreur du serveur. */
function fail(e: { message?: string; code?: string; status?: number } | null, fallback: string): never {
  const msg = e?.message ?? '';
  if (/15 ans/.test(msg)) throw new CommunityError('Boucle est réservé aux personnes de 15 ans et plus.');
  if (e?.code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) throw new CommunityError('E-mail ou mot de passe incorrect.');
  if (e?.code === 'weak_password' || /password should|weak/i.test(msg)) throw new CommunityError('Mot de passe trop court : 8 caractères au moins.');
  if (e?.code === 'reauthentication_needed' || /reauthenticat/i.test(msg)) throw new CommunityError('Par sécurité, reconnecte-toi avec un code, puis change ton mot de passe.');
  if (e?.code === 'email_not_confirmed') throw new CommunityError('Adresse pas encore confirmée : utilise le code reçu par e-mail.');
  if (/token.*(expired|invalid)|otp/i.test(msg)) throw new CommunityError('Code incorrect ou expiré. Demande un nouveau code.');
  if (/rate limit|too many/i.test(msg)) throw new CommunityError('Trop de demandes : réessaie dans quelques minutes.');
  if (/fetch|network/i.test(msg)) throw new CommunityError('Pas de connexion : réessaie quand le réseau revient.');
  throw new CommunityError(fallback);
}

/** Écart en degrés pour un rayon donné (filtre grossier avant le tri par distance). */
const degSpan = (lat: number, km: number) => ({ dLat: km / 111, dLng: km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) });

export async function createSupabaseBackend(): Promise<CommunityBackend> {
  const { createClient } = await import('@supabase/supabase-js');
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'boucle.compte' },
  });
  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null;
  const need = async () => {
    const id = await uid();
    if (!id) throw new CommunityError('Connecte-toi pour continuer.');
    return id;
  };
  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? '' } : null;

  const backend: CommunityBackend = {
    demo: false,
    async session() {
      return toSession((await sb.auth.getSession()).data.session);
    },
    onSession(cb) {
      sb.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
    },
    async sendCode(email) {
      // L'e-mail contient le code à 6 chiffres et un lien de connexion qui ramène ici.
      const here = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined;
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: here } });
      if (error) fail(error, 'Envoi du code impossible. Vérifie l’adresse e-mail.');
    },
    async verifyCode(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.session) fail(error, 'Code incorrect ou expiré. Demande un nouveau code.');
      return toSession(data.session)!;
    },
    async signInWithPassword(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.session) fail(error, 'E-mail ou mot de passe incorrect.');
      return toSession(data.session)!;
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      // Le même mot de passe qu'avant : rien à changer.
      if (error && error.code !== 'same_password') fail(error, 'Mot de passe refusé : choisis-en un autre.');
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async deleteAccount() {
      // Les images d'abord (le stockage ne suit pas la suppression du compte).
      const me = await uid();
      if (me) {
        for (const bucket of ['avatars', 'photos'] as const) {
          const { data } = await sb.storage.from(bucket).list(me, { limit: 1000 });
          const paths = (data ?? []).map((f) => `${me}/${f.name}`);
          if (paths.length) await sb.storage.from(bucket).remove(paths);
        }
      }
      const { error } = await sb.rpc('delete_account');
      if (error) fail(error, 'Suppression impossible pour le moment. Réessaie.');
      await sb.auth.signOut();
    },
    async myProfile() {
      const id = await uid();
      if (!id) return null;
      const [{ data: p }, { data: priv }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', id).maybeSingle(),
        sb.from('profiles_private').select('birth_year').eq('id', id).maybeSingle(),
      ]);
      if (!p) return null;
      return { profile: toProfile(p as ProfileRow), priv: priv ? { birthYear: (priv as { birth_year: number }).birth_year } : null };
    },
    async saveProfile(p: ProfileInput, priv: PrivateProfile) {
      const id = await need();
      const { data: before } = await sb.from('profiles').select('avatar_path').eq('id', id).maybeSingle();
      const prev = (before as { avatar_path: string | null } | null)?.avatar_path ?? null;
      const avatarPath = p.avatar?.startsWith(avatarPrefix()) ? p.avatar.slice(avatarPrefix().length) : null;
      const { data, error } = await sb
        .from('profiles')
        .upsert({ id, first_name: p.firstName, city: p.city, sports: p.sports, level: p.level, practice_years: p.practiceYears, bio: p.bio, avatar_path: avatarPath })
        .select()
        .single();
      if (error) fail(error, 'Enregistrement du profil impossible.');
      // L'ancienne photo de profil ne sert plus.
      if (prev && prev !== avatarPath) void sb.storage.from('avatars').remove([prev]);
      const { error: e2 } = await sb.from('profiles_private').upsert({ id, birth_year: priv.birthYear });
      if (e2) fail(e2, 'Enregistrement du profil impossible.');
      return toProfile(data as ProfileRow);
    },
    async profile(id) {
      const [{ data: p }, { data: st }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', id).maybeSingle(),
        sb.from('profile_stats').select('*').eq('id', id).maybeSingle(),
      ]);
      if (!p) return null;
      const s = (st ?? {}) as { routes?: number; followers?: number; following?: number; likes?: number; followed_by_me?: boolean };
      const stats: ProfileStats = { routes: s.routes ?? 0, followers: s.followers ?? 0, following: s.following ?? 0, likes: s.likes ?? 0, followedByMe: !!s.followed_by_me };
      return { profile: toProfile(p as ProfileRow), stats };
    },
    async routesBy(authorId) {
      const { data, error } = await sb.from('routes_feed').select('*').eq('author_id', authorId).order('created_at', { ascending: false }).limit(100);
      if (error) fail(error, 'Parcours indisponibles pour le moment.');
      return (data as RouteRow[]).map(toRoute);
    },
    async feed(q: FeedQuery) {
      let query = sb.from('routes_feed').select('*');
      if (q.sport) query = query.eq('sport', q.sport);
      if (q.kind === 'nearby' && q.center) {
        // Autour de toi : départs à moins de ~40 km, triés du plus proche au plus loin.
        const [lng, lat] = q.center;
        const { dLat, dLng } = degSpan(lat, 40);
        query = query.gte('start_lat', lat - dLat).lte('start_lat', lat + dLat).gte('start_lng', lng - dLng).lte('start_lng', lng + dLng);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
        if (error) fail(error, 'Communauté indisponible pour le moment.');
        const c: LngLat = q.center;
        return (data as RouteRow[]).map(toRoute).sort((a, b) => haversine(c, a.start) - haversine(c, b.start)).slice(0, 60);
      }
      if (q.kind === 'following') {
        const ids = await backend.following();
        if (!ids.length) return [];
        query = query.in('author_id', ids);
      }
      if (q.kind === 'popular') {
        const since = new Date(Date.now() - 120 * 86400000).toISOString();
        query = query.gte('created_at', since).order('likes_count', { ascending: false });
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(60);
      if (error) fail(error, 'Communauté indisponible pour le moment.');
      return (data as RouteRow[]).map(toRoute);
    },
    async route(id) {
      const { data } = await sb.from('routes_feed').select('*').eq('id', id).maybeSingle();
      return data ? toRoute(data as RouteRow) : null;
    },
    async publish(r: PublishInput) {
      const id = await need();
      const { data, error } = await sb
        .from('routes')
        .insert({
          author_id: id,
          name: r.name,
          description: r.description,
          sport: r.sport,
          shape: r.shape,
          distance_m: Math.round(r.distanceM),
          ascent_m: Math.round(r.ascentM),
          start_lat: r.start[1],
          start_lng: r.start[0],
          data: r.data,
        })
        .select('id')
        .single();
      if (error) fail(error, 'Publication impossible pour le moment.');
      const out = await backend.route((data as { id: string }).id);
      if (!out) throw new CommunityError('Publication impossible pour le moment.');
      return out;
    },
    async unpublish(id) {
      const { error } = await sb.from('routes').delete().eq('id', id);
      if (error) fail(error, 'Retrait impossible pour le moment.');
    },
    async like(routeId, on) {
      const user = await need();
      const { error } = on
        ? await sb.from('likes').upsert({ route_id: routeId, user_id: user }, { ignoreDuplicates: true })
        : await sb.from('likes').delete().eq('route_id', routeId).eq('user_id', user);
      if (error) fail(error, 'Action impossible pour le moment.');
    },
    async comments(routeId) {
      const { data, error } = await sb.from('comments_feed').select('*').eq('route_id', routeId).order('created_at', { ascending: true }).limit(300);
      if (error) fail(error, 'Commentaires indisponibles pour le moment.');
      return (data as CommentRow[]).map(toComment);
    },
    async comment(routeId, body) {
      const user = await need();
      const { data, error } = await sb.from('comments').insert({ route_id: routeId, author_id: user, body }).select('id').single();
      if (error) fail(error, 'Envoi impossible pour le moment.');
      const { data: row } = await sb.from('comments_feed').select('*').eq('id', (data as { id: string }).id).single();
      return toComment(row as CommentRow);
    },
    async deleteComment(id) {
      const { error } = await sb.from('comments').delete().eq('id', id);
      if (error) fail(error, 'Suppression impossible pour le moment.');
    },
    async follow(userId, on) {
      const me = await need();
      const { error } = on
        ? await sb.from('follows').upsert({ follower_id: me, followee_id: userId }, { ignoreDuplicates: true })
        : await sb.from('follows').delete().eq('follower_id', me).eq('followee_id', userId);
      if (error) fail(error, 'Action impossible pour le moment.');
    },
    async following() {
      const me = await uid();
      if (!me) return [];
      const { data } = await sb.from('follows').select('followee_id').eq('follower_id', me);
      return ((data ?? []) as { followee_id: string }[]).map((x) => x.followee_id);
    },
    async blocked() {
      const me = await uid();
      if (!me) return [];
      const { data } = await sb.from('blocks').select('blocked_id').eq('blocker_id', me);
      return ((data ?? []) as { blocked_id: string }[]).map((x) => x.blocked_id);
    },
    async block(userId, on) {
      const me = await need();
      const { error } = on
        ? await sb.from('blocks').upsert({ blocker_id: me, blocked_id: userId }, { ignoreDuplicates: true })
        : await sb.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
      if (error) fail(error, 'Action impossible pour le moment.');
    },
    async report(target, reason) {
      const me = await need();
      const { error } = await sb.from('reports').insert({
        reporter_id: me,
        route_id: target.routeId ?? null,
        comment_id: target.commentId ?? null,
        profile_id: target.profileId ?? null,
        photo_id: target.photoId ?? null,
        reason,
      });
      if (error) fail(error, 'Signalement impossible pour le moment.');
    },
    async used(routeId) {
      if (await uid()) await sb.rpc('use_route', { rid: routeId });
    },
    async uploadAvatar(image) {
      const me = await need();
      const path = `${me}/avatar-${Date.now().toString(36)}.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, image, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (error) fail(error, 'Envoi de la photo impossible pour le moment.');
      return publicUrl('avatars', path)!;
    },
    async photos(routeId) {
      const { data, error } = await sb.from('photos_feed').select('*').eq('route_id', routeId).order('created_at', { ascending: true }).limit(200);
      if (error) fail(error, 'Photos indisponibles pour le moment.');
      return (data as PhotoRow[]).map(toPhoto);
    },
    async photosBy(authorId) {
      const { data, error } = await sb.from('photos_feed').select('*').eq('author_id', authorId).order('created_at', { ascending: false }).limit(120);
      if (error) fail(error, 'Photos indisponibles pour le moment.');
      return (data as PhotoRow[]).map(toPhoto);
    },
    async addPhoto(routeId, p: PhotoInput) {
      const me = await need();
      const base = `${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const files = [
        { path: `${base}.jpg`, blob: p.full },
        { path: `${base}-v.jpg`, blob: p.thumb },
      ];
      for (const f of files) {
        const { error } = await sb.storage.from('photos').upload(f.path, f.blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (error) fail(error, 'Envoi de la photo impossible pour le moment.');
      }
      const { data, error } = await sb
        .from('route_photos')
        .insert({
          route_id: routeId,
          author_id: me,
          path: files[0].path,
          thumb_path: files[1].path,
          lat: p.at?.[1] ?? null,
          lng: p.at?.[0] ?? null,
          caption: p.caption,
          width: p.width,
          height: p.height,
        })
        .select('id')
        .single();
      if (error) {
        void sb.storage.from('photos').remove(files.map((f) => f.path));
        fail(error, 'Envoi de la photo impossible pour le moment.');
      }
      const { data: row } = await sb.from('photos_feed').select('*').eq('id', (data as { id: string }).id).single();
      return toPhoto(row as PhotoRow);
    },
    async healthDays() {
      const me = await uid();
      if (!me) return [];
      // les 28 jours du téléphone, aujourd'hui compris, en date locale
      const t = new Date();
      t.setDate(t.getDate() - 27);
      const since = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const { data, error } = await sb.from('health_days').select('*').eq('user_id', me).gte('day', since).order('day');
      if (error) fail(error, 'Santé indisponible pour le moment.');
      return ((data ?? []) as { day: string; steps: number | null; resting_hr: number | null; vo2max: number | null; distance_m: number; workouts: HealthDay['workouts']; source: HealthDay['source'] }[]).map((r) => ({
        day: r.day,
        steps: r.steps,
        restingHr: r.resting_hr,
        vo2max: r.vo2max,
        distance: r.distance_m,
        workouts: r.workouts ?? [],
        source: r.source,
      }));
    },
    async saveHealth(days) {
      const me = await need();
      if (!days.length) return;
      const { error } = await sb.from('health_days').upsert(
        days.map((d) => ({
          user_id: me,
          day: d.day,
          steps: d.steps,
          resting_hr: d.restingHr,
          vo2max: d.vo2max,
          distance_m: Math.round(d.distance),
          workouts: d.workouts,
          source: d.source,
          updated_at: new Date().toISOString(),
        })),
      );
      if (error) fail(error, 'Envoi des données de santé impossible pour le moment.');
    },
    async clearHealth() {
      const me = await need();
      const { error } = await sb.from('health_days').delete().eq('user_id', me);
      if (error) fail(error, 'Effacement impossible pour le moment.');
    },
    async strava(action, code) {
      const { data, error } = await sb.functions.invoke('strava', { body: { action, code } });
      if (error) throw new CommunityError('Strava ne répond pas pour le moment.');
      return data as StravaData;
    },
    async deletePhoto(id) {
      const { data: row } = await sb.from('route_photos').select('author_id, path, thumb_path').eq('id', id).maybeSingle();
      const { error } = await sb.from('route_photos').delete().eq('id', id);
      if (error) fail(error, 'Suppression impossible pour le moment.');
      // Les fichiers appartiennent à qui a posté la photo : retirés s'il s'agit de moi.
      const r = row as { author_id: string; path: string; thumb_path: string } | null;
      if (r && r.author_id === (await uid())) void sb.storage.from('photos').remove([r.path, r.thumb_path]);
    },
  };
  return backend;
}
