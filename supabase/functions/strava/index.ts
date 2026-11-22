// Boucle : lien avec Strava (fonction Supabase, Deno).
// Le code secret de l'application Strava reste ici (secret STRAVA_CLIENT_SECRET), jamais dans l'app.
// Actions : connect (code reçu après l'accord sur Strava), stats (chiffres et dernières sorties), disconnect.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STRAVA = 'https://www.strava.com';
const CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') ?? '';

interface Link {
  user_id: string;
  athlete_id: number;
  athlete_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function token(body: Record<string, string>) {
  const r = await fetch(`${STRAVA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...body }),
  });
  if (!r.ok) throw new Error(`strava token ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'not_configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Clés publique et de service : anciens noms (ANON, SERVICE_ROLE) ou nouveaux (PUBLISHABLE, SECRET).
  const pub = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  const asUser = createClient(url, pub, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await asUser.auth.getUser();
  const user = who?.user;
  if (!user) return json({ error: 'auth' }, 401);
  const admin = createClient(url, secret);

  let body: { action?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide */
  }

  const load = async (): Promise<Link | null> => (await admin.from('strava_links').select('*').eq('user_id', user.id).maybeSingle()).data as Link | null;
  /** Jeton valable (Strava les fait expirer au bout de 6 h : on le renouvelle au besoin). */
  const fresh = async (l: Link): Promise<Link> => {
    if (l.expires_at > Date.now() / 1000 + 120) return l;
    const t = await token({ grant_type: 'refresh_token', refresh_token: l.refresh_token });
    const next = { ...l, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
    await admin.from('strava_links').update({ access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    return next;
  };

  try {
    if (body.action === 'connect') {
      if (!body.code) return json({ error: 'code' }, 400);
      const t = await token({ grant_type: 'authorization_code', code: body.code });
      const a = t.athlete ?? {};
      await admin.from('strava_links').upsert({
        user_id: user.id,
        athlete_id: a.id,
        athlete_name: [a.firstname, a.lastname].filter(Boolean).join(' ') || null,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: t.expires_at,
        scope: t.scope ?? null,
        updated_at: new Date().toISOString(),
      });
      return json({ connected: true });
    }

    if (body.action === 'disconnect') {
      const l = await load();
      if (l) {
        await fetch(`${STRAVA}/oauth/deauthorize`, { method: 'POST', headers: { Authorization: `Bearer ${l.access_token}` } }).catch(() => {});
        await admin.from('strava_links').delete().eq('user_id', user.id);
      }
      return json({ connected: false });
    }

    // stats (par défaut)
    const l0 = await load();
    if (!l0) return json({ connected: false });
    const l = await fresh(l0);
    const h = { Authorization: `Bearer ${l.access_token}` };
    const [statsR, actsR] = await Promise.all([
      fetch(`${STRAVA}/api/v3/athletes/${l.athlete_id}/stats`, { headers: h }),
      fetch(`${STRAVA}/api/v3/athlete/activities?per_page=6`, { headers: h }),
    ]);
    if (statsR.status === 401) return json({ connected: false, revoked: true });
    const stats = statsR.ok ? await statsR.json() : null;
    const acts = actsR.ok ? await actsR.json() : [];
    const tot = (x: { count?: number; distance?: number; moving_time?: number; elevation_gain?: number } | undefined) => ({
      count: x?.count ?? 0,
      distance: Math.round(x?.distance ?? 0),
      time: x?.moving_time ?? 0,
      elevation: Math.round(x?.elevation_gain ?? 0),
    });
    return json({
      connected: true,
      athlete: l.athlete_name,
      ytd: { run: tot(stats?.ytd_run_totals), ride: tot(stats?.ytd_ride_totals) },
      recent: { run: tot(stats?.recent_run_totals), ride: tot(stats?.recent_ride_totals) },
      activities: (acts as Record<string, unknown>[]).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type ?? a.type,
        distance: Math.round((a.distance as number) ?? 0),
        time: a.moving_time,
        elevation: Math.round((a.total_elevation_gain as number) ?? 0),
        date: a.start_date,
      })),
    });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
