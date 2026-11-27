import { SUPABASE_ANON_KEY, SUPABASE_URL } from './community/config';
import { isNativeApp } from './platform';

/*
 * Compteur de visites, sans cookie et sans rien sur personne : le serveur ne garde que le nombre de visites par jour
 * et par provenance (« tiktok », « insta », « lien » d'un parcours partagé…), pour savoir quelle vidéo amène du monde.
 * Ni adresse IP, ni identifiant, ni appareil. Une visite par jour et par appareil (la date de la dernière, gardée
 * sur l'appareil). Les liens des réseaux portent `?src=tiktok`, `?src=insta`, `?src=youtube`.
 */

const KEY = 'boucle.visite';

/** D'où vient cette visite (à lire avant que l'app ne nettoie l'adresse). */
export function visitSource(): string {
  if (isNativeApp) return 'app';
  const q = new URLSearchParams(location.search);
  const given = (q.get('src') ?? q.get('utm_source') ?? '').toLowerCase();
  if (/^[a-z0-9_-]{1,24}$/.test(given)) return given;
  if (location.hash.startsWith('#r=')) return 'lien';
  let host = '';
  try {
    host = document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    /* provenance illisible */
  }
  if (!host || host === location.hostname) return 'direct';
  if (/instagram\./.test(host)) return 'insta';
  if (/tiktok\./.test(host)) return 'tiktok';
  if (/youtube\.|youtu\.be/.test(host)) return 'youtube';
  if (/facebook\.|fb\./.test(host)) return 'facebook';
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host)) return 'x';
  if (/google\./.test(host)) return 'google';
  return 'site';
}

/** Compte la visite (une fois par jour sur cet appareil) et retire `src` de l'adresse affichée. */
export function countVisit(src: string) {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('src') || [...u.searchParams.keys()].some((k) => k.startsWith('utm_'))) {
      u.searchParams.delete('src');
      for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch {
    /* adresse laissée telle quelle */
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || navigator.webdriver) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(KEY) === today) return;
    localStorage.setItem(KEY, today);
  } catch {
    return;
  }
  void fetch(`${SUPABASE_URL}/rest/v1/rpc/count_visit`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ src }),
    keepalive: true,
  }).catch(() => {});
}
