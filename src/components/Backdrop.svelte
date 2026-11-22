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

  function loaded(key: number) {
    layers = layers.map((l) => (l.key === key ? { ...l, ready: true } : l));
    // Une fois la nouvelle photo posée, l'ancienne s'en va.
    setTimeout(() => (layers = layers.filter((l) => l.key >= key)), 1400);
  }
</script>

<div class="backdrop" class:visible style:background={SCENES[current].tone} aria-hidden="true">
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
    transition:
      opacity 460ms var(--ease-out),
      visibility 0s linear 460ms,
      background-color 900ms var(--ease-out);
  }
  .backdrop.visible {
    opacity: 1;
    visibility: visible;
    transition:
      opacity 460ms var(--ease-out),
      visibility 0s,
      background-color 900ms var(--ease-out);
  }
  img {
    position: absolute;
    inset: -3%;
    width: 106%;
    height: 106%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 1200ms var(--ease-out);
    animation: drift 48s ease-in-out infinite alternate;
    animation-play-state: paused;
    will-change: transform, opacity;
  }
  .visible img {
    animation-play-state: running;
  }
  img.in {
    opacity: 1;
  }
  @keyframes drift {
    from {
      transform: scale(1) translate3d(0, 0, 0);
    }
    to {
      transform: scale(1.06) translate3d(-1.2%, -1%, 0);
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
