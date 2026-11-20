<script lang="ts">
  import { haptic, tactile } from '../lib/haptics';
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { ORTHO_TILES, type MapType } from '../lib/mapstyle';
  import type { LngLat } from '../lib/types';

  let pill: HTMLDivElement | undefined = $state();
  let open = $state(false);

  // L'attribution des données se range sous la pilule, quelle que soit sa hauteur (boussole affichée ou non).
  $effect(() => {
    const el = pill;
    if (!el) return;
    const place = () => document.documentElement.style.setProperty('--ctrls-bottom', `${Math.round(el.getBoundingClientRect().bottom)}px`);
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  });

  /** Vignette Satellite : la vraie photo IGN autour du départ (Nantes par défaut). */
  function orthoThumb(c: LngLat): string {
    const z = 15;
    const n = 2 ** z;
    const x = Math.floor(((c[0] + 180) / 360) * n);
    const r = (c[1] * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    return ORTHO_TILES.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
  }
  const thumb = $derived(orthoThumb(app.start?.coord ?? [-1.5536, 47.2184]));

  function choose(t: MapType) {
    haptic('tap');
    app.setMapType(t);
    open = false;
  }
  function onDown(e: PointerEvent) {
    if (!open) return;
    const t = e.target as HTMLElement;
    if (!t.closest('.types') && !t.closest('.type-btn')) open = false;
  }
</script>

<svelte:window onpointerdown={onDown} onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

<div class="ctrls-wrap" class:wide={app.wide} bind:this={pill}>
<div class="ctrls glass" role="toolbar" aria-label="Carte">
  <!-- Comme dans Plans : le type de carte en haut de la pilule. -->
  <button use:tactile
    type="button"
    class="round type-btn"
    aria-label="Type de carte : {app.mapType === 'satellite' ? 'Satellite' : 'Plan'}"
    aria-haspopup="true"
    aria-expanded={open}
    onclick={() => {
      haptic('tap');
      open = !open;
    }}
  >
    <Icon name={app.mapType === 'satellite' ? 'globe' : 'map'} size={21} />
  </button>
  <span class="sep" aria-hidden="true"></span>
  <button use:tactile type="button" class="round" aria-label="Me localiser" aria-busy={app.locating} onclick={() => app.locateButton()}>
    <span class:spin={app.locating}><Icon name="locate" size={20} fill={!!app.userPos} /></span>
  </button>
  <span class="sep" aria-hidden="true"></span>
  <!-- Comme dans Plans : le bouton annonce la vue vers laquelle il bascule. -->
  <button use:tactile
    type="button"
    class="round"
    aria-pressed={app.terrain3d}
    aria-label="Relief et bâtiments en 3D"
    title={app.terrain3d ? 'Revenir à la carte à plat' : 'Relief et bâtiments en 3D'}
    onclick={() => {
      haptic('tap');
      app.terrain3d = !app.terrain3d;
    }}
  >
    {#key app.terrain3d}<span class="three">{app.terrain3d ? '2D' : '3D'}</span>{/key}
  </button>
  {#if Math.abs(app.bearing) > 2}
    <span class="sep" aria-hidden="true"></span>
    <button use:tactile type="button" class="round" aria-label="Remettre le nord en haut" onclick={() => app.northTick++}>
      <span class="compass" style:transform="rotate({-app.bearing}deg)"><Icon name="compass" size={22} /></span>
    </button>
  {/if}
</div>
{#if app.wide}
  <!-- Comme dans Plans sur Mac : zoomer et dézoomer d'un clic ; dézoomer loin mène à la Terre entière. -->
  <div class="ctrls zoom glass" role="group" aria-label="Zoom">
    <button use:tactile type="button" class="round" aria-label="Zoomer" onclick={() => app.zoomBy(1)}><Icon name="plus" size={18} /></button>
    <span class="sep" aria-hidden="true"></span>
    <button use:tactile type="button" class="round" aria-label="Dézoomer" onclick={() => app.zoomBy(-1)}><Icon name="minus" size={18} /></button>
  </div>
{/if}
</div>

{#if open}
  <div class="types glass glass-panel" class:wide={app.wide} role="group" aria-label="Type de carte">
    <div class="opts">
      <button use:tactile type="button" class="opt" aria-pressed={app.mapType === 'plan'} onclick={() => choose('plan')}>
        <span class="thumb plan" aria-hidden="true">
          <svg viewBox="0 0 96 64" preserveAspectRatio="xMidYMid slice">
            <rect width="96" height="64" class="t-land" />
            <path d="M58 0h38v30c-10 4-20 2-28-4S56 10 58 0Z" class="t-park" />
            <path d="M0 46c18-6 30 4 46 0s26-12 50-6v24H0Z" class="t-water" />
            <path d="M-4 22 L100 34 M30 -4 L40 70 M66 -4 L60 40" class="t-road-c" />
            <path d="M-4 22 L100 34 M30 -4 L40 70 M66 -4 L60 40" class="t-road" />
            <path d="M24 30c-4-12 10-20 22-14s18 2 22 10-4 16-16 14-24 2-28-10Z" class="t-route" />
          </svg>
        </span>
        <span class="opt-label">Plan</span>
      </button>
      <button use:tactile type="button" class="opt" aria-pressed={app.mapType === 'satellite'} onclick={() => choose('satellite')}>
        <span class="thumb sat" aria-hidden="true" style:background-image="url({thumb})"></span>
        <span class="opt-label">Satellite</span>
      </button>
    </div>
    <p class="types-note">Photos IGN en France, images NASA ailleurs.</p>
  </div>
{/if}

<style>
  .ctrls-wrap {
    position: fixed;
    z-index: 15;
    right: 12px;
    top: calc(var(--safe-top) + 72px);
    display: grid;
    gap: 10px;
  }
  .ctrls-wrap.wide {
    top: 12px;
  }
  .ctrls {
    display: flex;
    flex-direction: column;
    border-radius: 24px;
    padding: 2px;
  }
  .ctrls.zoom .round {
    color: var(--label);
  }
  .ctrls .round {
    color: var(--location);
  }
  .ctrls .type-btn {
    color: var(--label);
  }
  .ctrls .type-btn[aria-expanded='true'] {
    color: var(--tint);
  }
  .ctrls .round[aria-pressed='true'] {
    color: var(--tint);
  }
  .sep {
    height: 0.5px;
    margin: 0 10px;
    background: var(--separator);
  }
  .three {
    font-family: var(--font-rounded);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: -0.02em;
    color: var(--label);
  }
  .round[aria-pressed='true'] .three {
    color: var(--tint);
  }
  .three {
    display: inline-block;
    animation: flip-in 420ms var(--spring-bouncy);
  }
  @keyframes flip-in {
    from {
      opacity: 0;
      transform: rotateX(80deg);
    }
  }
  .compass {
    display: inline-grid;
    color: var(--label);
    transition: transform 120ms linear;
  }
  .spin {
    display: inline-grid;
    animation: blink 1s ease-in-out infinite alternate;
  }
  @keyframes blink {
    to {
      opacity: 0.35;
    }
  }

  /* Choix du fond de carte : deux vignettes, à gauche de la pilule. */
  .types {
    position: fixed;
    z-index: 16;
    right: 70px;
    top: calc(var(--safe-top) + 72px);
    display: grid;
    width: min-content;
    padding: 10px 10px 8px;
    border-radius: 24px;
    transform-origin: top right;
    animation: types-in 360ms var(--spring-bouncy);
  }
  .types.wide {
    top: 12px;
  }
  .opts {
    display: flex;
    gap: 8px;
  }
  .opt {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 0;
    border-radius: 16px;
    transition: transform 240ms var(--spring);
  }
  .opt:active {
    transform: scale(0.96);
  }
  .thumb {
    display: block;
    width: 96px;
    height: 64px;
    border-radius: 14px;
    overflow: hidden;
    background-color: var(--fill);
    background-size: cover;
    background-position: center;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
    transition: box-shadow 200ms var(--ease-out);
  }
  .thumb svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .opt[aria-pressed='true'] .thumb {
    box-shadow:
      inset 0 0 0 2.5px var(--tint),
      inset 0 0 0 4px rgba(255, 255, 255, 0.9);
  }
  .opt-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--label);
  }
  .opt[aria-pressed='true'] .opt-label {
    color: var(--tint);
  }
  .types-note {
    margin: 8px 2px 0;
    font-size: 0.6875rem;
    line-height: 1.3;
    color: var(--label-2);
    text-align: center;
  }
  .t-land {
    fill: #f2f1ed;
  }
  .t-park {
    fill: #d5ebc6;
  }
  .t-water {
    fill: #a9d2f0;
  }
  .t-road-c {
    fill: none;
    stroke: #d8d5ce;
    stroke-width: 6;
  }
  .t-road {
    fill: none;
    stroke: #fff;
    stroke-width: 4;
  }
  .t-route {
    fill: none;
    stroke: var(--tint);
    stroke-width: 3.5;
    stroke-linejoin: round;
  }
  @media (prefers-color-scheme: dark) {
    .t-land {
      fill: #1e1f21;
    }
    .t-park {
      fill: #213729;
    }
    .t-water {
      fill: #13304a;
    }
    .t-road-c {
      stroke: #141516;
    }
    .t-road {
      stroke: #47484d;
    }
  }
  @keyframes types-in {
    from {
      opacity: 0;
      transform: scale(0.88);
    }
  }
</style>
