<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import CommunityItem from './CommunityItem.svelte';
  import ProfileView from './ProfileView.svelte';
  import { community } from '../lib/community.svelte';
  import { app } from '../lib/state.svelte';
  import { SPORTS } from '../lib/sports';
  import { haptic, tactile } from '../lib/haptics';
  import type { FeedKind } from '../lib/community/types';
  import type { IconName } from '../lib/icons';
  import type { Sport } from '../lib/types';

  const SPORT_ICON: Record<Sport, IconName> = { run: 'run', trail: 'hike', road: 'bicycle', gravel: 'bike' };
  const from = $derived(community.feedKind === 'nearby' ? (app.userPos ?? app.start?.coord ?? null) : null);

  const EMPTY: Record<FeedKind, { title: string; text: string }> = {
    nearby: {
      title: 'Personne n’a encore publié autour de toi',
      text: 'Crée une boucle qui te plaît, puis touche Publier : tu seras le premier sur la carte.',
    },
    following: {
      title: 'Aucun abonnement pour l’instant',
      text: 'Sur le profil d’un coureur ou d’un cycliste, touche Suivre : ses parcours arriveront ici.',
    },
    popular: { title: 'Pas encore de parcours aimés', text: 'Les parcours les plus aimés de ces derniers mois apparaîtront ici.' },
  };
</script>

{#if !community.available}
  <div class="c-empty">
    <span class="c-empty-ic" aria-hidden="true"><Icon name="users" size={40} /></span>
    <h3>La Communauté arrive bientôt</h3>
    <p class="hint">Tu pourras y publier tes parcours, découvrir ceux des coureurs et cyclistes autour de toi, les aimer, les commenter et les reprendre.</p>
  </div>
{:else if community.view === 'profile' && community.viewing}
  <ProfileView />
{:else}
  {#if community.demo}
    <div class="banner demo" role="note">
      <span class="icon"><Icon name="shield" size={18} /></span>
      <span>Démonstration : membres et parcours fictifs, rien ne quitte ton appareil. Code de connexion : 123456.</span>
      {#if community.configured}<button use:tactile type="button" class="text-btn" onclick={() => community.quitDemo()}>Quitter</button>{/if}
    </div>
  {/if}

  <div class="feed-head">
    <Segmented
      label="Parcours de la communauté"
      value={community.feedKind}
      options={[
        { value: 'nearby', label: 'Autour de toi' },
        { value: 'following', label: 'Abonnements' },
        { value: 'popular', label: 'Populaires' },
      ]}
      onchange={(v) => community.setFeedKind(v)}
    />
    <div class="sports" role="group" aria-label="Sport">
      {#each Object.keys(SPORTS) as s (s)}
        {@const sp = s as Sport}
        {@const on = community.sport === sp}
        <button use:tactile type="button" class="chip" class:on aria-pressed={on} onclick={() => {
            haptic('tap');
            community.setSport(sp);
          }}>
          <Icon name={SPORT_ICON[sp]} size={16} fill={on} />{SPORTS[sp].label}
        </button>
      {/each}
    </div>
  </div>

  {#if community.loading && !community.feed.length}
    <ul class="c-list skel" aria-label="Chargement des parcours" aria-busy="true">
      {#each [0, 1, 2] as k (k)}
        <li class="sk">
          <span class="sk-a"></span>
          <span class="sk-r"><span class="sk-g"></span><span class="sk-lines"><span></span><span class="short"></span></span></span>
        </li>
      {/each}
    </ul>
  {:else if community.error}
    <div class="banner is-error" role="alert">
      <span class="icon"><Icon name="warning" size={18} /></span>
      <span>{community.error}</span>
      <button use:tactile type="button" class="text-btn" onclick={() => community.loadFeed()}>Réessayer</button>
    </div>
  {:else if community.feed.length}
    <ul class="c-list" aria-label="Parcours publiés" aria-busy={community.loading}>
      {#each community.feed as r, i (r.id)}
        <CommunityItem {r} {i} {from} />
      {/each}
    </ul>
    <p class="hint foot">Un parcours publié commence à 300{' '}m du départ de son auteur : son adresse reste privée.</p>
  {:else}
    <div class="c-empty">
      <span class="c-empty-ic" aria-hidden="true"><Icon name={community.feedKind === 'following' ? 'userPlus' : 'users'} size={38} /></span>
      <h3>{EMPTY[community.feedKind].title}</h3>
      <p class="hint">{EMPTY[community.feedKind].text}</p>
      {#if community.feedKind === 'following'}
        <button use:tactile type="button" class="pill is-on" onclick={() => community.setFeedKind('nearby')}>Voir autour de toi</button>
      {:else}
        <button use:tactile type="button" class="pill is-on" onclick={() => (app.phase = 'compose')}>Créer un parcours</button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .demo {
    margin-bottom: 12px;
    align-items: center;
  }
  .demo .text-btn {
    margin-left: auto;
    min-height: 32px;
  }
  .feed-head {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }
  .sports {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -16px;
    padding: 0 16px;
  }
  .sports::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--label);
    transition:
      background-color 200ms var(--ease-out),
      color 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .chip.on {
    color: var(--tint-deep);
    background: var(--tint-soft);
    font-weight: 600;
  }
  .foot {
    margin: 0 4px 8px;
  }
  /* Chargement : la forme du fil, sans contenu, qui pulse doucement. */
  .sk {
    display: grid;
    gap: 10px;
    padding: 14px;
  }
  .sk + .sk {
    border-top: 0.5px solid var(--separator);
  }
  .sk-a {
    width: 46%;
    height: 12px;
    border-radius: 6px;
    background: var(--fill-2);
  }
  .sk-r {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .sk-g {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1.5px dashed var(--label-3);
    opacity: 0.6;
  }
  .sk-lines {
    flex: 1;
    display: grid;
    gap: 8px;
  }
  .sk-lines span {
    height: 10px;
    border-radius: 5px;
    background: var(--fill-2);
  }
  .sk-lines .short {
    width: 60%;
  }
  .skel {
    animation: sk-pulse 1.2s ease-in-out infinite alternate;
  }
  @keyframes sk-pulse {
    to {
      opacity: 0.55;
    }
  }
</style>
