<script lang="ts">
  import Icon from './Icon.svelte';
  import { community } from '../lib/community.svelte';
  import { tactile } from '../lib/haptics';

  /** Signaler un parcours, un commentaire ou un profil : une raison, un mot d'explication si besoin. */
  let { target, label }: { target: { routeId?: string; commentId?: string; profileId?: string }; label: string } = $props();

  const REASONS = [
    'Propos insultants, haineux ou harcèlement',
    'Contenu sexuel ou choquant',
    'Parcours dangereux ou interdit',
    'Publicité ou arnaque',
    'Usurpation d’identité',
    'Autre',
  ];
  let reason = $state('');
  let details = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!reason || busy) return;
    busy = true;
    await community.report(target, details.trim() ? `${reason} : ${details.trim()}`.slice(0, 300) : reason);
    busy = false;
  }
</script>

<form class="rep" onsubmit={submit}>
  <p class="intro">Qu’est-ce qui ne va pas avec {label} ?</p>
  <fieldset class="group">
    <legend class="visually-hidden">Raison du signalement</legend>
    {#each REASONS as r (r)}
      <label class="row">
        <span class="row-label">{r}</span>
        <input type="radio" name="raison" value={r} bind:group={reason} class="radio" />
      </label>
    {/each}
  </fieldset>
  <label class="field">
    <span class="field-label">Précisions <span class="opt">facultatif</span></span>
    <textarea class="input" rows="2" maxlength="200" bind:value={details}></textarea>
  </label>
  <p class="hint">Le signalement est anonyme pour la personne concernée. Il est examiné sous 24 h ; un contenu contraire aux conditions est retiré.</p>
  <button use:tactile type="submit" class="cta" disabled={!reason || busy}><Icon name="report" size={18} />{busy ? 'Envoi…' : 'Signaler'}</button>
</form>

<style>
  .rep {
    display: grid;
    gap: 14px;
  }
  .intro {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  .row {
    cursor: pointer;
  }
  .row + .row::before {
    left: 14px;
  }
  .radio {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--tint);
  }
  .opt {
    font-weight: 400;
    font-size: 0.8125rem;
    color: var(--label-2);
    margin-left: 4px;
  }
  textarea.input {
    resize: vertical;
    min-height: 60px;
    padding-top: 10px;
  }
  .rep > .hint {
    margin: 0 4px;
  }
</style>
