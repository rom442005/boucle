<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, type Detent } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';

  let {
    header,
    children,
    footer,
    label,
    onswipe,
    solid = false,
    photo = null,
  }: {
    header?: Snippet;
    children: Snippet;
    footer?: Snippet;
    label: string;
    /** balayage horizontal sur l'en-tête (iPhone) : 1 vers la gauche, -1 vers la droite */
    onswipe?: (dir: 1 | -1) => void;
    /** feuille opaque (réglages en plein écran) */
    solid?: boolean;
    /** sur un paysage : verre fumé (« sheet »), ou plus de feuille du tout, seulement des blocs de verre (« cards ») */
    photo?: 'sheet' | 'cards' | null;
  } = $props();

  let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
  let safeTop = $state(0);
  let headH = $state(0);
  let footH = $state(0);
  let probe: HTMLDivElement | undefined = $state();
  let body: HTMLDivElement | undefined = $state();
  let dragH = $state<number | null>(null);
  /** Hauteur du contenu jusqu'au repère [data-fold] : la position moyenne s'arrête juste en dessous. */
  let foldH = $state(0);

  /** barre d'onglets en bas (iPhone) : le panneau se pose au-dessus */
  const tabs = $derived(app.wide ? 0 : app.tabbarH);
  const heights = $derived({
    peek: Math.max(110, Math.round(headH + footH)),
    half: foldH ? Math.round(Math.min(headH + foldH + footH, vh * 0.66)) : Math.round(Math.min(vh * 0.62, 600)),
    // Les réglages prennent tout l'écran ; un parcours ou une liste laisse voir le haut de la carte.
    full: Math.round(vh - safeTop - (app.phase === 'compose' ? 10 : 70) - tabs),
  } satisfies Record<Detent, number>);

  // Mesure du repère (le contenu change selon l'étape et le sport).
  $effect(() => {
    void app.phase;
    const el = body;
    if (!el || app.wide) return;
    const measure = () => {
      const fold = el.querySelector<HTMLElement>('[data-fold]');
      if (!fold) {
        foldH = 0;
        return;
      }
      const top = fold.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop;
      foldH = Math.round(top + 14);
    };
    const ro = new ResizeObserver(measure);
    for (const c of el.children) ro.observe(c);
    measure();
    return () => ro.disconnect();
  });

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
      // Pendant la composition, la barre du départ occupe le haut ; ensuite, la carte est libre jusqu'en haut.
      const top = app.phase === 'compose' ? 128 : 40;
      // Parcours affiché : marges latérales plus larges pour que les pastilles des côtes tiennent à l'écran.
      const side = app.phase === 'results' || app.phase === 'detail' ? 64 : 28;
      app.padding = { top: safeTop + top, bottom: heights[app.detent] + 24 + tabs, left: side, right: 64 };
    }
  });

  let startY = 0;
  let startX = 0;
  let startH = 0;
  let moved = false;
  /** geste horizontal (changer de proposition) plutôt que vertical (taille du panneau) */
  let sideways = false;
  let samples: { y: number; t: number }[] = [];
  let frame = 0;
  let pendingH: number | null = null;
  /** Cible du toucher : avec la capture du pointeur, la cible de pointerup devient l'en-tête entier. */
  let downTarget: HTMLElement | null = null;

  function down(e: PointerEvent) {
    if (app.wide || (e.target as HTMLElement).closest('button:not(.handle), input, a, [role="slider"]')) return;
    downTarget = e.target as HTMLElement;
    startY = e.clientY;
    startX = e.clientX;
    startH = height;
    moved = false;
    sideways = false;
    samples = [{ y: e.clientY, t: e.timeStamp }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const dy = startY - e.clientY;
    const dx = e.clientX - startX;
    if (!moved) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 8) return;
      moved = true;
      sideways = !!onswipe && Math.abs(dx) > Math.abs(dy);
    }
    if (sideways) return;
    const min = heights.peek;
    const max = heights.full;
    let h = startH + dy;
    if (h > max) h = max + (h - max) * 0.25;
    if (h < min) h = min - (min - h) * 0.25;
    // Une mise à jour par image, pas par événement.
    pendingH = h;
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pendingH != null) dragH = pendingH;
      });
    samples.push({ y: e.clientY, t: e.timeStamp });
    if (samples.length > 6) samples.shift();
  }
  function up(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    cancelAnimationFrame(frame);
    frame = 0;
    pendingH = null;
    if (!moved) {
      if (downTarget?.closest('.handle, [data-toggle-sheet]')) cycle();
      return;
    }
    if (sideways) {
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 36) onswipe?.(dx < 0 ? 1 : -1);
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
    if (best !== app.detent) haptic('tick');
    app.detent = best;
    dragH = null;
  }
  function cycle() {
    app.detent = app.detent === 'peek' ? 'half' : app.detent === 'half' ? 'full' : 'half';
    haptic('tick');
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
  class:solid
  class:wide={app.wide}
  class:dragging={dragH != null}
  class:is-peek={!app.wide && app.detent === 'peek' && dragH == null}
  class:over-tabs={tabs > 0}
  class:on-photo={!!photo}
  class:bare={photo === 'cards'}
  style:height={app.wide ? undefined : `${height}px`}
  style:bottom={tabs ? `${tabs + 6}px` : undefined}
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
      <button use:tactile
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
  <div class="body" bind:this={body}>
    <div class="body-in">
      {@render children()}
    </div>
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
    /* Ressort : le panneau se pose avec un très léger rebond. */
    transition: height 620ms var(--sheet-ease);
    will-change: height;
    contain: layout paint;
    /* À l'ouverture, le panneau monte du bas de l'écran, avec un léger rebond. */
    animation: panel-rise 640ms var(--sheet-ease) both;
  }
  @keyframes panel-rise {
    from {
      translate: 0 104%;
    }
  }
  .panel.wide {
    animation-name: panel-slide;
  }
  @keyframes panel-slide {
    from {
      translate: calc(-100% - 24px) 0;
      opacity: 0;
    }
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
    height: 18px;
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
    transition: opacity 260ms var(--ease-out);
  }
  /* Marges dans un conteneur interne : replié, le panneau ne garde que l'en-tête et le bouton. */
  .body-in {
    padding: 4px 16px 16px;
  }
  /* Replié : le contenu s'efface pendant que le panneau descend. */
  .is-peek .body {
    opacity: 0;
    pointer-events: none;
  }
  .foot {
    flex: none;
    padding: 8px 14px max(12px, calc(var(--safe-bottom) - 8px));
    border-top: 0.5px solid var(--separator);
  }
  /* Sur un paysage, en blocs : la feuille disparaît, les réglages flottent en verre sur la photo. */
  .panel.bare {
    --g-bg: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }
  .panel.bare::before,
  .panel.bare::after {
    display: none;
  }
  .bare .top {
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
  }
  .bare .handle span {
    background: rgba(255, 255, 255, 0.55);
  }
  .bare .foot {
    border-top: none;
  }
  .wide .foot,
  .over-tabs .foot {
    padding-bottom: 12px;
  }
  .panel.over-tabs {
    transition:
      height 620ms var(--sheet-ease),
      bottom 320ms var(--ease-out);
  }
</style>
