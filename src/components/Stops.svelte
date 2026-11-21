<script lang="ts">
  /**
   * Lieux du parcours après le départ : les points de passage imposés (5 au plus, dans l'ordre qui fait le
   * moins de chemin) et, pour un aller simple, l'arrivée (libre tant qu'on n'en choisit pas).
   * Sur Mac, en haut de la colonne sous le départ ; sur iPhone, dans la section Forme.
   */
  import Icon from './Icon.svelte';
  import PlaceField from './PlaceField.svelte';
  import { app, MAX_VIAS } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';

  const oneway = $derived(app.params.shape === 'oneway');
</script>

<div class="stops">
  {#each app.vias as v, i (i)}
    <div class="line">
      <PlaceField kind="via" place={v} onclick={() => app.chooseVia(i)} />
      <button use:tactile
        type="button"
        class="rm"
        aria-label="Retirer le point de passage {v.name}"
        onclick={() => {
          haptic('tap');
          app.removeVia(i);
        }}><Icon name="close" size={16} /></button
      >
    </div>
  {/each}
  {#if oneway}
    <div class="line">
      <PlaceField kind="destination" place={app.destination} onclick={() => (app.search = 'destination')} />
      {#if app.destination}
        <button use:tactile
          type="button"
          class="rm"
          aria-label="Arrivée libre"
          onclick={() => {
            haptic('tap');
            app.clearDestination();
          }}><Icon name="close" size={16} /></button
        >
      {/if}
    </div>
  {/if}
  {#if app.vias.length < MAX_VIAS}
    <button use:tactile type="button" class="add" onclick={() => app.chooseVia(null)}>
      <span class="add-ic" aria-hidden="true"><Icon name="plus" size={14} /></span>
      Point de passage
    </button>
  {/if}
</div>

<style>
  .stops {
    display: grid;
    gap: 8px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    animation: line-in 380ms var(--spring) both;
  }
  @keyframes line-in {
    from {
      opacity: 0;
      translate: 0 -6px;
    }
  }
  .line :global(.place) {
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
  @media (prefers-reduced-motion: reduce) {
    .line {
      animation: none;
    }
  }
</style>
