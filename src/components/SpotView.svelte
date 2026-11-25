<script lang="ts">
  import Icon from './Icon.svelte';
  import { app, MAX_VIAS } from '../lib/state.svelte';
  import { readHours } from '../lib/hours';
  import { haversine } from '../lib/geo';
  import { km } from '../lib/format';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * iPhone, « Voir sur la carte » depuis la Découverte : la carte revient (le lieu et sa zone au centre) et une
   * fiche de verre en bas : la photo, le nom, ce que c'est, les horaires du jour, la distance au départ,
   * « Passer par ici » et le retour aux réglages.
   */
  const s = $derived(app.spotView!);
  const h = $derived(readHours(s.hours));
  const on = $derived(app.viaNear(s.coord) >= 0);
  const dist = $derived(app.start ? km(haversine(app.start.coord, s.coord)) : null);

  function back() {
    haptic('tap');
    app.spotView = null;
    app.spotFocus = null;
  }
  function toggle() {
    const i = app.viaNear(s.coord);
    if (i >= 0) {
      app.removeVia(i);
      haptic('tap');
      return;
    }
    if (!app.addVia({ name: s.name, detail: s.kind, coord: s.coord, kind: 'search' })) {
      haptic('warn');
      app.showToast(`${MAX_VIAS} points de passage au plus`);
      return;
    }
    haptic('success');
    app.showToast(`Le parcours passera par ${s.name}`);
    back();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && back()} />

<section class="spot-view glass photo-card" aria-label={s.name}>
  {#if s.image}<img class="ph" src={s.image} alt="" decoding="async" referrerpolicy="no-referrer" />{/if}
  <div class="txt">
    <span class="k">{s.emoji} {s.kind}{dist ? ` · à ${dist} du départ` : ''}</span>
    <h2>{s.name}</h2>
    {#if s.desc}<p class="desc">{s.desc}</p>{/if}
    {#if h}
      <p class="hours" class:is-open={h.open === true} class:is-closed={h.open === false}>
        <i aria-hidden="true"></i>{h.label}
      </p>
      {#if h.today && h.open !== null}<p class="today">Aujourd’hui : {h.today}</p>{/if}
    {/if}
  </div>
  <div class="acts">
    <button use:tactile type="button" class="back" onclick={back}><Icon name="back" size={16} />Réglages</button>
    <button use:tactile type="button" class="go" class:on onclick={toggle}>
      <Icon name={on ? 'check' : 'plus'} size={16} />{on ? 'Sur le parcours' : 'Passer par ici'}
    </button>
  </div>
</section>

<style>
  .spot-view {
    position: fixed;
    z-index: 30;
    left: var(--gutter);
    right: var(--gutter);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
    display: grid;
    gap: 10px;
    padding: 10px 10px 12px;
    border-radius: 30px;
    color: #fff;
    --g-bg: rgba(22, 23, 25, 0.86);
    animation: rise 520ms var(--spring) backwards;
  }
  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 40px;
    }
  }
  .ph {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 22px;
  }
  .txt {
    display: grid;
    gap: 2px;
    padding: 0 6px;
  }
  .k {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .desc {
    margin: 0;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.72);
  }
  .hours {
    margin: 4px 0 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .hours i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #8e8e93;
  }
  .hours.is-open {
    color: #30d158;
  }
  .hours.is-open i {
    background: #30d158;
  }
  .hours.is-closed {
    color: #ff9f0a;
  }
  .hours.is-closed i {
    background: #ff9f0a;
  }
  .today {
    margin: 0;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.7);
  }
  .acts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
  }
  .back,
  .go {
    min-height: 48px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 1rem;
    font-weight: 650;
  }
  .back {
    padding: 0 18px;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .go {
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%),
      var(--tint);
  }
  .go.on {
    background: rgba(255, 255, 255, 0.2);
  }
  @media (prefers-reduced-motion: reduce) {
    .spot-view {
      animation: none;
    }
  }
</style>
