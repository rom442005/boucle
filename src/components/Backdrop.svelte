<script lang="ts">
  import { onMount } from 'svelte';
  import { SCENES, SCENE_MS, sceneAt, sceneUrl, warmScene } from '../lib/scenes';

  /*
   * Un paysage en plein écran sous le verre. Toujours là, il apparaît et s'efface en fondu quand on passe
   * d'un écran à carte à un écran à photo (rien à recharger). Vingt photos tournent toutes les cinq minutes
   * en fondu enchaîné ; la suivante est téléchargée et décodée bien avant son tour. Elle dérive très
   * lentement, comme une prise de vue en drone (à l'arrêt quand elle est cachée ou si l'on réduit les
   * animations).
   */
  let { visible }: { visible: boolean } = $props();

  let current = $state(sceneAt());
  /** photos affichées : la précédente reste dessous le temps du fondu */
  let layers = $state<{ i: number; key: number; ready: boolean }[]>([{ i: sceneAt(), key: 0, ready: false }]);
  let nextKey = 1;

  function show(i: number) {
    if (i === current) return;
    current = i;
    layers = [...layers.slice(-1), { i, key: nextKey++, ready: false }];
  }

  onMount(() => {
    warmScene(current);
    let warmTimer: ReturnType<typeof setTimeout>;
    let turnTimer: ReturnType<typeof setTimeout>;
    const plan = () => {
      const left = SCENE_MS - (Date.now() % SCENE_MS);
      // La suivante se prépare 40 s avant son tour.
      warmTimer = setTimeout(() => warmScene(sceneAt(Date.now() + SCENE_MS)), Math.max(0, left - 40000));
      turnTimer = setTimeout(() => {
        show(sceneAt());
        plan();
      }, left + 50);
    };
    plan();
    // Retour sur l'app après une pause : la photo du moment.
    const onVis = () => document.visibilityState === 'visible' && show(sceneAt());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(warmTimer);
      clearTimeout(turnTimer);
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  // Mac (souris) : la photo glisse un peu à l'opposé du pointeur, comme un paysage vu avec de la profondeur.
  let px = $state(0);
  let py = $state(0);
  onMount(() => {
    if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        px = -(e.clientX / innerWidth - 0.5) * 18;
        py = -(e.clientY / innerHeight - 0.5) * 12;
      });
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
    };
  });

  function loaded(key: number) {
    layers = layers.map((l) => (l.key === key ? { ...l, ready: true } : l));
    // Une fois la nouvelle photo posée, l'ancienne s'en va.
    setTimeout(() => (layers = layers.filter((l) => l.key >= key)), 1400);
  }
</script>

<div class="backdrop" class:visible style:background={SCENES[current].tone} aria-hidden="true">
  <div class="par" style:transform="translate3d({px}px, {py}px, 0)">
    {#each layers as l (l.key)}
      <img
        src={sceneUrl(l.i)}
        alt=""
        decoding="async"
        fetchpriority="high"
        class:in={l.ready}
        onload={() => loaded(l.key)}
      />
    {/each}
  </div>
  <div class="veil"></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 6;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    /* Fil rouge : la photo se dissout dans la carte en perdant sa netteté, et revient en faisant le point. */
    filter: blur(18px);
    transition:
      opacity 460ms var(--ease-out),
      filter 520ms var(--ease-out),
      visibility 0s linear 520ms,
      background-color 900ms var(--ease-out);
  }
  .backdrop.visible {
    opacity: 1;
    visibility: visible;
    filter: none;
    transition:
      opacity 460ms var(--ease-out),
      filter 620ms var(--ease-out),
      visibility 0s,
      background-color 900ms var(--ease-out);
  }
  .par {
    position: absolute;
    inset: 0;
    transition: transform 1100ms var(--ease-out);
    will-change: transform;
  }
  img {
    position: absolute;
    inset: -3%;
    width: 106%;
    height: 106%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 1200ms var(--ease-out);
    /* Un mouvement de caméra lent mais visible (Romain : « moins statiques ») : zoom et glissement, aller-retour. */
    animation: drift 28s ease-in-out infinite alternate;
    animation-play-state: paused;
    will-change: transform, opacity;
  }
  .visible img {
    animation-play-state: running;
  }
  img.in {
    opacity: 1;
  }
  /*
   * Zoom de 6 % au plus : avec la marge de 6 %, la photo n'est jamais agrandie au-delà de ce que ses pixels
   * permettent (SCENE_OVERSCAN, scenes.ts), elle reste nette même sur un écran ultra-large.
   */
  @keyframes drift {
    0% {
      transform: scale(1) translate3d(1.4%, 0.9%, 0);
    }
    50% {
      transform: scale(1.035) translate3d(-0.3%, -0.2%, 0);
    }
    100% {
      transform: scale(1.06) translate3d(-1.4%, -0.9%, 0);
    }
  }
  .veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0) 22%),
      linear-gradient(to top, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0) 46%);
  }
  @media (prefers-reduced-motion: reduce) {
    img {
      animation: none;
    }
  }
</style>
