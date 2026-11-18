<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
  import type { FeatureCollection, GeoJSON, Polygon } from 'geojson';
  import { app } from '../lib/state.svelte';
  import { buildStyle, ROUTE_CASING, type Theme } from '../lib/mapstyle';
  import { circlePolygon, EMPTY, kmMarks, lineFeature, pointsFC, segmentsToGeoJSON, sliceRoute, slopeSegments } from '../lib/routegeo';
  import { bbox, cumulative, haversine, pointAt } from '../lib/geo';
  import { km } from '../lib/format';
  import type { LngLat, Route } from '../lib/types';

  const VIEW_KEY = 'boucle.vue.v1';
  const NANTES: LngLat = [-1.5536, 47.2184];
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let el: HTMLDivElement;
  let map: MLMap | null = null;
  let ready = $state(false);
  let theme: Theme = dark.matches ? 'dark' : 'light';
  let anim = 0;
  let lastTick = -1;
  let lastStartKey = '';
  let startMarker: Marker | null = null;
  let destMarker: Marker | null = null;
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
  function clickKind(): 'start' | 'destination' | null {
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
    const s = app.start?.coord;
    return s ? `à ${km(haversine(s, aim.ll))} du départ` : 'Destination ici';
  });
  let ripple = $state<{ x: number; y: number; id: number } | null>(null);
  let rippleId = 0;

  /** Retour visuel d'un point posé : onde à l'endroit du clic, puis le marqueur se pose. */
  function landed(kind: 'start' | 'destination', pt: { x: number; y: number }) {
    aim = null;
    aimHold = { x: pt.x, y: pt.y };
    if (reduce) return;
    ripple = { x: pt.x, y: pt.y, id: ++rippleId };
    requestAnimationFrame(() => {
      const mk = (kind === 'start' ? startMarker : destMarker)?.getElement();
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

  function addLayers() {
    const m = map!;
    const tint = tintOf();
    const casing = ROUTE_CASING[theme];
    if (!m.hasImage('chevron')) m.addImage('chevron', chevron(), { pixelRatio: 2 });
    if (!m.hasImage('collider')) m.addImage('collider', new ImageData(68, 68), { pixelRatio: 2 });
    for (const id of ['reach', 'aim', 'alt', 'sel', 'sel-line', 'done', 'marks', 'water', 'start-pt']) {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY });
    }
    const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
    m.addLayer({ id: 'reach-fill', type: 'fill', source: 'reach', paint: { 'fill-color': tint, 'fill-opacity': 0.035 } });
    m.addLayer({
      id: 'reach-line',
      type: 'line',
      source: 'reach',
      paint: { 'line-color': tint, 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2.5] },
    });
    // Aperçu au survol : ligne droite du départ vers le point visé.
    m.addLayer({
      id: 'aim-line',
      type: 'line',
      source: 'aim',
      layout: round,
      paint: { 'line-color': theme === 'dark' ? '#FFFFFF' : '#1C1C1E', 'line-opacity': 0.5, 'line-width': 1.75, 'line-dasharray': [0.1, 2.2] },
    });
    m.addLayer({ id: 'alt-casing', type: 'line', source: 'alt', layout: round, paint: { 'line-color': casing, 'line-width': zw(5, 9), 'line-opacity': 0.75 } });
    m.addLayer({ id: 'alt-line', type: 'line', source: 'alt', layout: round, paint: { 'line-color': theme === 'dark' ? '#98989D' : '#8E8E93', 'line-opacity': theme === 'dark' ? 0.7 : 0.62, 'line-width': zw(3, 5.5) } });
    m.addLayer({ id: 'alt-hit', type: 'line', source: 'alt', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 24 } });
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
        'circle-radius': 9,
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
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
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

  function onStyleLoad() {
    addLayers();
    apply3D(app.terrain3d, false);
    ready = true;
  }

  function apply3D(on: boolean, animate: boolean) {
    if (!map) return;
    try {
      map.setTerrain(on ? { source: 'dem-3d', exaggeration: 1.4 } : null);
    } catch {
      /* style pas encore prêt */
    }
    if (animate) map.easeTo({ pitch: on ? 58 : 0, duration: reduce ? 0 : 900 });
  }

  function element(cls: string, html = ''): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    return d;
  }

  function fitCoords(coords: LngLat[], animate = true) {
    if (!map || coords.length < 2) return;
    const [w, s, e, n] = bbox(coords);
    const pad = untrack(() => app.padding);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: pad, maxZoom: 16, duration: animate && !reduce ? 850 : 0 },
    );
  }

  function draw(r: Route, animate: boolean) {
    cancelAnimationFrame(anim);
    const segs = slopeSegments(r);
    const total = cumOf(r)[r.coords.length - 1];
    if (!animate || reduce) {
      setData('sel', segmentsToGeoJSON(segs));
      setData('sel-line', lineFeature(r.coords));
      return;
    }
    const t0 = performance.now();
    const dur = Math.min(1400, 700 + total / 40);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const upTo = total * (1 - Math.pow(1 - k, 3));
      setData('sel', segmentsToGeoJSON(segs, upTo));
      const part = sliceRoute(r.coords, upTo);
      setData('sel-line', part.length >= 2 ? lineFeature(part) : EMPTY);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    setData('sel', EMPTY);
    setData('sel-line', EMPTY);
    anim = requestAnimationFrame(step);
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
    placeAttribution();
    map.on('style.load', onStyleLoad);
    map.on('rotate', () => (app.bearing = map!.getBearing()));
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
    const place = (kind: 'start' | 'destination', c: LngLat, pt: { x: number; y: number }) => {
      void app.placeFromMap(kind, c);
      app.showToast(kind === 'start' ? 'Départ placé ici' : 'Destination placée ici');
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
      for (const id of ['alt', 'sel', 'sel-line', 'marks', 'water', 'done']) setData(id, EMPTY);
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
    setData('marks', kmMarks(r));
    setData('water', pointsFC(r.waterPoints));
    const fresh = tick !== lastTick;
    lastTick = tick;
    draw(r, fresh);
    // Les marges dépendent du panneau, mis à jour dans le même cycle : on cadre à l'image suivante.
    if (fresh) requestAnimationFrame(() => fitCoords(r.coords));
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

  // Remise au nord.
  $effect(() => {
    if (app.northTick && map) map.easeTo({ bearing: 0, duration: reduce ? 0 : 500 });
  });

  // Demandes de déplacement.
  $effect(() => {
    const cam = app.camera;
    if (!map || !cam) return;
    map.flyTo({ center: cam.center, zoom: cam.zoom ?? Math.max(map.getZoom(), 13), padding: untrack(() => app.padding), duration: reduce ? 0 : 900 });
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

<div class="map" bind:this={el} class:picking={!!placing} aria-label="Carte" role="region"></div>

{#if aimKind && aim}
  <!-- Aperçu sous le curseur : le marqueur flotte au-dessus du point, prêt à s'y poser au clic. -->
  <div class="aim" style:transform="translate({aim.x}px, {aim.y}px)" aria-hidden="true">
    <span class="aim-pulse"></span>
    <span class="aim-shadow"></span>
    <span class="aim-pin" class:start={aimKind === 'start'}><span></span></span>
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
  :global(.mk-dest.is-draggable) {
    cursor: grab;
  }
  /* Le marqueur se pose (translate s'ajoute au transform de positionnement de MapLibre). */
  :global(.mk-start.is-dropping),
  :global(.mk-dest.is-dropping) {
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
