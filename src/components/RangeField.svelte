<script lang="ts">
  import type { Snippet } from 'svelte';

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
  } = $props();

  const f = $derived((Math.min(max, Math.max(min, value)) - min) / (max - min || 1));
</script>

<div class="field">
  <div class="head">
    <label class="field-label" for={id}>{label}</label>
    <div class="value">
      {#if off}
        <span class="off" aria-hidden="true">{offText}</span>
      {:else}
        <span class="num rounded tabular" aria-hidden="true">{display}</span><span class="unit" aria-hidden="true">{unit}</span>
        {#if onreset}
          <button type="button" class="reset" onclick={onreset} aria-label="Remettre {label.toLowerCase()} sur indifférent">
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
    oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))}
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
</style>
