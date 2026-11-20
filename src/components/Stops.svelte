<script lang="ts">
  /**
   * Lieux du parcours après le départ : le point de passage imposé (un endroit à visiter forcément,
   * quelle que soit la forme) et la destination (« Vers un lieu »).
   * Sur Mac, en haut de la colonne sous le départ ; sur iPhone, dans la section Forme.
   */
  import Icon from './Icon.svelte';
  import PlaceField from './PlaceField.svelte';
  import { app } from '../lib/state.svelte';
  import { isDesktop } from '../lib/platform';
  import { haptic, tactile } from '../lib/haptics';

  const oneway = $derived(app.params.shape === 'oneway');
</script>

<div class="stops">
  {#if app.via}
    <div class="via">
      <PlaceField kind="via" place={app.via} onclick={() => (app.search = 'via')} />
      <button use:tactile
        type="button"
        class="rm"
        aria-label="Retirer le point de passage {app.via.name}"
        onclick={() => {
          haptic('tap');
          app.clearVia();
        }}><Icon name="close" size={16} /></button
      >
    </div>
  {:else}
    <button use:tactile type="button" class="add" onclick={() => (app.search = 'via')}>
      <span class="add-ic" aria-hidden="true"><Icon name="diamond" size={14} /></span>
      Passer par un lieu
      <span class="opt">facultatif</span>
    </button>
  {/if}
  {#if oneway}
    <PlaceField kind="destination" place={app.destination} onclick={() => (app.search = 'destination')} />
    <p class="hint">
      {#if app.destination}
        Pour la déplacer, {isDesktop ? 'clique ailleurs sur' : 'touche ailleurs'} la carte ou fais glisser le drapeau.
      {:else}
        Ou {isDesktop ? 'clique directement sur' : 'touche directement'} la carte, là où tu veux aller.
      {/if}
    </p>
  {/if}
</div>

<style>
  .stops {
    display: grid;
    gap: 8px;
  }
  .via {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .via :global(.place) {
    flex: 1;
    min-width: 0;
  }
  .rm {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--label-2);
    background: var(--fill-2);
    transition: transform 240ms var(--spring);
  }
  .rm:active {
    transform: scale(0.9);
  }
  .add {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px 0 6px;
    border-radius: 999px;
    color: var(--tint);
    font-size: 0.875rem;
    font-weight: 600;
    transition:
      transform 240ms var(--spring),
      background-color 200ms var(--ease-out);
  }
  .add:active {
    transform: scale(0.97);
    background: var(--fill-2);
  }
  .add-ic {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--tint-soft);
  }
  .opt {
    font-weight: 400;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .hint {
    margin: -2px 0 0;
  }
</style>
