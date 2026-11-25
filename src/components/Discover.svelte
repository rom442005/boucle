<script lang="ts">
  import Icon from './Icon.svelte';
  import { app, MAX_VIAS } from '../lib/state.svelte';
  import { discover, type BBox, type Spot } from '../lib/discover';
  import { readHours } from '../lib/hours';
  import { haversine } from '../lib/geo';
  import { km } from '../lib/format';
  import { haptic, tactile } from '../lib/haptics';
  import type { LngLat } from '../lib/types';

  /*
   * Découverte, dans les réglages : les lieux emblématiques de la zone affichée sur la carte, en cartes à photo
   * sur deux colonnes, que l'on fait défiler aux flèches (ou du doigt). Le « + » en fait un point de passage.
   * Mac : survoler une carte montre le lieu et sa zone sur la carte. iPhone : « Voir sur la carte ».
   * Repliée par défaut ; rien n'est demandé au réseau tant qu'elle est fermée.
   */
  let open = $state(!!app.flags.decouverte);
  let spots = $state.raw<Spot[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let track: HTMLDivElement | undefined = $state();
  let first = $state(0);
  const hover = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function toggle() {
    open = !open;
    app.setFlag('decouverte', open);
    haptic('tick');
    if (!open) app.spotFocus = null;
  }

  /** Autour d'un point, 3 km de côté environ (iPhone : la carte est sous la photo, on part du départ). */
  const around = (c: LngLat): BBox => [c[0] - 0.035, c[1] - 0.025, c[0] + 0.035, c[1] + 0.025];
  const zone = $derived(app.wide ? (app.viewBounds ?? (app.start ? around(app.start.coord) : null)) : app.start ? around(app.start.coord) : app.viewBounds);

  let ctrl: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const b = zone;
    if (!open || !b) return;
    clearTimeout(timer);
    // La carte qui bouge : on attend qu'elle se pose (et le cache évite la plupart des requêtes).
    timer = setTimeout(() => void load(b), 380);
    return () => clearTimeout(timer);
  });

  async function load(b: BBox) {
    ctrl?.abort();
    const c = (ctrl = new AbortController());
    loading = !spots.length;
    failed = false;
    try {
      const list = await discover(b, c.signal);
      if (c.signal.aborted) return;
      // Même tête de liste : on garde la page où l'on est.
      if (list[0]?.id !== spots[0]?.id) {
        first = 0;
        track?.scrollTo({ left: 0 });
      }
      spots = list;
    } catch {
      // Pas de réponse : on garde ce qui est affiché ; sinon, on le dit.
      if (!c.signal.aborted) failed = !spots.length;
    } finally {
      if (ctrl === c) loading = false;
    }
  }

  const from = $derived(app.start?.coord ?? null);
  const dist = (s: Spot) => (from ? km(haversine(from, s.coord)) : null);
  const added = (s: Spot) => app.viaNear(s.coord) >= 0;

  function toggleVia(s: Spot) {
    const i = app.viaNear(s.coord);
    if (i >= 0) {
      app.removeVia(i);
      haptic('tap');
      app.showToast(`${s.name} retiré du parcours`);
      return;
    }
    if (!app.addVia({ name: s.name, detail: s.kind, coord: s.coord, kind: 'search' })) {
      haptic('warn');
      app.showToast(`${MAX_VIAS} points de passage au plus`);
      return;
    }
    haptic('success');
    app.showToast(`Le parcours passera par ${s.name}`);
  }

  // Mac : le survol montre le lieu sur la carte (un léger délai à la sortie évite le clignotement).
  let leave: ReturnType<typeof setTimeout> | undefined;
  function preview(s: Spot, fly = false) {
    clearTimeout(leave);
    app.spotFocus = { coord: s.coord, bounds: s.bounds, emoji: s.emoji, name: s.name, fly };
  }
  function unpreview() {
    clearTimeout(leave);
    leave = setTimeout(() => (app.spotFocus = null), 160);
  }
  /** iPhone : la carte avec la fiche du lieu, à la place des réglages. */
  function see(s: Spot) {
    haptic('tap');
    app.spotView = s;
    app.spotFocus = { coord: s.coord, bounds: s.bounds, emoji: s.emoji, name: s.name, fly: true };
  }

  /* Défilement par pages de deux cartes. */
  const GAP = 10;
  function step(dir: 1 | -1) {
    if (!track) return;
    haptic('tick');
    track.scrollBy({ left: dir * (track.clientWidth + GAP), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function onScroll() {
    if (!track) return;
    const w = (track.clientWidth - GAP) / 2 + GAP;
    first = Math.round(track.scrollLeft / w);
  }
  const last = $derived(Math.min(spots.length, first + 2));
</script>

<section class="disc" class:open aria-labelledby="disc-h">
  <button use:tactile type="button" class="head" aria-expanded={open} aria-controls="disc-body" onclick={toggle}>
    <span class="field-label" id="disc-h">✨ Découverte</span>
    <span class="sub">{open ? (spots.length ? `${spots.length} lieux à voir` : '') : 'Lieux emblématiques autour'}</span>
    <span class="chev" aria-hidden="true"><Icon name="down" size={16} /></span>
  </button>

  {#if open}
    <div class="body" id="disc-body">
      {#if loading}
        <div class="row-cards" aria-hidden="true">
          <div class="spot skel"><span class="ph"></span><span class="l1"></span><span class="l2"></span></div>
          <div class="spot skel"><span class="ph"></span><span class="l1"></span><span class="l2"></span></div>
        </div>
        <p class="note">Recherche des lieux emblématiques…</p>
      {:else if failed}
        <p class="note">Les lieux ne répondent pas pour le moment. Réessaie dans un instant.</p>
      {:else if !spots.length}
        <p class="note">Pas de lieu emblématique connu ici. Déplace la carte vers une ville.</p>
      {:else}
        <div class="nav">
          <span class="count tabular" aria-live="polite">{first + 1}–{last} sur {spots.length}</span>
          <span class="arrows">
            <button use:tactile type="button" class="arrow" aria-label="Lieux précédents" disabled={first <= 0} onclick={() => step(-1)}><Icon name="caretLeft" size={16} /></button>
            <button use:tactile type="button" class="arrow" aria-label="Lieux suivants" disabled={last >= spots.length} onclick={() => step(1)}><Icon name="caretRight" size={16} /></button>
          </span>
        </div>
        <div class="row-cards track" bind:this={track} onscroll={onScroll} role="list" aria-label="Lieux emblématiques">
          {#each spots as s, i (s.id)}
            {@const h = readHours(s.hours)}
            {@const on = added(s)}
            <!-- svelte-ignore a11y_mouse_events_have_key_events -->
            <article
              class="spot"
              class:on
              role="listitem"
              style:--i={Math.min(i, 6)}
              onmouseenter={hover ? () => preview(s) : undefined}
              onmouseleave={hover ? unpreview : undefined}
              onfocusin={hover ? () => preview(s) : undefined}
              onfocusout={hover ? unpreview : undefined}
            >
              <div class="ph">
                {#if s.image}
                  <img src={s.image} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                {:else}
                  <span class="ph-emo" aria-hidden="true">{s.emoji}</span>
                {/if}
                <span class="kind">{s.emoji} {s.kind}</span>
                <button
                  use:tactile
                  type="button"
                  class="add"
                  class:on
                  aria-pressed={on}
                  aria-label={on ? `Ne plus passer par ${s.name}` : `Passer par ${s.name}`}
                  title={on ? 'Retirer du parcours' : 'Passer par ici'}
                  onclick={() => toggleVia(s)}
                >
                  <Icon name={on ? 'check' : 'plus'} size={16} />
                </button>
              </div>
              <h4 class="name" title={s.desc ?? s.name}>{s.name}</h4>
              {#if h}
                <p class="hours" class:is-open={h.open === true} class:is-closed={h.open === false} title={h.today ? `Aujourd’hui : ${h.today}` : undefined}>
                  <i aria-hidden="true"></i><span>{h.short}</span>
                </p>
              {/if}
              {#if dist(s)}<p class="meta tabular">à {dist(s)} du départ</p>{/if}
              {#if !hover}
                <button use:tactile type="button" class="see" onclick={() => see(s)}><Icon name="map" size={14} />Voir sur la carte</button>
              {:else}
                <button type="button" class="see" onclick={() => preview(s, true)}><Icon name="map" size={14} />Voir sur la carte</button>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .disc {
    display: grid;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    text-align: left;
    color: inherit;
  }
  .head .field-label {
    flex: none;
  }
  .sub {
    flex: 1;
    min-width: 0;
    font-size: 0.8125rem;
    color: var(--label-2);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--label-2);
    transition: rotate 320ms var(--spring);
  }
  .open .chev {
    rotate: 180deg;
  }
  .body {
    display: grid;
    gap: 8px;
    animation: unfold 380ms var(--spring) backwards;
  }
  @keyframes unfold {
    from {
      opacity: 0;
      translate: 0 -6px;
    }
  }
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .count {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .arrows {
    display: flex;
    gap: 6px;
  }
  .arrow {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label);
    background: var(--fill-2);
    transition:
      opacity 200ms var(--ease-out),
      transform 220ms var(--spring);
  }
  .arrow:active:not(:disabled) {
    transform: scale(0.9);
  }
  .arrow:disabled {
    opacity: 0.35;
  }
  /* Deux colonnes, qui défilent par pages (et du doigt, avec aimantation). */
  .row-cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc((100% - 10px) / 2);
    gap: 10px;
  }
  .track {
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    margin: 0 -2px;
    padding: 0 2px 2px;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .spot {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 4px;
    scroll-snap-align: start;
    animation: spot-in 460ms var(--spring) calc(var(--i, 0) * 50ms) backwards;
  }
  @keyframes spot-in {
    from {
      opacity: 0;
      scale: 0.96;
    }
  }
  .ph {
    position: relative;
    aspect-ratio: 4 / 3;
    border-radius: 18px;
    overflow: hidden;
    background: linear-gradient(135deg, color-mix(in srgb, var(--tint) 30%, #2c2c2e), #1c1c1e);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.18);
    transition: box-shadow 220ms var(--ease-out);
  }
  .spot.on .ph {
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.18),
      0 0 0 2px var(--tint);
  }
  .ph img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 600ms var(--ease-out);
  }
  @media (hover: hover) {
    .spot:hover .ph img {
      transform: scale(1.05);
    }
  }
  .ph-emo {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 2.25rem;
  }
  .kind {
    position: absolute;
    left: 6px;
    bottom: 6px;
    max-width: calc(100% - 12px);
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 650;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .add {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #1c1c1e;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.5);
    transition:
      background-color 220ms var(--ease-out),
      color 220ms var(--ease-out),
      transform 260ms var(--spring-bouncy);
  }
  .add:active {
    transform: scale(0.88);
  }
  .add.on {
    color: #fff;
    background: var(--tint);
  }
  .name {
    margin: 2px 2px 0;
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .hours {
    margin: 0 2px;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: var(--label-2);
    white-space: nowrap;
    overflow: hidden;
  }
  .hours span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hours i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--label-3, #8e8e93);
  }
  .hours.is-open {
    color: #30d158;
  }
  .hours.is-open i {
    background: #30d158;
  }
  .hours.is-closed i {
    background: #ff9f0a;
  }
  .meta {
    margin: 0 2px;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .see {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label);
    background: var(--fill-2);
  }
  .note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  /* Attente : deux cartes qui respirent. */
  .skel .ph {
    background: var(--fill-2);
    animation: breathe 1.4s ease-in-out infinite;
  }
  .skel .l1,
  .skel .l2 {
    display: block;
    height: 10px;
    border-radius: 5px;
    background: var(--fill-2);
    animation: breathe 1.4s ease-in-out infinite;
  }
  .skel .l1 {
    width: 80%;
    margin-top: 6px;
  }
  .skel .l2 {
    width: 50%;
  }
  @keyframes breathe {
    50% {
      opacity: 0.45;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .body,
    .spot,
    .skel .ph,
    .skel .l1,
    .skel .l2 {
      animation: none;
    }
  }
</style>
