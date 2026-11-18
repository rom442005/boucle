<script lang="ts">
  import type { Route } from '../lib/types';
  import { app } from '../lib/state.svelte';
  import { eleAt, grades, RAMP } from '../lib/elevation';
  import { slopeRuns } from '../lib/routegeo';
  import { grade as fmtGrade, kmValue, NNBSP } from '../lib/format';

  /** readout : bulle flottante au-dessus du graphique (Mac) ou ligne d'en-tête (téléphone) */
  let { route, height = 128, readout = 'float' }: { route: Route; height?: number; readout?: 'float' | 'header' } = $props();

  let w = $state(320);
  const padL = 40;
  const padR = 10;
  const padT = 12;
  const padB = 22;

  const L = $derived(route.lengthM);
  const g = $derived(grades(route.profile));
  const domain = $derived.by(() => {
    const ele = route.profile.ele;
    const lo = Math.min(...ele);
    const hi = Math.max(...ele);
    const span = Math.max(hi - lo, 40);
    const mid = (hi + lo) / 2;
    return { min: mid - span * 0.58, max: mid + span * 0.62 };
  });
  const innerW = $derived(Math.max(10, w - padL - padR));
  const innerH = $derived(height - padT - padB);
  const base = $derived(padT + innerH);
  const x = (s: number) => padL + (Math.min(Math.max(s, 0), L) / L) * innerW;
  const y = (e: number) => padT + (1 - (e - domain.min) / (domain.max - domain.min)) * innerH;

  /** échantillons du profil (distance, altitude) */
  const samples = $derived.by(() => {
    const out: [number, number][] = [];
    const { ele, step } = route.profile;
    for (let i = 0; i < ele.length; i++) out.push([Math.min(i * step, L), ele[i]]);
    return out;
  });

  const areas = $derived.by(() =>
    slopeRuns(route).map((r) => {
      const pts: [number, number][] = [[r.a, eleAt(route.profile, r.a)]];
      for (const [s, e] of samples) if (s > r.a && s < r.b) pts.push([s, e]);
      pts.push([r.b, eleAt(route.profile, r.b)]);
      const d = `M${x(r.a).toFixed(1)},${base} ` + pts.map(([s, e]) => `L${x(s).toFixed(1)},${y(e).toFixed(1)}`).join(' ') + ` L${x(r.b).toFixed(1)},${base} Z`;
      return { d, color: RAMP[r.c] };
    }),
  );
  const line = $derived(samples.map(([s, e], i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(e).toFixed(1)}`).join(' '));

  function nice(span: number, target: number) {
    const raw = span / target;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
  }
  const yTicks = $derived.by(() => {
    const stepE = nice(domain.max - domain.min, 2.5);
    const out: number[] = [];
    for (let v = Math.ceil(domain.min / stepE) * stepE; v <= domain.max; v += stepE) out.push(v);
    return out;
  });
  const xTicks = $derived.by(() => {
    const km = L / 1000;
    const stepK = Math.max(0.5, nice(km, Math.max(2, Math.floor(innerW / 70))));
    const out: number[] = [];
    for (let v = 0; v <= km + 1e-6; v += stepK) out.push(v);
    return out;
  });

  const s = $derived(app.scrub);
  const tip = $derived.by(() => {
    if (s == null) return null;
    const e = eleAt(route.profile, s);
    const k = Math.min(g.length - 1, Math.max(0, Math.floor(s / route.profile.step)));
    return { x: x(s), y: y(e), km: kmValue(s), ele: Math.round(e), grade: g.length ? fmtGrade(g[k]) : '' };
  });

  let el: SVGSVGElement | undefined = $state();
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;

  function at(e: PointerEvent) {
    const rect = el!.getBoundingClientRect();
    const f = (e.clientX - rect.left - padL) / innerW;
    app.scrub = Math.min(1, Math.max(0, f)) * L;
  }
  function down(e: PointerEvent) {
    clearTimeout(releaseTimer);
    pressed = true;
    at(e);
  }
  function move(e: PointerEvent) {
    if (pressed || e.pointerType === 'mouse') at(e);
  }
  function up(e: PointerEvent) {
    pressed = false;
    if (e.pointerType !== 'mouse') releaseTimer = setTimeout(() => (app.scrub = null), 1800);
  }
  function leave(e: PointerEvent) {
    if (e.pointerType === 'mouse') app.scrub = null;
  }
  function key(e: KeyboardEvent) {
    const cur = app.scrub ?? 0;
    const map: Record<string, number> = { ArrowRight: L / 100, ArrowLeft: -L / 100, PageUp: L / 10, PageDown: -L / 10 };
    if (e.key in map) app.scrub = Math.min(L, Math.max(0, cur + map[e.key]));
    else if (e.key === 'Home') app.scrub = 0;
    else if (e.key === 'End') app.scrub = L;
    else if (e.key === 'Escape') app.scrub = null;
    else return;
    e.preventDefault();
  }
</script>

{#if readout === 'header'}
  <div class="head" aria-hidden="true">
    <span class="field-label">Profil</span>
    {#if tip}
      <span class="tabular live"><b>{tip.km}</b>{NNBSP}km · {tip.ele}{NNBSP}m · {tip.grade}</span>
    {:else}
      <span class="rest">Glisse le doigt pour parcourir</span>
    {/if}
  </div>
{/if}
<div class="profile" bind:clientWidth={w} style:height="{height}px">
  <svg
    bind:this={el}
    width={w}
    {height}
    role="slider"
    tabindex="0"
    aria-label="Profil d’altitude : de {route.minEle} à {route.maxEle} m, {route.ascent} m de montée. Flèches pour parcourir."
    aria-valuemin={0}
    aria-valuemax={Math.round(L)}
    aria-valuenow={Math.round(s ?? 0)}
    aria-valuetext={tip ? `${tip.km} kilomètre, altitude ${tip.ele} mètres, pente ${tip.grade}` : 'Début du parcours'}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={leave}
    onkeydown={key}
    onblur={() => (app.scrub = null)}
  >
    {#each yTicks as t (t)}
      <line class="grid" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
      <text class="ylab tabular" x={padL - 8} y={y(t) + 4} text-anchor="end">{Math.round(t)}{NNBSP}m</text>
    {/each}
    {#each areas as a, i (i)}
      <path d={a.d} fill={a.color} />
    {/each}
    <path class="edge" d={line} />
    {#each xTicks as t, i (t)}
      <text class="xlab tabular" x={x(t * 1000)} y={height - 6} text-anchor={i === 0 ? 'start' : 'middle'}>
        {t.toLocaleString('fr-FR')}{i === xTicks.length - 1 ? `${NNBSP}km` : ''}
      </text>
    {/each}
    {#if tip}
      <line class="cursor" x1={tip.x} x2={tip.x} y1={padT - 4} y2={base} />
      <circle class="knob" cx={tip.x} cy={tip.y} r="5.5" />
    {/if}
  </svg>
  {#if tip && readout === 'float'}
    <div class="tip glass" style:left="{Math.min(Math.max(tip.x, 70), w - 70)}px" aria-hidden="true">
      <span class="tabular"><b>{tip.km}</b>{NNBSP}km</span>
      <span class="sep"></span>
      <span class="tabular">{tip.ele}{NNBSP}m</span>
      <span class="sep"></span>
      <span class="tabular">{tip.grade}</span>
    </div>
  {/if}
</div>

<style>
  .profile {
    position: relative;
    width: 100%;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-height: 24px;
    margin-bottom: 4px;
  }
  .head .rest {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .head .live {
    font-size: 0.875rem;
    color: var(--label);
  }
  .head .live b {
    font-weight: 650;
  }
  svg {
    display: block;
    touch-action: pan-y;
    cursor: crosshair;
    overflow: visible;
  }
  svg:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tint) 60%, transparent);
    outline-offset: 4px;
    border-radius: 8px;
  }
  .grid {
    stroke: var(--separator);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .ylab,
  .xlab {
    font-size: 11px;
    fill: var(--label-2);
  }
  path {
    opacity: 0.9;
  }
  .edge {
    fill: none;
    stroke: var(--label);
    stroke-opacity: 0.55;
    stroke-width: 1.4;
    stroke-linejoin: round;
    opacity: 1;
  }
  .cursor {
    stroke: var(--label);
    stroke-width: 1.5;
    stroke-opacity: 0.7;
  }
  .knob {
    fill: #fff;
    stroke: var(--tint);
    stroke-width: 3;
  }
  .tip {
    position: absolute;
    top: -38px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.8125rem;
    white-space: nowrap;
    pointer-events: none;
    z-index: 5;
  }
  .tip b {
    font-weight: 650;
  }
  .sep {
    width: 1px;
    height: 12px;
    background: var(--separator);
  }
</style>
