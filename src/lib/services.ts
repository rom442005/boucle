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

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export async function drinkingWater(b: BBox, signal?: AbortSignal): Promise<LngLat[]> {
  const [w, s, e, n] = b;
  const q = `[out:json][timeout:12];node["amenity"="drinking_water"](${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)});out;`;
  for (const base of OVERPASS) {
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal,
      });
      if (!r.ok) continue;
      const j: { elements: { lon: number; lat: number }[] } = await r.json();
      return j.elements.map((el) => [el.lon, el.lat]);
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }
  return [];
}
