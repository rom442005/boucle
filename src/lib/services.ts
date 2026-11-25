import type { LngLat, Place } from './types';
import type { BBox } from './geo';

/* ---------- Recherche d'adresses (Photon, données OpenStreetMap) ---------- */

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

function placeFromPhoton(f: PhotonFeature, kind: Place['kind']): Place {
  const p = f.properties;
  const street = p.street ? `${p.housenumber ? p.housenumber + ' ' : ''}${p.street}` : undefined;
  const name = p.name ?? street ?? p.city ?? 'Lieu';
  const detail = [p.name && street ? street : undefined, p.city ?? p.county, p.city ? undefined : p.state]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i && x !== name)
    .join(', ');
  const tag = p.osm_key && p.osm_value ? `${p.osm_key}:${p.osm_value}` : undefined;
  return { name, detail: detail || undefined, coord: f.geometry.coordinates, kind, ...(tag ? { tag } : {}) };
}

export async function searchPlaces(q: string, near: LngLat | null, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'fr');
  if (near) {
    url.searchParams.set('lon', String(near[0]));
    url.searchParams.set('lat', String(near[1]));
  }
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('search');
  const j: { features: PhotonFeature[] } = await r.json();
  return j.features.map((f) => placeFromPhoton(f, 'search'));
}

export async function reverse(p: LngLat, signal?: AbortSignal): Promise<{ name: string; detail?: string } | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lon=${p[0]}&lat=${p[1]}&lang=fr&limit=1`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j: { features: PhotonFeature[] } = await r.json();
    if (!j.features.length) return null;
    const pl = placeFromPhoton(j.features[0], 'map');
    return { name: pl.name, detail: pl.detail };
  } catch {
    return null;
  }
}

/* ---------- Vent (Open-Meteo) ---------- */

export interface Weather {
  /** direction d'où vient le vent, en degrés */
  windFrom: number;
  windKmh: number;
  temperature: number;
  isDay: boolean;
  code: number;
}

export async function weather(p: LngLat, signal?: AbortSignal): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(3)}&longitude=${p[0].toFixed(3)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&wind_speed_unit=kmh`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.current;
    return { windFrom: c.wind_direction_10m, windKmh: c.wind_speed_10m, temperature: c.temperature_2m, isDay: !!c.is_day, code: c.weather_code };
  } catch {
    return null;
  }
}

/* ---------- Points d'eau potable (Overpass, OpenStreetMap) ---------- */

/*
 * Overpass : le premier serveur qui répond (celui d'OpenStreetMap France, rapide et fiable, puis les deux
 * serveurs publics, souvent saturés), chacun avec un délai maximal pour ne jamais faire attendre l'app.
 */
const OVERPASS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** serveur qui vient de refuser ou d'échouer : on passe au suivant pendant 10 minutes */
const resting = new Map<string, number>();

export async function overpass<T>(q: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T | null> {
  const now = Date.now();
  const order = [...OVERPASS].sort((a, b) => Number((resting.get(a) ?? 0) > now) - Number((resting.get(b) ?? 0) > now));
  for (const base of order) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const stop = () => ctrl.abort();
    signal?.addEventListener('abort', stop);
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: ctrl.signal,
      });
      if (r.ok) return (await r.json()) as T;
      // Trop de demandes (429, 403), serveur saturé (5xx) : on le laisse se reposer.
      resting.set(base, Date.now() + 10 * 60000);
    } catch (err) {
      if (signal?.aborted) throw err;
      resting.set(base, Date.now() + 10 * 60000);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
  }
  return null;
}

export async function drinkingWater(b: BBox, signal?: AbortSignal): Promise<LngLat[]> {
  const [w, s, e, n] = b;
  const q = `[out:json][timeout:12];node["amenity"="drinking_water"](${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)});out;`;
  const j = await overpass<{ elements: { lon: number; lat: number }[] }>(q, signal, 12000);
  return j ? j.elements.map((el) => [el.lon, el.lat]) : [];
}

/* ---------- Horaires d'un lieu de la carte (OpenStreetMap), à la demande ---------- */

/** Ce qui porte les horaires, selon le genre du lieu touché (pistes, parcs, points d'eau, toilettes…). */
const HOURS_OF: Record<string, { f: string; r: number }> = {
  track: { f: '["leisure"~"^(track|sports_centre|stadium|pitch)$"]', r: 150 },
  park: { f: '["leisure"~"^(park|garden|playground|dog_park)$"]', r: 400 },
  wood: { f: '["leisure"~"^(park|nature_reserve)$"]', r: 400 },
  water: { f: '["leisure"~"^(park|swimming_area|beach_resort|marina)$"]', r: 300 },
  fountain: { f: '["amenity"="drinking_water"]', r: 40 },
  toilets: { f: '["amenity"="toilets"]', r: 40 },
};
const HOURS_KEY = 'boucle.horaires.v1';
const HOURS_TTL = 30 * 86400000;
let hoursMem: Record<string, { t: number; h: string | null }> | null = null;
function hoursStore() {
  if (hoursMem) return hoursMem;
  try {
    hoursMem = JSON.parse(localStorage.getItem(HOURS_KEY) ?? '{}') ?? {};
  } catch {
    hoursMem = {};
  }
  return hoursMem!;
}

/**
 * Les horaires d'ouverture (opening_hours) du lieu touché sur la carte, s'ils sont connus d'OpenStreetMap :
 * une petite requête au plus par lieu, gardée 30 jours (sans horaires aussi, pour ne pas redemander).
 */
export async function placeHours(c: LngLat, kind: string, signal?: AbortSignal): Promise<string | null> {
  const spec = HOURS_OF[kind];
  if (!spec) return null;
  const key = `${kind}:${c[0].toFixed(4)},${c[1].toFixed(4)}`;
  const st = hoursStore();
  const hit = st[key];
  if (hit && Date.now() - hit.t < HOURS_TTL) return hit.h;
  const q = `[out:json][timeout:10];nwr(around:${spec.r},${c[1].toFixed(5)},${c[0].toFixed(5)})${spec.f}["opening_hours"];out tags 1;`;
  const j = await overpass<{ elements: { tags?: Record<string, string> }[] }>(q, signal, 10000);
  if (!j) return null; // pas de réponse : on redemandera
  const h = j.elements[0]?.tags?.opening_hours ?? null;
  st[key] = { t: Date.now(), h };
  // Au plus 400 lieux gardés.
  const keys = Object.keys(st);
  if (keys.length > 400) for (const k of keys.sort((a, b) => st[a].t - st[b].t).slice(0, keys.length - 400)) delete st[k];
  try {
    localStorage.setItem(HOURS_KEY, JSON.stringify(st));
  } catch {
    /* stockage plein */
  }
  return h;
}
