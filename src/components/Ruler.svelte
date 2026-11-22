<script lang="ts">
  import { untrack } from 'svelte';
  import RollingNumber from './RollingNumber.svelte';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Règle graduée (Romain : les curseurs « manquaient cruellement de précision ») : la valeur s'écrit en grand
   * au-dessus, la règle glisse sous un repère fixe au centre et ses deux bouts s'estompent dans un flou. On la
   * fait glisser du doigt ou à la souris, avec de l'élan, puis elle se pose sur une graduation ; un toucher
   * l'amène à l'endroit touché. Sur Mac aussi au pavé tactile (geste horizontal), partout aux flèches du
   * clavier. Un tic à chaque graduation chiffrée franchie.
   */
  let {
    id,
    label,
    value,
    min,
    max,
    step,
    mid,
    every,
    display,
    unit,
    valuetext,
    off = false,
    offText = 'Indifférent',
    onchange,
    onreset,
  }: {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    /** valeur d'une graduation */
    step: number;
    /** graduation moyenne, et graduation chiffrée (en unités de la valeur) */
    mid: number;
    every: number;
    display: string;
    unit: string;
    valuetext: string;
    /** état « indifférent » : la règle est grisée jusqu'au premier geste */
    off?: boolean;
    offText?: string;
    onchange: (v: number) => void;
    onreset?: () => void;
  } = $props();

  /** écart entre deux graduations (px) */
  const GAP = 9;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  /** la graduation la plus proche */
  const snap = (v: number) => clamp(+(min + Math.round((clamp(v) - min) / step) * step).toFixed(6));
  const px = (v: number) => ((v - min) / step) * GAP;

  let width = $state(0);
  /** valeur sous le repère, en continu (la règle glisse entre les graduations) */
  let pos = $state(untrack(() => (off ? min : value)));
  let grabbing = $state(false);
  /** un geste ou un élan est en cours : la valeur reçue du parent ne déplace pas la règle */
  let busy = false;
  let sent = untrack(() => value);
  let raf = 0;
  /** valeur visée par le glissement en cours (un appui de touche repart d'elle, pas d'un point de passage) */
  let aim: number | null = null;

  // Valeur changée d'ailleurs (changement de sport, remise à « indifférent ») : la règle y glisse, même si un
  // glissement précédent n'est pas fini. L'écho d'une valeur qu'elle vient d'envoyer ne la déplace pas.
  $effect(() => {
    const v = off ? min : value;
    untrack(() => {
      if (v !== sent) {
        if (Math.abs(v - pos) > step / 2) glide(v, 140, false);
        else pos = v;
      }
    });
    sent = v;
  });

  /** La règle se place sur `v` ; la valeur arrondie part au parent dès qu'elle change, avec un tic. */
  function place(v: number, send = true) {
    pos = clamp(v);
    if (!send) return;
    const s = snap(pos);
    if (s === sent) return;
    const crossed = Math.floor((s - min) / every + 1e-9) !== Math.floor((sent - min) / every + 1e-9);
    if (s === min || s === max) haptic('tap');
    else if (crossed) haptic('tick');
    sent = s;
    onchange(s);
  }

  function stopGlide() {
    cancelAnimationFrame(raf);
    raf = 0;
    aim = null;
  }
  /** Glisse jusqu'à `to` en ralentissant (approche exponentielle, constante de temps `tau` en ms). */
  function glide(to: number, tau: number, send = true) {
    stopGlide();
    const target = snap(to);
    aim = target;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      aim = null;
      place(target, send);
      busy = false;
      return;
    }
    busy = true;
    const from = pos;
    const t0 = performance.now();
    const frame = () => {
      const t = performance.now() - t0;
      const v = target + (from - target) * Math.exp(-t / tau);
      if (Math.abs(px(v) - px(target)) < 0.25) {
        place(target, send);
        busy = false;
        raf = 0;
        aim = null;
        return;
      }
      place(v, send);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // Glisser : la règle suit le doigt, puis garde son élan et se pose sur une graduation.
  let pointer = -1;
  let x0 = 0;
  let p0 = 0;
  let moved = false;
  let samples: { x: number; t: number }[] = [];
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    stopGlide();
    busy = true;
    pointer = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    x0 = e.clientX;
    p0 = pos;
    moved = false;
    samples = [{ x: e.clientX, t: e.timeStamp }];
  }
  function move(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - x0;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true;
    grabbing = true;
    place(p0 - (dx / GAP) * step);
    samples.push({ x: e.clientX, t: e.timeStamp });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 90) samples.shift();
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    grabbing = false;
    const el = e.currentTarget as HTMLElement;
    if (!moved) {
      // Toucher : la règle amène la graduation touchée sous le repère.
      if (e.type === 'pointercancel') return void (busy = false);
      const r = el.getBoundingClientRect();
      glide(pos + ((e.clientX - (r.left + r.width / 2)) / GAP) * step, 110);
      return;
    }
    // Vitesse des 100 dernières ms avant le lever : un doigt arrêté avant de se lever ne lance rien.
    const recent = samples.filter((p) => e.timeStamp - p.t < 100);
    const a = recent[0];
    const b = recent[recent.length - 1];
    const v = a && b && b.t > a.t && e.timeStamp - b.t < 60 ? (b.x - a.x) / (b.t - a.t) : 0; // px/ms
    // Élan : un geste lancé continue sur sa lancée (comme une liste d'iOS) ; un glissé lent et précis reste
    // où le doigt l'a laissé. Dans les deux cas, la règle se pose sur une graduation.
    const thrown = Math.abs(v) >= 0.35;
    glide(pos - ((thrown ? v * 260 : 0) / GAP) * step, thrown ? 260 : 110);
  }

  // Pavé tactile du Mac (geste horizontal) : la règle défile, puis se pose sur une graduation.
  function wheel(node: HTMLElement) {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!d) return;
      e.preventDefault();
      stopGlide();
      busy = true;
      place(pos + (d / GAP) * step);
      clearTimeout(timer);
      timer = setTimeout(() => glide(pos, 90), 120);
    };
    node.addEventListener('wheel', on, { passive: false });
    return () => {
      clearTimeout(timer);
      node.removeEventListener('wheel', on);
    };
  }

  function key(e: KeyboardEvent) {
    const base = aim ?? (busy ? snap(pos) : off ? min : value);
    const k: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: every, PageDown: -every };
    let to: number | null = null;
    if (e.key in k) to = base + k[e.key];
    else if (e.key === 'Home') to = min;
    else if (e.key === 'End') to = max;
    if (to == null) return;
    e.preventDefault();
    glide(to, 70);
  }

  $effect(() => () => stopGlide());

  // Graduations : trois motifs répétés (fine, moyenne, chiffrée), calés sur les bonnes valeurs.
  const midW = $derived((mid / step) * GAP);
  const majW = $derived((every / step) * GAP);
  const midOff = $derived(px(Math.ceil(min / mid - 1e-9) * mid));
  const majOff = $derived(px(Math.ceil(min / every - 1e-9) * every));
  const labels = $derived.by(() => {
    const out: number[] = [];
    for (let v = Math.ceil(min / every - 1e-9) * every; v <= max + 1e-9; v += every) out.push(+v.toFixed(6));
    return out;
  });
  const fmt = (v: number) => v.toLocaleString('fr-FR');
</script>

<div class="field">
  <div class="head">
    <span class="field-label" id="{id}-l">{label}</span>
    <div class="value">
      {#if off}
        <span class="off" aria-hidden="true">{offText}</span>
      {:else}
        <span class="num rounded" aria-hidden="true"><RollingNumber value={display} /></span><span class="unit" aria-hidden="true">{unit}</span>
        {#if onreset}
          <button use:tactile type="button" class="reset" onclick={onreset} aria-label="Remettre {label.toLowerCase()} sur indifférent">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".18" /><path d="M5.5 5.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
        {/if}
      {/if}
    </div>
  </div>
  <div
    {id}
    class="ruler"
    class:is-off={off}
    class:grabbing
    role="slider"
    tabindex="0"
    aria-labelledby="{id}-l"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={off ? undefined : value}
    aria-valuetext={off ? offText : valuetext}
    bind:clientWidth={width}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
    {@attach wheel}
  >
    <div class="track" style:width="{px(max)}px" style:transform="translate3d({(width / 2 - px(pos)).toFixed(2)}px, 0, 0)">
      <div
        class="ticks"
        style:background-size="{majW}px 22px, {midW}px 15px, {GAP}px 9px"
        style:background-position="{majOff - 1}px 0, {midOff - 0.5}px 0, 0 0"
      ></div>
      {#each labels as v (v)}
        <span class="lb tabular" style:left="{px(v)}px">{fmt(v)}</span>
      {/each}
    </div>
    <span class="edge l" aria-hidden="true"></span>
    <span class="edge r" aria-hidden="true"></span>
    <span class="mark" aria-hidden="true"></span>
  </div>
</div>

<style>
  .field {
    display: grid;
    gap: 4px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .num {
    font-size: 2.125rem;
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1;
  }
  .unit {
    font-size: 1rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .off {
    font-size: 1.0625rem;
    font-weight: 500;
    color: var(--label-2);
    line-height: 34px;
  }
  .reset {
    align-self: center;
    margin-left: 6px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: var(--label-2);
    border-radius: 50%;
  }
  .ruler {
    position: relative;
    height: 46px;
    overflow: hidden;
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    border-radius: 12px;
    outline-offset: 2px;
    /* Les deux bouts s'estompent. */
    -webkit-mask-image: linear-gradient(to right, transparent, #000 20%, #000 80%, transparent);
    mask-image: linear-gradient(to right, transparent, #000 20%, #000 80%, transparent);
  }
  .ruler.grabbing {
    cursor: grabbing;
  }
  .ruler:focus-visible {
    outline: none;
  }
  /* Au clavier, le repère s'épaissit (le contour serait rogné par le fondu des bouts). */
  .ruler:focus-visible .mark {
    width: 5px;
    margin-left: -2.5px;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--tint) 30%, transparent),
      0 0 12px color-mix(in srgb, var(--tint) 80%, transparent);
  }
  /* À l'apparition, la règle glisse en place et le repère se dresse. */
  .track {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    will-change: transform;
    animation: ruler-in 760ms var(--spring) 160ms backwards;
  }
  @keyframes ruler-in {
    from {
      opacity: 0;
      translate: 48px 0;
    }
  }
  .ticks {
    position: absolute;
    top: 4px;
    left: 0;
    right: 0;
    height: 22px;
    background-image:
      linear-gradient(to right, var(--tick-3, var(--label)) 0 2px, transparent 2px),
      linear-gradient(to right, var(--tick-2, var(--label-2)) 0 1.5px, transparent 1.5px),
      linear-gradient(to right, var(--tick-1, var(--label-3)) 0 1px, transparent 1px);
    background-repeat: repeat-x;
  }
  .lb {
    position: absolute;
    top: 29px;
    translate: -50% 0;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
    color: var(--label-2);
    white-space: nowrap;
  }
  /* Le repère : un trait rose lumineux au centre, la valeur choisie. */
  .mark {
    position: absolute;
    top: 0;
    left: 50%;
    width: 3px;
    height: 30px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: var(--tint);
    box-shadow: 0 0 10px color-mix(in srgb, var(--tint) 70%, transparent);
    transition: opacity 200ms var(--ease-out);
    transform-origin: top;
    animation: mark-in 520ms var(--spring-bouncy) 420ms backwards;
  }
  @keyframes mark-in {
    from {
      transform: scaleY(0);
    }
  }
  /* Flou progressif vers les bouts : les graduations s'y perdent comme derrière du verre dépoli. */
  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 26%;
    pointer-events: none;
    -webkit-backdrop-filter: blur(2.5px);
    backdrop-filter: blur(2.5px);
  }
  .edge.l {
    left: 0;
    -webkit-mask-image: linear-gradient(to right, #000, transparent);
    mask-image: linear-gradient(to right, #000, transparent);
  }
  .edge.r {
    right: 0;
    -webkit-mask-image: linear-gradient(to left, #000, transparent);
    mask-image: linear-gradient(to left, #000, transparent);
  }
  .is-off .track {
    opacity: 0.45;
  }
  .is-off .mark {
    opacity: 0.5;
  }
  /* iPhone : chiffre net et moins haut, libellé discret. */
  @media (max-width: 859px) {
    .head {
      min-height: 28px;
      align-items: flex-end;
    }
    .num {
      font-size: 1.625rem;
      font-weight: 700;
    }
    .unit {
      font-size: 0.8125rem;
    }
    .off {
      font-size: 0.9375rem;
      line-height: 26px;
    }
    .reset {
      width: 26px;
      height: 26px;
      margin-left: 4px;
    }
  }
</style>
