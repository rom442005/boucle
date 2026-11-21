<script lang="ts">
  import Icon from './Icon.svelte';
  import { community } from '../lib/community.svelte';
  import { tactile } from '../lib/haptics';
  import type { ReportTarget } from '../lib/community/types';

  /** Signaler un parcours, un commentaire ou un profil : une raison, un mot d'explication si besoin. */
  let { target, label }: { target: ReportTarget; label: string } = $props();

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
    <span class="field-label">Précisions</span>
    <textarea class="input" rows="2" maxlength="200" bind:value={details}></textarea>
  </label>
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
  textarea.input {
    resize: vertical;
    min-height: 60px;
    padding-top: 10px;
  }
</style>
