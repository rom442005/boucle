<script lang="ts">
  import Icon from './Icon.svelte';
  import type { EnvClass } from '../lib/types';
  import type { IconName } from '../lib/icons';
  import { ENVS, ENV_ORDER } from '../lib/sports';

  let { selected, ontoggle }: { selected: EnvClass[]; ontoggle: (e: EnvClass) => void } = $props();

  const ICON: Record<EnvClass, IconName> = { forest: 'tree', water: 'waves', park: 'park', fields: 'grains', urban: 'buildings' };
</script>

<div class="chips" role="group" aria-label="Milieu traversé">
  {#each ENV_ORDER as e (e)}
    {@const on = selected.includes(e)}
    <button type="button" class="chip" class:on aria-pressed={on} style:--c="var(--env-{e})" onclick={() => ontoggle(e)}>
      <span class="ic"><Icon name={ICON[e]} size={18} fill={on} /></span>
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
  }
</style>
