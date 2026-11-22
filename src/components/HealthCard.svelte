<script lang="ts">
  import CountUp from './CountUp.svelte';
  import Icon from './Icon.svelte';
  import { tactile } from '../lib/haptics';
  import type { HealthSummary } from '../lib/health';

  /*
   * Santé du jour, comme un widget de l'app Santé : l'anneau des pas vers 10 000, le nombre qui monte, la
   * semaine en barres (aujourd'hui en rose), puis distance à pied, énergie et exercice du jour.
   */
  let { hd, onsync }: { hd: HealthSummary; onsync?: () => void } = $props();

  const GOAL = 10000;
  const R = 27;
  const C = 2 * Math.PI * R;
  const t = $derived(hd.today);
  const ratio = $derived(Math.min(1, (t.steps ?? 0) / GOAL));
  const top = $derived(Math.max(...hd.week.map((d) => d.steps), 1));
  const LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const letter = (day: string) => LETTERS[new Date(`${day}T12:00:00`).getDay()];
  const label = $derived(
    t.isToday ? 'aujourd’hui' : new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${t.day}T12:00:00`)),
  );
  const received = $derived.by(() => {
    if (!hd.updatedAt) return null;
    const d = new Date(hd.updatedAt);
    return new Date().toDateString() === d.toDateString() ? `reçu à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)}` : null;
  });
</script>

<section class="card wide glass photo-card health" aria-label="Santé, {label}">
  <div class="card-top">
    <span class="k">❤️ Santé · {label}</span>
    <span class="end">
      {#if received}<span class="k">{received}</span>{/if}
      {#if onsync}<button use:tactile type="button" class="sync" aria-label="Envoyer Santé maintenant (raccourci)" title="Envoyer maintenant" onclick={onsync}><Icon name="again" size={15} /></button>{/if}
    </span>
  </div>
  <div class="today">
    <svg class="ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" style:--c="{C.toFixed(1)}" style:--off="{(C * (1 - ratio)).toFixed(1)}">
      <circle cx="32" cy="32" r={R} class="track" />
      <circle cx="32" cy="32" r={R} class="fill" stroke-dasharray={C.toFixed(1)} />
      <text x="32" y="38" text-anchor="middle">👣</text>
    </svg>
    <div class="steps">
      <b class="big rounded"><CountUp value={t.steps ?? 0} /><small>pas</small></b>
      <span class="k">{Math.round(ratio * 100)} % de {GOAL.toLocaleString('fr-FR')}</span>
    </div>
  </div>
  <ol class="week" aria-label="Pas par jour, 7 derniers jours">
    {#each hd.week as d, i (d.day)}
      <li class:today={i === 6} style:--h={d.steps ? Math.max(0.1, d.steps / top) : 0.04} style:--i={i} aria-label="{letter(d.day)} : {d.steps.toLocaleString('fr-FR')} pas">
        <span class="bar"></span>
        <span class="d" aria-hidden="true">{letter(d.day)}</span>
      </li>
    {/each}
  </ol>
  <div class="trio">
    <span style:--i={0}><i aria-hidden="true">🚶</i><b class="tabular">{#if t.walkM != null}<CountUp value={t.walkM / 1000} decimals={1} />{:else}–{/if}</b><small>km</small></span>
    <span style:--i={1}><i aria-hidden="true">🔥</i><b class="tabular">{#if t.kcal != null}<CountUp value={t.kcal} />{:else}–{/if}</b><small>kcal</small></span>
    <span style:--i={2}><i aria-hidden="true">⏱️</i><b class="tabular">{#if t.exercise != null}<CountUp value={t.exercise} />{:else}–{/if}</b><small>min</small></span>
  </div>
</section>

<style>
  .health {
    grid-column: 1 / -1;
    display: grid;
    gap: 10px;
    min-width: 0;
    border-radius: 26px;
    padding: 14px 16px;
    animation: card-in 560ms var(--spring) 120ms backwards;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 14px;
      scale: 0.97;
    }
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .k {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--label-2);
  }
  .end {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sync {
    width: 28px;
    height: 28px;
    margin: -4px -6px -4px 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label);
    background: rgba(255, 255, 255, 0.14);
    transition: transform 300ms var(--spring-bouncy);
  }
  .sync:active {
    transform: rotate(-120deg) scale(0.92);
  }
  .today {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ring {
    flex: none;
    rotate: -90deg;
  }
  .ring circle {
    fill: none;
    stroke-width: 7;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.16);
  }
  /* L'anneau se remplit à l'apparition, jusqu'à la part de l'objectif atteinte. */
  .fill {
    stroke: var(--tint);
    stroke-linecap: round;
    stroke-dashoffset: var(--off);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--tint) 60%, transparent));
    animation: ring-fill 1200ms cubic-bezier(0.22, 1, 0.36, 1) 200ms backwards;
  }
  @keyframes ring-fill {
    from {
      stroke-dashoffset: var(--c);
    }
  }
  .ring text {
    rotate: 90deg;
    transform-origin: 32px 32px;
    font-size: 20px;
  }
  .steps {
    display: grid;
    gap: 2px;
  }
  .big {
    font-size: 2.25rem;
    font-weight: 650;
    letter-spacing: -0.035em;
    line-height: 1;
  }
  .big small {
    font-family: var(--font);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 5px;
  }
  .week {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    height: 70px;
  }
  .week li {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    gap: 4px;
    min-height: 0;
  }
  /* Les barres poussent l'une après l'autre. */
  .bar {
    align-self: end;
    width: 100%;
    max-width: 22px;
    height: calc(var(--h) * 100%);
    min-height: 3px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.34);
    transform-origin: bottom;
    animation: bar-grow 700ms var(--spring) backwards;
    animation-delay: calc(260ms + var(--i) * 55ms);
  }
  .today .bar {
    background: var(--tint);
    box-shadow: 0 0 12px -2px color-mix(in srgb, var(--tint) 80%, transparent);
  }
  @keyframes bar-grow {
    from {
      transform: scaleY(0);
    }
  }
  .d {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--label-3);
  }
  .today .d {
    color: var(--label);
  }
  .trio {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding-top: 8px;
    border-top: 0.5px solid var(--separator);
  }
  .trio span {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    animation: trio-in 520ms var(--spring) backwards;
    animation-delay: calc(520ms + var(--i) * 70ms);
  }
  @keyframes trio-in {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
  .trio i {
    font-style: normal;
  }
  .trio b {
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .trio small {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .health,
    .fill,
    .bar,
    .trio span {
      animation: none;
    }
  }
</style>
