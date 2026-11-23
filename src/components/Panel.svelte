<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, type Detent } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { reducedMotion } from '../lib/motion';

  let {
    header,
    children,
    footer,
    label,
    onswipe,
    solid = false,
    photo = null,
    centered = false,
    headless = false,
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
    /** Mac : Communauté, Mes parcours et profils au centre de l'écran (la colonne y glisse) */
    centered?: boolean;
    /** iPhone : pas d'en-tête du tout (onglets principaux sur la photo, le premier bloc tout en haut) */
    headless?: boolean;
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
  /**
   * iPhone, sur la photo (Communauté, Mes parcours, profils, connexion, réglages) : plein écran, sans poignée.
   * Le premier bloc est tout en haut et le contenu défile sous la barre d'onglets, qui flotte en verre
   * (comme les barres d'iOS 26) : plus de bande inutilisée en bas.
   */
  const fullscreen = $derived(!app.wide && photo === 'cards');
  /**
   * Hauteur du pied réellement affiché : la mesure d'un pied disparu (le bouton « Créer la boucle » des réglages)
   * resterait sinon en mémoire et laisserait une bande vide grise en bas du panneau replié.
   */
  const foot = $derived(footer ? footH : 0);
  const heights = $derived({
    // Replié : juste la ligne du résumé (et le pied s'il y en a un), sans bande vide dessous.
    peek: foot ? Math.max(110, Math.round(headH + foot)) : Math.max(64, Math.round(headH + 10)),
    half: foldH ? Math.round(Math.min(headH + foldH + foot, vh * 0.66)) : Math.round(Math.min(vh * 0.62, 600)),
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

  // Nouvel écran dans le même panneau (un parcours ouvert depuis le fil, une autre proposition) : il
  // commence en haut, pas à la hauteur où la liste précédente était défilée.
  $effect(() => {
    void app.phase;
    void app.route?.id;
    void app.detailFrom;
    const el = body;
    if (el) el.scrollTop = 0;
  });

  /*
   * Mac : la colonne glisse vers le centre (Communauté, Mes parcours, profils) ou en revient, sur un ressort et
   * par un simple déplacement que la carte graphique joue seule ; sa largeur change d'un coup, son contenu
   * entre bloc par bloc. Pendant un fondu (View Transitions), c'est la transition qui la déplace.
   */
  let panelEl = $state<HTMLElement>();
  let leftBefore: number | null = null;
  $effect.pre(() => {
    void centered;
    if (panelEl && app.wide) leftBefore = panelEl.getBoundingClientRect().left;
  });
  $effect(() => {
    void centered;
    const el = panelEl;
    const before = leftBefore;
    leftBefore = null;
    if (!el || !app.wide || before == null) return;
    const dx = before - el.getBoundingClientRect().left;
    if (Math.abs(dx) < 2 || document.documentElement.classList.contains('vt') || reducedMotion()) return;
    el.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 620, easing: 'cubic-bezier(0.2, 1.08, 0.3, 1)' });
  });

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
      app.padding = { top: 100, bottom: app.route ? 210 : 40, left: centered ? 40 : 384 + 40, right: 80 };
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
    if (app.wide || fullscreen || (e.target as HTMLElement).closest('button:not(.handle), input, a, [role="slider"]')) return;
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
  bind:this={panelEl}
  class="panel glass glass-panel"
  class:solid
  class:wide={app.wide}
  class:dragging={dragH != null}
  class:is-peek={!app.wide && app.detent === 'peek' && dragH == null}
  class:over-tabs={tabs > 0}
  class:on-photo={!!photo}
  class:bare={photo === 'cards'}
  class:centered={app.wide && centered}
  class:fullscreen
  style:height={app.wide || fullscreen ? undefined : `${height}px`}
  style:bottom={tabs && !fullscreen ? `${tabs + 6}px` : undefined}
  style:--tabs-h="{tabs}px"
  aria-label={label}
>
  {#if (header && !headless) || (!app.wide && !fullscreen)}
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
    {#if !app.wide && !fullscreen}
      <button use:tactile
        type="button"
        class="handle"
        aria-label="Taille du panneau : {app.detent === 'peek' ? 'réduit' : app.detent === 'half' ? 'moyen' : 'agrandi'}. Flèches haut et bas pour changer."
        onkeydown={key}
      >
        <span></span>
      </button>
    {/if}
    {#if header && !headless}{@render header()}{/if}
  </div>
  {/if}
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
    animation: panel-rise 640ms var(--sheet-ease) backwards;
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
  /*
   * iPhone, sur la carte (propositions, détail) : le panneau ouvert couvre le tracé rose, qui se lisait à
   * travers le texte. Un verre plus dense ; replié sur une ligne, il reste léger.
   */
  :global(.on-photo) .panel:not(.wide):not(.on-photo):not(.is-peek):not(.solid) {
    --g-bg: rgba(18, 18, 20, 0.74);
  }
  /* Mac : sous le menu fixe en haut au centre (App.svelte). */
  .panel.wide {
    top: 76px;
    left: 12px;
    bottom: 12px;
    right: auto;
    width: 384px;
    border-radius: 28px;
    /* La colonne change de place par un déplacement animé (script ci-dessus), pas par sa position. */
    transition: none;
  }
  /*
   * Créer (colonne de gauche) : toute la hauteur de la fenêtre dès que le menu, au centre, ne la recouvre pas
   * (fenêtre de 1 190 px de large ou plus).
   */
  @media (min-width: 1190px) {
    .panel.wide:not(.centered) {
      top: 12px;
    }
  }
  /* Communauté, Mes parcours, profils : la colonne glisse au centre de l'écran et s'élargit un peu. */
  .panel.wide.centered {
    left: calc(50% - 230px);
    width: 460px;
  }
  :global(html.vt) .panel {
    transition: none;
  }
  /*
   * Le panneau garde son identité pendant un changement d'onglet : il glisse d'une place à l'autre. Le nom
   * n'est posé que pendant la transition : en permanence, il isolerait le panneau et ses blocs de verre ne
   * verraient plus la photo derrière eux (plus de flou, texte difficile à lire).
   */
  :global(html.vt) .panel {
    view-transition-name: panel;
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
    /* Pas d'ancrage du défilement : un bloc chargé après coup (photos, commentaires) ne fait plus glisser le
       haut du contenu sous l'en-tête. */
    overflow-anchor: none;
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
  /* Pas de masque sur la zone qui défile : il couperait le verre des blocs de ce qu'il y a derrière (plus de flou). */
  .wide .foot,
  .over-tabs .foot {
    padding-bottom: 12px;
  }
  .panel.over-tabs {
    transition:
      height 620ms var(--sheet-ease),
      bottom 320ms var(--ease-out);
  }
  /* iPhone sur la photo : tout l'écran, du haut (sous l'heure) au bas (sous la barre d'onglets en verre). */
  .panel.fullscreen {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0;
    animation: panel-fade 420ms var(--ease-out) backwards;
  }
  @keyframes panel-fade {
    from {
      opacity: 0;
      translate: 0 18px;
    }
  }
  /* Le premier bloc un peu sous l'heure, hors du flou que l'iPhone pose sous la barre d'état. */
  .fullscreen .top {
    padding-top: calc(var(--safe-top) + 14px);
  }
  .fullscreen > .body:first-child .body-in {
    padding-top: calc(var(--safe-top) + 22px);
  }
  .fullscreen .body-in {
    padding-bottom: calc(var(--tabs-h, 0px) + 24px);
  }
  .fullscreen .foot {
    padding-bottom: max(14px, calc(var(--safe-bottom) + 4px));
  }
</style>
