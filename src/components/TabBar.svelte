<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import { app } from '../lib/state.svelte';
  import { community } from '../lib/community.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { smoothly } from '../lib/motion';

  /*
   * iPhone : quatre onglets en bas de l'écran (Créer, Communauté, Mes parcours, Profil) dans une capsule de
   * verre qui flotte ; le contenu défile dessous. À côté, la bulle rose « Faire une boucle », comme la bulle
   * de recherche des apps d'iOS 26 : une seule ligne en bas, le reste de l'écran pour la carte et les blocs.
   * L'onglet choisi est une bulle de verre liquide : elle s'étire vers son nouvel onglet puis se resserre
   * (comme Deezer), et grossit sous le doigt.
   */
  let {
    active,
    onphoto = false,
    action = false,
  }: { active: 'create' | 'community' | 'library' | 'profile'; onphoto?: boolean; action?: boolean } = $props();

  let h = $state(0);
  let el = $state<HTMLElement>();
  let pill = $state<HTMLElement>();
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Place occupée en bas de l'écran (barre et marge sous elle, zone du geste comprise) : le contenu s'y arrête.
  $effect(() => {
    void h;
    if (el) app.tabbarH = Math.round(h + parseFloat(getComputedStyle(el).bottom || '0'));
    return () => (app.tabbarH = 0);
  });

  const TABS = ['create', 'community', 'library', 'profile'] as const;
  const LABEL = { create: 'Créer', community: 'Communauté', library: 'Mes parcours', profile: 'Profil' } as const;
  const ICON = { create: 'path', community: 'users', library: 'bookmark', profile: 'user' } as const;

  // La bulle liquide : en changeant d'onglet, elle s'étire dans le sens du trajet, puis se resserre en place.
  let prev = -1;
  $effect(() => {
    const i = TABS.indexOf(active);
    if (prev >= 0 && prev !== i && pill && !reduce) {
      pill.animate(
        [
          { scale: '1 1', offset: 0 },
          { scale: '1.36 1.12', offset: 0.3 },
          { scale: '0.92 1.05', offset: 0.66 },
          { scale: '1.02 0.99', offset: 0.84 },
          { scale: '1 1', offset: 1 },
        ],
        { duration: 640, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    prev = i;
  });
  /** Sous le doigt, la bulle de l'onglet allumé grossit ; au relâché, elle revient avec un rebond. */
  function press(t: typeof active) {
    if (t !== active || !pill || reduce) return;
    pill.animate([{ scale: '1 1' }, { scale: '1.14 1.1' }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
  }
  function release() {
    if (!pill || reduce) return;
    pill.animate([{ scale: getComputedStyle(pill).scale === 'none' ? '1 1' : getComputedStyle(pill).scale }, { scale: '1 1' }], {
      duration: 460,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      fill: 'forwards',
    });
  }

  function go(t: typeof active) {
    if (t !== active) haptic('tap');
    smoothly(() => change(t));
  }
  function change(t: typeof active) {
    community.sheet = null;
    if (t === 'create') {
      if (app.phase !== 'compose') app.closeLibrary();
      else app.home = true;
    } else if (t === 'community') community.open();
    else if (t === 'library') app.openLibrary();
    else community.openMe();
  }
  /** La bulle rose : les réglages d'une nouvelle boucle, depuis n'importe quel onglet. */
  function compose() {
    smoothly(() => {
      community.sheet = null;
      if (app.phase !== 'compose') app.closeLibrary();
      app.openComposer();
    });
  }
</script>

<div class="dock" class:on-photo={onphoto} bind:offsetHeight={h} bind:this={el}>
  <nav class="tabbar glass" aria-label="Sections" style:--at={TABS.indexOf(active)}>
    <span class="pill-on" bind:this={pill} aria-hidden="true"></span>
    {#each TABS as t (t)}
      <button
        use:tactile
        type="button"
        class="tab"
        class:on={active === t}
        aria-label={LABEL[t]}
        title={LABEL[t]}
        aria-current={active === t ? 'page' : undefined}
        onpointerdown={() => press(t)}
        onpointerup={release}
        onpointercancel={release}
        onpointerleave={release}
        onclick={() => go(t)}
      >
        {#if t === 'profile' && community.me}
          <span class="av" class:ring={active === t}><Avatar id={community.me.id} name={community.me.firstName} src={community.me.avatar} size={28} /></span>
        {:else}
          <Icon name={ICON[t]} size={25} fill={active === t} />
        {/if}
      </button>
    {/each}
  </nav>
  <button use:tactile type="button" class="act" class:off={!action} aria-label="Faire une boucle" title="Faire une boucle" tabindex={action ? 0 : -1} aria-hidden={!action} onclick={compose}>
    <svg class="loop" viewBox="0 0 1024 1024" width="26" height="26" aria-hidden="true">
      <path d="M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z" fill="none" stroke="currentColor" stroke-width="92" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="318" cy="688" r="110" fill="currentColor" />
    </svg>
  </button>
</div>

<style>
  /* Une seule ligne qui flotte au-dessus du bas de l'écran : la capsule des onglets, puis la bulle rose. */
  .dock {
    position: fixed;
    z-index: 22;
    left: 0;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 16px;
    pointer-events: none;
    animation: bar-in 560ms var(--spring) both;
  }
  .dock > * {
    pointer-events: auto;
  }
  @keyframes bar-in {
    from {
      translate: 0 140%;
    }
  }
  .tabbar {
    position: relative;
    flex: 1 1 auto;
    max-width: 360px;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px;
    border-radius: 999px;
  }
  /* La bulle de l'onglet allumé : une lentille de verre qui éclaire ce qu'elle couvre. */
  .pill-on {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 6px;
    width: calc((100% - 12px) / 4);
    border-radius: 999px;
    background: var(--tint-soft);
    translate: calc(var(--at) * 100%) 0;
    transition: translate 560ms var(--spring-bouncy);
    transform-origin: center;
  }
  .on-photo .pill-on {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.12));
    box-shadow:
      inset 0 1px 0.5px rgba(255, 255, 255, 0.72),
      inset 0 -1px 1px rgba(255, 255, 255, 0.14),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.18),
      0 6px 16px -8px rgba(0, 0, 0, 0.5);
    -webkit-backdrop-filter: blur(4px) saturate(1.9) brightness(1.12);
    backdrop-filter: blur(4px) saturate(1.9) brightness(1.12);
  }
  .tab {
    position: relative;
    display: grid;
    place-items: center;
    height: 50px;
    color: var(--label-2);
    transition: color 220ms var(--ease-out);
  }
  .tab :global(.icon) {
    transition: transform 360ms var(--spring-bouncy);
  }
  .tab:active :global(.icon),
  .tab:active .av {
    transform: scale(0.86);
  }
  .tab.on {
    color: var(--tint);
  }
  .on-photo .tab.on {
    color: #fff;
  }
  .on-photo .tab :global(.icon) {
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.35));
  }
  .tab.on :global(.icon) {
    animation: tab-pop 480ms var(--spring-bouncy);
  }
  @keyframes tab-pop {
    40% {
      transform: scale(1.2);
    }
  }
  .av {
    display: grid;
    border-radius: 50%;
    padding: 2px;
    transition: transform 360ms var(--spring-bouncy);
  }
  .av.ring {
    box-shadow: 0 0 0 2px var(--tint);
  }
  .on-photo .av.ring {
    box-shadow: 0 0 0 2px #fff;
  }
  /* La bulle rose : du verre liquide teinté, un reflet en haut ; elle se replie quand elle n'a rien à faire. */
  .act {
    flex: none;
    width: 62px;
    height: 62px;
    margin-left: 10px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 58%),
      radial-gradient(120% 120% at 70% 110%, color-mix(in srgb, var(--tint) 70%, #000), transparent 60%),
      var(--tint);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.6),
      inset 0 -2px 6px rgba(0, 0, 0, 0.18),
      0 14px 28px -12px color-mix(in srgb, var(--tint) 90%, transparent);
    overflow: hidden;
    transition:
      width 420ms var(--spring),
      margin 420ms var(--spring),
      opacity 260ms var(--ease-out),
      transform 300ms var(--spring-bouncy);
  }
  .act:active {
    transform: scale(1.1);
  }
  .act.off {
    width: 0;
    margin-left: 0;
    opacity: 0;
    pointer-events: none;
  }
  .loop {
    flex: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
  }
  @media (prefers-reduced-motion: reduce) {
    .dock,
    .tab.on :global(.icon) {
      animation: none;
    }
    .pill-on,
    .act {
      transition: none;
    }
  }
</style>
