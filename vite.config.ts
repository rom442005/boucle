import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert l'app sous /boucle/ ; en local elle est à la racine.
// App iPhone (vite build --mode native) : fichiers servis par la coque Capacitor, chemins relatifs,
// et pas de service worker (la coque garde déjà l'app sur le téléphone).
export default defineConfig(({ command, isPreview, mode }) => ({
  base: mode === 'native' ? './' : command === 'build' || isPreview ? '/boucle/' : '/',
  plugins: [
    svelte(),
    mode !== 'native' &&
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/boucle/',
        name: 'Boucle',
        short_name: 'Boucle',
        description: 'Crée des parcours de course et de vélo sur mesure : distance, dénivelé, milieu, sol.',
        lang: 'fr',
        dir: 'ltr',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        theme_color: '#28312C',
        background_color: '#28312C',
        categories: ['sports', 'health', 'navigation'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Une nouvelle version prend la main tout de suite (sinon elle attend que tous les onglets et l'app
        // soient fermés : avec injectRegister à false, le plugin ne l'active pas de lui-même). main.ts recharge
        // ensuite la page au bon moment.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Index des pistes d'athlétisme (public/data/pistes.json) : gardé, revérifié en arrière-plan.
            urlPattern: ({ url }) => url.pathname.endsWith('/data/pistes.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'pistes', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Photos de fond (paysages) : fixes pour une version, gardées après la première vue. Nouvelle série de
            // photos : nouveau nom de cache (et ?v= dans scenes.ts), main.ts efface l'ancien.
            urlPattern: ({ url }) => url.pathname.includes('/scenes/'),
            handler: 'CacheFirst',
            options: { cacheName: 'scenes-2', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Tuiles vectorielles et polices de la carte : elles ne changent pas pour une version donnée.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(planet\/.+|fonts\/.+|sprites\/.+)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carte',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Description du jeu de tuiles : change chaque semaine, on préfère le réseau.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'carte-index', networkTimeoutSeconds: 4 },
          },
          {
            // Images NASA de la Terre (globe) : elles ne changent jamais ; gardées, la Terre s'affiche tout de suite.
            urlPattern: /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'terre',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'relief',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
}));
