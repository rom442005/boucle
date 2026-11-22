<script lang="ts">
  import Icon from './Icon.svelte';
  import PasswordField from './PasswordField.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import { community } from '../lib/community.svelte';
  import { CommunityError } from '../lib/community/types';
  import { haptic, tactile } from '../lib/haptics';
  import { untrack } from 'svelte';

  /*
   * Compte, dans le panneau.
   * Créer : une adresse e-mail, un code à 6 chiffres reçu par e-mail (il prouve l'adresse), puis le profil,
   * avec le mot de passe. Se connecter : l'e-mail et le mot de passe, sans e-mail à attendre.
   * Mot de passe oublié : un code par e-mail, et le nouveau mot de passe dans la foulée.
   * L'action qui l'a demandé reprend ensuite.
   */
  let { start = 'create' }: { reason?: string; start?: 'create' | 'login' } = $props();

  type Step = 'login' | 'email' | 'code' | 'profile';
  // L'écran de départ (le choix fait sur l'accueil), ensuite le parcours avance tout seul.
  let step = $state<Step>(community.session && !community.me ? 'profile' : untrack(() => start) === 'login' ? 'login' : 'email');
  /** mot de passe oublié : le code sert à en choisir un nouveau */
  let forgot = $state(false);
  let email = $state(community.session?.email ?? '');
  let code = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let resent = $state(false);

  // Connecté par le lien de l'e-mail (ici ou dans un autre onglet) : reste le profil.
  $effect(() => {
    if (step !== 'profile' && community.session && !community.me && !community.verifying) step = 'profile';
  });

  const fail = (e: unknown, fallback: string) => {
    error = e instanceof CommunityError ? e.message : fallback;
    haptic('warn');
  };
  const emailOk = () => /^\S+@\S+\.\S+$/.test(email.trim());

  function go(next: Step, isForgot = false) {
    error = null;
    forgot = isForgot;
    password = '';
    step = next;
  }

  async function login(e?: SubmitEvent) {
    e?.preventDefault();
    error = null;
    if (!emailOk()) return void (error = 'Adresse e-mail invalide.');
    if (!password) return void (error = 'Saisis ton mot de passe.');
    busy = true;
    try {
      if ((await community.signInWithPassword(email, password)) === 'profile') step = 'profile';
    } catch (err) {
      fail(err, 'E-mail ou mot de passe incorrect.');
    } finally {
      busy = false;
    }
  }

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    error = null;
    if (!emailOk()) return void (error = 'Adresse e-mail invalide.');
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
    if (forgot && password.length < 8) return void (error = 'Mot de passe trop court : 8 caractères au moins.');
    busy = true;
    try {
      if ((await community.verifyCode(email, code, forgot ? password : undefined)) === 'profile') step = 'profile';
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
      <span class="lead-ic" aria-hidden="true"><Icon name={step === 'login' || forgot ? 'key' : 'users'} size={22} fill={!(step === 'login' || forgot)} /></span>
      <h2>{step === 'login' ? 'Connexion' : forgot ? 'Mot de passe oublié' : 'Rejoins la Communauté'}</h2>
    </div>
  {/if}

  {#if step === 'login'}
    <form class="step rise" onsubmit={login} novalidate>
      <input class="input" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="Adresse mail" aria-label="Adresse e-mail" bind:value={email} use:autofocus required />
      <PasswordField bind:value={password} autocomplete="current-password" bare />
      {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
      <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      <div class="again">
        <button use:tactile type="button" class="text-btn" onclick={() => go('email', true)}>Mot de passe oublié</button>
        <button use:tactile type="button" class="text-btn" onclick={() => go('email')}>Créer un compte</button>
      </div>
    </form>
  {:else if step === 'email'}
    <form class="step rise" onsubmit={send} novalidate>
      <input class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="Adresse mail" aria-label="Adresse e-mail" bind:value={email} use:autofocus required />
      {#if community.demo}
        <p class="demo" role="note" aria-label="Démonstration : comptes sur cet appareil, code 123456.">🧪 Démo · code <b class="tabular">123456</b></p>
      {/if}
      {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
      <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir un code'}</button>
      <div class="again center">
        <button use:tactile type="button" class="text-btn" onclick={() => go('login')}>{forgot ? 'Retour' : 'J’ai déjà un compte'}</button>
      </div>
    </form>
  {:else if step === 'code'}
    <form class="step rise" onsubmit={verify} novalidate>
      {#if community.demo}
        <p class="sent"><Icon name="mail" size={18} />Aucun e-mail envoyé pour l’instant : saisis <b>123456</b>.</p>
      {:else}
        <p class="sent"><Icon name="mail" size={18} /><span>Code envoyé à <b>{email}</b></span></p>
      {/if}
      <input class="input code tabular" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="Code à 6 chiffres" aria-label="Code à 6 chiffres" bind:value={code} use:autofocus required />
      {#if forgot}
        <!-- Pour que le gestionnaire de mots de passe range le nouveau avec la bonne adresse. -->
        <input class="visually-hidden" type="email" autocomplete="username" value={email} readonly tabindex="-1" aria-hidden="true" />
        <PasswordField bind:value={password} label="Nouveau mot de passe" autocomplete="new-password" bare />
      {/if}
      {#if error}<div class="banner is-error" role="alert"><span class="icon"><Icon name="warning" size={18} /></span><span>{error}</span></div>{/if}
      <button use:tactile type="submit" class="cta" disabled={busy}>{busy ? 'Vérification…' : 'Valider'}</button>
      <div class="again">
        <button use:tactile type="button" class="text-btn" disabled={busy} onclick={async () => {
            await send();
            resent = true;
          }}>{resent ? 'Code renvoyé' : 'Renvoyer le code'}</button>
        <button use:tactile type="button" class="text-btn" onclick={() => (step = 'email')}>Changer d’adresse</button>
      </div>
    </form>
  {:else}
    <div class="lead">
      <h2>Ton profil</h2>
    </div>
    <ProfileForm creating ondone={() => community.finishAuth()} />
  {/if}
</div>

<style>
  .auth {
    display: grid;
    gap: 14px;
  }
  .lead {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
  }
  .lead h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .lead-ic {
    width: 44px;
    height: 44px;
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
  .code::placeholder {
    font-size: 1rem;
    letter-spacing: 0;
  }
  .step {
    gap: 10px;
  }
  .demo {
    justify-self: center;
    margin: 0;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .demo b {
    color: var(--label);
  }
  .again {
    display: flex;
    justify-content: space-between;
  }
  .again.center {
    justify-content: center;
  }
</style>
