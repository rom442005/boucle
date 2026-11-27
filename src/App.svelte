<script lang="ts">
  import { onMount } from 'svelte';
  import { haptic, tactile } from './lib/haptics';
  import MapView from './components/MapView.svelte';
  import Panel from './components/Panel.svelte';
  import Composer from './components/Composer.svelte';
  import Results from './components/Results.svelte';
  import Library from './components/Library.svelte';
  import MapControls from './components/MapControls.svelte';
  import PlaceField from './components/PlaceField.svelte';
  import SearchOverlay from './components/SearchOverlay.svelte';
  import AddPlace from './components/AddPlace.svelte';
  import FollowHUD from './components/FollowHUD.svelte';
  import ElevationProfile from './components/ElevationProfile.svelte';
  import Icon from './components/Icon.svelte';
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
  import Welcome from './components/Welcome.svelte';
  import Lightbox from './components/Lightbox.svelte';
  import TabBar from './components/TabBar.svelte';
  import Backdrop from './components/Backdrop.svelte';
  import TodayCard from './components/TodayCard.svelte';
  import ZonesCard from './components/ZonesCard.svelte';
  import PlaceCard from './components/PlaceCard.svelte';
  import SaveSheet from './components/SaveSheet.svelte';
  import HealthDetail from './components/HealthDetail.svelte';
  import SpotView from './components/SpotView.svelte';
  import { saved } from './lib/saved.svelte';
  import HealthLink from './components/HealthLink.svelte';
  import { sceneAt, warmScene } from './lib/scenes';
  import { liquidTabs } from './lib/lens';
  import { mix, sceneTone } from './lib/scene.svelte';
  import { PAYSAGE_BG } from './lib/mapstyle';
  import { links } from './lib/links.svelte';

  const wideQuery = matchMedia('(min-width: 860px)');
  app.wide = wideQuery.matches;

  // Fil rouge (DESIGN.md) : sur la carte Paysage comme en Satellite, l'interface prend le verre fumé et le texte
  // blanc des écrans à photo ; seul le plan clair garde l'interface claire.
  $effect(() => {
    const world = app.mapType !== 'plan';
    document.documentElement.classList.toggle('on-photo', world);
    const light = !world && !matchMedia('(prefers-color-scheme: dark)').matches;
    // Le fond de la page prend la teinte du bas de l'écran (carte Paysage voilée, bas des photos) : la bande
    // qu'iOS 26 laisse parfois sous la barre d'onglets (zone du geste, bug WebKit) se fond au lieu de faire
    // un rectangle gris. La barre du navigateur prend la même teinte.
    const ground = mix(mix(PAYSAGE_BG, sceneTone(), 0.32), '#000000', 0.22);
    for (const el of [document.documentElement, document.body]) el.style.backgroundColor = world ? ground : '';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', world ? ground : light ? '#F2F1ED' : '#1E1F21');
  });

  /** Premier lancement : te connecter ou créer un compte (une fois, ensuite plus jamais imposé). */
  const WELCOME_KEY = 'boucle.bienvenue';
  let welcome = $state(false);
  /** pile des messages étalée (survol) */
  let toastsOpen = $state(false);
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
    // Retour de Strava après l'accord : le code est échangé par le serveur.
    void links.finishStrava();
    // Pendant un moment calme, ce qui fera attendre plus tard se prépare : la photo du moment et la Communauté.
    const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 1500));
    setTimeout(() => idle(() => warmScene(sceneAt())), 2500);
    setTimeout(() => idle(() => void community.prefetch()), 3500);
    // App du téléphone reliée à Santé / Health Connect : ses données partent au retour sur l'app (30 min au plus souvent).
    setTimeout(() => idle(() => void links.loadHealth()), 5000);
    const onBack = () => document.visibilityState === 'visible' && void links.syncHealth().catch(() => {});
    document.addEventListener('visibilitychange', onBack);
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

  const SHEET_TITLE = { auth: 'Communauté', publish: 'Publier', edit: 'Mon profil', health: 'Apple Santé', report: 'Signaler' } as const;
  /** La connexion demandée par l'onglet Profil : elle en fait partie, l'onglet reste allumé. */
  const profileAuth = $derived(community.sheet?.kind === 'auth' && community.sheet.tab === 'profile');
  const headTitle = $derived(
    community.sheet
      ? profileAuth
        ? 'Profil'
        : SHEET_TITLE[community.sheet.kind]
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

  /** iPhone : balayer le résumé pour passer d'une proposition à l'autre. */
  function swipe(dir: 1 | -1) {
    const n = app.routes.length;
    if (n > 1) app.select((app.selected + dir + n) % n);
  }
  /** Accueil (iPhone) : la carte seule, « Faire une boucle » et les onglets. */
  const athome = $derived(!app.wide && app.phase === 'compose' && app.home);
  /** Accueil (Mac) : la carte seule ; les réglages s'ouvrent à gauche avec « Créer un parcours ». */
  const macHome = $derived(app.wide && app.phase === 'compose' && app.home && !community.sheet);
  $effect(() => {
    if (macHome) app.padding = { top: 100, bottom: 110, left: 40, right: 80 };
  });
  /** Enregistrer un lieu : depuis la carte de Créer (on peut aussi l'y choisir). */
  function addPlace() {
    haptic('tap');
    community.sheet = null;
    if (app.phase !== 'compose') app.closeLibrary();
    else app.home = true;
    app.addSavedPlace({});
  }
  // Accueil iPhone : la carte se cadre au-dessus de la barre d'onglets (la bulle « Faire une boucle » y est).
  $effect(() => {
    if (athome) app.padding = { top: 64, bottom: app.tabbarH + 28, left: 28, right: 64 };
  });
  /** iPhone : les réglages couvrent l'écran (pas de boutons de carte par-dessus). */
  const fullsheet = $derived(!app.wide && app.phase === 'compose' && !app.home && app.detent === 'full');
  const canSwipe = $derived(!app.wide && app.phase === 'results' && app.routes.length > 1);
  /** Ton propre profil est affiché. */
  const meView = $derived(app.phase === 'community' && community.view === 'profile' && !!community.viewing && community.viewing.profile.id === community.me?.id);
  /** Onglet actif : en haut sur Mac, en bas sur iPhone. */
  const tab = $derived<'create' | 'community' | 'library' | 'profile'>(
    meView || profileAuth
      ? 'profile'
      : app.phase === 'community' || (app.phase === 'detail' && app.detailFrom?.kind === 'communaute')
        ? 'community'
        : app.phase === 'library' || (app.phase === 'detail' && (app.detailFrom?.kind === 'favori' || app.detailFrom?.kind === 'historique'))
          ? 'library'
          : 'create',
  );
  /**
   * Paysage en fond des écrans qui ne montrent pas de parcours (fil rouge, DESIGN.md) : l'accueil, la connexion,
   * les réglages sur iPhone (la photo suit le sport), la Communauté, Mes parcours, les profils. La carte revient
   * dès qu'il y a un tracé à voir.
   */
  const scene = $derived(
    welcome ||
      (app.phase !== 'follow' &&
        !app.pickOnMap &&
        !app.spotView &&
        ((!app.wide && app.phase === 'compose' && !app.home) ||
          app.phase === 'library' ||
          app.phase === 'community' ||
          community.sheet?.kind === 'auth')),
  );
  /** Le paysage reste en place une fois venu : il ne fait que s'effacer, sans rien recharger. */
  let backdropOn = $state(false);
  $effect(() => {
    if (scene) backdropOn = true;
  });
  /** Sur la photo, plus de feuille : des blocs de verre (réglages sur iPhone, Mes parcours, profils). */
  /**
   * Sur la photo, plus de feuille : des blocs de verre (réglages sur iPhone, Mes parcours, profils). Sur Mac, les
   * réglages du parcours aussi, en blocs sur la carte, comme Profil et Communauté.
   */
  const photo = $derived(welcome ? null : scene || (app.wide && app.phase === 'compose' && !community.sheet) ? ('cards' as const) : null);
  // iPhone : les écrans sur la photo (Communauté, Mes parcours, profils, connexion) occupent tout l'écran, leurs
  // blocs flottent sur la photo ; même quand un onglet remet le panneau à mi-hauteur (passage Profil → Communauté).
  $effect(() => {
    if (photo && !app.wide && app.phase !== 'compose' && app.detent !== 'full') app.detent = 'full';
  });
  const TABS = ['create', 'community', 'library', 'profile'] as const;
  const TAB_LABEL = { create: 'Créer', community: 'Communauté', library: 'Mes parcours', profile: 'Profil' } as const;
  const TAB_ICON = { create: 'path', community: 'users', library: 'bookmark', profile: 'user' } as const;
  // Mac : la même lentille de verre liquide que sur iPhone (lens.ts) ; la page change d'un coup, sans fondu.
  function goTab(t: (typeof TABS)[number]) {
    changeTab(t);
  }
  function changeTab(t: (typeof TABS)[number]) {
    community.sheet = null;
    if (t === 'create') {
      if (tab !== 'create') app.closeLibrary();
    } else if (t === 'community') community.open();
    else if (t === 'library') app.openLibrary();
    else community.openMe();
  }
  /**
   * iPhone, onglets principaux sur la photo (Communauté, Mes parcours, mon profil, la connexion du Profil) :
   * ni poignée ni titre, le premier bloc est tout en haut ; l'onglet allumé dit où l'on est.
   */
  const headless = $derived(
    !app.wide &&
      !!photo &&
      (community.sheet
        ? profileAuth
        : app.phase === 'library' || (app.phase === 'community' && (community.view === 'feed' || meView))),
  );
  /** La bulle « Faire une boucle », à côté des onglets : sur la carte d'accueil et les onglets principaux. */
  const showAction = $derived(app.phase === 'compose' || app.phase === 'library' || app.phase === 'community');
  /** iPhone : les onglets du bas, sauf pendant les réglages (plein écran), le suivi ou un choix sur la carte. */
  const showTabs = $derived(!app.wide && app.phase !== 'follow' && !welcome && !app.pickOnMap && app.search !== 'save' && !(app.phase === 'compose' && !app.home));
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
              {app.drawOpen && app.params.shape === 'loop' ? 'Tracer mon dessin' : SHAPES[app.params.shape].cta}
            {/if}
          </button>
          {#if busy}
            <button use:tactile type="button" class="round cancel" aria-label="Annuler la création" onclick={() => app.cancel()}><Icon name="close" size={18} /></button>
          {/if}
        </div>
      {:else if (app.phase === 'results' || app.phase === 'detail') && app.route && app.wide}
        <button use:tactile type="button" class="cta" onclick={() => app.startFollow()}><Icon name="play" size={18} />Suivre ce parcours</button>
      {/if}
{/snippet}

<MapView />
{#if backdropOn}<Backdrop visible={scene} />{/if}

{#if app.wide && !welcome && app.phase !== 'follow'}
  <!--
    Mac : le menu (quatre sections, Enregistrer un lieu) reste toujours à la même place, en haut au centre, quel que
    soit l'onglet ; les panneaux commencent dessous (Romain : « qu'il ne bouge pas dans tous les sens »).
  -->
  <header class="menu glass glass-panel" data-arrive="down" style="--arrive-delay: 300ms" aria-label="Menu">
          <nav class="tabs" aria-label="Sections" style:--at={TABS.indexOf(tab)} use:liquidTabs={{ active: TABS.indexOf(tab), pick: (i) => goTab(TABS[i]) }}>
            <span class="tab-on" aria-hidden="true"></span>
            {#each TABS as t (t)}
              <button use:tactile type="button" class="tab" class:on={tab === t} aria-label={TAB_LABEL[t]} title={TAB_LABEL[t]} aria-current={tab === t ? 'page' : undefined} onclick={() => goTab(t)}>
                {#if t === 'profile' && community.me}
                  <Avatar id={community.me.id} name={community.me.firstName} src={community.me.avatar} size={24} />
                {:else}
                  <Icon name={TAB_ICON[t]} size={21} fill={tab === t} />
                {/if}
              </button>
            {/each}
          </nav>
          <!-- Enregistrer un lieu dans Mes lieux (adresse, position, point de la carte), depuis la carte de Créer. -->
          <button use:tactile type="button" class="round add-place" aria-label="Enregistrer un lieu" title="Enregistrer un lieu" onclick={addPlace}>
            <Icon name="pinPlus" size={20} />
          </button>
        </header>
{/if}

{#if app.phase !== 'follow'}
  {#if !welcome && !fullsheet && !scene && app.search !== 'save'}<MapControls minimal={athome && !app.wide} />{/if}
  {#if !scene && !app.pickOnMap && app.search !== 'save' && ((athome && !welcome) || (app.wide && app.phase === 'compose'))}
    <!-- Sur la carte : la météo du départ, et dessous les lieux à mettre en valeur (pistes, parcs, eau…). -->
    <!-- iPhone : la barre des lieux seule, tout en haut (la météo se lit dans les propositions). -->
    <div class="widgets" data-arrive="down" style="--arrive-delay: 380ms" class:full={macHome}>
      {#if app.wide}<TodayCard />{/if}
      <ZonesCard />
    </div>
    {#if app.place}
      <!-- Fiche du lieu touché : au-dessus des onglets sur iPhone, en bas de la carte sur Mac. -->
      <div class="place-zone" style:--place-bottom="{app.tabbarH + 10}px" style:--place-left-wide={macHome ? 'calc(50vw - 200px)' : undefined} style:--place-bottom-wide={macHome ? '96px' : undefined}><PlaceCard /></div>
    {/if}
  {/if}
  <!-- Légende seulement quand les volumes sont visibles (à partir du zoom 13). -->
  {#if app.terrain3d && app.zoom >= 13.2 && !app.pickOnMap && !scene}
    <BuildingsLegend />
  {/if}

  {#if showTabs}<TabBar active={tab} onphoto={scene || app.mapType !== 'plan'} action={showAction && !welcome} />{/if}
  {#if athome}
    <!-- « Faire une boucle » est la bulle rose à côté des onglets (TabBar). -->
  {:else if macHome}
    {#if !welcome && !app.pickOnMap && !app.search && !saved.draft}
      <!-- Mac : la carte seule ; les réglages du parcours s'ouvrent à gauche, au clic. -->
      <button use:tactile type="button" class="make" data-arrive="up" style="--arrive-delay: 640ms" onclick={() => app.openComposer()}><Icon name="path" size={20} />Créer un parcours</button>
    {/if}
  {:else if !welcome && !(app.spotView && !app.wide)}
  <!-- Premier lancement : seul l'accueil (rejoindre la Communauté) est à l'écran, le panneau vient après. -->
  <Panel solid={fullsheet && !photo} {photo} {headless} centered={app.phase === 'community' || app.phase === 'library' || community.sheet?.kind === 'auth'} label={headTitle} footer={app.phase === 'library' || app.phase === 'community' || community.sheet || (!app.wide && (app.phase === 'results' || app.phase === 'detail')) ? undefined : footer} onswipe={canSwipe && !community.sheet ? swipe : undefined}>
    {#snippet header()}
      {#if community.sheet}
        <!-- Une action de la Communauté (connexion, publication, profil, signalement) prend le panneau, sans fenêtre par-dessus. -->
        <div class="nav">
          {#if profileAuth}
            <!-- L'onglet Profil sans compte : la connexion est sa page, rien à fermer (les onglets mènent ailleurs). -->
            <span class="navbtn-space" aria-hidden="true"></span>
          {:else}
            <button use:tactile type="button" class="round navbtn" aria-label="Annuler" onclick={() => (community.sheet = null)}>
              <Icon name="close" size={20} />
            </button>
          {/if}
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
        <!-- Les réglages, montés du bas : un bouton pour redescendre vers la carte, puis le départ. Sur Mac, en verre. -->
        <div class="compose-head" class:glass={app.wide} class:photo-card={app.wide}>
        <div class="nav">
          {#if app.wide}
            <button use:tactile type="button" class="round navbtn" aria-label="Fermer les réglages" title="Fermer" onclick={() => app.closeComposer()}>
              <Icon name="close" size={18} />
            </button>
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
          {#if app.wide && !app.drawActive}<Stops />{/if}
        </div>
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
          {/if}
          <!-- Comme le bouton lecture d'une app de musique : suivre le parcours, d'un geste, sans quitter la carte. -->
          <button use:tactile type="button" class="round play" aria-label="Suivre ce parcours" onclick={() => app.startFollow()}>
            <Icon name="play" size={20} fill />
          </button>
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
        <!-- Sur la photo, l'action devient un bloc de verre, comme l'accueil. -->
        <div class="sheet" class:sheet-card={!!photo} class:glass={!!photo} class:photo-card={!!photo} class:mid={profileAuth && !app.wide}>
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
          {:else if sh.kind === 'health'}
            <HealthLink />
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
    <span>{isDesktop ? 'Clique sur' : 'Touche'} la carte {app.pickOnMap === 'save' ? 'sur le lieu à enregistrer' : `pour placer ${app.pickOnMap === 'start' ? 'le départ' : app.pickOnMap === 'via' ? 'le point de passage' : 'l’arrivée'}`}</span>
    <button use:tactile type="button" class="text-btn" onclick={() => app.cancelPick()}>Annuler</button>
  </div>
{/if}

{#if app.search === 'save'}
  <AddPlace />
{:else if app.search}
  <SearchOverlay />
{/if}
{#if saved.draft}<SaveSheet />{/if}
{#if links.detail}<HealthDetail />{/if}
{#if app.spotView && !app.wide}<SpotView />{/if}

{#if welcome}<Welcome onclose={closeWelcome} />{/if}
{#if community.lightbox}<Lightbox />{/if}

<!-- Messages en pile : le plus récent devant, les plus anciens en retrait derrière ; au survol, la pile s'étale. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="toast-zone" class:open={toastsOpen} aria-live="polite" onmouseenter={() => ((toastsOpen = true), app.holdToasts(true))} onmouseleave={() => ((toastsOpen = false), app.holdToasts(false))}>
  {#each app.toasts as t, i (t.id)}
    <div class="toast glass" class:back={app.toasts.length - 1 - i > 0} style:--d={app.toasts.length - 1 - i}>
      <span class="t-text">{t.text}</span>
      {#if t.undo}<button use:tactile type="button" class="undo" onclick={() => app.undoToast(t.id)}>Annuler</button>{/if}
    </div>
  {/each}
</div>

<style>
  /* Nom de transition seulement pendant un changement d'onglet (sinon le verre ne floute plus le fond). */
  :global(html.vt) .menu {
    view-transition-name: menu-mac;
  }
  .menu {
    position: fixed;
    z-index: 24;
    top: 14px;
    left: 50%;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px 6px 6px;
    border-radius: 999px;
    animation: menu-in 520ms var(--spring) backwards;
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      translate: -50% -12px;
    }
  }
  .menu .tabs {
    flex: none;
    width: 272px;
  }
  .add-place {
    width: 36px;
    height: 36px;
    color: var(--label-2);
  }
  .add-place:hover {
    color: var(--tint);
  }
  /* Quatre sections en icônes, une pastille glisse sous la section active. */
  .tabs {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 3px;
    border-radius: 999px;
    background: var(--fill-2);
  }
  .tab-on {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / 4);
    border-radius: 999px;
    background: var(--thumb);
    box-shadow:
      0 3px 8px rgba(0, 0, 0, 0.1),
      0 1px 1px rgba(0, 0, 0, 0.04);
    transform: translateX(calc(var(--at) * 100%));
  }
  .tab {
    position: relative;
    display: grid;
    place-items: center;
    height: 36px;
    color: var(--label-2);
    transition: color 200ms var(--ease-out);
  }
  .tab.on {
    color: var(--tint);
  }
  /* Sur la photo et la carte Paysage, comme Deezer : la pastille de l'onglet allumé, plus sombre que la barre. */
  :global(.on-photo) .tab-on {
    background: rgba(0, 0, 0, 0.32);
    box-shadow:
      inset 0 0.5px 0 rgba(255, 255, 255, 0.1),
      inset 0 -0.5px 0 rgba(255, 255, 255, 0.05);
  }
  :global(.on-photo) .tabs .tab {
    color: rgba(255, 255, 255, 0.9);
  }
  :global(.on-photo) .tabs .tab.on {
    color: var(--tint);
  }
  .tab :global(.icon) {
    transition: transform 320ms var(--spring-bouncy);
  }
  .tab:active :global(.icon) {
    transform: scale(0.86);
  }
  @media (prefers-reduced-motion: reduce) {
    .tab-on {
      transition: none;
    }
  }
  .start-wide {
    display: grid;
    gap: 8px;
    padding-bottom: 10px;
  }
  /* Mac : l'en-tête des réglages (fermer, départ, points de passage) est un bloc de verre sur la carte. */
  .compose-head.glass {
    --g-bg: rgba(22, 23, 25, 0.8);
    padding: 10px 12px 2px;
    margin-bottom: 10px;
    border-radius: 26px;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0 8px;
  }
  .sheet {
    animation: cascade-in 320ms var(--ease-out) backwards;
  }
  .sheet-card {
    padding: 22px 18px 14px;
    border-radius: 30px;
  }
  /* iPhone, onglet Profil sans compte : « Rejoins la Communauté » au milieu de l'écran. */
  .sheet.mid {
    margin-top: max(0px, calc((100dvh - var(--safe-top) - 330px) / 2 - 20px));
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
  /* Widgets posés sur la carte, l'un sous l'autre : météo, puis lieux à mettre en valeur. */
  .widgets {
    position: fixed;
    z-index: 15;
    top: calc(env(safe-area-inset-top, 0px) + 14px);
    left: var(--gutter);
    width: min(300px, calc(100vw - 2 * var(--gutter) - 64px));
    display: grid;
    gap: 8px;
    pointer-events: none;
  }
  .widgets > :global(*) {
    pointer-events: auto;
  }
  .place-zone {
    display: contents;
  }
  @media (min-width: 860px) {
    .widgets {
      left: 408px;
      top: 76px;
    }
    /* Réglages fermés : la carte occupe tout, les widgets se rangent à gauche. */
    .widgets.full {
      left: var(--gutter);
    }
  }
  /* Mac : « Créer un parcours », pastille rose en bas au centre de la carte. */
  .make {
    position: fixed;
    z-index: 18;
    left: 50%;
    bottom: 28px;
    translate: -50% 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    padding: 0 26px 0 22px;
    border-radius: 999px;
    font-size: 1.0625rem;
    font-weight: 650;
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%),
      var(--tint);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.5),
      0 16px 32px -14px color-mix(in srgb, var(--tint) 90%, transparent);
    animation: make-in 520ms var(--spring) backwards;
    transition: transform 260ms var(--spring-bouncy);
  }
  .make:hover {
    transform: scale(1.03);
  }
  .make:active {
    transform: scale(0.97);
  }
  @keyframes make-in {
    from {
      opacity: 0;
      translate: -50% 16px;
    }
  }
  /* ▶ Suivre : bulle rose de verre liquide, comme la bulle « Faire une boucle ». */
  .play {
    width: 46px;
    height: 46px;
    margin-left: 2px;
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 58%),
      var(--tint);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.6),
      inset 0 -2px 5px rgba(0, 0, 0, 0.18),
      0 10px 22px -10px color-mix(in srgb, var(--tint) 90%, transparent);
  }
  .play:active:not(:disabled) {
    transform: scale(1.1);
  }
  .play :global(.icon) {
    translate: 1px 0;
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
    display: grid;
    justify-items: center;
    pointer-events: none;
  }
  /* Tous dans la même case : les plus anciens glissent 14 px dessous et rapetissent de 5 % par rang, texte caché. */
  .toast {
    grid-area: 1 / 1;
    z-index: calc(10 - var(--d, 0));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 0.9375rem;
    font-weight: 500;
    max-width: calc(100vw - 32px);
    text-align: center;
    pointer-events: auto;
    transform: translateY(calc(var(--d, 0) * 14px)) scale(calc(1 - var(--d, 0) * 0.05));
    transition: transform 240ms var(--ease-out);
    animation: toast-in 300ms var(--spring);
  }
  .toast.back .t-text,
  .toast.back .undo {
    opacity: 0;
    transition: opacity 160ms var(--ease-out);
  }
  .toast-zone.open .toast {
    transform: translateY(calc(var(--d, 0) * (100% + 14px)));
  }
  .toast-zone.open .toast.back .t-text,
  .toast-zone.open .toast.back .undo {
    opacity: 1;
  }
  .undo {
    position: relative;
    flex: none;
    font-weight: 700;
    color: var(--tint);
    padding: 2px 0;
  }
  :global(.on-photo) .undo {
    color: #ff8fa6;
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
