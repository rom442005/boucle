<script lang="ts">
  import { onMount } from 'svelte';
  import MapView from './components/MapView.svelte';
  import Panel from './components/Panel.svelte';
  import Composer from './components/Composer.svelte';
  import Results from './components/Results.svelte';
  import Library from './components/Library.svelte';
  import MapControls from './components/MapControls.svelte';
  import PlaceField from './components/PlaceField.svelte';
  import SearchOverlay from './components/SearchOverlay.svelte';
  import FollowHUD from './components/FollowHUD.svelte';
  import ElevationProfile from './components/ElevationProfile.svelte';
  import Icon from './components/Icon.svelte';
  import InstallGuide from './components/InstallGuide.svelte';
  import Stops from './components/Stops.svelte';
  import RollingNumber from './components/RollingNumber.svelte';
  import { duration, kmValue } from './lib/format';
  import { app } from './lib/state.svelte';
  import { isDesktop } from './lib/platform';
  import { SHAPES } from './lib/sports';
  import { RAMP, RAMP_LABELS } from './lib/elevation';

  const wideQuery = matchMedia('(min-width: 860px)');
  app.wide = wideQuery.matches;

  onMount(() => {
    const onWide = () => (app.wide = wideQuery.matches);
    wideQuery.addEventListener('change', onWide);
    const h = location.hash;
    if (h.startsWith('#r=')) {
      void app.openSharedLink(h.slice(3));
      history.replaceState(null, '', location.pathname + location.search);
    } else if (!app.start) {
      void app.useMyPosition('start');
    }
    return () => wideQuery.removeEventListener('change', onWide);
  });

  const headTitle = $derived(
    app.phase === 'results'
      ? app.routes.length > 1
        ? `${app.routes.length} propositions`
        : '1 proposition'
      : app.phase === 'library'
        ? 'Mes parcours'
        : app.phase === 'detail'
          ? 'Parcours'
          : 'Nouveau parcours',
  );
  const busy = $derived(app.generating);
  let showInstall = $state(false);

  /** iPhone : balayer le résumé pour passer d'une proposition à l'autre. */
  function swipe(dir: 1 | -1) {
    const n = app.routes.length;
    if (n > 1) app.select((app.selected + dir + n) % n);
  }
  const canSwipe = $derived(!app.wide && app.phase === 'results' && app.routes.length > 1);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.pickOnMap && app.cancelPick()} />

{#snippet footer()}
      {#if app.phase === 'compose'}
        {#if app.error}
          <div class="banner is-error err" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{app.error}</span></div>
        {/if}
        <div class="cta-row">
          <button type="button" class="cta" class:is-busy={busy} aria-live="polite" onclick={() => (busy ? null : app.create())} aria-disabled={busy}>
            {#if busy}
              <span class="bar" style:transform="scaleX({app.progress?.ratio ?? 0.05})"></span>
              <span class="busy-text">{app.progress?.message ?? 'Recherche…'}</span>
            {:else}
              {SHAPES[app.params.shape].cta}
            {/if}
          </button>
          {#if busy}
            <button type="button" class="round cancel" aria-label="Annuler la création" onclick={() => app.cancel()}><Icon name="close" size={18} /></button>
          {/if}
        </div>
      {:else if (app.phase === 'results' || app.phase === 'detail') && app.route}
        <button type="button" class="cta" onclick={() => app.startFollow()}><Icon name="play" size={18} />Suivre ce parcours</button>
      {/if}
{/snippet}

<MapView />

{#if app.phase !== 'follow'}
  {#if !app.wide && app.phase === 'compose' && !app.pickOnMap}
    <div class="topbar">
      <PlaceField kind="start" place={app.start} busy={app.locating && !app.start} floating onclick={() => (app.search = 'start')} />
      <button type="button" class="round glass" aria-label="Mes parcours : favoris et historique" onclick={() => app.openLibrary()}>
        <Icon name="list" />
      </button>
    </div>
  {/if}

  <MapControls />

  <Panel label={headTitle} footer={app.phase === 'library' ? undefined : footer} onswipe={canSwipe ? swipe : undefined}>
    {#snippet header()}
      {#if app.wide}
        <div class="brand">
          <span class="logo" aria-hidden="true">
            <svg viewBox="0 0 1024 1024" width="30" height="30"><rect width="1024" height="1024" rx="230" fill="var(--tint)" /><path d="M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z" fill="none" stroke="#fff" stroke-width="78" stroke-linecap="round" stroke-linejoin="round" /><circle cx="318" cy="688" r="96" fill="#fff" /><circle cx="318" cy="688" r="46" fill="var(--tint)" /></svg>
          </span>
          <h1>Boucle</h1>
          <button type="button" class="round phone" aria-label="Installer Boucle sur l’iPhone" title="Ouvrir Boucle sur l’iPhone (QR code)" aria-expanded={showInstall} onclick={() => (showInstall = !showInstall)}>
            <Icon name="phone" size={18} />
          </button>
          <nav class="tabs" aria-label="Sections">
            <button type="button" class="pill" class:is-on={app.phase !== 'library' && app.phase !== 'detail'} onclick={() => (app.phase === 'library' || app.phase === 'detail' ? app.closeLibrary() : null)}>Créer</button>
            <button type="button" class="pill" class:is-on={app.phase === 'library' || app.phase === 'detail'} onclick={() => app.openLibrary()}>
              Mes parcours{#if app.library.length}<span class="tabular dim">&nbsp;{app.library.length}</span>{/if}
            </button>
          </nav>
        </div>
      {/if}
      {#if app.wide && showInstall}
        <InstallGuide mode="card" onclose={() => (showInstall = false)} />
      {/if}
      {#if app.phase === 'compose'}
        {#if app.wide}
          <!-- Les lieux du parcours, toujours visibles en haut : départ, point de passage, destination. -->
          <div class="start-wide">
            <PlaceField kind="start" place={app.start} busy={app.locating && !app.start} onclick={() => (app.search = 'start')} />
            <Stops />
          </div>
        {/if}
      {:else if !app.wide && (app.phase === 'results' || app.phase === 'detail') && app.route}
        <!-- iPhone : le parcours d'abord. Un résumé compact ; le détail en remontant le panneau. -->
        <div class="nav sum">
          <button type="button" class="round navbtn" aria-label={app.phase === 'detail' ? 'Retour à mes parcours' : 'Retour aux réglages'} onclick={() => app.back()}>
            <Icon name="back" size={20} />
          </button>
          <div class="sum-mid" data-toggle-sheet>
            <h2 class="visually-hidden">{headTitle}</h2>
            <p class="sum-stats rounded">
              <span><RollingNumber value={kmValue(app.route.lengthM)} /><small>km</small></span>
              <span><RollingNumber value={String(Math.round(app.route.ascent))} /><small>m D+</small></span>
              <span><RollingNumber value={duration(app.route.durationS)} /></span>
            </p>
            {#if app.phase === 'results' && app.routes.length > 1}
              <span class="dots" aria-hidden="true">{#each app.routes as x, i (x.id)}<i class:on={i === app.selected}></i>{/each}</span>
            {/if}
          </div>
          {#if app.phase === 'results'}
            <button type="button" class="round navbtn" aria-label="Autres propositions" disabled={busy} onclick={() => app.create(true)}>
              <span class:spin={busy}><Icon name="again" size={20} /></span>
            </button>
          {:else}
            <span class="navbtn-space" aria-hidden="true"></span>
          {/if}
        </div>
      {:else}
        <div class="nav">
          <button type="button" class="round navbtn" aria-label={app.phase === 'detail' ? 'Retour à mes parcours' : 'Retour aux réglages'} onclick={() => (app.phase === 'library' ? app.closeLibrary() : app.back())}>
            <Icon name="back" size={20} />
          </button>
          <h2>{headTitle}</h2>
          {#if app.phase === 'results'}
            <button type="button" class="round navbtn" aria-label="Autres propositions" disabled={busy} onclick={() => app.create(true)}>
              <span class:spin={busy}><Icon name="again" size={20} /></span>
            </button>
          {:else}
            <span class="navbtn-space" aria-hidden="true"></span>
          {/if}
        </div>
      {/if}
    {/snippet}

    {#if app.phase === 'compose'}
      <Composer />
    {:else if app.phase === 'library'}
      <Library />
    {:else}
      <Results />
    {/if}


  </Panel>

  {#if app.wide && app.route && (app.phase === 'results' || app.phase === 'detail')}
    <section class="dock glass glass-panel" aria-label="Profil d’altitude">
      <div class="dock-head">
        <h3>Profil</h3>
        <ul class="legend" aria-label="Pentes">
          {#each RAMP as c, i (c)}
            <li><span style:background={c}></span>{RAMP_LABELS[i]}</li>
          {/each}
        </ul>
      </div>
      <ElevationProfile route={app.route} height={122} />
    </section>
  {/if}
{:else}
  <FollowHUD />
{/if}

{#if app.pickOnMap}
  <div class="picker glass" role="status">
    <Icon name="crosshair" size={18} />
    <span>{isDesktop ? 'Clique sur' : 'Touche'} la carte pour placer {app.pickOnMap === 'start' ? 'le départ' : 'la destination'}</span>
    <button type="button" class="text-btn" onclick={() => app.cancelPick()}>Annuler</button>
  </div>
{/if}

{#if app.search}
  <SearchOverlay />
{/if}

<div class="toast-zone" aria-live="polite">
  {#if app.toast}
    {#key app.toast.id}
      <div class="toast glass">{app.toast.text}</div>
    {/key}
  {/if}
</div>

<style>
  .topbar {
    position: fixed;
    z-index: 15;
    top: calc(var(--safe-top) + 8px);
    left: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .topbar :global(.place) {
    flex: 1;
  }
  .topbar .round {
    width: 46px;
    height: 46px;
    position: relative;
    color: var(--label);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 0 14px;
  }
  .brand h1 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    flex: 1;
  }
  .logo {
    display: grid;
  }
  .phone {
    width: 34px;
    height: 34px;
    color: var(--label-2);
  }
  .phone[aria-expanded='true'] {
    color: var(--tint);
    background: var(--tint-soft);
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs .pill {
    min-height: 34px;
    padding: 0 12px;
    font-size: 0.8125rem;
    background: transparent;
  }
  .tabs .pill.is-on {
    background: var(--fill-2);
    color: var(--label);
  }
  .dim {
    color: var(--label-2);
    font-weight: 500;
  }
  .start-wide {
    display: grid;
    gap: 8px;
    padding-bottom: 10px;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0 8px;
  }
  .nav h2 {
    flex: 1;
    margin: 0;
    text-align: center;
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .navbtn {
    width: 40px;
    height: 40px;
    background: var(--fill-2);
    color: var(--label);
  }
  .navbtn-space {
    width: 40px;
  }
  .sum {
    padding-bottom: 4px;
  }
  .sum-mid {
    flex: 1;
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .sum-stats {
    margin: 0;
    display: flex;
    gap: 14px;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    white-space: nowrap;
  }
  .sum-stats span {
    display: inline-flex;
    align-items: baseline;
  }
  .sum-stats small {
    font-family: var(--font);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 3px;
  }
  .dots {
    display: flex;
    gap: 5px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fill);
    transition:
      background-color 200ms var(--ease-out),
      transform 420ms var(--spring-bouncy);
  }
  .dots i.on {
    background: var(--tint);
    transform: scale(1.3);
  }
  @media (max-width: 859px) {
    .navbtn {
      width: 36px;
      height: 36px;
    }
    .navbtn-space {
      width: 36px;
    }
    .nav h2 {
      font-size: 1rem;
    }
  }
  .spin {
    display: inline-grid;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .err {
    margin-bottom: 10px;
  }
  .cta-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .busy-text {
    position: relative;
    font-weight: 600;
  }
  .cancel {
    width: 52px;
    height: 52px;
    background: var(--fill-2);
    color: var(--label);
  }
  .dock {
    position: fixed;
    z-index: 14;
    left: calc(384px + 24px);
    right: 72px;
    bottom: 12px;
    max-width: 980px;
    padding: 12px 18px 10px;
    border-radius: 26px;
  }
  .dock-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 30px;
  }
  .dock-head h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 650;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .legend span {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .picker {
    position: fixed;
    z-index: 30;
    top: calc(var(--safe-top) + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 16px;
    border-radius: 24px;
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.3;
    width: max-content;
    max-width: calc(100vw - 24px);
  }
  .picker span {
    text-wrap: balance;
  }
  .picker .text-btn {
    flex: none;
  }
  .toast-zone {
    position: fixed;
    z-index: 50;
    left: 0;
    right: 0;
    top: calc(var(--safe-top) + 70px);
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .toast {
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 0.9375rem;
    font-weight: 500;
    max-width: calc(100vw - 32px);
    text-align: center;
    animation: toast-in 380ms var(--spring);
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.96);
    }
  }
  @media (min-width: 860px) {
    .toast-zone {
      top: 16px;
      left: 396px;
    }
  }
</style>
