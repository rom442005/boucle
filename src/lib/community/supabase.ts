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
  type ProfileStats,
  type PublishInput,
  type Session,
} from './types';

/* Communauté en ligne : Supabase (base PostgreSQL, comptes par code e-mail). Chargé à la demande. */

interface RouteRow {
  id: string;
  author_id: string;
  author_name: string;
  author_level: Level;
  author_city: string | null;
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
  created_at: string;
}
interface CommentRow {
  id: string;
  route_id: string;
  author_id: string;
  author_name: string;
  author_level: Level;
  body: string;
  created_at: string;
}

const toRoute = (r: RouteRow): CommunityRoute => ({
  id: r.id,
  authorId: r.author_id,
  authorName: r.author_name,
  authorLevel: r.author_level,
  authorCity: r.author_city,
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
  createdAt: Date.parse(p.created_at),
});
const toComment = (c: CommentRow): Comment => ({
  id: c.id,
  routeId: c.route_id,
  authorId: c.author_id,
  authorName: c.author_name,
  authorLevel: c.author_level,
  body: c.body,
  createdAt: Date.parse(c.created_at),
});

/** Message lisible pour une erreur du serveur. */
function fail(e: { message?: string; code?: string; status?: number } | null, fallback: string): never {
  const msg = e?.message ?? '';
  if (/15 ans/.test(msg)) throw new CommunityError('Boucle est réservé aux personnes de 15 ans et plus.');
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
    async signOut() {
      await sb.auth.signOut();
    },
    async deleteAccount() {
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
      const { data, error } = await sb
        .from('profiles')
        .upsert({ id, first_name: p.firstName, city: p.city, sports: p.sports, level: p.level, practice_years: p.practiceYears, bio: p.bio })
        .select()
        .single();
      if (error) fail(error, 'Enregistrement du profil impossible.');
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
        reason,
      });
      if (error) fail(error, 'Signalement impossible pour le moment.');
    },
    async used(routeId) {
      if (await uid()) await sb.rpc('use_route', { rid: routeId });
    },
  };
  return backend;
}
