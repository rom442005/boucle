<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Place } from '../lib/types';

  let {
    kind,
    place,
    busy = false,
    onclick,
    floating = false,
  }: { kind: 'start' | 'destination'; place: Place | null; busy?: boolean; onclick: () => void; floating?: boolean } = $props();

  const title = $derived(kind === 'start' ? 'Départ' : 'Destination');
  const value = $derived(
    busy ? 'Localisation…' : place ? (place.kind === 'gps' ? 'Ma position' : place.name) : kind === 'start' ? 'Choisir un départ' : 'Choisir une destination',
  );
  const detail = $derived(place?.kind === 'gps' ? place.detail : place?.detail);
</script>

<button type="button" class="place" class:glass={floating} class:floating {onclick} aria-label="{title} : {value}{detail ? ', ' + detail : ''}. Modifier">
  <span class="dot" class:dest={kind === 'destination'} aria-hidden="true">
    {#if kind === 'start'}
      {#if place?.kind === 'gps'}<Icon name="locate" size={15} fill />{:else}<Icon name="pin" size={15} />{/if}
    {:else}
      <Icon name="flag" size={15} />
    {/if}
  </span>
  <span class="txt">
    <span class="t">{title}</span>
    <span class="v" class:empty={!place && !busy}>{value}{#if detail}<span class="d">{` · ${detail}`}</span>{/if}</span>
  </span>
  <span class="chev" aria-hidden="true"><Icon name="search" size={18} /></span>
</button>

<style>
  .place {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 6px 14px 6px 8px;
    border-radius: 999px;
    text-align: left;
    background: var(--fill-2);
    transition: transform 240ms var(--spring);
  }
  .place.floating {
    background: var(--glass-ctl);
  }
  .place:active {
    transform: scale(0.98);
  }
  .dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    color: #fff;
    background: var(--tint);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .dot.dest {
    background: var(--label);
    color: var(--glass-panel);
  }
  .txt {
    display: grid;
    min-width: 0;
    flex: 1;
    line-height: 1.2;
  }
  .t {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--label-2);
  }
  .v {
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v.empty {
    color: var(--tint);
  }
  .d {
    font-weight: 400;
    color: var(--label-2);
  }
  .chev {
    color: var(--label-2);
  }
  @media (max-width: 859px) {
    .place {
      min-height: 46px;
      padding: 4px 12px 4px 6px;
      gap: 8px;
    }
    .dot {
      width: 34px;
      height: 34px;
    }
    .t {
      font-size: 0.6875rem;
    }
    .v {
      font-size: 0.875rem;
    }
  }
</style>
