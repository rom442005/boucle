// Boucle : idées de dessins à courir proposées par l'IA (fonction Supabase, Deno).
// La clé de l'API Claude reste ici (secret ANTHROPIC_API_KEY, posé par le propriétaire du projet dans
// Supabase › Edge Functions › Secrets), jamais dans l'app. Sans clé, la fonction répond « not_configured » et
// l'app se contente de sa bibliothèque de formes. Réservé aux membres connectés, 20 demandes par jour chacun
// (table dessin_usage, voir supabase/schema.sql).
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = 'claude-opus-5-5';
const DAILY = 20;

const SYSTEM = `You design GPS-art drawings: shapes that a runner or a cyclist will trace through city streets while recording with GPS, so that the recorded track draws the shape on the map.

Given a short request in French (for example "un diamant", "2027", "un chat", "un cœur avec une flèche"), propose 3 distinct drawings of it.

Rules for every drawing:
- Coordinates are on a 100 × 100 canvas, x to the right, y downward. Use most of the canvas (margin about 10).
- Prefer ONE continuous stroke: the runner cannot lift the pen. Use at most 4 strokes; strokes are joined in their order by straight lines that will be run too, so order them to keep those jumps short.
- A closed shape ends where it starts.
- Bold, simple silhouettes, recognizable at a glance. No detail smaller than 1/12 of the canvas: streets cannot render it.
- 8 to 80 points per stroke; straight segments between points.
- Numbers and words: simple block capitals, one stroke per character when possible, characters side by side on one line.
- name: a short French name for the drawing (2 to 4 words).`;

const SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          strokes: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' } } } },
        },
        required: ['name', 'strokes'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

type Idea = { name: string; strokes: [number, number][][] };

/** Remet chaque idée au propre : points de 0 à 1, traits d'au moins 2 points, 4 traits et 3 idées au plus. */
function clean(raw: unknown): Idea[] {
  const list = (raw as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) return [];
  const out: Idea[] = [];
  for (const it of list.slice(0, 3)) {
    const name = typeof it?.name === 'string' ? it.name.slice(0, 40) : 'Dessin';
    const strokes: [number, number][][] = [];
    for (const s of Array.isArray(it?.strokes) ? it.strokes.slice(0, 4) : []) {
      if (!Array.isArray(s)) continue;
      const pts: [number, number][] = [];
      for (const p of s.slice(0, 200)) {
        if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
        pts.push([Math.min(1, Math.max(0, p[0] / 100)), Math.min(1, Math.max(0, p[1] / 100))]);
      }
      if (pts.length >= 2) strokes.push(pts);
    }
    if (strokes.length) out.push({ name, strokes });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!key) return json({ error: 'not_configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Clés publique et de service : anciens noms (ANON, SERVICE_ROLE) ou nouveaux (PUBLISHABLE, SECRET).
  const pub = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  const asUser = createClient(url, pub, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await asUser.auth.getUser();
  const user = who?.user;
  if (!user) return json({ error: 'auth' }, 401);

  let prompt = '';
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 120) : '';
  } catch {
    /* corps illisible */
  }
  if (!prompt) return json({ error: 'prompt' }, 400);

  // 20 demandes par membre et par jour : l'IA coûte à chaque appel.
  const admin = createClient(url, secret);
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin.from('dessin_usage').select('n').eq('user_id', user.id).eq('day', day).maybeSingle();
  const used = (row as { n?: number } | null)?.n ?? 0;
  if (used >= DAILY) return json({ error: 'limit' }, 429);
  await admin.from('dessin_usage').upsert({ user_id: user.id, day, n: used + 1 });

  const client = new Anthropic({ apiKey: key });
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Si le modèle décline, la même demande repart sur le modèle de secours recommandé.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    } as unknown as Parameters<typeof client.beta.messages.create>[0]);
    const msg = res as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
    if (msg.stop_reason === 'refusal') return json({ ideas: [] });
    const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ ideas: [] });
    }
    return json({ ideas: clean(parsed) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 502);
    if (e instanceof Anthropic.APIError) return json({ error: 'ai', status: e.status }, 502);
    return json({ error: 'ai' }, 502);
  }
});
