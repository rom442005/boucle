<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, type Detent } from '../lib/state.svelte';

  let { header, children, footer, label }: { header?: Snippet; children: Snippet; footer?: Snippet; label: string } = $props();

  let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
  let safeTop = $state(0);
  let headH = $state(0);
  let footH = $state(0);
  let probe: HTMLDivElement | undefined = $state();
  let dragH = $state<number | null>(null);

  const heights = $derived({
    peek: Math.max(150, Math.round(headH + footH + 10)),
    half: Math.round(Math.min(vh * 0.62, 600)),
    full: Math.round(vh - safeTop - 70),
  } satisfies Record<Detent, number>);

  const height = $derived(dragH ?? heights[app.detent]);

  $effect(() => {
    const onResize = () => {
      vh = window.visualViewport?.height ?? window.innerHeight;
      if (probe) safeTop = probe.offsetHeight;
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  });

  // Zone de carte masquée par le panneau : sert à cadrer les parcours.
  $effect(() => {
    if (app.wide) {
      app.padding = { top: 40, bottom: app.route ? 210 : 40, left: 384 + 40, right: 80 };
    } else if (dragH == null) {
      app.padding = { top: safeTop + 128, bottom: heights[app.detent] + 24, left: 28, right: 64 };
    }
  });

  let startY = 0;
  let startH = 0;
  let moved = false;
  let samples: { y: number; t: number }[] = [];

  function down(e: PointerEvent) {
    if (app.wide || (e.target as HTMLElement).closest('button:not(.handle), input, a, [role="slider"]')) return;
    startY = e.clientY;
    startH = height;
    moved = false;
    samples = [{ y: e.clientY, t: e.timeStamp }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const dy = startY - e.clientY;
    if (!moved && Math.abs(dy) < 6) return;
    moved = true;
    const min = heights.peek;
    const max = heights.full;
    let h = startH + dy;
    if (h > max) h = max + (h - max) * 0.25;
    if (h < min) h = min - (min - h) * 0.25;
    dragH = h;
    samples.push({ y: e.clientY, t: e.timeStamp });
    if (samples.length > 6) samples.shift();
  }
  function up(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    if (!moved) {
      if ((e.target as HTMLElement).closest('.handle')) cycle();
      return;
    }
    const a = samples[0];
    const b = samples[samples.length - 1];
    const v = b && a && b.t > a.t ? (a.y - b.y) / (b.t - a.t) : 0; // px/ms, positif vers le haut
    const projected = (dragH ?? height) + v * 160;
    const order: Detent[] = ['peek', 'half', 'full'];
    let best: Detent = app.detent;
    let bestD = Infinity;
    for (const d of order) {
      const dist = Math.abs(heights[d] - projected);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    app.detent = best;
    dragH = null;
  }
  function cycle() {
    app.detent = app.detent === 'peek' ? 'half' : app.detent === 'half' ? 'full' : 'half';
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      app.detent = app.detent === 'peek' ? 'half' : 'full';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      app.detent = app.detent === 'full' ? 'half' : 'peek';
    }
  }
</script>

<div class="probe" bind:this={probe} aria-hidden="true"></div>

<section
  class="panel glass glass-panel"
  class:wide={app.wide}
  class:dragging={dragH != null}
  style:height={app.wide ? undefined : `${height}px`}
  aria-label={label}
>
  <div
    class="top"
    role="group"
    aria-label="En-tête du panneau"
    bind:offsetHeight={headH}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    {#if !app.wide}
      <button
        type="button"
        class="handle"
        aria-label="Taille du panneau : {app.detent === 'peek' ? 'réduit' : app.detent === 'half' ? 'moyen' : 'agrandi'}. Flèches haut et bas pour changer."
        onkeydown={key}
      >
        <span></span>
      </button>
    {/if}
    {#if header}{@render header()}{/if}
  </div>
  <div class="body">
    {@render children()}
  </div>
  {#if footer}
    <div class="foot" bind:offsetHeight={footH}>
      {@render footer()}
    </div>
  {/if}
</section>

<style>
  .probe {
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: env(safe-area-inset-top, 0px);
    pointer-events: none;
    visibility: hidden;
  }
  .panel {
    position: fixed;
    z-index: 20;
    left: 8px;
    right: 8px;
    bottom: 8px;
    display: flex;
    flex-direction: column;
    border-radius: 30px 30px 40px 40px;
    overflow: hidden;
    transition: height 420ms var(--sheet-ease);
    will-change: height;
  }
  .panel.dragging {
    transition: none;
  }
  .panel.wide {
    top: 12px;
    left: 12px;
    bottom: 12px;
    right: auto;
    width: 384px;
    border-radius: 28px;
    transition: none;
  }
  .top {
    flex: none;
    touch-action: none;
    padding: 0 16px;
  }
  .wide .top {
    touch-action: auto;
    padding-top: 14px;
  }
  .handle {
    display: grid;
    place-items: center;
    width: 100%;
    height: 22px;
    cursor: grab;
  }
  .handle span {
    width: 38px;
    height: 5px;
    border-radius: 3px;
    background: var(--fill);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 4px 16px 16px;
  }
  .foot {
    flex: none;
    padding: 10px 16px max(14px, calc(var(--safe-bottom) - 6px));
    border-top: 0.5px solid var(--separator);
  }
  .wide .foot {
    padding-bottom: 16px;
  }
</style>
