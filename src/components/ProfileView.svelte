<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import CommunityItem from './CommunityItem.svelte';
  import Segmented from './Segmented.svelte';
  import { community } from '../lib/community.svelte';
  import { pageUrl } from '../lib/platform';
  import { LEVELS } from '../lib/community/types';
  import { SPORTS } from '../lib/sports';
  import { haptic, tactile } from '../lib/haptics';
  import type { IconName } from '../lib/icons';
  import type { Sport } from '../lib/types';

  const SPORT_ICON: Record<Sport, IconName> = { run: 'run', trail: 'hike', road: 'bicycle', gravel: 'bike' };
  const v = $derived(community.viewing!);
  const p = $derived(v.profile);
  const mine = $derived(community.me?.id === p.id);
  const followed = $derived(community.following.includes(p.id));
  const since = $derived(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(p.createdAt));

  /** Parcours publiés ou photos de sorties, comme les onglets d'un profil Instagram. */
  let tab = $state<'routes' | 'photos'>('routes');
  let picker = $state<HTMLInputElement>();
  let avatarBusy = $state(false);

  async function pickAvatar(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    avatarBusy = true;
    await community.changeAvatar(file);
    avatarBusy = false;
  }

  /** Suppression du compte : un premier toucher demande confirmation, dans la page. */
  let confirmDelete = $state(false);
  let deleting = $state(false);
</script>

<section class="head" aria-label="Profil de {p.firstName}">
  {#if mine}
    <button use:tactile type="button" class="me-ph" aria-label={p.avatar ? 'Changer ma photo de profil' : 'Ajouter une photo de profil'} disabled={avatarBusy} onclick={() => picker?.click()}>
      <Avatar id={p.id} name={p.firstName} src={p.avatar} size={88} />
      <span class="me-badge" aria-hidden="true"><Icon name="camera" size={15} fill /></span>
      {#if avatarBusy}<span class="me-busy" aria-hidden="true"></span>{/if}
    </button>
    <input bind:this={picker} type="file" accept="image/*" hidden onchange={pickAvatar} />
  {:else}
    <Avatar id={p.id} name={p.firstName} src={p.avatar} size={88} />
  {/if}
  <dl class="pstats">
    <div><dd class="rounded tabular">{v.stats.routes}</dd><dt>Parcours</dt></div>
    <div><dd class="rounded tabular">{v.stats.followers}</dd><dt>Abonnés</dt></div>
    <div><dd class="rounded tabular">{v.stats.following}</dd><dt>Abonnements</dt></div>
  </dl>
</section>

<div class="who">
  <h2>{p.firstName}</h2>
  <p class="sub">{LEVELS[p.level]}{p.city ? ` · ${p.city}` : ''}{v.stats.likes ? ` · ${v.stats.likes} j’aime reçu${v.stats.likes > 1 ? 's' : ''}` : ''}</p>
</div>
{#if p.bio}<p class="bio">{p.bio}</p>{:else if mine}<button use:tactile type="button" class="text-btn add-bio" onclick={() => (community.sheet = { kind: 'edit' })}>Ajoute une présentation</button>{/if}
<p class="sports">
  {#each p.sports as s (s)}<span class="sp"><Icon name={SPORT_ICON[s]} size={15} />{SPORTS[s].label}</span>{/each}
</p>
<p class="hint since">Membre depuis {since}{p.practiceYears != null ? ` · pratique depuis ${p.practiceYears} an${p.practiceYears > 1 ? 's' : ''}` : ''}</p>

<div class="acts">
  {#if mine}
    <button use:tactile type="button" class="pill" onclick={() => (community.sheet = { kind: 'edit' })}><Icon name="pencil" size={17} />Modifier le profil</button>
  {:else}
    <button use:tactile type="button" class="pill" class:is-on={!followed} aria-label={followed ? `Ne plus suivre ${p.firstName}` : `Suivre ${p.firstName}`} onclick={() => community.toggleFollow(p.id)}>
      <Icon name={followed ? 'userCheck' : 'userPlus'} size={18} />{followed ? 'Abonné' : 'Suivre'}
    </button>
  {/if}
</div>

<div class="tabs">
  <Segmented
    label="Contenu du profil"
    value={tab}
    options={[
      { value: 'routes', label: `Parcours${v.routes.length ? ` · ${v.routes.length}` : ''}` },
      { value: 'photos', label: `Photos${v.photos.length ? ` · ${v.photos.length}` : ''}` },
    ]}
    onchange={(t) => (tab = t)}
  />
</div>
{#if tab === 'routes'}
  {#if v.routes.length}
    <ul class="c-list" aria-label="Parcours publiés par {p.firstName}">
      {#each v.routes as r, i (r.id)}
        <CommunityItem {r} {i} author={false} />
      {/each}
    </ul>
  {:else}
    <p class="hint none">{mine ? 'Rien de publié pour l’instant : sur un parcours qui te plaît, touche Publier.' : `${p.firstName} n’a encore rien publié.`}</p>
  {/if}
{:else if v.photos.length}
  <ul class="grid" aria-label="Photos de sorties de {p.firstName}">
    {#each v.photos as ph, i (ph.id)}
      <li style:--i={Math.min(i, 12)}>
        <button use:tactile type="button" aria-label="Photo {i + 1}{ph.caption ? ` : ${ph.caption}` : ''}" onclick={() => community.openPhotos(v.photos, i)}>
          <img src={ph.thumb} alt="" loading="lazy" decoding="async" />
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <p class="hint none">{mine ? 'Tes photos de sorties apparaîtront ici : ouvre un parcours de la Communauté et touche Ajouter.' : `${p.firstName} n’a pas encore partagé de photo.`}</p>
{/if}

{#if mine}
  <h3 class="field-label lh">Compte</h3>
  <div class="group">
    <button use:tactile type="button" class="row link" onclick={() => community.signOut()}>
      <span class="row-icon"><Icon name="signout" size={20} /></span><span class="row-label">Se déconnecter</span>
    </button>
    <a class="row link" href={pageUrl('confidentialite.html')} target="_blank" rel="noopener">
      <span class="row-icon"><Icon name="lock" size={20} /></span><span class="row-label">Confidentialité</span><Icon name="chevron" size={14} />
    </a>
    <a class="row link" href={pageUrl('conditions.html')} target="_blank" rel="noopener">
      <span class="row-icon"><Icon name="shield" size={20} /></span><span class="row-label">Conditions d’utilisation</span><Icon name="chevron" size={14} />
    </a>
  </div>
  {#if !confirmDelete}
    <button use:tactile type="button" class="danger-link" onclick={() => (confirmDelete = true)}>Supprimer mon compte</button>
  {:else}
    <div class="confirm" role="group" aria-label="Confirmer la suppression du compte">
      <p><b>Supprimer ton compte ?</b> Ton profil, tes parcours publiés, tes j’aime et tes commentaires seront effacés, sans retour possible. Tes favoris et ton historique restent sur cet appareil.</p>
      <div class="confirm-acts">
        <button use:tactile type="button" class="pill" onclick={() => (confirmDelete = false)}>Annuler</button>
        <button use:tactile type="button" class="pill danger" disabled={deleting} onclick={async () => {
            deleting = true;
            haptic('warn');
            await community.deleteAccount();
            deleting = false;
          }}>{deleting ? 'Suppression…' : 'Supprimer définitivement'}</button>
      </div>
    </div>
  {/if}
{:else}
  <div class="mod">
    <button use:tactile type="button" class="text-btn" onclick={() => community.toggleBlock(p.id, p.firstName)}>
      {community.blocked.includes(p.id) ? `Ne plus masquer ${p.firstName}` : `Masquer ${p.firstName}`}
    </button>
    <button use:tactile type="button" class="text-btn" onclick={() => community.startReport({ profileId: p.id }, `le profil de ${p.firstName}`)}>Signaler ce profil</button>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 12px;
  }
  .who {
    min-width: 0;
    margin-bottom: 4px;
  }
  .me-ph {
    position: relative;
    flex: none;
    border-radius: 50%;
    transition: transform 240ms var(--spring);
  }
  .me-ph:active {
    transform: scale(0.95);
  }
  .me-badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--on-tint);
    background: var(--tint);
    box-shadow: 0 2px 10px -2px rgba(0, 0, 0, 0.35);
  }
  .me-busy {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
    animation: busy 1s ease-in-out infinite alternate;
  }
  @keyframes busy {
    to {
      opacity: 0.4;
    }
  }
  .add-bio {
    display: block;
    min-height: 32px;
    margin: 0 0 4px;
    padding: 0;
  }
  .tabs {
    margin: 0 0 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    margin: 0 0 18px;
    padding: 0;
    list-style: none;
    border-radius: 14px;
    overflow: hidden;
  }
  .grid li {
    aspect-ratio: 1;
    animation: cell-in 380ms var(--spring) calc(var(--i, 0) * 30ms) both;
  }
  @keyframes cell-in {
    from {
      opacity: 0;
      scale: 0.92;
    }
  }
  .grid button {
    width: 100%;
    height: 100%;
    display: block;
    background: var(--fill-2);
  }
  .grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 2px 0 0;
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .sports {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 0 0 6px;
  }
  .sp {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8125rem;
    color: var(--label);
  }
  .sp :global(.icon) {
    color: var(--tint);
  }
  .bio {
    margin: 0 0 8px;
    font-size: 0.9375rem;
    line-height: 1.45;
    white-space: pre-line;
  }
  .since {
    margin: 0 0 14px;
  }
  .pstats {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 0;
  }
  .pstats div {
    display: grid;
    justify-items: center;
    gap: 2px;
    text-align: center;
  }
  .pstats dt {
    font-size: 0.6875rem;
    color: var(--label-2);
    font-weight: 500;
  }
  .pstats dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }
  .acts {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }
  .acts .pill {
    flex: 1;
  }
  .lh {
    margin: 0 0 8px;
  }
  .none {
    margin: 0 4px 18px;
  }
  .link {
    width: 100%;
    color: var(--label);
    text-decoration: none;
    text-align: left;
  }
  .link :global(.icon:last-child) {
    color: var(--label-3);
  }
  .danger-link {
    display: block;
    margin: 14px auto 6px;
    min-height: 44px;
    padding: 0 12px;
    color: #ff3b30;
    font-weight: 500;
  }
  .confirm {
    margin-top: 14px;
    padding: 14px;
    border-radius: 18px;
    background: color-mix(in srgb, #ff3b30 10%, transparent);
  }
  .confirm p {
    margin: 0 0 12px;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .confirm-acts {
    display: flex;
    gap: 8px;
  }
  .confirm-acts .pill {
    flex: 1;
  }
  .pill.danger {
    background: #ff3b30;
    color: #fff;
  }
  .mod {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 8px;
  }
  .mod .text-btn {
    color: var(--label-2);
    font-size: 0.875rem;
  }
</style>
