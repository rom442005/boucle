<script lang="ts" generics="T extends string">
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';

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

  function onkeydown(e: KeyboardEvent) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = options[(index + dir + options.length) % options.length];
    onchange(next.value);
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
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => onchange(o.value)}
    >
      {#if o.icon}
        <Icon name={o.icon} size={23} fill={o.value === value} />
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
  .seg.tall button[aria-checked='true'] .lbl {
    color: var(--label);
  }
  .lbl {
    white-space: nowrap;
  }
</style>
