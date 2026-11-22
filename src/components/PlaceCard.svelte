<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { saved, ZONE_EMOJI } from '../lib/saved.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { km } from '../lib/format';
  import { haversine } from '../lib/geo';
  import { aerialTiles, groundPhoto, hasAerial, type GroundPhoto } from '../lib/placephotos';

  /*
   * Fiche d'un lieu touché sur la carte (piste, parc, fontaine, lieu enregistré) : deux photos côte à côte, la
   * vue du ciel (une piste tournée à l'horizontale) et une photo prise au sol tout près, tournée vers le lieu ;
   * son nom, ce qu'on en sait, sa distance ; « Partir d'ici » et Enregistrer. Une photo touchée s'agrandit.
   */
  const p = $derived(app.place!);
  const aerial = $derived(hasAerial(p.coord));
  /** photo au sol : undefined pendant la recherche, null s'il n'y en a pas */
  let ground = $state<GroundPhoto | null | undefined>(undefined);
  let big = $state<null | 'aerial' | 'ground'>(null);
  let photosW = $state(0);
  let cardH = $state(0);
  let innerWidth = $state(390);
  let innerHeight = $state(800);

  $effect(() => {
    const cur = p;
    ground = undefined;
    big = null;
    void groundPhoto(cur.coord, cur.zone ?? 'place', cur.savedId ? null : cur.name).then((g) => {
      if (app.place?.id === cur.id) ground = g;
    });
  });
  $effect(() => {
    app.placeH = cardH;
  });
  // Fiche retirée de l'écran (réglages ouverts, autre onglet) : elle se ferme pour de bon.
  $effect(() => () => {
    if (app.place) app.place = null;
  });

  const mine = $derived(p.savedId ? (saved.places.find((x) => x.id === p.savedId) ?? null) : saved.near(p.coord, 30));
  const from = $derived(app.userPos ?? app.start?.coord ?? null);
  const dist = $derived(from ? haversine(from, p.coord) : null);
  /** une piste est tournée pour être à l'horizontale */
  const rot = $derived(p.track ? (p.track.a > 90 ? p.track.a - 180 : p.track.a) : 0);
  const both = $derived(aerial && ground !== null);
  const H = 128;
  const frameW = $derived(both ? (photosW - 6) / 2 : photosW);

  function save() {
    haptic('tap');
    if (mine) saved.edit({ id: mine.id, name: mine.name, detail: mine.detail, coord: mine.coord });
    else saved.edit({ name: p.name, detail: p.sub, coord: p.coord, emoji: p.zone ? ZONE_EMOJI[p.zone] : '📍', zone: p.zone });
  }
  function close() {
    haptic('tap');
    app.closePlace();
  }
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (big) big = null;
    else app.closePlace();
  }

  const PANO_FOV = 100;
</script>

<svelte:window onkeydown={onkey} bind:innerWidth bind:innerHeight />

{#snippet sky(w: number, h: number, across: number)}
  <span class="sky" style:width="{w}px" style:height="{h}px">
    <span class="sky-rot" style:transform="rotate({rot}deg)" style:transform-origin="{w / 2}px {h / 2}px">
      {#each aerialTiles(p.coord, across, w, h) as t (t.src)}
        <img src={t.src} alt="" draggable="false" style:left="{t.left}px" style:top="{t.top}px" style:width="{t.size + 0.5}px" style:height="{t.size + 0.5}px" />
      {/each}
    </span>
  </span>
{/snippet}

{#snippet street(g: GroundPhoto, w: number, h: number, fov: number)}
  {#if g.pano != null}
    {@const iw = (w * 360) / fov}
    <span
      class="pano"
      style:width="{w}px"
      style:height="{h}px"
      style:background-image="url({g.full})"
      style:background-size="{iw}px {iw / 2}px"
      style:background-position="{-(g.pano * iw - w / 2)}px {-(iw / 4 - h * 0.52)}px"
    ></span>
  {:else}
    <img class="flat" src={g.src} alt="" draggable="false" style:width="{w}px" style:height="{h}px" />
  {/if}
{/snippet}

<section class="card glass photo-card on-photo" aria-label="Fiche du lieu : {p.name}" bind:offsetHeight={cardH}>
  <div class="photos" bind:clientWidth={photosW} style:height="{H}px">
    {#if photosW}
      {#key p.id}
        {#if aerial}
          <button use:tactile type="button" class="ph" style:width="{frameW}px" aria-label="Agrandir la vue du ciel" onclick={() => (big = 'aerial')}>
            {@render sky(frameW, H, p.across * (frameW / Math.max(1, (photosW - 6) / 2)))}
            <span class="tag">Vue du ciel</span>
          </button>
        {/if}
        {#if ground === undefined}
          <span class="ph wait" style:width="{frameW}px" aria-hidden="true"></span>
        {:else if ground}
          <button use:tactile type="button" class="ph" style:width="{frameW}px" aria-label="Agrandir la photo du lieu" onclick={() => (big = 'ground')}>
            {@render street(ground, frameW, H, PANO_FOV)}
            <span class="tag">Sur place</span>
          </button>
        {:else if !aerial}
          <span class="ph none" style:width="{frameW}px"><Icon name="images" size={22} /><small>Pas encore de photo</small></span>
        {/if}
      {/key}
    {/if}
  </div>

  <div class="head">
    <span class="txt">
      <h3>{p.name}</h3>
      <small class="tabular">{[p.sub, dist != null && dist > 30 ? `à ${km(dist)}` : ''].filter(Boolean).join(' · ')}</small>
    </span>
    <button use:tactile type="button" class="x" aria-label="Fermer la fiche" onclick={close}><Icon name="close" size={16} /></button>
  </div>

  <div class="acts">
    <button use:tactile type="button" class="go" onclick={() => app.startFrom({ name: p.name, sub: p.sub, coord: p.coord })}><Icon name="path" size={18} />Partir d’ici</button>
    <button use:tactile type="button" class="keep" class:on={!!mine} aria-pressed={!!mine} onclick={save}>
      <Icon name="bookmark" size={18} fill={!!mine} />{mine ? 'Enregistré' : 'Enregistrer'}
    </button>
  </div>
</section>

{#if big}
  {@const vw = Math.min(innerWidth - 24, 900)}
  {@const vh = Math.min(innerHeight * 0.62, vw * 0.66)}
  <div class="viewer" role="dialog" aria-modal="true" aria-label={big === 'aerial' ? 'Vue du ciel' : 'Photo du lieu'}>
    <button type="button" class="scrim" aria-label="Fermer" onclick={() => (big = null)}></button>
    <figure class="big" style:width="{vw}px">
      <button use:tactile type="button" class="x big-x" aria-label="Fermer la photo" onclick={() => (big = null)}><Icon name="close" size={18} /></button>
      <span class="big-ph" style:height="{vh}px">
        {#if big === 'aerial'}
          {@render sky(vw, vh, p.across * (vw / Math.max(1, (photosW - 6) / 2)) * 0.62)}
        {:else if ground}
          {@render street(ground, vw, vh, 120)}
        {/if}
      </span>
      <figcaption>
        <b>{p.name}</b>
        {#if big === 'aerial'}
          <a href="https://geoservices.ign.fr" target="_blank" rel="noopener">Photo aérienne © IGN</a>
        {:else if ground}
          <a href={ground.link} target="_blank" rel="noopener">{ground.credit}</a>
        {/if}
      </figcaption>
    </figure>
  </div>
{/if}

<style>
  .card {
    position: fixed;
    z-index: 16;
    left: 12px;
    right: 12px;
    bottom: calc(var(--place-bottom, 96px));
    padding: 8px 8px 10px;
    border-radius: 30px;
    color: #fff;
    display: grid;
    gap: 8px;
    --g-bg: rgba(20, 22, 24, 0.58);
    --blur: 26px;
    animation: card-in 560ms var(--spring) backwards;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 28px;
      scale: 0.96;
    }
  }
  @media (min-width: 860px) {
    .card {
      left: calc(408px + (100vw - 408px - 400px) / 2);
      right: auto;
      width: 400px;
      bottom: 20px;
    }
  }
  .photos {
    display: flex;
    gap: 6px;
  }
  .ph {
    position: relative;
    flex: none;
    height: 100%;
    overflow: hidden;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.08);
    animation: ph-in 520ms var(--spring) backwards;
    transition:
      transform 300ms var(--spring-bouncy),
      width 420ms var(--spring);
  }
  .ph + .ph {
    animation-delay: 80ms;
  }
  @keyframes ph-in {
    from {
      opacity: 0;
      scale: 0.94;
    }
  }
  .ph:active {
    transform: scale(0.97);
  }
  .wait {
    background: linear-gradient(100deg, rgba(255, 255, 255, 0.06) 30%, rgba(255, 255, 255, 0.16) 50%, rgba(255, 255, 255, 0.06) 70%) 0 0 / 300% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -150% 0;
    }
  }
  .none {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.6);
  }
  .none small {
    font-size: 0.75rem;
  }
  .sky {
    position: absolute;
    inset: 0;
    overflow: hidden;
    display: block;
  }
  .sky-rot {
    position: absolute;
    inset: 0;
  }
  .sky img {
    position: absolute;
    max-width: none;
    user-select: none;
  }
  .pano {
    position: absolute;
    inset: 0;
    display: block;
    background-repeat: repeat-x;
  }
  .flat {
    position: absolute;
    inset: 0;
    object-fit: cover;
  }
  .tag {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 0 4px 0 8px;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  h3 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .txt small {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.72);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .x {
    width: 30px;
    height: 30px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transition: transform 240ms var(--spring-bouncy);
  }
  .x:active {
    transform: scale(0.86);
  }
  .acts {
    display: flex;
    gap: 8px;
  }
  .go,
  .keep {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    border-radius: 999px;
    font-weight: 620;
    font-size: 0.9375rem;
    transition: transform 260ms var(--spring-bouncy);
  }
  .go {
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%),
      var(--tint);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.5),
      0 10px 22px -12px var(--tint);
  }
  .keep {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .keep.on {
    color: #1c1c1e;
    background: #fff;
  }
  .go:active,
  .keep:active {
    transform: scale(0.96);
  }
  /* Photo agrandie : sur un voile sombre, avec son auteur. */
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    animation: fade-in 260ms var(--ease-out);
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  .big {
    position: relative;
    margin: 0;
    display: grid;
    gap: 10px;
    animation: card-in 480ms var(--spring) backwards;
  }
  .big-ph {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.06);
  }
  figcaption {
    display: grid;
    gap: 2px;
    padding: 0 6px;
    color: #fff;
  }
  figcaption b {
    font-size: 1rem;
    font-weight: 650;
  }
  figcaption a {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
  }
  .big-x {
    position: absolute;
    z-index: 2;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .ph,
    .big,
    .scrim,
    .wait {
      animation: none;
    }
  }
</style>
