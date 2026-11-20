<script lang="ts">
  import AuthFlow from './AuthFlow.svelte';
  import { community } from '../lib/community.svelte';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Premier lancement : la carte en fond, voilée, et une seule question : te connecter ou créer un compte.
   * Créer des parcours reste possible sans compte (l'App Store l'exige) : « Plus tard », en petit.
   */
  let { onclose }: { onclose: () => void } = $props();

  let step = $state<'hello' | 'auth'>('hello');
  let mode = $state<'create' | 'login'>('create');

  // Compte prêt (code validé, profil rempli) : l'accueil s'efface.
  $effect(() => {
    if (community.signedIn) onclose();
  });
</script>

<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="w-title">
  <div class="card">
    {#if step === 'hello'}
      <div class="hello">
        <svg class="logo" viewBox="0 0 1024 1024" width="84" height="84" aria-hidden="true">
          <rect width="1024" height="1024" rx="230" fill="var(--tint)" />
          <path class="trace" pathLength="1" d="M318 688C214 610 226 400 372 344c92-35 140 34 222 4 92-34 186-6 206 104 22 118-62 170-150 206-86 35-84 116-196 118-58 1-100-28-136-88Z" fill="none" stroke="#fff" stroke-width="78" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="318" cy="688" r="96" fill="#fff" /><circle cx="318" cy="688" r="46" fill="var(--tint)" />
        </svg>
        <h1 id="w-title">Boucle</h1>
        <p class="tag">Tes parcours de course et de vélo, sur mesure. Et ceux des autres, autour de toi.</p>
      </div>
      <div class="acts">
        <button use:tactile type="button" class="cta" onclick={() => {
            haptic('tap');
            mode = 'create';
            step = 'auth';
          }}>Créer un compte</button>
        <button use:tactile type="button" class="pill" onclick={() => {
            haptic('tap');
            mode = 'login';
            step = 'auth';
          }}>Se connecter</button>
        <button use:tactile type="button" class="later" onclick={() => {
            haptic('tap');
            onclose();
          }}>Plus tard</button>
      </div>
    {:else}
      <div class="auth">
        <AuthFlow reason={mode === 'create' ? 'Un code par e-mail suffit, sans mot de passe.' : 'Le même code par e-mail te reconnecte.'} />
        <button use:tactile type="button" class="later" onclick={() => (step = 'hello')}>Retour</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    align-items: end;
    justify-items: center;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
    background: color-mix(in srgb, #f2f1ed 78%, transparent);
    backdrop-filter: blur(18px) saturate(1.2);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
    animation: veil-in 600ms var(--ease-out) both;
    overflow-y: auto;
  }
  @keyframes veil-in {
    from {
      opacity: 0;
      backdrop-filter: blur(0);
    }
  }
  .card {
    width: min(440px, 100%);
    display: grid;
    gap: 28px;
    animation: card-rise 720ms var(--spring) 120ms both;
  }
  @keyframes card-rise {
    from {
      opacity: 0;
      translate: 0 60px;
    }
  }
  .hello {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 10px;
  }
  .logo {
    border-radius: 20px;
    box-shadow: 0 18px 40px -16px color-mix(in srgb, var(--tint) 70%, transparent);
    margin-bottom: 8px;
  }
  /* La boucle du logo se dessine, comme un parcours tout juste trouvé. */
  .trace {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 1.4s cubic-bezier(0.55, 0, 0.2, 1) 500ms forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  h1 {
    margin: 0;
    font-size: 2.25rem;
    font-weight: 750;
    letter-spacing: -0.035em;
  }
  .tag {
    margin: 0;
    max-width: 30ch;
    font-size: 1.0625rem;
    line-height: 1.4;
    color: var(--label-2);
  }
  .acts {
    display: grid;
    gap: 10px;
  }
  .acts .pill {
    min-height: 52px;
    font-size: 1.0625rem;
  }
  .later {
    justify-self: center;
    min-height: 44px;
    padding: 0 12px;
    color: var(--label-2);
    font-weight: 500;
  }
  .auth {
    display: grid;
    gap: 6px;
    padding: 20px 16px 8px;
    border-radius: 28px;
    background: var(--fill-group);
  }
  @media (prefers-color-scheme: dark) {
    .welcome {
      background: color-mix(in srgb, #1c1c1e 80%, transparent);
    }
  }
  @media (min-width: 860px) {
    .welcome {
      align-items: center;
    }
  }
</style>
