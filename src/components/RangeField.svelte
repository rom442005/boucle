<script lang="ts">
  import type { Snippet } from 'svelte';
  import RollingNumber from './RollingNumber.svelte';
  import { haptic, tactile } from '../lib/haptics';

  let {
    id,
    label,
    value,
    min,
    max,
    step,
    display,
    unit,
    sub,
    off = false,
    offText = 'Indifférent',
    onchange,
    onreset,
    valuetext,
    tickEvery,
  }: {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    display: string;
    unit: string;
    sub?: Snippet;
    /** état « indifférent » : le curseur est grisé jusqu'au premier geste */
    off?: boolean;
    offText?: string;
    onchange: (v: number) => void;
    onreset?: () => void;
    valuetext: string;
    /** un petit « tic » à chaque palier franchi (par défaut, chaque pas) */
    tickEvery?: number;
  } = $props();

  const f = $derived((Math.min(max, Math.max(min, value)) - min) / (max - min || 1));

  /** Le pouce « cogne » à chaque palier franchi : le tic qu'on sent sur Android, et qu'on voit partout. */
  function bump(el: HTMLInputElement, strong: boolean) {
    el.classList.remove('bump', 'bump-strong');
    void el.offsetWidth;
    el.classList.add(strong ? 'bump-strong' : 'bump');
  }
  function input(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const v = Number(el.value);
    const every = tickEvery ?? step;
    const before = Math.floor((off ? min : value) / every + 1e-9);
    const after = Math.floor(v / every + 1e-9);
    if (v === min || v === max) {
      if (v !== value || off) {
        haptic('tap');
        bump(el, true);
      }
    } else if (after !== before) {
      haptic('tick');
      bump(el, false);
    }
    onchange(v);
  }
</script>

<div class="field">
  <div class="head">
    <label class="field-label" for={id}>{label}</label>
    <div class="value">
      {#if off}
        <span class="off" aria-hidden="true">{offText}</span>
      {:else}
        <span class="num rounded" aria-hidden="true"><RollingNumber value={display} /></span><span class="unit" aria-hidden="true">{unit}</span>
        {#if onreset}
          <button use:tactile type="button" class="reset" onclick={onreset} aria-label="Remettre {label.toLowerCase()} sur indifférent">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".18" /><path d="M5.5 5.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
        {/if}
      {/if}
    </div>
  </div>
  <input
    {id}
    class="range"
    class:is-off={off}
    type="range"
    {min}
    {max}
    {step}
    value={off ? min : value}
    style:--f={off ? 0 : f}
    aria-valuetext={off ? offText : valuetext}
    oninput={input}
  />
  {#if sub && !off}
    <div class="sub">{@render sub()}</div>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: 2px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .num {
    font-size: 2.125rem;
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1;
  }
  .unit {
    font-size: 1rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .off {
    font-size: 1.0625rem;
    font-weight: 500;
    color: var(--label-2);
    line-height: 34px;
  }
  .reset {
    align-self: center;
    margin-left: 6px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: var(--label-2);
    border-radius: 50%;
  }
  .sub {
    margin-top: -2px;
    font-size: 0.8125rem;
    color: var(--label-2);
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }
  /* iPhone : chiffre net et moins haut, libellé discret. */
  @media (max-width: 859px) {
    .head {
      min-height: 28px;
      align-items: flex-end;
    }
    .num {
      font-size: 1.625rem;
      font-weight: 700;
    }
    .unit {
      font-size: 0.8125rem;
    }
    .off {
      font-size: 0.9375rem;
      line-height: 26px;
    }
    .reset {
      width: 26px;
      height: 26px;
      margin-left: 4px;
    }
    .sub {
      font-size: 0.75rem;
    }
  }
</style>
