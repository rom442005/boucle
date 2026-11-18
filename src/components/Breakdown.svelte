<script lang="ts">
  import { percent } from '../lib/format';

  interface Item {
    key: string;
    label: string;
    color: string;
    value: number;
  }
  let { title, items, note }: { title: string; items: Item[]; note?: string } = $props();

  const shown = $derived(items.filter((i) => i.value >= 0.02).sort((a, b) => b.value - a.value));
  const total = $derived(shown.reduce((s, i) => s + i.value, 0) || 1);
</script>

<section class="bd" aria-label={title}>
  <div class="head">
    <h4>{title}</h4>
    {#if note}<span class="note">{note}</span>{/if}
  </div>
  <div class="bar" aria-hidden="true">
    {#each shown as i (i.key)}
      <span style:flex-grow={i.value / total} style:background={i.color}></span>
    {/each}
  </div>
  <ul>
    {#each shown as i (i.key)}
      <li><span class="dot" style:background={i.color}></span>{i.label}<b class="tabular">{percent(i.value)}</b></li>
    {/each}
  </ul>
</section>

<style>
  .bd {
    display: grid;
    gap: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  h4 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .note {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .bar {
    display: flex;
    gap: 2px;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }
  .bar span {
    flex-basis: 0;
    min-width: 3px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  li b {
    margin-left: auto;
    font-weight: 600;
    color: var(--label);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
</style>
