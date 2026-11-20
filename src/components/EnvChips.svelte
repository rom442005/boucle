<script lang="ts">
  import Icon from './Icon.svelte';
  import type { EnvClass } from '../lib/types';
  import type { IconName } from '../lib/icons';
  import { ENVS, ENV_ORDER } from '../lib/sports';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';

  let { selected, ontoggle }: { selected: EnvClass[]; ontoggle: (e: EnvClass) => void } = $props();

  const ICON: Record<EnvClass, IconName> = { forest: 'tree', water: 'waves', park: 'park', fields: 'grains', urban: 'buildings' };
</script>

<div class="chips" role="group" aria-label="Milieu traversé">
  {#each ENV_ORDER as e (e)}
    {@const on = selected.includes(e)}
    <button use:tactile type="button" class="chip" class:on aria-pressed={on} style:--c="var(--env-{e})" onclick={() => {
        haptic('tap');
        ontoggle(e);
      }}>
      <span class="ic"><Icon name={ICON[e]} size={app.wide ? 18 : 16} fill={on} /></span>
      {ENVS[e].label}
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px 0 10px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--label);
    transition:
      background-color 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .ic {
    color: var(--c);
    display: inline-grid;
  }
  .chip.on {
    background: color-mix(in srgb, var(--c) 18%, transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 85%, transparent);
    font-weight: 600;
    animation: chip-pop 460ms var(--spring-bouncy);
  }
  /* Choisi : la pastille rebondit légèrement. */
  @keyframes chip-pop {
    from {
      transform: scale(0.9);
    }
  }
  @media (max-width: 859px) {
    .chips {
      gap: 6px;
    }
    .chip {
      min-height: 32px;
      padding: 0 12px 0 9px;
      gap: 5px;
      font-size: 0.875rem;
    }
  }
</style>
