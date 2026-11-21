<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import { app } from '../lib/state.svelte';
  import { community } from '../lib/community.svelte';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * iPhone : quatre onglets en bas de l'écran, comme sur Strava. Créer (la carte et « Faire une boucle »),
   * la Communauté, Mes parcours, ton Profil. Le panneau se pose juste au-dessus.
   */
  let { active, onphoto = false }: { active: 'create' | 'community' | 'library' | 'profile'; onphoto?: boolean } = $props();

  let h = $state(0);
  $effect(() => {
    app.tabbarH = h;
    return () => (app.tabbarH = 0);
  });

  function go(t: typeof active) {
    if (t !== active) haptic('tap');
    community.sheet = null;
    if (t === 'create') {
      if (app.phase !== 'compose') app.closeLibrary();
      else app.home = true;
    } else if (t === 'community') community.open();
    else if (t === 'library') app.openLibrary();
    else community.openMe();
  }
</script>

<nav class="tabbar glass" class:on-photo={onphoto} aria-label="Sections" bind:offsetHeight={h}>
  <button use:tactile type="button" class="tab" class:on={active === 'create'} aria-current={active === 'create' ? 'page' : undefined} onclick={() => go('create')}>
    <span class="ic"><Icon name="map" size={24} /></span><span class="lb">Créer</span>
  </button>
  <button use:tactile type="button" class="tab" class:on={active === 'community'} aria-current={active === 'community' ? 'page' : undefined} onclick={() => go('community')}>
    <span class="ic"><Icon name="users" size={24} fill={active === 'community'} /></span><span class="lb">Communauté</span>
  </button>
  <button use:tactile type="button" class="tab" class:on={active === 'library'} aria-current={active === 'library' ? 'page' : undefined} onclick={() => go('library')}>
    <span class="ic"><Icon name="bookmark" size={24} fill={active === 'library'} /></span><span class="lb">Mes parcours</span>
  </button>
  <button use:tactile type="button" class="tab" class:on={active === 'profile'} aria-current={active === 'profile' ? 'page' : undefined} onclick={() => go('profile')}>
    <span class="ic">
      {#if community.me}<span class="av" class:ring={active === 'profile'}><Avatar id={community.me.id} name={community.me.firstName} src={community.me.avatar} size={26} /></span>
      {:else}<Icon name="user" size={24} fill={active === 'profile'} />{/if}
    </span><span class="lb">Profil</span>
  </button>
</nav>

<style>
  .tabbar {
    position: fixed;
    z-index: 22;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px 6px calc(env(safe-area-inset-bottom, 0px) + 4px);
    border-radius: 0;
    border-top: 0.5px solid var(--separator);
    animation: bar-in 420ms var(--ease-out) both;
  }
  @keyframes bar-in {
    from {
      translate: 0 100%;
    }
  }
  .tab {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    min-height: 50px;
    color: var(--label-2);
    transition: color 200ms var(--ease-out);
  }
  .tab .ic {
    display: grid;
    place-items: center;
    height: 28px;
    transition: transform 320ms var(--spring-bouncy);
  }
  .tab:active .ic {
    transform: scale(0.86);
  }
  .tab.on {
    color: var(--tint);
  }
  .tab.on .ic {
    animation: tab-pop 420ms var(--spring-bouncy);
  }
  @keyframes tab-pop {
    40% {
      transform: scale(1.14);
    }
  }
  .lb {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .av {
    display: grid;
    border-radius: 50%;
    padding: 1.5px;
  }
  .av.ring {
    box-shadow: 0 0 0 2px var(--tint);
  }
  @media (prefers-reduced-motion: reduce) {
    .tabbar,
    .tab.on .ic {
      animation: none;
    }
  }
</style>
