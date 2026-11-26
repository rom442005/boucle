<script lang="ts">
  import CountUp from './CountUp.svelte';
  import Icon from './Icon.svelte';
  import CommunityItem from './CommunityItem.svelte';
  import ProfileView from './ProfileView.svelte';
  import ActivityBars from './ActivityBars.svelte';
  import { community } from '../lib/community.svelte';
  import { app } from '../lib/state.svelte';
  import { SPORTS } from '../lib/sports';
  import { SPORT_EMOJI } from '../lib/scenes';
  import { haptic, tactile } from '../lib/haptics';
  import type { FeedKind } from '../lib/community/types';
  import type { IconName } from '../lib/icons';
  import type { Sport } from '../lib/types';

  /*
   * La Communauté, dans la même grammaire que Mes parcours (fil rouge, DESIGN.md) : sur la photo, un bloc
   * récapitulatif (combien de parcours, de membres, et leurs publications des 28 derniers jours en barres),
   * trois blocs-onglets avec leur nombre, les sports en pastilles, puis chaque parcours en bloc de verre.
   */
  const SPORT_ICON: Record<Sport, IconName> = { run: 'run', walk: 'walk', trail: 'hike', road: 'bicycle', gravel: 'bike' };
  const KINDS: { k: FeedKind; emoji: string; label: string; title: string }[] = [
    { k: 'nearby', emoji: '📍', label: 'Autour', title: 'Autour de toi' },
    { k: 'following', emoji: '👥', label: 'Suivis', title: 'Abonnements' },
    { k: 'popular', emoji: '🔥', label: 'Populaires', title: 'Populaires' },
  ];
  /** Le serveur renvoie au plus 60 parcours par fil. */
  const count = (n: number | null) => (n == null ? '–' : n >= 60 ? '60+' : String(n));

  const kind = $derived(KINDS.find((x) => x.k === community.feedKind)!);
  const from = $derived(community.feedKind === 'nearby' ? (app.userPos ?? app.start?.coord ?? null) : null);
  const place = $derived(app.start ? (app.start.kind === 'gps' ? (app.start.detail?.split(',').pop()?.trim() ?? null) : app.start.name) : null);
  const authors = $derived(new Set(community.feed.map((r) => r.authorId)).size);
  /** Le sport le plus publié, pour l'émoji du résumé. */
  const topSport = $derived.by(() => {
    if (community.sport) return SPORT_EMOJI[community.sport];
    const n: Partial<Record<Sport, number>> = {};
    for (const r of community.feed) n[r.sport] = (n[r.sport] ?? 0) + 1;
    const top = (Object.entries(n) as [Sport, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? SPORT_EMOJI[top] : '🏃';
  });
  const published = $derived(community.feed.map((r) => ({ date: r.createdAt, distanceM: r.distanceM, route: { s: r.sport } })));
  const following = $derived(community.following.length);

  const EMPTY: Record<FeedKind, string> = {
    nearby: 'Rien de publié autour de toi',
    following: 'Aucun abonnement',
    popular: 'Pas encore de parcours aimés',
  };
</script>

{#if !community.available}
  <div class="cards">
    <section class="card wide glass photo-card empty" aria-label="Communauté">
      <span class="empty-ic" aria-hidden="true"><Icon name="users" size={36} /></span>
      <h3>La Communauté arrive bientôt</h3>
    </section>
  </div>
{:else if community.view === 'profile' && community.viewing}
  <ProfileView />
{:else}
  <div class="cards">
    {#if community.demo}
      <div class="demo wide" role="note" aria-label="Démonstration : membres et parcours fictifs, rien ne quitte ton appareil. Code de connexion : 123456.">
        <span>🧪 Démo · code <b class="tabular">123456</b></span>
        {#if community.configured}<button use:tactile type="button" class="text-btn" onclick={() => community.quitDemo()}>Quitter</button>{/if}
      </div>
    {/if}

    <!-- Le fil en un coup d'œil, comme le bloc du mois de Mes parcours. -->
    <section class="card wide glass photo-card" aria-label="En bref">
      <div class="card-top">
        <span class="k">{kind.emoji} {kind.title}</span>
        <span class="k">
          {#if community.feedKind === 'nearby'}{place ? `📍 ${place}` : ''}{:else if community.feedKind === 'following'}👥 {following} suivi{following > 1 ? 's' : ''}{:else}🗓️ 4 mois{/if}
        </span>
      </div>
      <div class="m">
        <span class="emo" aria-hidden="true">{topSport}</span>
        <b class="big rounded tabular">{community.loading && !community.feed.length ? '–' : count(community.feed.length)}<small>parcours</small></b>
        <span class="side"><b class="rounded"><CountUp value={authors} /></b> membre{authors > 1 ? 's' : ''}</span>
      </div>
      <div class="sep"></div>
      <span class="k">28 derniers jours</span>
      <ActivityBars entries={published} label="Kilomètres publiés par jour, 28 derniers jours" />
    </section>

    <!-- Les trois fils, en blocs-onglets avec leur nombre (comme Favoris et Sorties). -->
    <div class="kinds wide" role="group" aria-label="Parcours de la communauté">
      {#each KINDS as x (x.k)}
        {@const on = community.feedKind === x.k}
        <button use:tactile type="button" class="card tabcard glass photo-card" class:on aria-pressed={on} onclick={() => {
            haptic('tap');
            community.setFeedKind(x.k);
          }}>
          <span class="k">{x.label}</span>
          <span class="nrow"><span class="emo-s" aria-hidden="true">{x.emoji}</span><b class="n rounded tabular">{count(community.feedCounts[x.k])}</b></span>
        </button>
      {/each}
    </div>

    <div class="sports wide" role="group" aria-label="Sport">
      {#each Object.keys(SPORTS) as sp (sp)}
        {@const s = sp as Sport}
        {@const on = community.sport === s}
        <button use:tactile type="button" class="chip" class:on aria-pressed={on} onclick={() => {
            haptic('tap');
            community.setSport(s);
          }}>
          <Icon name={SPORT_ICON[s]} size={16} fill={on} />{SPORTS[s].label}
        </button>
      {/each}
    </div>

    {#if community.loading && !community.feed.length}
      <ul class="c-list wide skel" aria-label="Chargement des parcours" aria-busy="true">
        {#each [0, 1] as k (k)}
          <li class="glass photo-card sk">
            <span class="sk-media"></span>
            <span class="sk-lines"><span></span><span class="short"></span></span>
          </li>
        {/each}
      </ul>
    {:else if community.error}
      <section class="card wide glass photo-card" aria-label="Erreur">
        <div class="banner is-error" role="alert">
          <span class="icon"><Icon name="warning" size={18} /></span>
          <span>{community.error}</span>
          <button use:tactile type="button" class="text-btn" onclick={() => community.loadFeed()}>Réessayer</button>
        </div>
      </section>
    {:else if community.feed.length}
      <ul class="c-list wide" aria-label="Parcours publiés" aria-busy={community.loading}>
        {#each community.feed as r, i (r.id)}
          <CommunityItem {r} {i} {from} />
        {/each}
      </ul>
    {:else}
      <section class="card wide glass photo-card empty" aria-label={EMPTY[community.feedKind]}>
        <svg viewBox="0 0 120 84" width="120" height="84" aria-hidden="true">
          <path d="M22 62c-9-10-6-30 8-36 13-6 20 6 32 2s14-18 30-12c15 6 14 30 0 40-12 9-26 2-38 6S30 72 22 62Z" fill="none" stroke="var(--tint)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 7" />
          <circle cx="22" cy="62" r="6" fill="var(--tint)" />
          <circle cx="22" cy="62" r="10" fill="none" stroke="var(--tint)" stroke-opacity=".25" stroke-width="3" />
        </svg>
        <h3>{EMPTY[community.feedKind]}</h3>
        {#if community.feedKind === 'following'}
          <button use:tactile type="button" class="pill is-on" onclick={() => community.setFeedKind('nearby')}>Voir autour de toi</button>
        {:else}
          <button use:tactile type="button" class="pill is-on" onclick={() => (app.phase = 'compose')}>Créer un parcours</button>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  /* Mêmes blocs que Mes parcours (Library.svelte) : mêmes rayons, marges, chiffres et entrée en cascade. */
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding-bottom: 8px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .card {
    display: grid;
    gap: 6px;
    min-width: 0;
    border-radius: 26px;
    padding: 14px 16px;
    text-align: left;
    color: var(--label);
    animation: card-in 560ms var(--spring) backwards;
  }
  .cards > :nth-child(2) { animation-delay: 70ms; }
  .cards > :nth-child(3) { animation-delay: 110ms; }
  .cards > :nth-child(n + 4) { animation-delay: 160ms; }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 14px;
      scale: 0.97;
    }
  }
  .k {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--label-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .m {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .emo {
    font-size: 2.25rem;
    line-height: 1;
  }
  .big {
    font-size: 2.75rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .big small {
    font-family: var(--font);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 6px;
  }
  .side {
    margin-left: auto;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .side b {
    font-size: 1.25rem;
    font-weight: 650;
    color: var(--label);
  }
  .sep {
    height: 0.5px;
    margin: 6px 0 4px;
    background: var(--separator);
  }
  /* Trois blocs-onglets sur une ligne. */
  .kinds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .kinds > :nth-child(2) { animation-delay: 110ms; }
  .kinds > :nth-child(3) { animation-delay: 150ms; }
  .tabcard {
    animation-delay: 70ms;
    transition:
      transform 260ms var(--spring),
      box-shadow 260ms var(--ease-out);
  }
  .tabcard:active {
    transform: scale(0.97);
  }
  .tabcard.on {
    box-shadow:
      var(--shadow-glass),
      inset 0 0 0 2px rgba(255, 255, 255, 0.85);
  }
  /* Étiquette seule en haut (elle tient sur iPhone), l'émoji à côté du chiffre. */
  .nrow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .emo-s {
    font-size: 1.125rem;
    line-height: 1;
  }
  .kinds .tabcard {
    padding: 13px 13px;
  }
  .tabcard .n {
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  /* Les sports : pastilles de verre ; choisie, pastille blanche pleine (fil rouge). */
  .sports {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 2px 0;
    animation: card-in 560ms var(--spring) 130ms backwards;
  }
  .sports::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px 0 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    -webkit-backdrop-filter: blur(20px) saturate(1.5);
    backdrop-filter: blur(20px) saturate(1.5);
    box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.35);
    font-size: 0.875rem;
    font-weight: 600;
    color: #fff;
    transition:
      background-color 200ms var(--ease-out),
      color 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .chip.on {
    color: #1c1c1e;
    background: #fff;
  }
  .demo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    justify-self: center;
    padding: 4px 14px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .demo b {
    color: var(--label);
  }
  .demo .text-btn {
    min-height: 28px;
    font-size: 0.8125rem;
  }
  .c-list {
    margin: 0;
  }
  /* Vide : la boucle en pointillés de Mes parcours, un titre, une action. */
  .empty {
    justify-items: center;
    text-align: center;
    gap: 10px;
    padding: 22px 16px 18px;
  }
  .empty h3 {
    margin: 6px 0 4px;
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .empty-ic {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--tint);
    background: var(--tint-soft);
  }
  /* Chargement : la forme des blocs du fil, sans contenu, qui pulse doucement. */
  .sk {
    display: grid;
    gap: 12px;
    padding: 8px 8px 16px;
  }
  .sk-media {
    height: 168px;
    border-radius: 20px;
    background: var(--fill-2);
  }
  .sk-lines {
    display: grid;
    gap: 8px;
    padding: 0 8px;
  }
  .sk-lines span {
    height: 11px;
    width: 70%;
    border-radius: 6px;
    background: var(--fill-2);
  }
  .sk-lines .short {
    width: 45%;
  }
  .skel {
    animation: sk-pulse 1.2s ease-in-out infinite alternate;
  }
  @keyframes sk-pulse {
    to {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .sports {
      animation: none;
    }
  }
  /* Téléphone : des blocs un peu plus compacts (Romain, 23/11). */
  @media (max-width: 859px) {
    .cards {
      gap: 8px;
    }
    .card {
      padding: 12px 14px;
      border-radius: 24px;
    }
    .k {
      font-size: 0.75rem;
    }
    .big {
      font-size: 2.375rem;
    }
    .tabcard .n {
      font-size: 1.75rem;
    }
    .kinds .tabcard {
      padding: 11px 12px;
    }
  }
</style>
