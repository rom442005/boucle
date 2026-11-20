<script lang="ts">
  import Icon from './Icon.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import { community } from '../lib/community.svelte';
  import { CommunityError } from '../lib/community/types';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Compte sans mot de passe, dans le panneau : une adresse e-mail, un code à 6 chiffres reçu par e-mail
   * (il crée le compte la première fois), puis le profil. L'action qui l'a demandé reprend ensuite.
   */
  let { reason }: { reason: string } = $props();

  let step = $state<'email' | 'code' | 'profile'>(community.session && !community.me ? 'profile' : 'email');
  let email = $state(community.session?.email ?? '');
  let code = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let resent = $state(false);
  /** en ligne, l'e-mail porte d'abord un lien ; le code reste possible */
  let typing = $state(community.demo);

  // Connecté par le lien de l'e-mail (ici ou dans un autre onglet) : reste le profil.
  $effect(() => {
    if (step !== 'profile' && community.session && !community.me) step = 'profile';
  });

  const fail = (e: unknown, fallback: string) => {
    error = e instanceof CommunityError ? e.message : fallback;
    haptic('warn');
  };

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    error = null;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void (error = 'Adresse e-mail invalide.');
    busy = true;
    try {
      await community.sendCode(email);
      step = 'code';
      code = '';
    } catch (err) {
      fail(err, 'Envoi du code impossible. Vérifie l’adresse e-mail.');
    } finally {
      busy = false;
    }
  }

  async function verify(e?: SubmitEvent) {
    e?.preventDefault();
    error = null;
    if (!/^\d{6}$/.test(code.trim())) return void (error = 'Le code fait 6 chiffres.');
    busy = true;
    try {
      const next = await community.verifyCode(email, code);
      if (next === 'profile') step = 'profile';
    } catch (err) {
      fail(err, 'Code incorrect ou expiré. Demande un nouveau code.');
    } finally {
      busy = false;
    }
  }

  function autofocus(node: HTMLInputElement) {
    // Pas de clavier qui surgit sur iPhone avant d'avoir lu : seulement sur Mac.
    if (matchMedia('(pointer: fine)').matches) node.focus();
  }
</script>

<div class="auth">
  {#if step !== 'profile'}
    <div class="lead">
      <span class="lead-ic" aria-hidden="true"><Icon name="users" size={30} fill /></span>
      <h2>Rejoins la Communauté</h2>
      <p class="hint">{reason} Publie tes parcours, aime et commente ceux des autres, suis les coureurs et cyclistes autour de toi.</p>
    </div>
  {/if}

  {#if step === 'email'}
    <form class="step" onsubmit={send} novalidate>
      <label class="field">
        <span class="field-label">Adresse e-mail</span>
        <input class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="prenom@exemple.fr" bind:value={email} use:autofocus required />
      </label>
      {#if community.demo}
        <div class="banner" role="note"><span class="icon"><Icon name="mail" size={18} /></span><span>Pas encore d’e-mail : les comptes vivent sur cet appareil le temps que le serveur soit mis en ligne. Le code est <b>123456</b>.</span></div>
      {:else}
        <p class="hint">Pas de mot de passe : un lien de connexion arrive par e-mail. Il crée ton compte la première fois.</p>
      {/if}
      {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
      <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Envoi…' : community.demo ? 'Recevoir un code' : 'Recevoir le lien'}</button>
    </form>
  {:else if step === 'code'}
    <form class="step" onsubmit={verify} novalidate>
      {#if community.demo}
        <p class="sent"><Icon name="mail" size={18} />Aucun e-mail envoyé pour l’instant : saisis <b>123456</b>.</p>
      {:else}
        <p class="sent"><Icon name="mail" size={18} /><span>E-mail envoyé à <b>{email}</b></span></p>
        <p class="hint">Ouvre-le et touche le lien de connexion : Boucle s’ouvre, connecté. Pense aux courriers indésirables.</p>
      {/if}
      {#if typing}
        <label class="field">
          <span class="field-label">Code à 6 chiffres</span>
          <input class="input code tabular" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000" bind:value={code} use:autofocus required />
        </label>
        {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
        <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Vérification…' : 'Valider'}</button>
      {:else}
        {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
        <button use:tactile type="button" class="pill" onclick={() => (typing = true)}>J’ai reçu un code</button>
      {/if}
      <div class="again">
        <button use:tactile type="button" class="text-btn" disabled={busy} onclick={async () => {
            await send();
            resent = true;
          }}>{resent ? 'E-mail renvoyé' : 'Renvoyer l’e-mail'}</button>
        <button use:tactile type="button" class="text-btn" onclick={() => (step = 'email')}>Changer d’adresse</button>
      </div>
    </form>
  {:else}
    <div class="lead">
      <h2>Ton profil</h2>
      <p class="hint">Ce que la communauté verra : ton prénom, ton niveau, tes sports. Le reste reste privé.</p>
    </div>
    <ProfileForm creating ondone={() => community.finishAuth()} />
  {/if}
</div>

<style>
  .auth {
    display: grid;
    gap: 16px;
  }
  .lead {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
  }
  .lead h2 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .lead .hint {
    margin: 0;
    max-width: 36ch;
  }
  .lead-ic {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--tint);
    background: var(--tint-soft);
  }
  .step {
    display: grid;
    gap: 12px;
  }
  .step .hint {
    margin: 0 4px;
  }
  .sent {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }
  .sent :global(.icon) {
    color: var(--tint);
    flex: none;
  }
  .code {
    font-size: 1.5rem;
    letter-spacing: 0.3em;
    text-align: center;
  }
  .again {
    display: flex;
    justify-content: space-between;
  }
</style>
