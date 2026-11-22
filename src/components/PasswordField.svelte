<script lang="ts">
  import Icon from './Icon.svelte';
  import { tactile } from '../lib/haptics';

  /** Champ mot de passe, avec l'œil pour le voir en clair (gestionnaires de mots de passe compris). */
  let {
    value = $bindable(''),
    label = 'Mot de passe',
    autocomplete = 'current-password',
    placeholder = '',
    bare = false,
  }: {
    value?: string;
    label?: string;
    autocomplete?: 'current-password' | 'new-password';
    placeholder?: string;
    /** sans libellé au-dessus : le nom du champ est écrit dedans (formulaires compacts) */
    bare?: boolean;
  } = $props();

  let shown = $state(false);
  const id = $props.id();
</script>

<!-- Le libellé ne nomme que le champ : le bouton œil garde son propre nom. -->
<div class="field">
  {#if !bare}<label class="field-label" for={id}>{label}</label>{/if}
  <span class="pw">
    <input {id} class="input" type={shown ? 'text' : 'password'} {autocomplete} placeholder={bare ? label : placeholder} aria-label={bare ? label : undefined} autocapitalize="off" spellcheck="false" maxlength="72" bind:value required />
    <button use:tactile type="button" class="eye" aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={shown} onclick={() => (shown = !shown)}>
      <Icon name={shown ? 'eyeSlash' : 'eye'} size={18} />
    </button>
  </span>
</div>

<style>
  .pw {
    position: relative;
    display: block;
  }
  .pw .input {
    width: 100%;
    padding-right: 48px;
  }
  .eye {
    position: absolute;
    top: 50%;
    right: 4px;
    translate: 0 -50%;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label-2);
  }
</style>
