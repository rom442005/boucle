import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app as state } from './lib/state.svelte';

const app = mount(App, { target: document.getElementById('app')! });

/*
 * Ouverture (index.html, scripts/intro.py) : une sortie se trace, les chiffres défilent, « Boucle » se pose. Elle
 * reste au moins 3,3 s (le temps d'aller au bout) et au plus 5 s, jusqu'à la première image complète de la carte.
 * Puis on plonge dans la boucle : la carte se pose d'un léger zoom (MapView, « boucle:intro-out ») et l'interface
 * arrive élément par élément (html.arrive, app.css). Pas d'ouverture pour les tests automatisés.
 */
const intro = document.getElementById('intro');
if (intro) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    setTimeout(() => {
      intro.classList.add('out');
      dispatchEvent(new Event('boucle:intro-out'));
      document.documentElement.classList.add('arrive');
      setTimeout(() => intro.remove(), calm ? 400 : 1050);
      setTimeout(() => document.documentElement.classList.remove('arrive'), 2200);
    }, Math.max(0, (calm ? 1200 : 3300) - performance.now()));
  };
  if (navigator.webdriver) intro.remove();
  else {
    addEventListener('boucle:ready', leave, { once: true });
    setTimeout(leave, 5000);
  }
}

/** L'app a déjà été touchée (une mise à jour attend alors qu'elle passe en arrière-plan). */
let touched = false;
addEventListener('pointerdown', () => (touched = true), { once: true, capture: true });

// Dans l'app iPhone (coque Capacitor), pas de service worker : les mises à jour passent par l'App Store.
if (import.meta.env.PROD && import.meta.env.MODE !== 'native' && 'serviceWorker' in navigator) {
  // Anciennes photos de fond (2 560 px, floues sur grand écran), remplacées par la série HD : place libérée.
  if ('caches' in window) void caches.delete('scenes').catch(() => {});
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      // Nouvelle version installée : au lancement (rien touché encore), elle s'applique tout de suite ;
      // sinon, l'app se recharge quand elle passe en arrière-plan, sans jamais couper ce qu'on fait (un
      // rechargement au changement d'onglet ramenait sur Créer : « les onglets ne marchent pas »). Jamais
      // pendant un suivi en direct, une création ou la comparaison de propositions.
      onNeedReload: () => {
        const safe = () => (state.phase === 'compose' || state.phase === 'library') && !state.generating && !state.search && !state.pickOnMap && !state.follow;
        if (!touched && performance.now() < 6000 && safe()) return location.reload();
        const onHide = () => {
          if (document.visibilityState !== 'hidden' || !safe()) return;
          document.removeEventListener('visibilitychange', onHide);
          location.reload();
        };
        document.addEventListener('visibilitychange', onHide);
      },
      // Un onglet ou une app restés ouverts cherchent aussi une nouvelle version au retour, et toutes les heures.
      onRegisteredSW: (_url, reg) => {
        if (!reg) return;
        const check = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', check);
        setInterval(check, 60 * 60 * 1000);
      },
    }),
  );
}

export default app;
