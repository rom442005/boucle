<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import { app } from '../lib/state.svelte';
  import { community } from '../lib/community.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { smoothly } from '../lib/motion';

  /*
   * iPhone : quatre onglets en bas de l'écran, comme sur Strava. Créer (la carte et « Faire une boucle »),
   * la Communauté, Mes parcours, ton Profil. Le panneau se pose juste au-dessus.
   */
  let { active, onphoto = false }: { active: 'create' | 'community' | 'library' | 'profile'; onphoto?: boolean } = $props();

  let h = $state(0);
  let el = $state<HTMLElement>();
  // Place occupée en bas de l'écran (barre et marge sous elle, zone du geste comprise) : le panneau se pose au-dessus.
  $effect(() => {
    void h;
    if (el) app.tabbarH = Math.round(h + parseFloat(getComputedStyle(el).bottom || '0'));
    return () => (app.tabbarH = 0);
  });

  const TABS = ['create', 'community', 'library', 'profile'] as const;
  const LABEL = { create: 'Créer', community: 'Communauté', library: 'Mes parcours', profile: 'Profil' } as const;
  const ICON = { create: 'path', community: 'users', library: 'bookmark', profile: 'user' } as const;

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
</script>

<nav class="tabbar glass" class:on-photo={onphoto} aria-label="Sections" bind:offsetHeight={h} bind:this={el} style:--at={TABS.indexOf(active)}>
  <span class="pill-on" aria-hidden="true"></span>
  {#each TABS as t (t)}
    <button use:tactile type="button" class="tab" class:on={active === t} aria-label={LABEL[t]} title={LABEL[t]} aria-current={active === t ? 'page' : undefined} onclick={() => go(t)}>
      {#if t === 'profile' && community.me}
        <span class="av" class:ring={active === t}><Avatar id={community.me.id} name={community.me.firstName} src={community.me.avatar} size={28} /></span>
      {:else}
        <Icon name={ICON[t]} size={26} fill={active === t} />
      {/if}
    </button>
  {/each}
</nav>

<style>
  /* Une capsule de verre qui flotte au-dessus du bas de l'écran, comme la barre d'onglets d'iOS 26. */
  .tabbar {
    position: fixed;
    z-index: 22;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
    translate: -50% 0;
    width: min(360px, calc(100vw - 32px));
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px;
    border-radius: 999px;
    animation: bar-in 520ms var(--spring) both;
  }
  @keyframes bar-in {
    from {
      translate: -50% 140%;
    }
  }
  /* La pastille de l'onglet actif glisse d'un onglet à l'autre. */
  .pill-on {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 6px;
    width: calc((100% - 12px) / 4);
    border-radius: 999px;
    background: var(--tint-soft);
    transform: translateX(calc(var(--at) * 100%));
    transition: transform 520ms var(--spring-bouncy);
  }
  .on-photo .pill-on {
    background: rgba(255, 255, 255, 0.22);
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
    transform: scale(0.84);
  }
  .tab.on {
    color: var(--tint);
  }
  .on-photo .tab.on {
    color: #fff;
  }
  .tab.on :global(.icon) {
    animation: tab-pop 440ms var(--spring-bouncy);
  }
  @keyframes tab-pop {
    40% {
      transform: scale(1.18);
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
  @media (prefers-reduced-motion: reduce) {
    .tabbar,
    .tab.on :global(.icon) {
      animation: none;
    }
    .pill-on {
      transition: none;
    }
  }
</style>
