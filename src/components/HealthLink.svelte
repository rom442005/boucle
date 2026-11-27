<script lang="ts">
  import Icon from './Icon.svelte';
  import { links, SHORTCUT_NAME } from '../lib/links.svelte';
  import { community } from '../lib/community.svelte';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Relier Apple Santé sans l'app (iPhone, site sur l'écran d'accueil). Apple réserve Santé aux apps : le lien
   * passe par le raccourci « Boucle Santé » (app Raccourcis), qui lit Santé et l'envoie au serveur avec une
   * clé personnelle. Trois gestes : créer et copier la clé, ajouter le raccourci (il demande la clé), le lancer.
   * Sur Mac, on renvoie vers l'iPhone.
   */
  let copied = $state(false);

  async function copy() {
    if (!links.shortcutKey) return;
    try {
      await navigator.clipboard.writeText(links.shortcutKey);
      copied = true;
      haptic('success');
    } catch {
      copied = false;
    }
  }
  const received = $derived.by(() => {
    const at = links.health?.updatedAt;
    if (!at) return null;
    const d = new Date(at);
    const today = new Date().toDateString() === d.toDateString();
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
    return today ? `aujourd’hui à ${time}` : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d) + ` à ${time}`;
  });
</script>

<div class="hl">
  <div class="lead">
    <span class="lead-ic" aria-hidden="true">❤️</span>
    <h2>Relie Apple Santé</h2>
    <p>Tes pas, ta distance à pied, ton énergie, ton exercice, ta fréquence au repos et ta VO2 max, jour par jour sur ton profil, sur l’iPhone comme sur le Mac.</p>
  </div>

  {#if links.healthByShortcut}
    <ol class="steps">
      <li style:--i={0}>
        <span class="num" aria-hidden="true">1</span>
        <div class="st">
          <b>Ta clé personnelle</b>
          {#if links.shortcutKey}
            <div class="key">
              <code class="tabular">{links.shortcutKey}</code>
              <button use:tactile type="button" class="pill" onclick={copy}>{copied ? 'Copiée ✓' : 'Copier'}</button>
            </div>
            <span class="hint">Elle ne sert qu’à envoyer tes données de santé à ton compte.</span>
          {:else}
            <button use:tactile type="button" class="pill strong" disabled={links.healthBusy} onclick={() => links.newShortcutKey()}>{links.healthBusy ? 'Création…' : 'Créer ma clé'}</button>
          {/if}
        </div>
      </li>
      <li style:--i={1}>
        <span class="num" aria-hidden="true">2</span>
        <div class="st">
          <b>Ajoute le raccourci « {SHORTCUT_NAME} »</b>
          <a class="pill strong" class:dim={!links.shortcutKey} href={links.shortcutFile} download="{SHORTCUT_NAME}.shortcut" onclick={() => links.shortcutAdded()}>Ajouter le raccourci</a>
          <span class="hint">Ouvre-le dans Raccourcis, puis colle ta clé quand il la demande.</span>
        </div>
      </li>
      <li style:--i={2}>
        <span class="num" aria-hidden="true">3</span>
        <div class="st">
          <b>Envoie tes données</b>
          <button use:tactile type="button" class="pill strong" onclick={() => links.runShortcut()}>Lancer maintenant</button>
          <span class="hint">La première fois, autorise l’accès à Santé et l’envoi vers Boucle (« Toujours autoriser »), puis reviens ici.</span>
        </div>
      </li>
      <li style:--i={3}>
        <span class="num" aria-hidden="true"><Icon name="clock" size={14} /></span>
        <div class="st">
          <b>Chaque soir, tout seul</b>
          <span class="hint">Raccourcis › Automatisation › + › Heure de la journée (21 h, chaque jour) › Exécuter immédiatement › {SHORTCUT_NAME}.</span>
        </div>
      </li>
    </ol>
    {#if community.demo}
      <p class="note" role="note">🧪 Démonstration : la clé ne fonctionne qu’avec un vrai compte.</p>
    {/if}
  {:else}
    <p class="note">Santé se relie depuis ton iPhone : ouvre Boucle sur l’iPhone (bouton iPhone en haut de l’écran), puis Profil › Santé › Relier.</p>
  {/if}

  {#if received}<p class="received">✓ Dernier envoi reçu {received}</p>{/if}
  {#if links.health || links.shortcutOn}
    <button use:tactile type="button" class="text-btn off" onclick={() => links.disconnectHealth()}>Ne plus relier Santé (efface les données reçues)</button>
  {/if}
</div>

<style>
  .hl {
    display: grid;
    gap: 16px;
  }
  .lead {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
  }
  .lead-ic {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 1.5rem;
    background: rgba(255, 55, 95, 0.2);
    animation: beat 1400ms var(--ease-out) 300ms 2;
  }
  /* Le cœur bat deux fois à l'ouverture. */
  @keyframes beat {
    14% {
      transform: scale(1.14);
    }
    28% {
      transform: scale(1);
    }
    42% {
      transform: scale(1.1);
    }
    70% {
      transform: scale(1);
    }
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .lead p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.4;
    color: var(--label-2);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
  }
  .steps li {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 12px;
    animation: step-in 380ms var(--spring) backwards;
    animation-delay: calc(100ms + var(--i) * 45ms);
  }
  @keyframes step-in {
    from {
      opacity: 0;
      translate: 0 12px;
    }
  }
  .num {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--tint);
    color: #fff;
    font-weight: 700;
    font-size: 0.875rem;
  }
  .st {
    display: grid;
    gap: 6px;
    justify-items: start;
    min-width: 0;
  }
  .st b {
    font-size: 0.9375rem;
    padding-top: 4px;
  }
  .hint {
    font-size: 0.8125rem;
    line-height: 1.35;
    color: var(--label-2);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 16px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 0.875rem;
    color: var(--label);
    background: var(--fill-2);
    text-decoration: none;
    transition: transform 240ms var(--spring);
  }
  .pill.strong {
    color: #fff;
    background: var(--tint);
  }
  .pill.dim {
    opacity: 0.55;
  }
  .pill:active {
    transform: scale(0.95);
  }
  .key {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }
  code {
    min-width: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--fill-2);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
    user-select: all;
    -webkit-user-select: all;
  }
  .note {
    margin: 0;
    padding: 10px 14px;
    border-radius: 16px;
    background: var(--fill-2);
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .received {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #30d158;
  }
  .off {
    justify-self: center;
    font-size: 0.8125rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .lead-ic,
    .steps li {
      animation: none;
    }
  }
</style>
