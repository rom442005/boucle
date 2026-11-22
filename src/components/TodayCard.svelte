<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { sunTimes } from '../lib/sun';
  import { clock } from '../lib/conditions';
  import { skyEmoji } from '../lib/scenes';
  import { NNBSP } from '../lib/format';

  /*
   * Aujourd'hui, en un coup d'œil, posé sur la carte comme un widget : le temps qu'il fait au départ et la
   * lumière qui reste.
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
</section>

<style>
  .today {
    position: fixed;
    z-index: 15;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 12px;
    width: min(300px, calc(100vw - 96px));
    display: grid;
    padding: 12px 16px;
    border-radius: 28px;
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
  /* iPhone : une seule ligne (le temps, la température, le lieu), pour laisser la carte au centre. */
  @media (max-width: 859px) {
    .today {
      width: auto;
      max-width: calc(100vw - 96px);
      top: calc(env(safe-area-inset-top, 0px) + 10px);
      padding: 7px 16px 7px 12px;
      border-radius: 999px;
    }
    .sky {
      gap: 8px;
    }
    .emo {
      font-size: 1.25rem;
    }
    .temp {
      font-size: 1.3125rem;
      letter-spacing: -0.03em;
    }
    .where {
      margin-left: 2px;
      text-align: left;
    }
    .where span {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .today {
      animation: none;
    }
  }
</style>
