<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { sunTimes } from '../lib/sun';
  import { clock } from '../lib/conditions';
  import { skyEmoji, weekActivity } from '../lib/scenes';
  import { NNBSP } from '../lib/format';

  /*
   * Aujourd'hui, en un coup d'œil, posé sur la carte comme un widget : le temps qu'il fait au départ, la
   * lumière qui reste, et la semaine en barres (distance par jour, aujourd'hui en rose).
   */
  $effect(() => {
    const s = app.start?.coord;
    if (s) app.refreshWeather(s);
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(t);
  });

  const w = $derived(app.weather);
  const place = $derived(app.start ? (app.start.kind === 'gps' ? (app.start.detail?.split(',').pop()?.trim() ?? 'Ici') : app.start.name) : null);
  const sun = $derived.by(() => {
    const s = app.start?.coord;
    if (!s) return null;
    const t = sunTimes(now, s[1], s[0]);
    if (t.sunset && now < t.sunset) return { emoji: '🌇', text: `Coucher ${clock(t.sunset)}` };
    const next = sunTimes(now + 86400000, s[1], s[0]).sunrise;
    return next ? { emoji: '🌅', text: `Lever ${clock(next)}` } : null;
  });
  const week = $derived(weekActivity(app.history, now));
  const top = $derived(Math.max(...week.days, 1));
  const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const kmW = $derived((week.total / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
</script>

<section class="today glass photo-card on-photo" aria-label="Aujourd’hui">
  <div class="sky">
    <span class="emo" aria-hidden="true">{w ? skyEmoji(w.code, w.isDay) : '🌤️'}</span>
    <span class="temp rounded tabular">{w ? `${Math.round(w.temperature)}°` : '–°'}</span>
    <span class="where">
      {#if place}<b>{place}</b>{/if}
      {#if sun}<span>{sun.emoji} {sun.text}</span>{/if}
      {#if w}<span>💨 {Math.round(w.windKmh)}{NNBSP}km/h</span>{/if}
    </span>
  </div>
  <div class="week">
    <span class="wk">
      <b class="rounded tabular">{kmW}<small>km</small></b>
      <span>{week.count ? `${week.count} sortie${week.count > 1 ? 's' : ''} cette semaine` : 'Cette semaine'}</span>
    </span>
    <ol class="bars" aria-label="Distance par jour cette semaine">
      {#each week.days as d, i (i)}
        <li class:now={i === week.today} aria-label="{DAYS[i]} : {(d / 1000).toFixed(1)} km">
          <span class="bar" style:--h={d ? Math.max(0.12, d / top) : 0}></span>
          <span class="d">{DAYS[i]}</span>
        </li>
      {/each}
    </ol>
  </div>
</section>

<style>
  .today {
    position: fixed;
    z-index: 15;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 12px;
    width: min(300px, calc(100vw - 96px));
    display: grid;
    gap: 14px;
    padding: 14px 16px 12px;
    border-radius: 30px;
    --g-bg: rgba(24, 26, 28, 0.62);
    --blur: 22px;
    animation: today-in 700ms var(--spring) 200ms both;
  }
  @keyframes today-in {
    from {
      opacity: 0;
      translate: 0 -14px;
      scale: 0.96;
    }
  }
  @media (min-width: 860px) {
    .today {
      left: 408px;
      top: 12px;
    }
  }
  .sky {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .emo {
    font-size: 1.75rem;
    line-height: 1;
  }
  .temp {
    font-size: 2.125rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .where {
    min-width: 0;
    display: grid;
    gap: 1px;
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--label-2);
    text-align: right;
    white-space: nowrap;
  }
  .where b {
    color: var(--label);
    font-weight: 600;
    font-size: 0.9375rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .week {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-top: 12px;
    border-top: 0.5px solid var(--separator);
  }
  .wk {
    display: grid;
    gap: 2px;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .wk b {
    font-size: 1.375rem;
    font-weight: 650;
    color: var(--label);
    letter-spacing: -0.02em;
  }
  .wk small {
    font-family: var(--font);
    font-size: 0.75rem;
    font-weight: 600;
    margin-left: 2px;
    color: var(--label-2);
  }
  .bars {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bars li {
    display: grid;
    justify-items: center;
    gap: 4px;
  }
  .bar {
    width: 7px;
    height: 34px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.16);
    position: relative;
    overflow: hidden;
  }
  .bar::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: calc(var(--h) * 100%);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.85);
    transform-origin: bottom;
    animation: grow 700ms var(--spring) 500ms both;
  }
  li.now .bar::after {
    background: var(--tint);
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .d {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--label-3);
  }
  li.now .d {
    color: var(--label);
  }
  @media (prefers-reduced-motion: reduce) {
    .today,
    .bar::after {
      animation: none;
    }
  }
</style>
