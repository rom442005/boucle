<script lang="ts">
  import { onMount } from 'svelte';
  import { tactile } from './lib/haptics';
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
  import BuildingsLegend from './components/BuildingsLegend.svelte';
  import RollingNumber from './components/RollingNumber.svelte';
  import { duration, kmValue } from './lib/format';
  import { app } from './lib/state.svelte';
  import { isDesktop } from './lib/platform';
  import { SHAPES } from './lib/sports';
  import SlopeLegend from './components/SlopeLegend.svelte';
  import Community from './components/Community.svelte';
  import AuthFlow from './components/AuthFlow.svelte';
  import PublishForm from './components/PublishForm.svelte';
  import ProfileForm from './components/ProfileForm.svelte';
  import ReportForm from './components/ReportForm.svelte';
  import Avatar from './components/Avatar.svelte';
  import { community } from './lib/community.svelte';
  import HomeBar from './components/HomeBar.svelte';
  import Welcome from './components/Welcome.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import TabBar from './components/TabBar.svelte';
  import Backdrop from './components/Backdrop.svelte';
  import TodayCard from './components/TodayCard.svelte';
  import type { Scene } from './lib/scenes';

  const wideQuery = matchMedia('(min-width: 860px)');
  app.wide = wideQuery.matches;

  /** Premier lancement : te connecter ou créer un compte (une fois, ensuite plus jamais imposé). */
  const WELCOME_KEY = 'boucle.bienvenue';
  let welcome = $state(false);
  function closeWelcome() {
    welcome = false;
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* sans mémoire */
    }
  }

  onMount(() => {
    void community.start().then(() => {
      let seen = false;
      try {
        seen = !!localStorage.getItem(WELCOME_KEY);
      } catch {
        seen = true;
      }
      if (community.available && !community.session && !seen && !location.hash.startsWith('#r=')) welcome = true;
    });
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

  const SHEET_TITLE = { auth: 'Communauté', publish: 'Publier', edit: 'Mon profil', report: 'Signaler' } as const;
  const headTitle = $derived(
    community.sheet
      ? SHEET_TITLE[community.sheet.kind]
      : app.phase === 'results'
        ? app.routes.length > 1
          ? `${app.routes.length} propositions`
          : '1 proposition'
        : app.phase === 'library'
          ? 'Mes parcours'
          : app.phase === 'community'
            ? community.view === 'profile' && community.viewing
              ? community.viewing.profile.id === community.me?.id
                ? 'Mon profil'
                : community.viewing.profile.firstName
              : 'Communauté'
            : app.phase === 'detail'
              ? app.detailFrom?.kind === 'communaute'
                ? 'Communauté'
                : 'Parcours'
              : 'Nouveau parcours',
  );
  /** Retour dans la Communauté : du profil au fil, du fil aux réglages. */
  function communityBack() {
    if (community.view === 'profile') {
      community.view = 'feed';
      community.viewing = null;
      void community.loadFeed();
    } else app.closeLibrary();
  }
  const busy = $derived(app.generating);
  /** Un refus (aucun parcours possible, réseau) : le bouton tremble une fois. */
  let ctaEl: HTMLButtonElement | undefined = $state();
  $effect(() => {
    if (!app.error || !ctaEl) return;
    ctaEl.classList.remove('shake');
    void ctaEl.offsetWidth;
    ctaEl.classList.add('shake');
  });
  let showInstall = $state(false);

  /** iPhone : balayer le résumé pour passer d'une proposition à l'autre. */
  function swipe(dir: 1 | -1) {
    const n = app.routes.length;
    if (n > 1) app.select((app.selected + dir + n) % n);
  }
  /** Accueil (iPhone) : la carte seule, « Faire une boucle » et les onglets. Sur Mac, le panneau reste ouvert. */
  const athome = $derived(!app.wide && app.phase === 'compose' && app.home);
  /** iPhone : les réglages couvrent l'écran (pas de boutons de carte par-dessus). */
  const fullsheet = $derived(!app.wide && app.phase === 'compose' && !app.home && app.detent === 'full');
  const canSwipe = $derived(!app.wide && app.phase === 'results' && app.routes.length > 1);
  /** Ton propre profil est affiché. */
  const meView = $derived(app.phase === 'community' && community.view === 'profile' && !!community.viewing && community.viewing.profile.id === community.me?.id);
  /** Onglet actif : en haut sur Mac, en bas sur iPhone. */
  const tab = $derived<'create' | 'community' | 'library' | 'profile'>(
    meView
      ? 'profile'
      : app.phase === 'community' || (app.phase === 'detail' && app.detailFrom?.kind === 'communaute')
        ? 'community'
        : app.phase === 'library' || (app.phase === 'detail' && (app.detailFrom?.kind === 'favori' || app.detailFrom?.kind === 'historique'))
          ? 'library'
          : 'create',
  );
  /**
   * Paysage en fond des écrans qui ne montrent pas de parcours : l'accueil, les réglages sur iPhone (la photo
   * suit le sport), Mes parcours, un profil. La carte revient dès qu'il y a un tracé à voir.
   */
  const SPORT_SCENE = { run: 'run', trail: 'trail', road: 'road', gravel: 'gravel' } as const;
  const scene = $derived<Scene | null>(
    welcome
      ? 'welcome'
      : app.phase === 'follow' || app.pickOnMap
        ? null
        : !app.wide && app.phase === 'compose' && !app.home
          ? SPORT_SCENE[app.params.sport]
          : app.phase === 'library'
            ? 'library'
            : app.phase === 'community' && community.view === 'profile' && !community.sheet
              ? 'profile'
              : null,
  );
  /** Le panneau sur la photo : en blocs pour les réglages (iPhone), en verre fumé ailleurs. */
  const photo = $derived(!scene || welcome ? null : app.phase === 'compose' ? 'cards' : 'sheet');
  /** iPhone : les onglets du bas, sauf pendant les réglages (plein écran), le suivi ou un choix sur la carte. */
  const showTabs = $derived(!app.wide && app.phase !== 'follow' && !welcome && !app.pickOnMap && !(app.phase === 'compose' && !app.home));
  const backLabel = $derived(
    app.phase === 'detail' ? (app.detailFrom?.kind === 'communaute' ? 'Retour à la Communauté' : 'Retour à mes parcours') : 'Retour aux réglages',
  );
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.pickOnMap && app.cancelPick()} />

{#snippet footer()}
      {#if app.phase === 'compose'}
        {#if app.error}
          <div class="banner is-error err" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{app.error}</span></div>
        {/if}
        <div class="cta-row">
          <button use:tactile type="button" class="cta" class:is-busy={busy} aria-live="polite" onclick={() => (busy ? null : app.create())} aria-disabled={busy} bind:this={ctaEl}>
            {#if busy}
              <span class="bar" style:transform="scaleX({app.progress?.ratio ?? 0.05})"></span>
              <span class="busy-text">{app.progress?.message ?? 'Recherche…'}</span>
            {:else}
              {SHAPES[app.params.shape].cta}
            {/if}
          </button>
          {#if busy}
            <button use:tactile type="button" class="round cancel" aria-label="Annuler la création" onclick={() => app.cancel()}><Icon name="close" size={18} /></button>
          {/if}
        </div>
      {:else if (app.phase === 'results' || app.phase === 'detail') && app.route}
        <button use:tactile type="button" class="cta" onclick={() => app.startFollow()}><Icon name="play" size={18} />Suivre ce parcours</button>
      {/if}
{/snippet}

<MapView />
{#if scene}<Backdrop {scene} />{/if}

{#if app.phase !== 'follow'}
  {#if !welcome && !fullsheet && !scene}<MapControls minimal={athome && !app.wide} />{/if}
  {#if !scene && !app.pickOnMap && ((athome && !welcome) || (app.wide && app.phase === 'compose'))}<TodayCard />{/if}
  <!-- Légende seulement quand les volumes sont visibles (à partir du zoom 13). -->
  {#if app.terrain3d && app.zoom >= 13.2 && !app.pickOnMap && !scene}
    <BuildingsLegend />
  {/if}

  {#if showTabs}<TabBar active={tab} onphoto={!!scene} />{/if}
  {#if athome}
    {#if !app.pickOnMap && !welcome}<HomeBar />{/if}
  {:else}
  <Panel solid={fullsheet && !photo} {photo} label={headTitle} footer={app.phase === 'library' || app.phase === 'community' || community.sheet ? undefined : footer} onswipe={canSwipe && !community.sheet ? swipe : undefined}>
    {#snippet header()}
      {#if app.wide}
        <div class="brand">
          <span class="logo" aria-hidden="true">
            <svg viewBox="0 0 1024 1024" width="30" height="30"><rect width="1024" height="1024" rx="230" fill="var(--tint)" /><path d="M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z" fill="none" stroke="#fff" stroke-width="78" stroke-linecap="round" stroke-linejoin="round" /><circle cx="318" cy="688" r="96" fill="#fff" /><circle cx="318" cy="688" r="46" fill="var(--tint)" /></svg>
          </span>
          <h1>Boucle</h1>
          <button use:tactile type="button" class="round phone" aria-label="Installer Boucle sur l’iPhone" title="Ouvrir Boucle sur l’iPhone (QR code)" aria-expanded={showInstall} onclick={() => (showInstall = !showInstall)}>
            <Icon name="phone" size={18} />
          </button>
          <nav class="tabs" aria-label="Sections">
            <button use:tactile type="button" class="pill" class:is-on={tab === 'create'} onclick={() => {
                community.sheet = null;
                if (tab !== 'create') app.closeLibrary();
              }}>Créer</button>
            <button use:tactile type="button" class="pill" class:is-on={tab === 'community'} onclick={() => {
                community.sheet = null;
                community.open();
              }}>Communauté</button>
            <button use:tactile type="button" class="pill" class:is-on={tab === 'library'} onclick={() => {
                community.sheet = null;
                app.openLibrary();
              }}>Mes parcours</button>
            <button use:tactile type="button" class="pill prof" class:is-on={tab === 'profile'} onclick={() => community.openMe()}>
              {#if community.me}<Avatar id={community.me.id} name={community.me.firstName} src={community.me.avatar} size={20} />{/if}Profil
            </button>
          </nav>
        </div>
      {/if}
      {#if app.wide && showInstall}
        <InstallGuide mode="card" onclose={() => (showInstall = false)} />
      {/if}
      {#if community.sheet}
        <!-- Une action de la Communauté (connexion, publication, profil, signalement) prend le panneau, sans fenêtre par-dessus. -->
        <div class="nav">
          <button use:tactile type="button" class="round navbtn" aria-label="Annuler" onclick={() => (community.sheet = null)}>
            <Icon name="close" size={20} />
          </button>
          <h2>{headTitle}</h2>
          <span class="navbtn-space" aria-hidden="true"></span>
        </div>
      {:else if app.phase === 'community'}
        <div class="nav">
          <!-- Les onglets mènent partout : un retour seulement depuis le profil d'un autre membre. -->
          {#if community.view === 'profile' && !meView}
            <button use:tactile type="button" class="round navbtn" aria-label="Retour à la Communauté" onclick={communityBack}>
              <Icon name="back" size={20} />
            </button>
          {:else}
            <span class="navbtn-space" aria-hidden="true"></span>
          {/if}
          <h2>{headTitle}</h2>
          <span class="navbtn-space" aria-hidden="true"></span>
        </div>
      {:else if app.phase === 'compose'}
        <!-- Les réglages, montés du bas : un bouton pour redescendre vers la carte, puis le départ. -->
        <div class="nav">
          {#if app.wide}
            <span class="navbtn-space" aria-hidden="true"></span>
          {:else}
            <button use:tactile type="button" class="round navbtn" aria-label="Fermer les réglages" onclick={() => app.closeComposer()}>
              <Icon name="down" size={20} />
            </button>
          {/if}
          <h2>{headTitle}</h2>
          <span class="navbtn-space" aria-hidden="true"></span>
        </div>
        <div class="start-wide">
          <PlaceField kind="start" place={app.start} busy={app.locating && !app.start} onclick={() => (app.search = 'start')} />
          {#if app.wide}<Stops />{/if}
        </div>
      {:else if !app.wide && (app.phase === 'results' || app.phase === 'detail') && app.route}
        <!-- iPhone : le parcours d'abord. Un résumé compact ; le détail en remontant le panneau. -->
        <div class="nav sum">
          <button use:tactile type="button" class="round navbtn" aria-label={backLabel} onclick={() => app.back()}>
            <Icon name="back" size={20} />
          </button>
          <div class="sum-mid" data-toggle-sheet>
            <h2 class="visually-hidden">{headTitle}</h2>
            <p class="sum-stats rounded">
              <!-- Pendant le tracé, les chiffres montent avec le stylo : le compteur, c'est le parcours. -->
              <span><RollingNumber value={kmValue(app.route.lengthM * app.revealK)} /><small>km</small></span>
              <span><RollingNumber value={String(Math.round(app.route.ascent * app.revealK))} /><small>m D+</small></span>
              <span><RollingNumber value={duration(app.route.durationS * app.revealK)} /></span>
            </p>
            {#if app.phase === 'results' && app.routes.length > 1}
              <span class="dots" aria-hidden="true">{#each app.routes as x, i (x.id)}<i class:on={i === app.selected}></i>{/each}</span>
            {/if}
          </div>
          {#if app.phase === 'results'}
            <button use:tactile type="button" class="round navbtn" aria-label="Autres propositions" disabled={busy} onclick={() => app.create(true)}>
              <span class:spin={busy}><Icon name="again" size={20} /></span>
            </button>
          {:else}
            <span class="navbtn-space" aria-hidden="true"></span>
          {/if}
        </div>
      {:else}
        <div class="nav">
          {#if app.phase === 'library'}
            <span class="navbtn-space" aria-hidden="true"></span>
          {:else}
            <button use:tactile type="button" class="round navbtn" aria-label={backLabel} onclick={() => app.back()}>
              <Icon name="back" size={20} />
            </button>
          {/if}
          <h2>{headTitle}</h2>
          {#if app.phase === 'results'}
            <button use:tactile type="button" class="round navbtn" aria-label="Autres propositions" disabled={busy} onclick={() => app.create(true)}>
              <span class:spin={busy}><Icon name="again" size={20} /></span>
            </button>
          {:else}
            <span class="navbtn-space" aria-hidden="true"></span>
          {/if}
        </div>
      {/if}
    {/snippet}

    {#if community.sheet}
      {@const sh = community.sheet}
      {#key sh}
        <div class="sheet">
          {#if sh.kind === 'auth'}
            <AuthFlow reason={sh.reason} />
          {:else if sh.kind === 'publish'}
            <PublishForm />
          {:else if sh.kind === 'edit'}
            <ProfileForm ondone={() => {
                community.sheet = null;
                app.showToast('Profil enregistré');
                if (community.me) void community.openProfile(community.me.id);
              }} />
          {:else if sh.kind === 'report'}
            <ReportForm target={sh.target} label={sh.label} />
          {/if}
        </div>
      {/key}
    {:else if app.phase === 'compose'}
      <Composer />
    {:else if app.phase === 'library'}
      <Library />
    {:else if app.phase === 'community'}
      <Community />
    {:else}
      <Results />
    {/if}


  </Panel>
  {/if}

  {#if app.wide && app.route && (app.phase === 'results' || app.phase === 'detail')}
    <section class="dock glass glass-panel" aria-label="Profil d’altitude">
      <div class="dock-head">
        <h3>Profil</h3>
        <div class="dock-legend"><SlopeLegend /></div>
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
    <span>{isDesktop ? 'Clique sur' : 'Touche'} la carte pour placer {app.pickOnMap === 'start' ? 'le départ' : app.pickOnMap === 'via' ? 'le point de passage' : 'l’arrivée'}</span>
    <button use:tactile type="button" class="text-btn" onclick={() => app.cancelPick()}>Annuler</button>
  </div>
{/if}

{#if app.search}
  <SearchOverlay />
{/if}

{#if welcome}<Welcome onclose={closeWelcome} />{/if}
{#if community.lightbox}<Lightbox />{/if}

<div class="toast-zone" aria-live="polite">
  {#if app.toast}
    {#key app.toast.id}
      <div class="toast glass">{app.toast.text}</div>
    {/key}
  {/if}
</div>

<style>
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
  /* Quatre onglets : sur leur propre ligne, sous le nom de l'app. */
  .brand {
    flex-wrap: wrap;
    row-gap: 10px;
  }
  .tabs {
    flex-basis: 100%;
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--fill-2);
  }
  .tabs .pill {
    min-height: 32px;
    padding: 0 8px;
    font-size: 0.8125rem;
    background: transparent;
  }
  .tabs .prof {
    gap: 6px;
  }
  .tabs .pill.is-on {
    background: var(--thumb);
    color: var(--label);
    box-shadow:
      0 3px 8px rgba(0, 0, 0, 0.1),
      0 1px 1px rgba(0, 0, 0, 0.04);
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
  .sheet {
    animation: cascade-in 320ms var(--ease-out) both;
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
  .dock-legend {
    width: 300px;
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
