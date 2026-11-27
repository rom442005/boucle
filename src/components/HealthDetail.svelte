<script lang="ts">
  import Icon from './Icon.svelte';
  import CountUp from './CountUp.svelte';
  import { links, type HealthMetric } from '../lib/links.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { appName } from '../lib/health';
  import type { HealthDay } from '../lib/community/types';
  import { NNBSP } from '../lib/format';

  /*
   * Le détail d'une donnée de Santé, comme dans l'app Santé : une donnée choisie en haut (pas, marche, énergie,
   * exercice, repos, VO2 max, sorties), 7 ou 28 jours, le chiffre héros (la moyenne, ou le jour touché sur le
   * graphique), la comparaison avec la semaine d'avant, puis les repères et la liste jour par jour.
   */
  interface Def {
    emoji: string;
    label: string;
    unit: string;
    /** valeur d'un jour, null sans donnée */
    get: (d: HealthDay) => number | null;
    /** cumul sur la journée (pas, km…) plutôt qu'un niveau (repos, VO2 max) */
    sum: boolean;
    dec: number;
    goal?: number;
    /** plus bas, c'est mieux (fréquence au repos) */
    low?: boolean;
    color: string;
  }
  const DEFS: Record<HealthMetric, Def> = {
    steps: { emoji: '👣', label: 'Pas', unit: 'pas', get: (d) => d.steps, sum: true, dec: 0, goal: 10000, color: '#FF2D55' },
    walk: { emoji: '🚶', label: 'Marche et course', unit: 'km', get: (d) => (d.walkM != null ? d.walkM / 1000 : null), sum: true, dec: 1, color: '#FF9F0A' },
    kcal: { emoji: '🔥', label: 'Énergie active', unit: 'kcal', get: (d) => d.activeKcal ?? null, sum: true, dec: 0, color: '#FF453A' },
    exercise: { emoji: '⏱️', label: 'Exercice', unit: 'min', get: (d) => d.exerciseMin ?? null, sum: true, dec: 0, goal: 30, color: '#30D158' },
    rhr: { emoji: '❤️', label: 'Fréquence au repos', unit: 'bpm', get: (d) => d.restingHr, sum: false, dec: 0, low: true, color: '#FF375F' },
    vo2: { emoji: '🫁', label: 'VO2 max', unit: 'ml/kg/min', get: (d) => d.vo2max, sum: false, dec: 1, color: '#64D2FF' },
    runs: { emoji: '⌚', label: 'Sorties', unit: 'km', get: (d) => (d.workouts.length ? d.distance / 1000 : 0), sum: true, dec: 1, color: '#BF5AF2' },
  };
  const ORDER: HealthMetric[] = ['steps', 'walk', 'kcal', 'exercise', 'runs', 'rhr', 'vo2'];

  const metric = $derived<HealthMetric>(links.detail ?? 'steps');
  let span = $state<7 | 28>(7);
  /** jour touché sur le graphique (index dans la période) */
  let pick = $state<number | null>(null);

  const def = $derived(DEFS[metric]);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** les 28 derniers jours du calendrier (aujourd'hui compris), avec ou sans données */
  const days = $derived.by(() => {
    const by = new Map(links.healthDays.map((d) => [d.day, d]));
    const now = new Date();
    return Array.from({ length: 28 }, (_, i) => {
      const k = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27 + i));
      return { day: k, d: by.get(k) ?? null };
    });
  });
  const vals = $derived(days.map((x) => (x.d ? def.get(x.d) : null)));
  const shown = $derived(vals.slice(28 - span));
  const shownDays = $derived(days.slice(28 - span));
  const known = $derived(shown.filter((v): v is number => v != null));
  const avg = $derived(known.length ? known.reduce((a, b) => a + b, 0) / known.length : null);
  const total = $derived(known.reduce((a, b) => a + b, 0));
  const max = $derived(known.length ? Math.max(...known) : 0);
  const min = $derived(known.length ? Math.min(...known) : 0);
  const best = $derived.by(() => {
    let i = -1;
    shown.forEach((v, j) => {
      if (v != null && (i < 0 || (def.low ? v < shown[i]! : v > shown[i]!))) i = j;
    });
    return i >= 0 ? { day: shownDays[i].day, v: shown[i]! } : null;
  });
  const lastVal = $derived([...vals].reverse().find((v) => v != null) ?? null);
  /** moyenne des 7 derniers jours comparée aux 7 d'avant */
  const trend = $derived.by(() => {
    const mean = (a: (number | null)[]) => {
      const k = a.filter((v): v is number => v != null);
      return k.length ? k.reduce((x, y) => x + y, 0) / k.length : null;
    };
    const now = mean(vals.slice(21));
    const before = mean(vals.slice(14, 21));
    if (now == null || before == null || !before) return null;
    return (now - before) / before;
  });

  const fmt = (v: number, dec = def.dec) => v.toLocaleString('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: dec });
  const dayName = (k: string, long = false) =>
    new Intl.DateTimeFormat('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${k}T12:00:00`));
  const letter = (k: string) => 'DLMMJVS'[new Date(`${k}T12:00:00`).getDay()];

  const hero = $derived.by(() => {
    if (pick != null && shownDays[pick]) {
      const v = shown[pick];
      return { k: dayName(shownDays[pick].day, true), v, cap: v == null ? 'pas de donnée ce jour-là' : def.goal ? `${Math.round((v / def.goal) * 100)} % de l’objectif` : '' };
    }
    if (def.sum) return { k: `Moyenne par jour · ${span} jours`, v: avg, cap: def.goal && avg != null ? `objectif ${fmt(def.goal, 0)} ${def.unit}` : '' };
    return { k: 'Dernière mesure', v: lastVal, cap: avg != null ? `moyenne ${fmt(avg)} ${def.unit} sur ${span} jours` : '' };
  });

  /* Graphique : barres (cumuls) ou courbe (niveaux), avec la ligne de la moyenne. */
  const W = 320;
  const H = 120;
  const lo = $derived(def.sum ? 0 : Math.floor(min - (max - min) * 0.4 - 1));
  const hi = $derived(Math.max(def.sum ? Math.max(max, def.goal && span === 7 ? def.goal : 0) : max + (max - min) * 0.4 + 1, 1));
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const bw = $derived(W / span);
  const line = $derived(
    shown
      .map((v, i) => (v == null ? null : `${(i + 0.5) * bw},${y(v)}`))
      .filter(Boolean)
      .join(' '),
  );

  function choose(m: HealthMetric) {
    if (m === metric) return;
    haptic('tick');
    links.detail = m;
    pick = null;
  }
  function setSpan(s: 7 | 28) {
    haptic('tick');
    span = s;
    pick = null;
  }
  function touch(i: number) {
    haptic('tick');
    pick = pick === i ? null : i;
  }
  const close = () => (links.detail = null);
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const i = ORDER.indexOf(metric) + (e.key === 'ArrowLeft' ? -1 : 1);
      if (ORDER[i]) choose(ORDER[i]);
    }
  }

  const runs = $derived(
    links.healthDays
      .flatMap((d) => d.workouts.map((w) => ({ ...w, day: d.day })))
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start)),
  );
  const pace = (m: number, s: number) => {
    if (!m || !s) return '';
    const p = Math.round(s / (m / 1000));
    return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')}${NNBSP}/km`;
  };
  const dur = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return h ? `${h}${NNBSP}h${NNBSP}${String(m).padStart(2, '0')}` : `${m}${NNBSP}min`;
  };
</script>

<svelte:window onkeydown={onkey} />

<button type="button" class="scrim" aria-label="Fermer" onclick={close}></button>
<div class="sheet glass photo-card on-photo" role="dialog" aria-modal="true" aria-labelledby="hd-title" style:--accent={def.color}>
  <header>
    <h2 id="hd-title"><span aria-hidden="true">{def.emoji}</span> {def.label}</h2>
    <button use:tactile type="button" class="x" aria-label="Fermer" onclick={close}><Icon name="close" size={16} /></button>
  </header>

  <div class="chips" role="tablist" aria-label="Donnée de Santé">
    {#each ORDER as m (m)}
      <button use:tactile type="button" role="tab" class="chip" class:on={m === metric} aria-selected={m === metric} onclick={() => choose(m)}>
        <span aria-hidden="true">{DEFS[m].emoji}</span>{DEFS[m].label}
      </button>
    {/each}
  </div>

  <div class="body">
    <div class="seg" role="radiogroup" aria-label="Période">
      <button use:tactile type="button" role="radio" aria-checked={span === 7} class:on={span === 7} onclick={() => setSpan(7)}>7 jours</button>
      <button use:tactile type="button" role="radio" aria-checked={span === 28} class:on={span === 28} onclick={() => setSpan(28)}>28 jours</button>
    </div>

    <div class="hero" aria-live="polite">
      <span class="k">{hero.k}</span>
      <b class="big rounded tabular">
        {#if hero.v != null}{#key `${metric}-${span}-${pick}`}<CountUp value={hero.v} decimals={def.dec} duration={500} />{/key}{:else}–{/if}<small>{def.unit}</small>
      </b>
      <span class="cap">
        {hero.cap}
        {#if pick == null && trend != null}
          {@const up = trend > 0}
          {@const good = def.low ? !up : up}
          <span class="trend" class:good class:bad={!good && Math.abs(trend) >= 0.02}>
            {up ? '↗' : '↘'} {Math.abs(Math.round(trend * 100))}{NNBSP}% vs la semaine d’avant
          </span>
        {/if}
      </span>
    </div>

    <!-- Graphique : toucher un jour montre son chiffre. -->
    <div class="chart" class:wide={span === 28}>
      <svg viewBox="0 0 {W} {H + 18}" preserveAspectRatio="none" role="img" aria-label="{def.label}, {span} derniers jours">
        {#if avg != null && def.sum}
          <line class="avg" x1="0" x2={W} y1={y(avg)} y2={y(avg)} />
        {/if}
        {#if def.goal && span === 7}
          <line class="goal" x1="0" x2={W} y1={y(def.goal)} y2={y(def.goal)} />
        {/if}
        {#if def.sum}
          {#each shown as v, i (shownDays[i].day)}
            <rect
              class="bar"
              class:on={pick === i}
              class:dim={pick != null && pick !== i}
              class:today={i === shown.length - 1}
              x={i * bw + bw * 0.18}
              width={bw * 0.64}
              y={v ? y(v) : H - 2}
              height={v ? H - y(v) : 2}
              rx={Math.min(5, bw * 0.3)}
              style:--i={i}
            />
          {/each}
        {:else}
          <polyline class="curve" points={line} />
          {#each shown as v, i (shownDays[i].day)}
            {#if v != null}<circle class="dot" class:on={pick === i} cx={(i + 0.5) * bw} cy={y(v)} r={pick === i ? 4.5 : span === 7 ? 3.5 : 2.2} />{/if}
          {/each}
        {/if}
      </svg>
      <div class="hits" style:--n={span}>
        {#each shownDays as d, i (d.day)}
          <button type="button" class="hit" class:on={pick === i} aria-label="{dayName(d.day)} : {shown[i] != null ? `${fmt(shown[i]!)} ${def.unit}` : 'pas de donnée'}" onclick={() => touch(i)}>
            {#if span === 7 || i % 7 === 6}<span class="d">{span === 7 ? letter(d.day) : new Date(`${d.day}T12:00:00`).getDate()}</span>{/if}
          </button>
        {/each}
      </div>
    </div>

    <dl class="tiles">
      {#if def.sum}
        <div><dt class="k">Total {span} j</dt><dd class="tabular">{fmt(total, def.dec)}<small>{def.unit}</small></dd></div>
        <div><dt class="k">Meilleur jour</dt><dd class="tabular">{best ? fmt(best.v) : '–'}<small>{best ? dayName(best.day) : ''}</small></dd></div>
        <div><dt class="k">{def.goal ? 'Objectif atteint' : 'Jours actifs'}</dt><dd class="tabular">{def.goal ? known.filter((v) => v >= def.goal!).length : known.filter((v) => v > 0).length}<small>/ {span} j</small></dd></div>
      {:else}
        <div><dt class="k">Moyenne</dt><dd class="tabular">{avg != null ? fmt(avg) : '–'}<small>{def.unit}</small></dd></div>
        <div><dt class="k">{def.low ? 'Plus bas' : 'Plus haut'}</dt><dd class="tabular">{best ? fmt(best.v) : '–'}<small>{best ? dayName(best.day) : ''}</small></dd></div>
        <div><dt class="k">Écart</dt><dd class="tabular">{known.length ? `${fmt(min)}–${fmt(max)}` : '–'}</dd></div>
      {/if}
    </dl>

    {#if metric === 'runs'}
      <h3 class="k list-h">Sorties reçues de Santé</h3>
      {#if runs.length}
        <ul class="list">
          {#each runs as w, i (w.start + i)}
            <li>
              <span class="emo" aria-hidden="true">{w.sport === 'ride' ? '🚴' : w.sport === 'walk' ? '🥾' : '🏃'}</span>
              <span class="lt">
                <b class="tabular">{fmt(w.distance / 1000, 1)}{NNBSP}km<span class="sub"> · {dur(w.time)}{w.sport !== 'ride' ? ` · ${pace(w.distance, w.time)}` : ''}</span></b>
                <span class="k">{dayName(w.day)}{w.kcal ? ` · 🔥 ${w.kcal}${NNBSP}kcal` : ''}{appName(w.source) ? ` · via ${appName(w.source)}` : ''}</span>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty k">Aucune sortie reçue ces 28 jours.</p>
      {/if}
    {:else}
      <h3 class="k list-h">Jour par jour</h3>
      <ul class="list">
        {#each [...shownDays].reverse() as d, j (d.day)}
          {@const i = shownDays.length - 1 - j}
          {@const v = shown[i]}
          <li class:on={pick === i}>
            <span class="lt"><span>{dayName(d.day)}</span></span>
            {#if def.sum && v != null && max}<span class="mini" aria-hidden="true"><span style:width="{(v / max) * 100}%"></span></span>{/if}
            <b class="tabular val">{v != null ? fmt(v) : '–'}<small>{v != null ? def.unit : ''}</small></b>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="src k">Données de Santé{links.healthDays.at(-1)?.source === 'android' ? ' (Health Connect)' : ' (Apple Santé)'}, lues par l’app du téléphone.</p>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    /* Interface sombre sur photo : un voile à 60 % (32 % ne se voit pas sur du sombre). */
    background: rgba(0, 0, 0, 0.6);
    animation: fade 200ms var(--ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .sheet {
    position: fixed;
    z-index: 45;
    left: 8px;
    right: 8px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    height: min(86dvh, 760px);
    display: flex;
    flex-direction: column;
    border-radius: 32px;
    color: #fff;
    --g-bg: rgba(22, 23, 25, 0.9);
    --blur: 30px;
    overflow: hidden;
    contain: layout paint;
    animation: up 400ms var(--spring) backwards;
  }
  @keyframes up {
    from {
      opacity: 0;
      translate: 0 48px;
    }
  }
  @media (min-width: 860px) {
    .sheet {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      width: 480px;
      height: min(84dvh, 780px);
      translate: -50% -50%;
      animation: pop 460ms var(--spring) backwards;
    }
    @keyframes pop {
      from {
        opacity: 0;
        scale: 0.95;
      }
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 10px 20px;
  }
  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .x {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .chips {
    display: flex;
    gap: 6px;
    padding: 0 16px 10px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: none;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.86);
    background: rgba(255, 255, 255, 0.1);
    transition:
      background-color 200ms var(--ease-out),
      color 200ms var(--ease-out);
  }
  .chip.on {
    color: #1c1c1e;
    background: #fff;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 16px 16px;
    display: grid;
    align-content: start;
    gap: 14px;
  }
  .seg {
    justify-self: start;
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }
  .seg button {
    min-height: 30px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }
  .seg button.on {
    color: #1c1c1e;
    background: #fff;
  }
  .k {
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.66);
  }
  .hero {
    display: grid;
    gap: 2px;
    min-height: 92px;
  }
  .big {
    font-size: 2.75rem;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }
  .big small {
    margin-left: 6px;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.66);
    letter-spacing: 0;
  }
  .cap {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.72);
  }
  .trend {
    margin-left: 6px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }
  .trend.good {
    color: #30d158;
  }
  .trend.bad {
    color: #ff9f0a;
  }
  .chart {
    position: relative;
  }
  .chart svg {
    display: block;
    width: 100%;
    height: 150px;
    overflow: visible;
  }
  .bar {
    fill: color-mix(in srgb, var(--accent) 78%, white);
    opacity: 0.9;
    transform-box: fill-box;
    transform-origin: bottom;
    transition:
      opacity 200ms var(--ease-out),
      fill 200ms var(--ease-out);
    animation: grow 440ms var(--spring) calc(var(--i) * 14ms) backwards;
  }
  @keyframes grow {
    from {
      transform: scaleY(0.02);
    }
  }
  .bar.today {
    fill: var(--accent);
    opacity: 1;
  }
  .bar.on {
    fill: #fff;
    opacity: 1;
  }
  .bar.dim {
    opacity: 0.38;
  }
  .avg,
  .goal {
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }
  .avg {
    stroke: rgba(255, 255, 255, 0.55);
    stroke-dasharray: 4 4;
  }
  .goal {
    stroke: color-mix(in srgb, var(--accent) 60%, white);
    stroke-dasharray: 1 5;
    stroke-linecap: round;
    stroke-width: 2;
  }
  .curve {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.4;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .dot {
    fill: #1c1c1e;
    stroke: var(--accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    transition: r 200ms var(--spring);
  }
  .dot.on {
    fill: #fff;
  }
  .hits {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
  }
  .hit {
    position: relative;
    border-radius: 8px;
  }
  .hit:focus-visible {
    outline: 2px solid #fff;
  }
  .d {
    position: absolute;
    left: 50%;
    bottom: 0;
    translate: -50% 0;
    font-size: 0.6875rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
  }
  .hit.on .d {
    color: #fff;
  }
  .tiles {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .tiles > div {
    min-width: 0;
    padding: 10px 11px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.08);
  }
  .tiles dt {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .tiles dd {
    margin: 2px 0 0;
    font-size: 1.125rem;
    font-weight: 680;
    display: grid;
  }
  .tiles small {
    font-size: 0.6875rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list-h {
    margin: 4px 0 -6px 4px;
    font-weight: 600;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 8px 14px;
    font-size: 0.9375rem;
  }
  .list li + li {
    border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  }
  .list li.on {
    background: rgba(255, 255, 255, 0.1);
  }
  .lt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .lt .sub {
    font-weight: 500;
    color: rgba(255, 255, 255, 0.72);
  }
  .emo {
    font-size: 1.25rem;
  }
  .mini {
    width: 64px;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .mini span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }
  .val {
    min-width: 84px;
    text-align: right;
    font-weight: 650;
  }
  .val small {
    margin-left: 3px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }
  .empty {
    margin: 0;
  }
  .src {
    margin: 2px 4px 0;
    font-size: 0.75rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .scrim,
    .bar {
      animation: none;
    }
  }
</style>
