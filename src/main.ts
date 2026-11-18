import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app as state } from './lib/state.svelte';

const app = mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      // Nouvelle version installée : rechargement automatique, mais jamais pendant un suivi en direct,
      // une création ou la comparaison de propositions (elles seraient perdues).
      onNeedReload: () => {
        const safe = () => (state.phase === 'compose' || state.phase === 'library') && !state.generating && !state.search && !state.pickOnMap;
        if (safe()) return location.reload();
        const t = setInterval(() => {
          if (!safe()) return;
          clearInterval(t);
          location.reload();
        }, 3000);
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
