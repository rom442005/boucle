<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { tactile } from '../lib/haptics';

  /*
   * Accueil (iPhone) : la carte seule et, au-dessus des onglets, le geste principal : « Faire une boucle »,
   * qui fait monter les réglages.
   */

  // La carte se cadre au-dessus du bouton et des onglets.
  $effect(() => {
    app.padding = { top: 60, bottom: 110 + app.tabbarH, left: 28, right: 64 };
  });
</script>

<nav class="home" aria-label="Accueil" style:--tabs="{app.tabbarH}px">
  <button use:tactile type="button" class="go" onclick={() => app.openComposer()}>
    <svg class="loop" viewBox="0 0 1024 1024" width="22" height="22" aria-hidden="true">
      <path d="M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z" fill="none" stroke="currentColor" stroke-width="92" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="318" cy="688" r="110" fill="currentColor" />
    </svg>
    Faire une boucle
  </button>
</nav>

<style>
  .home {
    position: fixed;
    z-index: 18;
    left: 50%;
    bottom: calc(var(--tabs, 0px) + 14px);
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: home-in 620ms var(--spring) both;
  }
  @keyframes home-in {
    from {
      opacity: 0;
      translate: -50% 40px;
      scale: 0.94;
    }
  }
  /* Le geste principal : une capsule rose, la boucle de l'icône en tête. */
  .go {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 58px;
    padding: 0 24px 0 20px;
    white-space: nowrap;
    border-radius: 999px;
    color: var(--on-tint);
    font-weight: 650;
    font-size: 1.0625rem;
    letter-spacing: -0.01em;
    background:
      radial-gradient(120% 140% at 30% -40%, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0) 55%),
      var(--tint);
    box-shadow:
      0 14px 30px -12px color-mix(in srgb, var(--tint) 85%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    transition:
      transform 260ms var(--spring),
      filter 200ms var(--ease-out);
  }
  .go:active {
    transform: scale(0.95);
    filter: brightness(0.94);
  }
  .loop {
    animation: loop-turn 2.4s var(--ease-out) 700ms both;
  }
  @keyframes loop-turn {
    from {
      rotate: -90deg;
      opacity: 0;
    }
  }
</style>
