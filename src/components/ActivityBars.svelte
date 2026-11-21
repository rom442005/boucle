<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { last28, SPORT_COLOR } from '../lib/scenes';
  import { SPORTS } from '../lib/sports';
  import type { Sport } from '../lib/types';

  /*
   * Les 28 derniers jours en barres, une par jour, colorées par sport (aujourd'hui cerclé), avec la légende
   * des sports pratiqués : la carte « Température » d'une app santé, appliquée aux sorties.
   */
  const data = $derived(last28(app.history));
  const top = $derived(Math.max(...data.days.map((d) => d.m), 1));
  const sports = $derived([...new Set(data.days.map((d) => d.sport).filter(Boolean))] as Sport[]);
</script>

<div class="act">
  <ol class="bars" aria-label="Distance par jour, 28 derniers jours">
    {#each data.days as d, i (i)}
      <li
        class:today={i === 27}
        class:empty={!d.m}
        style:--h={d.m ? Math.max(0.16, d.m / top) : 0.08}
        style:--c={d.sport ? SPORT_COLOR[d.sport] : 'rgba(255, 255, 255, 0.28)'}
        style:--i={i}
        aria-label="{(d.m / 1000).toFixed(1)} km"
      ></li>
    {/each}
  </ol>
  {#if sports.length}
    <p class="legend">
      {#each sports as s (s)}<span><i style:background={SPORT_COLOR[s]}></i>{SPORTS[s].label}</span>{/each}
    </p>
  {/if}
</div>

<style>
  .act {
    display: grid;
    gap: 10px;
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(28, 1fr);
    align-items: end;
    gap: 3px;
    height: 54px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    height: calc(var(--h) * 100%);
    min-height: 4px;
    border-radius: 3px;
    background: var(--c);
    transform-origin: bottom;
    animation: grow 620ms var(--spring) calc(160ms + var(--i) * 14ms) both;
  }
  li.empty {
    height: 5px;
    background: rgba(255, 255, 255, 0.22);
  }
  li.today {
    box-shadow: 0 0 0 1.5px #fff;
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  @media (prefers-reduced-motion: reduce) {
    li {
      animation: none;
    }
  }
</style>
