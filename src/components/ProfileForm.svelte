<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import Avatar from './Avatar.svelte';
  import { untrack } from 'svelte';
  import { community } from '../lib/community.svelte';
  import { pageUrl } from '../lib/platform';
  import { CommunityError, LEVELS, type Level } from '../lib/community/types';
  import { SPORTS } from '../lib/sports';
  import { haptic, tactile } from '../lib/haptics';
  import type { IconName } from '../lib/icons';
  import type { Sport } from '../lib/types';

  /** Profil : à la création du compte (avec l'accord aux conditions) ou pour le modifier. */
  let { creating = false, ondone }: { creating?: boolean; ondone: () => void } = $props();

  const SPORT_ICON: Record<Sport, IconName> = { run: 'run', trail: 'hike', road: 'bicycle', gravel: 'bike' };
  const me = community.me;
  const year = new Date().getFullYear();

  let firstName = $state(me?.firstName ?? '');
  let birthYear = $state<number | null>(community.myPrivate?.birthYear ?? null);
  let city = $state(me?.city ?? '');
  let sports = $state<Sport[]>(me?.sports ?? []);
  let level = $state<Level>(me?.level ?? 'regular');
  let years = $state<number | null>(me?.practiceYears ?? null);
  let bio = $state(me?.bio ?? '');
  let avatar = $state<string | null>(me?.avatar ?? null);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let avatarBusy = $state(false);
  let picker = $state<HTMLInputElement>();
  const uid = community.session?.userId ?? 'moi';

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    avatarBusy = true;
    error = null;
    try {
      avatar = await community.uploadAvatar(file);
      haptic('success');
    } catch (err) {
      error = err instanceof CommunityError ? err.message : 'Cette photo n’a pas pu être envoyée. Essaie une autre image.';
      haptic('warn');
    } finally {
      avatarBusy = false;
    }
  }
  // À la création, l'accord aux conditions est à donner ; ensuite, il est acquis.
  let accept = $state(untrack(() => !creating));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const age = $derived(birthYear ? year - birthYear : null);

  function toggle(s: Sport) {
    haptic('tap');
    sports = sports.includes(s) ? sports.filter((x) => x !== s) : [...sports, s];
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    if (!firstName.trim()) return void (error = 'Indique ton prénom.');
    if (!birthYear || birthYear < 1900 || birthYear > year) return void (error = 'Indique ton année de naissance.');
    if (age != null && age < 15) return void (error = 'Boucle est réservé aux personnes de 15 ans et plus.');
    if (!sports.length) return void (error = 'Choisis au moins un sport.');
    if (!accept) return void (error = 'Pour créer ton compte, accepte les conditions d’utilisation.');
    busy = true;
    try {
      await community.saveProfile(
        {
          firstName: firstName.trim(),
          city: city.trim() || null,
          sports,
          level,
          practiceYears: years != null && years >= 0 ? Math.min(80, Math.round(years)) : null,
          bio: bio.trim() || null,
          avatar,
        },
        { birthYear },
      );
      ondone();
    } catch (err) {
      error = err instanceof CommunityError ? err.message : 'Enregistrement impossible pour le moment.';
      haptic('warn');
    } finally {
      busy = false;
    }
  }
</script>

<form class="pf" onsubmit={submit} novalidate>
  <div class="ph">
    <button use:tactile type="button" class="ph-btn" aria-label={avatar ? 'Changer la photo de profil' : 'Ajouter une photo de profil'} disabled={avatarBusy} onclick={() => picker?.click()}>
      <Avatar id={uid} name={firstName || '?'} src={avatar} size={96} />
      <span class="ph-badge" aria-hidden="true"><Icon name="camera" size={16} fill /></span>
      {#if avatarBusy}<span class="ph-busy" aria-hidden="true"></span>{/if}
    </button>
    <div class="ph-acts">
      <button use:tactile type="button" class="text-btn" disabled={avatarBusy} onclick={() => picker?.click()}>{avatarBusy ? 'Envoi…' : avatar ? 'Changer la photo' : 'Ajouter une photo'}</button>
      {#if avatar && !avatarBusy}<button use:tactile type="button" class="text-btn muted" onclick={() => (avatar = null)}>Retirer</button>{/if}
    </div>
    <input bind:this={picker} type="file" accept="image/*" hidden onchange={pick} />
  </div>

  <label class="field">
    <span class="field-label">Prénom</span>
    <input class="input" bind:value={firstName} autocomplete="given-name" maxlength="40" required />
  </label>

  <div class="two">
    <label class="field">
      <span class="field-label">Année de naissance</span>
      <input class="input tabular" type="number" inputmode="numeric" min="1900" max={year} placeholder="1995" bind:value={birthYear} autocomplete="bday-year" required />
    </label>
    <label class="field">
      <span class="field-label">Ville</span>
      <input class="input" bind:value={city} autocomplete="address-level2" maxlength="60" />
    </label>
  </div>

  <div class="field">
    <span class="field-label">Sports pratiqués</span>
    <div class="chips" role="group" aria-label="Sports pratiqués">
      {#each Object.keys(SPORTS) as s (s)}
        {@const sp = s as Sport}
        {@const on = sports.includes(sp)}
        <button use:tactile type="button" class="chip" class:on aria-pressed={on} onclick={() => toggle(sp)}>
          <Icon name={SPORT_ICON[sp]} size={16} fill={on} />{SPORTS[sp].label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="field-label">Niveau</span>
    <Segmented label="Niveau" value={level} options={(Object.keys(LEVELS) as Level[]).map((l) => ({ value: l, label: LEVELS[l] }))} onchange={(v) => (level = v)} />
  </div>

  <label class="field">
    <span class="field-label">Années de pratique</span>
    <input class="input tabular short" type="number" inputmode="numeric" min="0" max="80" bind:value={years} />
  </label>

  <label class="field">
    <span class="field-label">Présentation</span>
    <textarea class="input" rows="3" maxlength="300" placeholder="Qui tu es, tes sorties préférées, tes objectifs, ton prochain dossard…" bind:value={bio}></textarea>
  </label>

  {#if creating}
    <label class="accept">
      <input type="checkbox" class="check" bind:checked={accept} />
      <span>J’accepte les <a href={pageUrl('conditions.html')} target="_blank" rel="noopener">conditions d’utilisation</a> et la <a href={pageUrl('confidentialite.html')} target="_blank" rel="noopener">politique de confidentialité</a>.</span>
    </label>
  {/if}

  {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}

  <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Enregistrement…' : creating ? 'Créer mon profil' : 'Enregistrer'}</button>
</form>

{#if !creating}
  <!-- Le compte, rangé ici pour alléger le profil. -->
  <h3 class="field-label acct-h">Compte</h3>
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
      <p><b>Supprimer ton compte ?</b> Profil, parcours publiés, photos, j’aime et commentaires sont effacés, sans retour possible.</p>
      <div class="confirm-acts">
        <button use:tactile type="button" class="pill" onclick={() => (confirmDelete = false)}>Annuler</button>
        <button use:tactile type="button" class="pill danger" disabled={deleting} onclick={async () => {
            deleting = true;
            haptic('warn');
            await community.deleteAccount();
            deleting = false;
          }}>{deleting ? 'Suppression…' : 'Supprimer'}</button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .acct-h {
    margin: 22px 0 8px;
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
  .ph {
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  .ph-btn {
    position: relative;
    border-radius: 50%;
    transition: transform 240ms var(--spring);
  }
  .ph-btn:active {
    transform: scale(0.95);
  }
  .ph-badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--on-tint);
    background: var(--tint);
    box-shadow: 0 2px 10px -2px rgba(0, 0, 0, 0.35), inset 0 0.5px 0 rgba(255, 255, 255, 0.4);
  }
  .ph-busy {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
    animation: ph-pulse 1s ease-in-out infinite alternate;
  }
  @keyframes ph-pulse {
    to {
      opacity: 0.4;
    }
  }
  .ph-acts {
    display: flex;
    gap: 16px;
  }
  .muted {
    color: var(--label-2);
  }
  .pf {
    display: grid;
    gap: 14px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .short {
    max-width: 120px;
  }
  textarea.input {
    resize: vertical;
    min-height: 80px;
    padding-top: 10px;
    line-height: 1.4;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px 0 10px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--label);
    transition:
      background-color 200ms var(--ease-out),
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
  .accept {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .accept a {
    color: var(--tint);
  }
  .check {
    flex: none;
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: var(--tint);
  }
</style>
