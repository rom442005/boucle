<script lang="ts" generics="T extends string">
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';

  interface Option {
    value: T;
    label: string;
    icon?: IconName;
  }

  let {
    options,
    value,
    onchange,
    label,
    tall = false,
  }: { options: Option[]; value: T; onchange: (v: T) => void; label: string; tall?: boolean } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));

  function choose(v: T) {
    if (v !== value) haptic('tap');
    onchange(v);
  }

  function onkeydown(e: KeyboardEvent) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = options[(index + dir + options.length) % options.length];
    choose(next.value);
    const host = e.currentTarget as HTMLElement;
    queueMicrotask(() => (host.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  }
</script>

<div class="seg" class:tall role="radiogroup" aria-label={label} tabindex="-1" {onkeydown}>
  <span
    class="seg-thumb"
    style:width="calc((100% - 6px) / {options.length})"
    style:transform="translateX({index * 100}%)"
    aria-hidden="true"
  ></span>
  {#each options as o (o.value)}
    <button use:tactile
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => choose(o.value)}
    >
      {#if o.icon}
        <Icon name={o.icon} size={app.wide ? 23 : 18} fill={o.value === value} />
      {/if}
      <span class="lbl">{o.label}</span>
    </button>
  {/each}
</div>

<style>
  .seg.tall button {
    min-height: 54px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.75rem;
    letter-spacing: 0.005em;
  }
  .seg.tall button[aria-checked='true'] {
    color: var(--tint);
  }
  .seg.tall button[aria-checked='true'] :global(.icon) {
    animation: seg-pop 460ms var(--spring-bouncy);
  }
  @keyframes seg-pop {
    from {
      transform: scale(0.7) rotate(-8deg);
    }
  }
  .seg.tall button[aria-checked='true'] .lbl {
    color: var(--label);
  }
  .lbl {
    white-space: nowrap;
  }
  /* iPhone : icône et libellé sur une ligne, contrôle moins haut. */
  @media (max-width: 859px) {
    .seg.tall button {
      min-height: 38px;
      flex-direction: row;
      gap: 5px;
      font-size: 0.8125rem;
    }
  }
</style>
