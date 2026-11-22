<script lang="ts">
  import Icon from './Icon.svelte';
  import type { EnvClass } from '../lib/types';
  import type { IconName } from '../lib/icons';
  import { ENVS, ENV_ORDER } from '../lib/sports';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';

  let { selected, ontoggle }: { selected: EnvClass[]; ontoggle: (e: EnvClass) => void } = $props();

  const ICON: Record<EnvClass, IconName> = { forest: 'tree', water: 'waves', park: 'park', fields: 'grains', urban: 'buildings' };
  /* Sur une seule ligne (Romain) : cinq tuiles égales, l'icône au-dessus d'un nom court. */
  const SHORT: Record<EnvClass, string> = { forest: 'Forêt', water: 'Eau', park: 'Parcs', fields: 'Campagne', urban: 'Ville' };
</script>

<div class="chips" role="group" aria-label="Milieu traversé">
  {#each ENV_ORDER as e (e)}
    {@const on = selected.includes(e)}
    <button
      use:tactile
      type="button"
      class="chip"
      class:on
      aria-pressed={on}
      aria-label={ENVS[e].label}
      title={ENVS[e].label}
      style:--c="var(--env-{e})"
      onclick={() => {
        haptic('tap');
        ontoggle(e);
      }}
    >
      <span class="ic"><Icon name={ICON[e]} size={app.wide ? 21 : 19} fill={on} /></span>
      <span class="lb">{SHORT[e]}</span>
    </button>
  {/each}
</div>

<style>
  .chips {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .chip {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 56px;
    padding: 6px 2px 5px;
    border-radius: 16px;
    background: var(--fill-2);
    color: var(--label);
    transition:
      background-color 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .chip:active {
    transform: scale(0.94);
  }
  .ic {
    color: var(--c);
    display: inline-grid;
  }
  .lb {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .chip.on {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 85%, transparent);
    animation: chip-pop 460ms var(--spring-bouncy);
  }
  .chip.on .lb {
    font-weight: 650;
  }
  /* Choisi : la tuile rebondit légèrement. */
  @keyframes chip-pop {
    from {
      transform: scale(0.9);
    }
  }
  @media (max-width: 859px) {
    .chips {
      gap: 5px;
    }
    .chip {
      min-height: 52px;
      border-radius: 14px;
    }
    .lb {
      font-size: 0.6875rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip.on {
      animation: none;
    }
  }
</style>
