<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
  import type { FeatureCollection, GeoJSON, Polygon } from 'geojson';
  import { app, type Padding, type PlaceKind } from '../lib/state.svelte';
  import { buildStyle, planValue, ROUTE_CASING, satelliteOverrides, SPACE_ZOOM, type Theme } from '../lib/mapstyle';
  import { cityDot, globeLabels, prefetchEarth, registerEarth } from '../lib/earth';
  import { easeInOutSine, easeOutCubic, traceEase, traceMs, traceTimeAt } from '../lib/motion';
  import { circlePolygon, EMPTY, kmMarks, lineFeature, pointsFC, segmentsToGeoJSON, sliceBetween, sliceRoute, slopeSegments } from '../lib/routegeo';
  import { climbsOf, slopeColor, SLOPE_WORDS } from '../lib/elevation';
  import { ICONS } from '../lib/icons';
  import { bbox, cumulative, haversine, pointAt } from '../lib/geo';
  import { km, kmValue, NNBSP } from '../lib/format';
  import { haptic, tactile } from '../lib/haptics';
  import Icon from './Icon.svelte';
  import type { LngLat, Route } from '../lib/types';

  const VIEW_KEY = 'boucle.vue.v1';
  const NANTES: LngLat = [-1.5536, 47.2184];
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Ciel étoilé autour du globe : deux motifs de tailles différentes, pour que la répétition ne se voie pas. */
  function starTile(size: number, count: number, seed: number): string {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    let dots = '';
    for (let i = 0; i < count; i++) {
      const r = 0.3 + Math.pow(rnd(), 3) * 0.95;
      const o = 0.22 + rnd() * 0.6;
      const hue = rnd();
      const fill = hue < 0.12 ? '#cfe0ff' : hue > 0.92 ? '#fff1d6' : '#ffffff';
      dots += `<circle cx='${(rnd() * size).toFixed(1)}' cy='${(rnd() * size).toFixed(1)}' r='${r.toFixed(2)}' fill='${fill}' fill-opacity='${o.toFixed(2)}'/>`;
    }
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${dots}</svg>`)}")`;
  }
  const STARS = `${starTile(389, 34, 7)}, ${starTile(557, 58, 4241)}`;

  let el: HTMLDivElement;
  let map: MLMap | null = null;
  let ready = $state(false);
  /** Vue de loin : l'espace autour du globe est visible. */
  let space = $state(false);
  /** La Terre entière, au dézoom maximal. */
  let orbit = $state(false);
  /** Assez loin pour que les pastilles des côtes se chevauchent : elles s'effacent. */
  let far = $state(false);
  let theme: Theme = dark.matches ? 'dark' : 'light';
  /** Style d'origine du thème : on y relit les valeurs du plan en quittant le mode Satellite. */
  let planStyle = buildStyle(theme);
  let anim = 0;
  let lastTick = -1;
  let lastStartKey = '';
  let startMarker: Marker | null = null;
  let destMarker: Marker | null = null;
  let viaMarker: Marker | null = null;
  let userMarker: Marker | null = null;
  let lens: Marker | null = null;
  let attrib: maplibregl.AttributionControl | null = null;
  const cumCache = new WeakMap<Route, Float64Array>();
  const cumOf = (r: Route) => {
    let c = cumCache.get(r);
    if (!c) cumCache.set(r, (c = cumulative(r.coords)));
    return c;
  };

  /** Ce qu'un clic sur la carte place, selon le moment (null : le clic ne place rien). */
  function clickKind(): PlaceKind | null {
    if (app.pickOnMap) return app.pickOnMap;
    if (app.search && app.wide) return app.search;
    if (app.phase === 'compose' && app.params.shape === 'oneway') return 'destination';
    return null;
  }
  const placing = $derived(clickKind());

  // Aperçu au survol (souris) : le point se prépare sous le curseur avant le clic.
  const hoverable = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const aimKind = $derived(hoverable && ready ? placing : null);
  let aim = $state<{ x: number; y: number; ll: LngLat } | null>(null);
  /** Juste après un clic : aperçu masqué jusqu'au prochain mouvement. */
  let aimHold: { x: number; y: number } | null = null;
  let dragging = false;
  const aimLabel = $derived.by(() => {
    if (!aim || !aimKind) return '';
    if (aimKind === 'start') return 'Départ ici';
    if (aimKind === 'via') return 'Passer par ici';
    const s = app.start?.coord;
    return s ? `à ${km(haversine(s, aim.ll))} du départ` : 'Destination ici';
  });
  let ripple = $state<{ x: number; y: number; id: number } | null>(null);
  let rippleId = 0;

  /** Retour visuel d'un point posé : onde à l'endroit du clic, puis le marqueur se pose. */
  function landed(kind: PlaceKind, pt: { x: number; y: number }) {
    aim = null;
    aimHold = { x: pt.x, y: pt.y };
    if (reduce) return;
    ripple = { x: pt.x, y: pt.y, id: ++rippleId };
    requestAnimationFrame(() => {
      const mk = (kind === 'start' ? startMarker : kind === 'via' ? viaMarker : destMarker)?.getElement();
      if (!mk) return;
      mk.classList.remove('is-dropping');
      void mk.offsetWidth;
      mk.classList.add('is-dropping');
      mk.addEventListener('animationend', () => mk.classList.remove('is-dropping'), { once: true });
    });
  }

  const tintOf = () => (theme === 'dark' ? '#FF375F' : '#FF2D55');
  const zw = (a: number, b: number) => ['interpolate', ['linear'], ['zoom'], 10, a, 16, b] as unknown as number;

  function setData(id: string, data: GeoJSON) {
    (map?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  function chevron(): ImageData {
    const s = 2;
    const c = document.createElement('canvas');
    c.width = 14 * s;
    c.height = 14 * s;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    ctx.lineWidth = 2.3 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(4.8 * s, 3.6 * s);
    ctx.lineTo(9.4 * s, 7 * s);
    ctx.lineTo(4.8 * s, 10.4 * s);
    ctx.stroke();
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  /** Opacité des propositions non choisies (elles apparaissent en fondu une fois le parcours tracé). */
  const ALT_OPACITY = { casing: 0.75 };
  const altLineOpacity = () => (theme === 'dark' ? 0.7 : 0.62);

  /**
   * Fondu d'une propriété de couche : la transition est réglée juste avant la nouvelle valeur. Un délai passe
   * par un minuteur : MapLibre ne garde que la dernière valeur posée avant une image, une valeur posée puis
   * remplacée dans la foulée ne serait jamais affichée.
   */
  let fadeTimers: ReturnType<typeof setTimeout>[] = [];
  function fadeProp(id: string, prop: string, value: unknown, ms: number, delay = 0) {
    if (delay > 0) {
      fadeTimers.push(setTimeout(() => fadeProp(id, prop, value, ms), delay));
      return;
    }
    const m = map;
    if (!m?.getLayer(id)) return;
    m.setPaintProperty(id, `${prop}-transition`, { duration: ms, delay: 0 });
    m.setPaintProperty(id, prop, value);
  }
  function clearFades() {
    for (const t of fadeTimers) clearTimeout(t);
    fadeTimers = [];
  }

  function addLayers() {
    const m = map!;
    const tint = tintOf();
    const casing = ROUTE_CASING[theme];
    if (!m.hasImage('chevron')) m.addImage('chevron', chevron(), { pixelRatio: 2 });
    if (!m.hasImage('collider')) m.addImage('collider', new ImageData(68, 68), { pixelRatio: 2 });
    addCityDots();
    for (const id of ['reach', 'aim', 'alt', 'climb-hl', 'sel', 'sel-line', 'done', 'marks', 'water', 'start-pt', 'pen', 'sonar']) {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY });
    }
    const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
    // Voile de mise au point : quand un parcours est proposé, le fond de carte s'efface un peu derrière lui.
    m.addLayer({
      id: 'focus-veil',
      type: 'background',
      paint: {
        'background-color': theme === 'dark' ? '#1e1f21' : '#f7f6f2',
        'background-opacity': 0,
        'background-opacity-transition': { duration: 700, delay: 0 },
      },
    });
    m.addLayer({
      id: 'reach-fill',
      type: 'fill',
      source: 'reach',
      paint: { 'fill-color': tint, 'fill-opacity': 0.035, 'fill-opacity-transition': { duration: 750, delay: 0 } },
    });
    m.addLayer({
      id: 'reach-line',
      type: 'line',
      source: 'reach',
      paint: { 'line-color': tint, 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2.5] },
    });
    // Sonar pendant la recherche : deux ondes partent du départ jusqu'au bord de la zone explorée.
    for (const id of ['sonar-a', 'sonar-b']) {
      m.addLayer({
        id,
        type: 'circle',
        source: 'sonar',
        paint: {
          'circle-radius': 0,
          'circle-color': tint,
          'circle-opacity': 0,
          'circle-stroke-color': tint,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0,
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
        },
      });
    }
    // Aperçu au survol : ligne droite du départ vers le point visé.
    m.addLayer({
      id: 'aim-line',
      type: 'line',
      source: 'aim',
      layout: round,
      paint: { 'line-color': theme === 'dark' ? '#FFFFFF' : '#1C1C1E', 'line-opacity': 0.5, 'line-width': 1.75, 'line-dasharray': [0.1, 2.2] },
    });
    m.addLayer({ id: 'alt-casing', type: 'line', source: 'alt', layout: round, paint: { 'line-color': casing, 'line-width': zw(5, 9), 'line-opacity': ALT_OPACITY.casing } });
    m.addLayer({ id: 'alt-line', type: 'line', source: 'alt', layout: round, paint: { 'line-color': theme === 'dark' ? '#98989D' : '#8E8E93', 'line-opacity': altLineOpacity(), 'line-width': zw(3, 5.5) } });
    m.addLayer({ id: 'alt-hit', type: 'line', source: 'alt', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 24 } });
    // Côte ou descente mise en avant : un halo de sa couleur sous le tracé.
    m.addLayer({
      id: 'climb-hl',
      type: 'line',
      source: 'climb-hl',
      layout: round,
      paint: { 'line-color': ['get', 'color'], 'line-width': zw(16, 26), 'line-opacity': 0.34, 'line-blur': 3 },
    });
    // Halo du tracé : la lumière du stylo qui dessine le parcours, puis elle s'éteint doucement.
    m.addLayer({
      id: 'sel-glow',
      type: 'line',
      source: 'sel-line',
      layout: round,
      paint: {
        'line-color': tint,
        'line-width': zw(16, 28),
        'line-blur': zw(9, 15),
        'line-opacity': 0,
        'line-opacity-transition': { duration: 1100, delay: 0 },
      },
    });
    m.addLayer({ id: 'sel-casing', type: 'line', source: 'sel-line', layout: round, paint: { 'line-color': casing, 'line-width': zw(7.5, 12.5) } });
    m.addLayer({ id: 'sel-line', type: 'line', source: 'sel', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': zw(4.5, 8) } });
    m.addLayer({
      id: 'done-line',
      type: 'line',
      source: 'done',
      layout: round,
      paint: { 'line-color': theme === 'dark' ? '#7C7C80' : '#A7A7AC', 'line-width': zw(4.5, 8) },
    });
    m.addLayer({
      id: 'sel-arrows',
      type: 'symbol',
      source: 'sel-line',
      minzoom: 12.5,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 72,
        'icon-image': 'chevron',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.65, 17, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
      },
    });
    // Le stylo : une pointe blanche cerclée de rose et sa lueur, en tête du tracé.
    m.addLayer({
      id: 'pen-glow',
      type: 'circle',
      source: 'pen',
      paint: {
        'circle-radius': 22,
        'circle-color': tint,
        'circle-blur': 1,
        'circle-opacity': 0,
        'circle-opacity-transition': { duration: 420, delay: 0 },
        'circle-pitch-alignment': 'map',
      },
    });
    m.addLayer({
      id: 'pen-core',
      type: 'circle',
      source: 'pen',
      paint: {
        'circle-radius': 6.5,
        'circle-color': '#FFFFFF',
        'circle-stroke-color': tint,
        'circle-stroke-width': 3,
        'circle-opacity': 0,
        'circle-stroke-opacity': 0,
        'circle-opacity-transition': { duration: 420, delay: 0 },
        'circle-stroke-opacity-transition': { duration: 420, delay: 0 },
        'circle-pitch-alignment': 'map',
      },
    });
    m.addLayer({
      id: 'water-pts',
      type: 'circle',
      source: 'water',
      paint: { 'circle-radius': 6, 'circle-color': '#2F8AD1', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 },
    });
    m.addLayer({
      id: 'marks-dot',
      type: 'circle',
      source: 'marks',
      minzoom: 11.5,
      paint: {
        // Bornes kilométriques discrètes de loin, lisibles de près.
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 16, 9.5] as unknown as number,
        'circle-color': theme === 'dark' ? '#1E1F21' : '#FFFFFF',
        'circle-stroke-color': tint,
        'circle-stroke-width': 1.6,
      },
    });
    m.addLayer({
      id: 'marks-label',
      type: 'symbol',
      source: 'marks',
      minzoom: 11.5,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 8.5, 16, 10.5] as unknown as number,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': theme === 'dark' ? '#FFFFFF' : '#C8103C' },
    });
    // Zone invisible sous le marqueur de départ : les noms de lieux s'écartent au lieu d'être coupés.
    m.addLayer({
      id: 'start-collider',
      type: 'symbol',
      source: 'start-pt',
      layout: { 'icon-image': 'collider', 'icon-allow-overlap': true, 'icon-ignore-placement': false },
    });
  }

  /** Anneaux des villes du globe : aux couleurs du thème, et blanc sur les photos. */
  function addCityDots() {
    const m = map;
    if (!m) return;
    if (!m.hasImage('city-dot')) m.addImage('city-dot', cityDot(theme), { pixelRatio: 2 });
    if (!m.hasImage('city-dot-night')) m.addImage('city-dot-night', cityDot('dark'), { pixelRatio: 2 });
  }

  function onStyleLoad() {
    addLayers();
    applyMapType();
    apply3D(app.terrain3d, false);
    ready = true;
    limbFaded = false;
    fadeLimb();
    placeShade();
  }

  /**
   * Plan ou Satellite : les photos et les noms en blanc s'appliquent sur le style en place, sans le recharger.
   * Les images (photos IGN, Terre dessinée ou photographiée) passent de l'une à l'autre en fondu enchaîné ;
   * les couleurs des routes et des noms suivent la transition du style.
   */
  const RASTERS = ['earth', 'earth-sat', 'ortho'];
  let rasterTimer: ReturnType<typeof setTimeout> | undefined;
  function crossfadeRasters(sat: boolean, animate: boolean) {
    const m = map;
    if (!m) return;
    clearTimeout(rasterTimer);
    const motion = animate && !reduce ? 1 : 0;
    for (const id of RASTERS) {
      if (!m.getLayer(id)) continue;
      const show = id === 'earth' ? !sat : sat;
      const full = planValue(planStyle, { id, kind: 'paint', prop: 'raster-opacity', value: null });
      if (show) {
        // Apparition : d'abord invisible (affiché une image), puis l'opacité du style en fondu.
        if (m.getLayoutProperty(id, 'visibility') === 'none') {
          m.setPaintProperty(id, 'raster-opacity-transition', { duration: 0, delay: 0 });
          m.setPaintProperty(id, 'raster-opacity', 0);
          m.setLayoutProperty(id, 'visibility', 'visible');
          if (motion) {
            requestAnimationFrame(() => requestAnimationFrame(() => fadeProp(id, 'raster-opacity', full, 640)));
            continue;
          }
        }
        m.setPaintProperty(id, 'raster-opacity-transition', { duration: 640 * motion, delay: 0 });
        m.setPaintProperty(id, 'raster-opacity', full);
      } else if (motion) {
        m.setPaintProperty(id, 'raster-opacity-transition', { duration: 420, delay: 0 });
        m.setPaintProperty(id, 'raster-opacity', 0);
      } else {
        m.setLayoutProperty(id, 'visibility', 'none');
      }
    }
    if (motion)
      rasterTimer = setTimeout(() => {
        for (const id of RASTERS) {
          const show = id === 'earth' ? app.mapType !== 'satellite' : app.mapType === 'satellite';
          if (!show && map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
        }
      }, 460);
  }
  function applyMapType(animate = false) {
    const m = map;
    if (!m) return;
    const sat = app.mapType === 'satellite';
    crossfadeRasters(sat, animate);
    for (const o of satelliteOverrides()) {
      if (!m.getLayer(o.id)) continue;
      if (RASTERS.includes(o.id) && o.prop === 'visibility') continue;
      const v = sat ? o.value : planValue(planStyle, o);
      try {
        if (o.kind === 'paint') m.setPaintProperty(o.id, o.prop, v);
        else m.setLayoutProperty(o.id, o.prop, v);
      } catch {
        /* propriété refusée : le plan reste lisible */
      }
    }
    applyVeil();
    if (app.terrain3d && m.getLayer('building-3d')) {
      m.setPaintProperty('building-3d', 'fill-extrusion-opacity', sat ? 0.62 : theme === 'dark' ? 0.88 : 0.94);
    }
  }

  /** Voile de mise au point : couleur du sol sur le plan, ombre légère sur les photos. */
  function applyVeil() {
    const m = map;
    if (!m?.getLayer('focus-veil')) return;
    const on = app.phase === 'results' || app.phase === 'detail';
    const sat = app.mapType === 'satellite';
    m.setPaintProperty('focus-veil', 'background-color', sat ? '#0b0d10' : theme === 'dark' ? '#1e1f21' : '#f7f6f2');
    m.setPaintProperty('focus-veil', 'background-opacity', on ? (sat ? 0.3 : theme === 'dark' ? 0.34 : 0.42) : 0);
  }

  /** Relief accentué selon le terrain : une ville plate a besoin de plus d'exagération pour que ses côtes se voient. */
  function exaggeration(): number {
    const r = app.route;
    const range = r ? r.maxEle - r.minEle : null;
    if (range == null) return 1.9;
    return range < 40 ? 2.4 : range < 120 ? 1.9 : range < 400 ? 1.5 : 1.3;
  }

  /**
   * Le relief se lève : l'exagération du terrain monte de 0 à sa valeur (ou redescend) image par image.
   * MapLibre la lit à chaque rendu ; rien n'est rechargé.
   */
  let riseAnim = 0;
  function riseTerrain(to: number, ms: number, done?: () => void) {
    cancelAnimationFrame(riseAnim);
    const t = map?.terrain;
    if (!t) return done?.();
    const from = t.exaggeration;
    const t0 = performance.now();
    const step = (now: number) => {
      const tr = map?.terrain;
      if (!tr) return;
      const k = Math.min(1, (now - t0) / ms);
      tr.exaggeration = from + (to - from) * easeOutCubic(k);
      map!.triggerRepaint();
      if (k < 1) riseAnim = requestAnimationFrame(step);
      else done?.();
    };
    riseAnim = requestAnimationFrame(step);
  }

  /**
   * Passage en 3D, comme un survol : la caméra s'incline en pivotant d'un quart de tour léger, puis revient
   * face au nord d'origine, pendant que le relief se lève et que les bâtiments apparaissent.
   */
  const SWING = 14;
  /** Pendant le pivot, la boussole ne s'affiche pas (le nord revient tout seul). */
  let swinging = false;
  function swingBack(target: number, pitch: number) {
    swinging = true;
    map?.once('moveend', () => {
      const m = map;
      // Pivot interrompu (geste, autre demande) : on n'insiste pas.
      if (!m || !app.terrain3d || m.isMoving() || Math.abs(m.getPitch() - pitch) > 2) {
        swinging = false;
        if (m) app.bearing = m.getBearing();
        return;
      }
      m.easeTo({ bearing: target, duration: 760, easing: easeInOutSine });
      m.once('moveend', () => {
        swinging = false;
        if (map) app.bearing = map.getBearing();
      });
    });
  }

  let b3dTimer: ReturnType<typeof setTimeout> | undefined;
  function apply3D(on: boolean, animate: boolean) {
    if (!map) return;
    const motion = animate && !reduce;
    try {
      // Ombrage du relief plus marqué en 3D : les collines se lisent.
      map.setPaintProperty('hillshade', 'hillshade-exaggeration-transition', { duration: motion ? 1100 : 0, delay: 0 });
      map.setPaintProperty('hillshade', 'hillshade-exaggeration', on ? (theme === 'dark' ? 0.55 : 0.5) : theme === 'dark' ? 0.35 : 0.28);
      if (on) {
        cancelAnimationFrame(riseAnim);
        map.setTerrain({ source: 'dem-3d', exaggeration: exaggeration() });
        if (motion && map.terrain) {
          map.terrain.exaggeration = 0.01;
          riseTerrain(exaggeration(), 1400);
        }
      } else if (motion && map.terrain) {
        // Le relief redescend vite, puis la carte redevient plate.
        riseTerrain(0.01, 480, () => {
          if (!app.terrain3d) map?.setTerrain(null);
        });
      } else {
        cancelAnimationFrame(riseAnim);
        map.setTerrain(null);
      }
    } catch {
      /* style pas encore prêt */
    }
    // Bâtiments en volume : ils apparaissent en fondu, et sont masqués une fois effacés.
    clearTimeout(b3dTimer);
    if (map.getLayer('building-3d')) {
      if (on) {
        map.setLayoutProperty('building-3d', 'visibility', 'visible');
        // Ils apparaissent pendant que la caméra s'incline, un peu après le relief.
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity-transition', { duration: motion ? 950 : 0, delay: motion ? 260 : 0 });
        // Sur les photos, les volumes restent translucides : les toits photographiés se voient au travers.
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity', app.mapType === 'satellite' ? 0.62 : theme === 'dark' ? 0.88 : 0.94);
      } else {
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity-transition', { duration: motion ? 420 : 0, delay: 0 });
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0);
        b3dTimer = setTimeout(() => {
          if (map?.getLayer('building-3d') && !app.terrain3d) map.setLayoutProperty('building-3d', 'visibility', 'none');
        }, animate ? 700 : 0);
      }
    }
    if (animate) {
      const r = app.phase === 'results' || app.phase === 'detail' ? app.route : null;
      const b0 = map.getBearing();
      if (r) {
        // Un parcours affiché : on le recadre en entier, incliné en 3D (en pivotant), à plat sinon.
        fitCoords(r.coords, true, on ? 52 : 0, on && motion ? b0 - SWING : undefined);
        if (on && motion) swingBack(b0, 52);
      } else {
        // Assez près pour que la ville se lève (les volumes montent avec le zoom jusqu'à 13,8).
        const z = map.getZoom();
        // Centré sur le départ, dans la partie de carte que le panneau laisse visible.
        map.easeTo({
          center: on && app.start ? app.start.coord : undefined,
          padding: untrack(() => app.padding),
          pitch: on ? 60 : 0,
          zoom: on ? Math.max(z, 14.8) : z,
          bearing: on && motion ? b0 - SWING : b0,
          duration: reduce ? 0 : on ? 1100 : 650,
          easing: on ? easeInOutSine : (t) => 1 - Math.pow(1 - t, 3),
        });
        if (on && motion) swingBack(b0, 60);
      }
    }
  }

  function element(cls: string, html = ''): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    return d;
  }

  /**
   * Cadre des coordonnées dans la partie visible de la carte (la marge du panneau est déjà celle de la carte) ;
   * en 3D, avec une inclinaison douce qui embrasse tout le parcours. Un lieu lointain se rejoint en survolant
   * le globe, comme dans Plans : on s'élève, on traverse, on redescend.
   */
  const NO_PAD: Padding = { top: 0, bottom: 0, left: 0, right: 0 };
  /** Un peu d'air entre un parcours cadré et les bords (panneau, profil, boutons). */
  const breathe = (p: Padding): Padding => ({ top: p.top + 18, bottom: p.bottom + 18, left: p.left + 18, right: p.right + 18 });
  function fitCoords(coords: LngLat[], animate = true, pitch = app.terrain3d ? 52 : 0, bearing?: number) {
    if (!map || coords.length < 2) return;
    const [w, s, e, n] = bbox(coords);
    // En projection globe, MapLibre cadre d'après la seule marge passée ici : la marge propre de la carte
    // (celle qui centre le globe vu de loin) est mise à zéro le temps du calcul, puis rejointe pendant le mouvement.
    const tr = map.transform;
    const kept = { ...tr.padding };
    tr.setPadding(NO_PAD);
    const cam = map.cameraForBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: breathe(untrack(() => app.padding)), maxZoom: 16, ...(bearing != null ? { bearing } : {}) },
    );
    tr.setPadding(kept);
    if (!cam) return;
    const c = map.getCenter();
    const far = haversine([c.lng, c.lat], [(w + e) / 2, (s + n) / 2]) > 40000 || map.getZoom() < 8;
    const motion = !animate || reduce ? { duration: 0 } : far ? { curve: 1.55, speed: 1.25, maxDuration: 3600 } : { duration: 850 };
    map.flyTo({ ...cam, pitch, padding: NO_PAD, ...motion });
  }

  /**
   * Vu de l'espace, le globe se place au milieu de la partie visible de la carte (hors panneau et barres) :
   * il y glisse quand le panneau change de taille ou quand on finit de dézoomer.
   */
  let pendingPad: Padding | null = null;
  /** Vu de l'espace sur iPhone, la capsule « Revenir… » coiffe le panneau : la Terre se centre au-dessus d'elle. */
  function spacePad(p: Padding): Padding {
    return app.wide ? p : { ...p, bottom: p.bottom + 44 };
  }
  function syncPadding(given: Padding) {
    const p = spacePad(given);
    if (!map || map.getZoom() >= SPACE_ZOOM) return;
    // Pendant un cadrage ou un geste, on attend la fin du mouvement : un saut l'interromprait.
    if (map.isMoving()) {
      pendingPad = given;
      return;
    }
    pendingPad = null;
    const cur = map.getPadding();
    if (cur.top === p.top && cur.bottom === p.bottom && cur.left === p.left && cur.right === p.right) return;
    // Vue de la Terre entière : elle garde sa taille par rapport à la nouvelle partie visible.
    const zoom = orbit ? { zoom: orbitZoom(map.getCenter().lat, given) } : {};
    map.easeTo({ padding: p, ...zoom, duration: reduce ? 0 : 520, easing: (t) => 1 - Math.pow(1 - t, 3) });
  }

  /**
   * Le tracé d'un parcours tout juste trouvé, comme au stylo : une pointe lumineuse part du départ et
   * dessine le parcours, coloré selon la pente, avec un halo rose qui s'éteint ensuite. Les bornes
   * kilométriques apparaissent à son passage, les autres propositions en fondu à la fin, et le départ
   * (ou l'arrivée) « respire » une fois quand la boucle se referme. Le profil et les chiffres suivent
   * le même avancement (app.revealK).
   */
  let reveal: { tick: number; t0: number; ms: number } | null = null;
  function draw(r: Route, animate: boolean, marks: FeatureCollection) {
    cancelAnimationFrame(anim);
    clearFades();
    const segs = slopeSegments(r);
    const total = cumOf(r)[r.coords.length - 1];
    const allMarks = marks.features;
    if (!animate || reduce) {
      // Tracé direct (autre proposition choisie, mouvement réduit) : un tracé en cours s'arrête net.
      if (reveal) {
        fadeProp('sel-glow', 'line-opacity', 0, 300);
        for (const p of ['circle-opacity', 'circle-stroke-opacity']) fadeProp('pen-core', p, 0, 200);
        fadeProp('pen-glow', 'circle-opacity', 0, 200);
        fadeProp('alt-casing', 'line-opacity', ALT_OPACITY.casing, 300);
        fadeProp('alt-line', 'line-opacity', altLineOpacity(), 300);
      }
      reveal = null;
      setData('sel', segmentsToGeoJSON(segs));
      setData('sel-line', lineFeature(r.coords));
      setData('marks', marks);
      setData('pen', EMPTY);
      app.revealK = 1;
      return;
    }
    const ms = traceMs(total);
    const t0 = performance.now();
    reveal = { tick: app.drawTick, t0, ms };
    // Le stylo s'allume, les autres propositions attendent la fin du tracé.
    fadeProp('pen-glow', 'circle-opacity', 0.42, 160);
    fadeProp('pen-core', 'circle-opacity', 1, 160);
    fadeProp('pen-core', 'circle-stroke-opacity', 1, 160);
    fadeProp('sel-glow', 'line-opacity', 0.38, 200);
    for (const id of ['alt-line', 'alt-casing']) fadeProp(id, 'line-opacity', 0, 0);
    fadeProp('alt-casing', 'line-opacity', ALT_OPACITY.casing, 520, Math.round(ms * 0.82));
    fadeProp('alt-line', 'line-opacity', altLineOpacity(), 520, Math.round(ms * 0.82));
    let shown = -1;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = traceEase(k);
      const upTo = total * e;
      setData('sel', segmentsToGeoJSON(segs, upTo));
      const part = sliceRoute(r.coords, upTo);
      setData('sel-line', part.length >= 2 ? lineFeature(part) : EMPTY);
      setData('pen', pointsFC([part[part.length - 1] ?? r.coords[0]]));
      // Bornes kilométriques : chacune apparaît quand le stylo l'atteint.
      const n = allMarks.findIndex((f) => Number(f.properties?.label) * 1000 > upTo + 1);
      const count = n < 0 ? allMarks.length : n;
      if (count !== shown) {
        shown = count;
        setData('marks', { type: 'FeatureCollection', features: allMarks.slice(0, count) });
      }
      app.revealK = e;
      if (k < 1) {
        anim = requestAnimationFrame(step);
        return;
      }
      // Arrivée : le stylo s'efface, le halo s'éteint, le départ (ou l'arrivée) respire une fois.
      app.revealK = 1;
      fadeProp('pen-glow', 'circle-opacity', 0, 420);
      fadeProp('pen-core', 'circle-opacity', 0, 420);
      fadeProp('pen-core', 'circle-stroke-opacity', 0, 420);
      fadeProp('sel-glow', 'line-opacity', 0, 1100, 150);
      const mk = (r.shape === 'oneway' ? destMarker : startMarker)?.getElement();
      if (mk) {
        mk.classList.remove('is-closing');
        void mk.offsetWidth;
        mk.classList.add('is-closing');
        mk.addEventListener('animationend', () => mk.classList.remove('is-closing'), { once: true });
      }
      haptic('success');
    };
    app.revealK = 0;
    setData('sel', EMPTY);
    setData('sel-line', EMPTY);
    setData('marks', EMPTY);
    anim = requestAnimationFrame(step);
  }

  /*
   * Vers la Terre : un dézoom qui quitte le plan (la Terre dessinée a pris le relais) s'achève tout seul,
   * en douceur, sur la planète entière, nord en haut, au milieu de la partie visible. Comme si l'élan du
   * geste nous emportait dans l'espace, puis ralentissait jusqu'à l'arrêt.
   */
  /** Un dézoom qui finit à moins de 4,2 niveaux de la Terre entière (l'échelle d'un pays) file jusqu'à elle. */
  const ORBIT_SPAN = 4.2;
  let zoomingOut = false;
  /** Sens du dernier geste de zoom : −1 vers l'espace, 1 vers le sol. */
  let lastDir = 0;
  let lastZoom = 0;
  /** Distance caméra-centre de MapLibre, en hauteurs de carte (champ de 36,87°). */
  const CAM = 0.5 / Math.tan(0.6435011087932844 / 2);
  /** Part du petit côté de la partie visible occupée par la Terre entière. */
  const ORBIT_FILL = 0.9;
  /**
   * Zoom de la Terre entière. Vu de loin, MapLibre grossit le globe quand le centre monte en latitude
   * (l'échelle au centre reste celle du plan) : on compense, perspective comprise, pour que la planète
   * garde la même taille, entière, au milieu de la partie visible, au-dessus de Nantes comme de l'équateur.
   */
  function orbitZoom(lat = map!.getCenter().lat, given: Padding = untrack(() => app.padding)): number {
    const p = spacePad(given);
    const box = map!.getContainer();
    const side = Math.max(160, Math.min(box.clientWidth - p.left - p.right, box.clientHeight - p.top - p.bottom));
    const r = (ORBIT_FILL * side) / 2;
    const cd = CAM * box.clientHeight;
    const R = (r * r) / cd + Math.sqrt(r ** 4 / (cd * cd) + r * r);
    const cos = Math.cos((Math.min(84, Math.abs(lat)) * Math.PI) / 180);
    return Math.log2((2 * Math.PI * R * cos) / 512);
  }
  /** Glissement vers la Terre entière (après un dézoom), ou retour en place après l'avoir dépassée (ressort). */
  function toOrbit(spring = false) {
    const m = map;
    if (!m) return;
    const target = orbitZoom();
    const span = Math.abs(m.getZoom() - target);
    const p = spacePad(untrack(() => app.padding));
    const cur = m.getPadding();
    const placed = cur.top === p.top && cur.bottom === p.bottom && cur.left === p.left && cur.right === p.right;
    if (span < 0.01 && Math.abs(m.getPitch()) < 0.5 && placed) return;
    m.easeTo({
      zoom: target,
      pitch: 0,
      ...(spring ? {} : { bearing: 0 }),
      padding: p,
      duration: reduce ? 0 : spring ? 480 : Math.min(2300, 1100 + span * 300),
      // Le glissement part en douceur et se pose en douceur ; le ressort, lui, revient vite puis ralentit.
      easing: spring ? (t) => 1 - Math.pow(1 - t, 3.2) : (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    });
  }
  /**
   * Comme dans Plans, les noms du globe (continents, océans, grandes villes) s'effacent en approchant du bord
   * de la Terre, au lieu de déborder dans l'espace. Le bord visible dépend de la perspective : on le calcule.
   */
  const LABEL_PTS = globeLabels().features.map((f) => {
    // Les longs noms (continents, océans sur trois lignes) s'effacent plus tôt que les villes.
    const kind = f.properties?.kind as string;
    const fade = kind === 'continent' ? [0.45, 0.27] : kind === 'ocean' ? [0.55, 0.25] : [0.66, 0.24];
    return { id: f.id as number, c: f.geometry.coordinates as LngLat, from: fade[0], span: fade[1] };
  });
  let limbFaded = false;
  function fadeLimb() {
    const m = map;
    if (!m || !ready || !m.getSource('globe-labels')) return;
    const z = m.getZoom();
    if (z > 4) {
      if (limbFaded) for (const p of LABEL_PTS) m.setFeatureState({ source: 'globe-labels', id: p.id }, { vis: 1 });
      limbFaded = false;
      return;
    }
    limbFaded = true;
    const c = m.getCenter();
    const R = (512 * 2 ** z) / (2 * Math.PI) / Math.cos((c.lat * Math.PI) / 180);
    const cd = CAM * m.getContainer().clientHeight;
    const horizon = (Math.acos(R / (cd + R)) * 180) / Math.PI;
    for (const p of LABEL_PTS) {
      const x = haversine([c.lng, c.lat], p.c) / 111195 / horizon;
      const t = Math.min(1, Math.max(0, (x - p.from) / p.span));
      m.setFeatureState({ source: 'globe-labels', id: p.id }, { vis: 1 - t * t * (3 - 2 * t) });
    }
  }
  /**
   * Lancé à l'image suivante : une fin de zoom survient aussi quand un nouveau mouvement en interrompt un autre
   * (touches + et −, double-clic). Si un mouvement a repris entre-temps, on attend sa propre fin.
   */
  function queueOrbit(spring: boolean) {
    requestAnimationFrame(() => {
      const m = map;
      if (!m) return;
      if (!m.isMoving()) return toOrbit(spring);
      // La carte bouge encore (fin d'un geste, molette) : on attend qu'elle s'arrête, si l'on ne s'est pas
      // remis à zoomer vers le sol entre-temps.
      m.once('moveend', () => {
        if (!map || map.isMoving()) return;
        if (spring ? map.getZoom() < orbitZoom() - 0.01 : lastDir < 0 && map.getZoom() < orbitZoom() + ORBIT_SPAN) toOrbit(spring);
      });
    });
  }
  /*
   * La Terre vue de loin est une boule, comme dans Plans : ses bords s'assombrissent et l'atmosphère y dessine
   * un liseré bleu. Un disque posé exactement sur le globe (même centre, même rayon apparent, perspective
   * comprise), entre la carte et les marqueurs ; il s'efface en approchant ou quand la carte est inclinée.
   */
  let shade: HTMLDivElement | null = null;
  let earthReady = false;
  function placeShade() {
    const m = map;
    if (!m || !shade) return;
    const z = m.getZoom();
    const vis = Math.max(0, Math.min(1, (orbitZoom() + 1.7 - z) / 0.9)) * Math.max(0, 1 - m.getPitch() / 6);
    if (vis <= 0) {
      if (shade.style.opacity !== '0') shade.style.opacity = '0';
      return;
    }
    const box = m.getContainer();
    const { top = 0, bottom = 0, left = 0, right = 0 } = m.getPadding();
    const R = (512 * 2 ** z) / (2 * Math.PI) / Math.cos((m.getCenter().lat * Math.PI) / 180);
    const r = R / Math.sqrt(1 + (2 * R) / (CAM * box.clientHeight));
    const cx = left + (box.clientWidth - left - right) / 2;
    const cy = top + (box.clientHeight - top - bottom) / 2;
    shade.style.opacity = vis.toFixed(3);
    shade.style.width = shade.style.height = `${(2 * r).toFixed(1)}px`;
    shade.style.transform = `translate(${(cx - r).toFixed(1)}px, ${(cy - r).toFixed(1)}px)`;
  }
  function updateOrbit() {
    const m = map;
    if (!m) return;
    const o = Math.abs(m.getZoom() - orbitZoom()) < 0.06;
    if (o !== orbit) orbit = o;
  }

  /* ---------- Échelle : elle apparaît pendant qu'on zoome, puis s'efface (comme dans Plans) ---------- */
  let scale = $state<{ w: number; label: string } | null>(null);
  let scaleOn = $state(false);
  let scaleTimer: ReturnType<typeof setTimeout> | undefined;
  function updateScale() {
    const m = map;
    if (!m || m.getZoom() < 4.5) {
      scale = null;
      return;
    }
    // Mesurée au centre de la partie visible, sur 100 px.
    const box = m.getContainer();
    const p = app.padding;
    const x = p.left + (box.clientWidth - p.left - p.right) / 2;
    const y = p.top + (box.clientHeight - p.top - p.bottom) / 2;
    const a = m.unproject([x - 50, y]);
    const b = m.unproject([x + 50, y]);
    const per100 = haversine([a.lng, a.lat], [b.lng, b.lat]);
    if (!(per100 > 0)) {
      scale = null;
      return;
    }
    const maxM = (per100 * (app.wide ? 120 : 96)) / 100;
    const pow = Math.pow(10, Math.floor(Math.log10(maxM)));
    let nice = pow;
    for (const k of [2, 5]) if (k * pow <= maxM) nice = k * pow;
    scale = {
      w: Math.round((nice / per100) * 100),
      label: nice >= 1000 ? `${(nice / 1000).toLocaleString('fr-FR')}${NNBSP}km` : `${nice}${NNBSP}m`,
    };
  }

  /* ---------- « Revenir au départ / au parcours » quand on s'en est éloigné ---------- */
  let lost = $state<'start' | 'route' | null>(null);
  function shownRoute(): Route | null {
    return app.phase === 'results' || app.phase === 'detail' ? app.route : null;
  }
  /** Ce qu'il faut voir pendant la composition : la zone du départ, la destination et le point de passage. */
  function composeFrame(): LngLat[] {
    const s = app.start;
    if (!s) return [];
    const D = app.params.distanceKm * 1000;
    const ring = circlePolygon(s.coord, app.params.shape === 'outback' ? D / 2.56 : D / 3.7);
    const pts = [...((ring.features[0].geometry as Polygon).coordinates[0] as LngLat[])];
    if (app.params.shape === 'oneway' && app.destination) pts.push(app.destination.coord);
    if (app.via) pts.push(app.via.coord);
    return pts;
  }
  function checkLost() {
    const m = map;
    if (!m || !ready || app.phase === 'follow') {
      lost = null;
      return;
    }
    const r = shownRoute();
    const s = app.phase === 'compose' ? app.start : null;
    if (!r && !s) {
      lost = null;
      return;
    }
    const box = m.getContainer();
    const p = app.padding;
    const step = r ? Math.max(1, Math.floor(r.coords.length / 80)) : 1;
    const pts = r ? r.coords.filter((_, i) => i % step === 0) : [s!.coord];
    const inView = pts.some((c) => {
      const q = m.project(c);
      return q.x >= p.left - 24 && q.x <= box.clientWidth - p.right + 24 && q.y >= p.top - 24 && q.y <= box.clientHeight - p.bottom + 24;
    });
    lost = !inView || m.getZoom() < (r ? 8.5 : 9.5) ? (r ? 'route' : 'start') : null;
  }
  function recenter() {
    haptic('tap');
    const r = shownRoute();
    fitCoords(r ? r.coords : composeFrame());
  }

  /**
   * Dézoom permis : un peu au-delà de la Terre entière, le temps qu'elle revienne en place comme un ressort.
   * Jamais au-dessus du zoom actuel : après avoir tourné le globe, il se recale en glissant, pas d'un bond.
   */
  function fitMinZoom() {
    if (!map) return;
    map.setMinZoom(Math.floor(Math.min(orbitZoom() - 0.3, map.getZoom()) * 100) / 100);
  }

  function placeAttribution() {
    if (!map) return;
    if (attrib) map.removeControl(attrib);
    attrib = new maplibregl.AttributionControl({
      compact: true,
      customAttribution:
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · Itinéraires <a href="https://valhalla1.openstreetmap.de" target="_blank" rel="noopener">Valhalla FOSSGIS</a> · Adresses Photon · Météo Open-Meteo',
    });
    map.addControl(attrib, 'top-right');
    // Repliée par défaut : le bouton (i) l'ouvre.
    requestAnimationFrame(() => el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
  }

  onMount(() => {
    let view: { center: LngLat; zoom: number } | null = null;
    try {
      view = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    } catch {
      view = null;
    }
    // Tuiles du globe dessiné (terre://), avant le premier style.
    registerEarth((name, load) => maplibregl.addProtocol(name, load));
    map = new maplibregl.Map({
      container: el,
      style: buildStyle(theme),
      center: app.start?.coord ?? view?.center ?? NANTES,
      zoom: app.start ? 13 : (view?.zoom ?? 12.5),
      attributionControl: false,
      maxPitch: 72,
      fadeDuration: 120,
      dragRotate: true,
      touchPitch: true,
    });
    map.touchZoomRotate.enableRotation();
    // Molette de souris : un cran dézoome franchement (le réglage par défaut demande des dizaines de crans).
    map.scrollZoom.setWheelZoomRate(1 / 160);
    shade = document.createElement('div');
    shade.className = 'globe-shade';
    map.getCanvas().insertAdjacentElement('afterend', shade);
    placeAttribution();
    fitMinZoom();
    map.on('resize', () => {
      const was = orbit;
      fitMinZoom();
      if (was) toOrbit(true);
      updateOrbit();
    });
    // Une couche demande l'anneau des villes avant la fin du chargement du style : on le fournit tout de suite.
    map.on('styleimagemissing', (e) => {
      if (e.id === 'city-dot' || e.id === 'city-dot-night') addCityDots();
    });
    space = map.getZoom() < SPACE_ZOOM;
    lastZoom = map.getZoom();
    updateOrbit();
    map.on('style.load', onStyleLoad);
    map.on('rotate', () => {
      if (!swinging) app.bearing = map!.getBearing();
    });
    far = map.getZoom() < 11;
    // Une molette de souris ne transmet pas son événement aux zooms de MapLibre (le zoom part un peu plus tard) :
    // on la suit à part, pour savoir qu'un geste vers l'espace est en cours et montrer l'échelle.
    let wheelAt = 0;
    el.addEventListener(
      'wheel',
      (e) => {
        wheelAt = performance.now();
        if (e.deltaY > 0) {
          zoomingOut = true;
          lastDir = -1;
        } else if (e.deltaY < 0) {
          zoomingOut = false;
          lastDir = 1;
        }
      },
      { capture: true, passive: true },
    );
    map.on('zoom', (e) => {
      const z = map!.getZoom();
      if (z < SPACE_ZOOM !== space) space = z < SPACE_ZOOM;
      if (z < 11 !== far) far = z < 11;
      updateOrbit();
      // En route vers l'espace : les images de la Terre entière se chargent avant d'y arriver.
      if (!earthReady && z < 8) {
        earthReady = true;
        const c = map!.getCenter();
        const tz = Math.max(0, Math.round(orbitZoom() + 1));
        prefetchEarth([c.lng, c.lat], tz > 0 ? [tz - 1, tz] : [0]);
      }
      // L'échelle ne répond qu'aux gestes (pincement, molette), pas aux cadrages automatiques.
      if (e.originalEvent || performance.now() - wheelAt < 700) {
        // Sens du geste : vers l'espace ou vers le sol.
        if (z < lastZoom - 1e-4) {
          zoomingOut = true;
          lastDir = -1;
        } else if (z > lastZoom + 1e-4) {
          zoomingOut = false;
          lastDir = 1;
        }
        updateScale();
        scaleOn = true;
        clearTimeout(scaleTimer);
      }
      lastZoom = z;
    });
    map.on('zoomend', () => {
      app.zoom = map!.getZoom();
      const out = zoomingOut;
      zoomingOut = false;
      if (app.phase !== 'follow') {
        // Un dézoom qui a quitté le plan file jusqu'à la Terre entière ; au-delà, elle revient en place.
        if (out && app.zoom < orbitZoom() + ORBIT_SPAN) queueOrbit(false);
        else if (app.zoom < orbitZoom() - 0.01) queueOrbit(true);
        // Fin d'un dézoom vers l'espace : le globe vient au milieu de la partie visible.
        else if (app.zoom < SPACE_ZOOM) syncPadding(app.padding);
      }
      clearTimeout(scaleTimer);
      scaleTimer = setTimeout(() => (scaleOn = false), 1500);
    });
    map.on('moveend', () => {
      if (pendingPad) syncPadding(pendingPad);
      // Le globe a pu tourner vers le nord ou le sud : la limite de dézoom suit la latitude du centre.
      fitMinZoom();
      updateOrbit();
      checkLost();
    });
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    map.on('moveend', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const c = map!.getCenter();
          localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map!.getZoom() }));
        } catch {
          /* stockage indisponible */
        }
      }, 600);
    });
    map.on('dragstart', () => {
      if (app.phase === 'follow') app.followCamera = false;
    });
    let longPressAt = 0;
    const place = (kind: PlaceKind, c: LngLat, pt: { x: number; y: number }) => {
      haptic('tap');
      void app.placeFromMap(kind, c);
      app.showToast(kind === 'start' ? 'Départ placé ici' : kind === 'via' ? 'Point de passage placé ici' : 'Destination placée ici');
      landed(kind, pt);
    };
    // Un clic place un point : « Choisir sur la carte », recherche ouverte sur Mac (la carte reste visible),
    // ou mode « Vers un lieu » (place ou déplace la destination).
    map.on('click', (e) => {
      // Ignoré : fin d'un appui long (départ déjà placé) ou clic sur un marqueur.
      if (Date.now() - longPressAt < 800) return;
      if ((e.originalEvent.target as HTMLElement | null)?.closest?.('.maplibregl-marker')) return;
      const kind = clickKind();
      if (!kind) return;
      if (app.search) app.search = null;
      place(kind, [e.lngLat.lng, e.lngLat.lat], e.point);
    });
    map.on('mousemove', (e) => {
      if (!aimKind || dragging || (e.originalEvent.target as HTMLElement | null)?.closest?.('.maplibregl-marker')) {
        if (aim) aim = null;
        return;
      }
      if (aimHold) {
        if (Math.hypot(e.point.x - aimHold.x, e.point.y - aimHold.y) < 8) return;
        aimHold = null;
      }
      aim = { x: e.point.x, y: e.point.y, ll: [e.lngLat.lng, e.lngLat.lat] };
    });
    map.on('mouseout', () => (aim = null));
    map.on('dragstart', () => {
      dragging = true;
      aim = null;
    });
    map.on('dragend', () => (dragging = false));
    map.on('move', fadeLimb);
    map.on('move', placeShade);
    map.on('resize', placeShade);
    // Zoom à la molette : le point visé change sous le curseur immobile.
    map.on('move', () => {
      if (!aim || !map) return;
      const ll = map.unproject([aim.x, aim.y]);
      aim = { ...aim, ll: [ll.lng, ll.lat] };
    });
    map.on('click', 'alt-hit', (e) => {
      const idx = e.features?.[0]?.properties?.idx;
      if (typeof idx === 'number' && !app.pickOnMap) app.select(idx);
    });
    map.on('mouseenter', 'alt-hit', () => (map!.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'alt-hit', () => (map!.getCanvas().style.cursor = ''));
    const placeStart = (ll: maplibregl.LngLat) => {
      if (app.phase !== 'compose') return;
      longPressAt = Date.now();
      place('start', [ll.lng, ll.lat], map!.project(ll));
    };
    map.on('contextmenu', (e) => placeStart(e.lngLat));
    // Appui long sur écran tactile : place le départ.
    let lp: ReturnType<typeof setTimeout> | undefined;
    let lpAt: { x: number; y: number } | null = null;
    map.on('touchstart', (e) => {
      clearTimeout(lp);
      if (e.originalEvent.touches.length !== 1) return;
      lpAt = { x: e.point.x, y: e.point.y };
      const ll = e.lngLat;
      lp = setTimeout(() => placeStart(ll), 560);
    });
    map.on('touchmove', (e) => {
      if (lpAt && Math.hypot(e.point.x - lpAt.x, e.point.y - lpAt.y) > 8) clearTimeout(lp);
    });
    map.on('touchend', () => clearTimeout(lp));
    map.on('touchcancel', () => clearTimeout(lp));

    const onTheme = () => {
      theme = dark.matches ? 'dark' : 'light';
      ready = false;
      planStyle = buildStyle(theme);
      map?.setStyle(buildStyle(theme), { diff: false });
    };
    dark.addEventListener('change', onTheme);
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map;
    return () => {
      dark.removeEventListener('change', onTheme);
      cancelAnimationFrame(anim);
      map?.remove();
      map = null;
    };
  });

  // Position de l'attribution selon la mise en page.
  $effect(() => {
    void app.wide;
    if (ready) untrack(placeAttribution);
  });

  // Zone visible de la carte (le suivi en direct règle la sienne). Avant les cadrages ci-dessous.
  $effect(() => {
    const p = app.padding;
    if (!ready || !map || app.phase === 'follow') return;
    untrack(() => {
      syncPadding(p);
      fitMinZoom();
    });
  });

  // Aperçu de la zone couverte pendant la composition.
  $effect(() => {
    if (!ready) return;
    const p = app.params;
    const show = app.phase === 'compose' && !!app.start && p.shape !== 'oneway';
    if (!show) {
      setData('reach', EMPTY);
      return;
    }
    const D = p.distanceKm * 1000;
    setData('reach', circlePolygon(app.start!.coord, p.shape === 'loop' ? D / 3.7 : D / 2.56));
  });

  // Pendant la création, un sonar balaie la zone explorée : deux ondes partent du départ jusqu'à son bord,
  // et la zone respire doucement. La recherche est en cours, autour de toi.
  $effect(() => {
    if (!ready || !map) return;
    const m = map;
    const s = app.start?.coord;
    if (!app.generating || !s) {
      fadeProp('reach-fill', 'fill-opacity', 0.035, 600);
      for (const id of ['sonar-a', 'sonar-b']) fadeProp(id, 'circle-stroke-opacity', 0, 300);
      return;
    }
    const p = untrack(() => app.params);
    const reachM = p.shape === 'oneway' && app.destination ? haversine(s, app.destination.coord) : (p.distanceKm * 1000) / (p.shape === 'outback' ? 2.56 : 3.7);
    setData('sonar', pointsFC([s]));
    for (const id of ['sonar-a', 'sonar-b']) {
      m.setPaintProperty(id, 'circle-stroke-opacity-transition', { duration: 0, delay: 0 });
      m.setPaintProperty(id, 'circle-radius-transition', { duration: 0, delay: 0 });
    }
    if (reduce) {
      fadeProp('reach-fill', 'fill-opacity', 0.1, 600);
      return;
    }
    const PERIOD = 1700;
    const t0 = performance.now();
    let raf = 0;
    let breath = false;
    const frame = (now: number) => {
      const z = m.getZoom();
      // Rayon de la zone en pixels à ce zoom (tuiles de 512 px).
      const mpp = (40075016.686 * Math.cos((s[1] * Math.PI) / 180)) / (512 * 2 ** z);
      const R = reachM / mpp;
      ['sonar-a', 'sonar-b'].forEach((id, i) => {
        const ph = ((now - t0) / PERIOD + i / 2) % 1;
        m.setPaintProperty(id, 'circle-radius', R * easeOutCubic(ph));
        m.setPaintProperty(id, 'circle-stroke-opacity', 0.55 * (1 - ph) ** 1.6);
      });
      const b = Math.floor((now - t0) / 900) % 2 === 0;
      if (b !== breath) {
        breath = b;
        fadeProp('reach-fill', 'fill-opacity', b ? 0.1 : 0.04, 880);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      setData('sonar', EMPTY);
    };
  });

  // Départ : marqueur déplaçable pendant la composition, cadrage quand il change.
  $effect(() => {
    if (!ready || !map) return;
    const s = app.start;
    const compose = app.phase === 'compose';
    if (!s) {
      startMarker?.remove();
      startMarker = null;
      setData('start-pt', EMPTY);
      return;
    }
    setData('start-pt', pointsFC([s.coord]));
    if (!startMarker) {
      startMarker = new maplibregl.Marker({ element: element('mk-start', '<span></span>'), draggable: compose, anchor: 'center' })
        .setLngLat(s.coord)
        .addTo(map);
      startMarker.on('dragend', () => {
        const ll = startMarker!.getLngLat();
        app.placeFromMap('start', [ll.lng, ll.lat]);
      });
    } else {
      startMarker.setLngLat(s.coord);
      startMarker.setDraggable(compose);
    }
    const key = s.coord.join(',');
    if (key !== lastStartKey && compose) {
      const first = lastStartKey === '';
      lastStartKey = key;
      const D = untrack(() => app.params.distanceKm) * 1000;
      const ring = circlePolygon(s.coord, untrack(() => app.params.shape) === 'outback' ? D / 2.56 : D / 3.7);
      const coords = (ring.features[0].geometry as Polygon).coordinates[0] as LngLat[];
      fitCoords(coords, !first);
    } else lastStartKey = key;
  });

  // Destination.
  $effect(() => {
    if (!ready || !map) return;
    const d = app.destination;
    const show = !!d && ((app.phase === 'compose' && app.params.shape === 'oneway') || app.route?.shape === 'oneway');
    if (!show || !d) {
      destMarker?.remove();
      destMarker = null;
      return;
    }
    // Déplaçable pendant la composition, comme le départ.
    const compose = app.phase === 'compose';
    if (!destMarker) {
      destMarker = new maplibregl.Marker({ element: element('mk-dest', '<span></span>'), draggable: compose, anchor: 'center' })
        .setLngLat(d.coord)
        .addTo(map);
      destMarker.on('dragend', () => {
        const ll = destMarker!.getLngLat();
        app.placeFromMap('destination', [ll.lng, ll.lat]);
      });
    } else {
      destMarker.setLngLat(d.coord);
      destMarker.setDraggable(compose);
    }
    destMarker.getElement().classList.toggle('is-draggable', compose);
  });

  // Mise au point sur le parcours proposé (résultats, parcours ouvert).
  $effect(() => {
    void app.phase;
    if (ready) untrack(applyVeil);
  });

  // Plan ou Satellite : en fondu enchaîné.
  $effect(() => {
    void app.mapType;
    if (ready) untrack(() => applyMapType(true));
  });

  // Le départ ou le parcours est-il encore à l'écran ?
  $effect(() => {
    void [app.phase, app.route, app.start, app.padding];
    if (ready) untrack(checkLost);
  });

  // Point de passage imposé : losange, déplaçable pendant la composition.
  $effect(() => {
    if (!ready || !map) return;
    const compose = app.phase === 'compose';
    const v = compose ? app.via?.coord : app.phase === 'results' || app.phase === 'detail' ? app.route?.via?.coord : undefined;
    if (!v) {
      viaMarker?.remove();
      viaMarker = null;
      return;
    }
    if (!viaMarker) {
      viaMarker = new maplibregl.Marker({ element: element('mk-via', '<span></span>'), draggable: compose, anchor: 'center' }).setLngLat(v).addTo(map);
      viaMarker.on('dragend', () => {
        const ll = viaMarker!.getLngLat();
        app.placeFromMap('via', [ll.lng, ll.lat]);
      });
    } else {
      viaMarker.setLngLat(v);
      viaMarker.setDraggable(compose);
    }
    viaMarker.getElement().classList.toggle('is-draggable', compose);
  });

  // Aperçu au survol : ligne droite du départ vers la destination visée.
  $effect(() => {
    if (!ready) return;
    const s = app.start?.coord;
    setData('aim', aim && aimKind === 'destination' && s ? lineFeature([s, aim.ll]) : EMPTY);
  });

  // Propositions : alternatives discrètes, tracé choisi coloré selon la pente, qui se dessine.
  $effect(() => {
    if (!ready) return;
    const routes = app.routes;
    const sel = app.selected;
    const tick = app.drawTick;
    if (!routes.length) {
      cancelAnimationFrame(anim);
      app.revealK = 1;
      for (const id of ['alt', 'sel', 'sel-line', 'marks', 'water', 'done', 'pen']) setData(id, EMPTY);
      if (lastTick !== -1 && app.phase === 'compose' && app.start) {
        const D = untrack(() => app.params.distanceKm) * 1000;
        const ring = circlePolygon(app.start.coord, D / 3.7);
        fitCoords((ring.features[0].geometry as Polygon).coordinates[0] as LngLat[]);
      }
      lastTick = -1;
      return;
    }
    const r = routes[sel] ?? routes[0];
    const alt: FeatureCollection = {
      type: 'FeatureCollection',
      features: routes.flatMap((x, i) => (i === sel ? [] : [lineFeature(x.coords, { idx: i })])),
    };
    setData('alt', alt);
    setData('water', pointsFC(r.waterPoints));
    const fresh = tick !== lastTick;
    lastTick = tick;
    draw(r, fresh, kmMarks(r));
    // Les marges dépendent du panneau, mis à jour dans le même cycle : on cadre à l'image suivante.
    if (fresh) requestAnimationFrame(() => fitCoords(r.coords));
  });

  // Côtes et descentes du parcours sélectionné : une pastille au milieu de chacune, à toucher pour la mettre en avant.
  let climbMarkers: Marker[] = [];
  $effect(() => {
    if (!ready || !map) return;
    const r = app.phase === 'results' || app.phase === 'detail' ? app.route : null;
    void app.drawTick;
    for (const mk of climbMarkers) mk.remove();
    climbMarkers = [];
    untrack(() => (app.focusClimb = null));
    if (!r) return;
    const cum = cumOf(r);
    climbsOf(r).forEach((c, i) => {
      const mid = pointAt(r.coords, cum, (c.from + c.to) / 2).coord;
      const word = `${c.up ? 'Montée' : 'Descente'} ${SLOPE_WORDS[Math.abs(c.cls)]}`;
      const label = `${c.up ? '+' : '−'}${c.gain} m · ${c.avg.toLocaleString('fr-FR')} %`;
      const el = element(`mk-climb ${c.up ? 'up' : 'down'}`, `<span class="ic" style="background:${slopeColor(c.cls)}">${c.up ? ICONS.rise : ICONS.fall}</span><span class="tx">${label}</span>`);
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${word} au kilomètre ${kmValue(c.from)} : ${km(c.to - c.from)} à ${c.avg} %, ${label}`);
      const toggle = (e: Event) => {
        e.stopPropagation();
        haptic('tap');
        app.focusClimb = app.focusClimb === i ? null : i;
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && toggle(e));
      tactile(el);
      // Pendant le tracé, chaque pastille attend le passage du stylo.
      const rv = reveal && reveal.tick === app.drawTick ? reveal : null;
      if (rv) {
        const at = rv.t0 + rv.ms * traceTimeAt((c.from + c.to) / 2 / cum[cum.length - 1]);
        el.style.animationDelay = `${Math.max(0, Math.round(at - performance.now()))}ms`;
      }
      climbMarkers.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(mid).addTo(map!));
    });
  });

  // Mise en avant : halo sur le tronçon, caméra sur la côte, puis retour au parcours entier.
  let hadFocus = false;
  $effect(() => {
    if (!ready || !map) return;
    const f = app.focusClimb;
    const r = app.route;
    climbMarkers.forEach((mk, i) => mk.getElement().classList.toggle('on', i === f));
    const c = r && f != null ? climbsOf(r)[f] : null;
    if (!r || !c) {
      setData('climb-hl', EMPTY);
      if (hadFocus && r) untrack(() => fitCoords(r.coords));
      hadFocus = false;
      return;
    }
    const part = sliceBetween(r.coords, c.from, c.to);
    setData('climb-hl', lineFeature(part, { color: slopeColor(c.cls) }));
    // À l'image suivante : le panneau a pu changer de hauteur (marges à jour).
    requestAnimationFrame(() => fitCoords(part));
    hadFocus = true;
  });

  // En 3D, l'exagération du relief suit le parcours affiché.
  $effect(() => {
    void app.route;
    if (!ready || !map || !untrack(() => app.terrain3d)) return;
    untrack(() => {
      try {
        map!.setTerrain({ source: 'dem-3d', exaggeration: exaggeration() });
      } catch {
        /* style pas encore prêt */
      }
    });
  });

  // Loupe de verre qui suit le profil d'altitude.
  $effect(() => {
    if (!map) return;
    const s = app.scrub;
    const r = app.route;
    if (s == null || !r) {
      lens?.remove();
      lens = null;
      return;
    }
    const p = pointAt(r.coords, cumOf(r), s).coord;
    if (!lens) lens = new maplibregl.Marker({ element: element('mk-lens', '<span></span>'), anchor: 'center' }).setLngLat(p).addTo(map);
    else lens.setLngLat(p);
    const pt = map.project(p);
    const pad = untrack(() => app.padding);
    const c = map.getContainer();
    if (pt.x < pad.left || pt.x > c.clientWidth - pad.right || pt.y < pad.top || pt.y > c.clientHeight - pad.bottom) {
      map.easeTo({ center: p, padding: pad, duration: 300 });
    }
  });

  // Ma position.
  $effect(() => {
    if (!map) return;
    const u = app.userPos;
    if (!u) {
      userMarker?.remove();
      userMarker = null;
      return;
    }
    if (!userMarker) userMarker = new maplibregl.Marker({ element: element('mk-user', '<span></span>'), anchor: 'center' }).setLngLat(u).addTo(map);
    else userMarker.setLngLat(u);
  });

  // Relief en 3D.
  $effect(() => {
    const on = app.terrain3d;
    if (ready) untrack(() => apply3D(on, true));
  });

  // Boutons + et − (Mac) : un niveau à la fois ; comme un geste, un dézoom loin finit sur la Terre entière.
  $effect(() => {
    const s = app.zoomStep;
    if (!s || !map) return;
    untrack(() => {
      const m = map!;
      m.easeTo({ zoom: m.getZoom() + s.d, duration: reduce ? 0 : 320, easing: (t) => 1 - Math.pow(1 - t, 3) }, { originalEvent: new Event('zoom-button') });
    });
  });

  // Remise au nord.
  $effect(() => {
    if (app.northTick && map) map.easeTo({ bearing: 0, duration: reduce ? 0 : 500 });
  });

  // Demandes de déplacement : un saut lointain survole le globe (durée calculée), un pas voisin glisse.
  $effect(() => {
    const cam = app.camera;
    if (!map || !cam) return;
    const c = map.getCenter();
    const far = haversine([c.lng, c.lat], cam.center) > 40000 || map.getZoom() < 8;
    map.flyTo({
      center: cam.center,
      zoom: cam.zoom ?? Math.max(map.getZoom(), 13),
      padding: untrack(() => app.padding),
      ...(reduce ? { duration: 0 } : far ? { curve: 1.55, speed: 1.25, maxDuration: 3600 } : { duration: 900 }),
    });
  });

  // Suivi en direct : partie faite en gris, carte centrée sur la position.
  $effect(() => {
    if (!ready || !map) return;
    const f = app.follow;
    const r = app.route;
    if (app.phase !== 'follow' || !f || !r) {
      setData('done', EMPTY);
      return;
    }
    setData('done', f.progress > 5 ? lineFeature(sliceRoute(r.coords, f.progress)) : EMPTY);
    if (f.position && app.followCamera) {
      map.easeTo({
        center: f.position,
        zoom: Math.max(untrack(() => map!.getZoom()), 15.5),
        padding: { top: 200, bottom: 120, left: 24, right: 24 },
        duration: reduce ? 0 : 700,
      });
    }
  });
</script>

<div
  class="map"
  bind:this={el}
  class:picking={!!placing}
  class:space
  class:orbit
  class:far
  style:--stars={STARS}
  style:--pl="{app.padding.left}px"
  style:--pr="{app.padding.right}px"
  style:--pt="{app.padding.top}px"
  style:--pb="{app.padding.bottom}px"
  aria-label="Carte"
  role="region"
></div>

{#if scale}
  <!-- Échelle : 0, une barre de deux tons, une longueur ronde. -->
  <div
    class="scale"
    class:on={scaleOn}
    class:wide={app.wide}
    class:low={app.wide && app.terrain3d && app.zoom >= 13.2}
    class:night={space || app.mapType === 'satellite'}
    style:--w="{scale.w}px"
    aria-hidden="true"
  >
    <span class="scale-nums"><span class="n0">0</span><span class="nv">{scale.label}</span></span>
    <span class="scale-bar"></span>
  </div>
{/if}

{#if lost && !app.pickOnMap && app.phase !== 'follow'}
  <button use:tactile
    type="button"
    class="back-to glass"
    class:wide={app.wide}
    class:dock={app.wide && lost === 'route'}
    class:legend={!app.wide && app.terrain3d && app.zoom >= 13.2}
    style:--sheet="{app.padding.bottom}px"
    onclick={recenter}
  >
    {#if lost === 'start'}<span class="dot" aria-hidden="true"></span>{:else}<Icon name="path" size={16} />{/if}
    {lost === 'start' ? 'Revenir au départ' : 'Revenir au parcours'}
  </button>
{/if}

{#if aimKind && aim}
  <!-- Aperçu sous le curseur : le marqueur flotte au-dessus du point, prêt à s'y poser au clic. -->
  <div class="aim" style:transform="translate({aim.x}px, {aim.y}px)" aria-hidden="true">
    <span class="aim-pulse"></span>
    <span class="aim-shadow"></span>
    <span class="aim-pin" class:start={aimKind === 'start'} class:via={aimKind === 'via'}><span></span></span>
    <span class="aim-label">{aimLabel}</span>
  </div>
{/if}

{#if ripple}
  {#key ripple.id}
    <div class="ripple" style:transform="translate({ripple.x}px, {ripple.y}px)" aria-hidden="true" onanimationend={() => (ripple = null)}><span></span></div>
  {/key}
{/if}

<style>
  .map {
    position: fixed;
    inset: 0;
    z-index: 0;
  }
  /*
   * L'espace autour du globe : noir et étoiles discrètes, dans les deux apparences, comme Plans. Une lueur
   * à peine bleutée entoure la Terre, au milieu de la partie visible (hors panneau).
   */
  .map.space {
    background:
      var(--stars),
      radial-gradient(
        closest-side circle at calc(var(--pl) + (100% - var(--pl) - var(--pr)) / 2) calc(var(--pt) + (100% - var(--pt) - var(--pb)) / 2),
        #0b1324 0%,
        #060a14 62%,
        #000 100%
      );
    background-color: #000;
  }
  /* Relief de la boule : bords assombris, liseré et halo d'atmosphère (le disque suit le globe, voir placeShade). */
  .map :global(.globe-shade) {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    border-radius: 50%;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(
      circle closest-side,
      rgba(0, 3, 18, 0) 56%,
      rgba(0, 3, 18, 0.12) 74%,
      rgba(0, 3, 18, 0.34) 92%,
      rgba(28, 64, 150, 0.32) 99%,
      rgba(90, 140, 255, 0.5) 100%
    );
    box-shadow:
      0 0 0 1px rgba(120, 160, 255, 0.4),
      0 0 10px 2px rgba(84, 132, 255, 0.42),
      0 0 40px 8px rgba(48, 98, 230, 0.2);
  }
  @media (prefers-color-scheme: light) {
    .map :global(.globe-shade) {
      background: radial-gradient(
        circle closest-side,
        rgba(4, 18, 50, 0) 58%,
        rgba(4, 18, 50, 0.1) 76%,
        rgba(4, 18, 50, 0.28) 93%,
        rgba(60, 110, 210, 0.32) 99%,
        rgba(150, 190, 255, 0.55) 100%
      );
    }
  }

  /* Le parcours est tracé : le départ (ou l'arrivée) respire une fois, une onde rose s'en échappe. */
  :global(.mk-start.is-closing)::after,
  :global(.mk-dest.is-closing)::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    border-radius: 50%;
    border: 2.5px solid var(--tint);
    pointer-events: none;
    animation: close-ring 950ms var(--ease-out) forwards;
  }
  :global(.mk-start.is-closing) > :global(span),
  :global(.mk-dest.is-closing) > :global(span) {
    animation: close-bump 620ms var(--spring-bouncy);
  }
  @keyframes -global-close-ring {
    from {
      transform: scale(0.7);
      opacity: 0.95;
    }
    to {
      transform: scale(3.1);
      opacity: 0;
    }
  }
  @keyframes -global-close-bump {
    40% {
      transform: scale(1.22);
    }
  }

  /* De loin, les pastilles des côtes s'empileraient sur un point : elles attendent qu'on s'approche. */
  .map.far :global(.mk-climb) {
    visibility: hidden;
  }

  .scale {
    position: fixed;
    z-index: 12;
    left: 18px;
    top: calc(var(--safe-top) + 68px);
    display: grid;
    gap: 3px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 420ms var(--ease-out);
    --ink: var(--label);
    --halo: rgba(255, 255, 255, 0.92);
  }
  @media (prefers-color-scheme: dark) {
    .scale {
      --halo: rgba(0, 0, 0, 0.75);
    }
  }
  .scale.night {
    --ink: #fff;
    --halo: rgba(0, 0, 0, 0.7);
  }
  .scale.on {
    opacity: 1;
    transition-duration: 120ms;
  }
  .scale.wide {
    left: 424px;
    top: 20px;
  }
  .scale.wide.low {
    top: 64px;
  }
  .scale-nums {
    position: relative;
    height: 13px;
    width: var(--w);
    font: 600 11px/13px var(--font-rounded);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    text-shadow:
      0 0 2px var(--halo),
      0 0 2px var(--halo),
      0 0 4px var(--halo);
    transition: width 180ms var(--ease-out);
  }
  .scale-nums span {
    position: absolute;
    top: 0;
    white-space: nowrap;
  }
  .n0 {
    left: 0;
    transform: translateX(-35%);
  }
  .nv {
    left: 100%;
    transform: translateX(-50%);
  }
  .scale-bar {
    width: var(--w);
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, #1c1c1e 0 50%, #fff 50% 100%);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.85),
      0 1px 3px rgba(0, 0, 0, 0.3);
    transition: width 180ms var(--ease-out);
  }

  /* Revenir au départ ou au parcours : une capsule de verre au-dessus du panneau. */
  .back-to {
    position: fixed;
    z-index: 13;
    left: 50%;
    bottom: calc(var(--sheet) - 12px);
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px 0 12px;
    border-radius: 999px;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--tint);
    white-space: nowrap;
    animation: back-in 420ms var(--spring-bouncy);
    transition: transform 240ms var(--spring);
  }
  .back-to:active {
    transform: translateX(-50%) scale(0.95);
  }
  .back-to.legend {
    bottom: calc(var(--sheet) + 34px);
  }
  .back-to.wide {
    left: calc(408px + (100vw - 408px) / 2);
    bottom: 22px;
  }
  .back-to.wide.dock {
    bottom: 236px;
  }
  .back-to .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--tint);
    box-shadow:
      0 0 0 3px #fff,
      0 1px 4px 2px rgba(0, 0, 0, 0.2);
  }
  @keyframes back-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px) scale(0.92);
    }
  }
  .map.picking :global(canvas) {
    cursor: crosshair;
  }
  :global(.mk-start) {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.28),
      0 0 0 0.5px rgba(0, 0, 0, 0.12);
    display: grid;
    place-items: center;
    cursor: grab;
  }
  :global(.mk-start span) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--tint);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }
  :global(.mk-dest) {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #1c1c1e;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.3),
      0 0 0 2.5px #fff;
    display: grid;
    place-items: center;
  }
  :global(.mk-dest.is-draggable),
  :global(.mk-via.is-draggable) {
    cursor: grab;
  }
  /* Point de passage : losange blanc cerclé de rose, distinct du départ (disque) et de l'arrivée (damier). */
  :global(.mk-via) {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
  }
  :global(.mk-via span) {
    width: 17px;
    height: 17px;
    border-radius: 4px;
    rotate: 45deg;
    background: #fff;
    box-shadow:
      inset 0 0 0 3.5px var(--tint),
      0 4px 10px rgba(0, 0, 0, 0.28);
  }
  /* Le marqueur se pose (translate s'ajoute au transform de positionnement de MapLibre). */
  :global(.mk-start.is-dropping),
  :global(.mk-dest.is-dropping),
  :global(.mk-via.is-dropping) {
    animation: mk-drop 440ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes -global-mk-drop {
    from {
      translate: 0 -18px;
      opacity: 0.6;
    }
    60% {
      translate: 0 2px;
      opacity: 1;
    }
    to {
      translate: 0 0;
    }
  }

:global(.mk-climb) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px 0 3px;
    border-radius: 999px;
    background: var(--glass-ctl);
    -webkit-backdrop-filter: blur(12px) saturate(1.7);
    backdrop-filter: blur(12px) saturate(1.7);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.18),
      0 0 0 0.5px rgba(0, 0, 0, 0.08);
    font: 600 11px/1 var(--font-rounded);
    color: var(--label);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    white-space: nowrap;
    animation: climb-in 380ms var(--spring-bouncy) 900ms both;
    transition: box-shadow 200ms var(--ease-out);
  }
  :global(.mk-climb .ic) {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
  }
  :global(.mk-climb .ic svg) {
    width: 11px;
    height: 11px;
  }
  :global(.mk-climb.on) {
    z-index: 2;
    box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.24),
      0 0 0 2px var(--label);
  }
  @keyframes -global-climb-in {
    from {
      opacity: 0;
      translate: 0 6px;
    }
  }

  .aim,
  .ripple {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1;
    pointer-events: none;
  }
  .aim {
    will-change: transform;
  }
  .aim > span,
  .ripple > span {
    position: absolute;
  }
  .aim-pulse {
    left: -18px;
    top: -18px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--tint);
    opacity: 0;
    animation: aim-pulse 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }
  .aim-shadow {
    left: -6px;
    top: -3px;
    width: 12px;
    height: 6px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.32);
    filter: blur(1px);
  }
  .aim-pin {
    left: -13px;
    top: -33px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #1c1c1e;
    box-shadow:
      0 8px 16px rgba(0, 0, 0, 0.26),
      0 0 0 2.5px #fff;
    opacity: 0.94;
    animation:
      aim-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both,
      aim-float 1.6s ease-in-out 200ms infinite;
  }
  .aim-pin span {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: conic-gradient(#fff 0 25%, #1c1c1e 0 50%, #fff 0 75%, #1c1c1e 0) 0 0 / 5px 5px;
  }
  .aim-pin.start {
    background: #fff;
    box-shadow:
      0 8px 16px rgba(0, 0, 0, 0.26),
      0 0 0 0.5px rgba(0, 0, 0, 0.12);
  }
  .aim-pin.start span {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--tint);
  }
  .aim-pin.via {
    background: transparent;
    box-shadow: none;
  }
  .aim-pin.via span {
    width: 17px;
    height: 17px;
    border-radius: 4px;
    rotate: 45deg;
    background: #fff;
    box-shadow:
      inset 0 0 0 3.5px var(--tint),
      0 6px 14px rgba(0, 0, 0, 0.26);
  }
  .aim-label {
    top: 12px;
    left: 0;
    transform: translateX(-50%);
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    color: var(--label);
    background: var(--glass-ctl);
    -webkit-backdrop-filter: blur(12px) saturate(1.6);
    backdrop-filter: blur(12px) saturate(1.6);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.14),
      0 0 0 0.5px rgba(0, 0, 0, 0.06);
  }
  .ripple span {
    left: -22px;
    top: -22px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid var(--tint);
    animation: ripple 560ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  @keyframes aim-pulse {
    from {
      transform: scale(0.45);
      opacity: 0.7;
    }
    to {
      transform: scale(1.5);
      opacity: 0;
    }
  }
  @keyframes aim-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.8);
    }
  }
  @keyframes aim-float {
    50% {
      transform: translateY(-2px);
    }
  }
  @keyframes ripple {
    from {
      transform: scale(0.3);
      opacity: 0.9;
    }
    to {
      transform: scale(1.6);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aim-pulse {
      display: none;
    }
    .aim-pin {
      animation: none;
    }
  }
  :global(.mk-dest span) {
    width: 12px;
    height: 12px;
    background:
      conic-gradient(#fff 0 25%, #1c1c1e 0 50%, #fff 0 75%, #1c1c1e 0) 0 0 / 6px 6px;
    border-radius: 2px;
  }
  :global(.mk-user) {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--location);
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    position: relative;
  }
  :global(.mk-user span) {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--location) 22%, transparent);
    animation: pulse 2.4s var(--ease-out) infinite;
    z-index: -1;
  }
  @keyframes pulse {
    from {
      transform: scale(0.5);
      opacity: 1;
    }
    to {
      transform: scale(1.4);
      opacity: 0;
    }
  }
  :global(.mk-lens) {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    pointer-events: none;
    background: rgba(255, 255, 255, 0.12);
    -webkit-backdrop-filter: blur(1.5px) saturate(1.6) brightness(1.08);
    backdrop-filter: blur(1.5px) saturate(1.6) brightness(1.08);
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.95),
      inset 0 3px 6px rgba(255, 255, 255, 0.5),
      inset 0 -2px 5px rgba(0, 0, 0, 0.12),
      0 6px 16px rgba(0, 0, 0, 0.28);
    display: grid;
    place-items: center;
  }
  :global(.mk-lens span) {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 3px var(--tint),
      0 1px 3px rgba(0, 0, 0, 0.3);
  }
</style>
