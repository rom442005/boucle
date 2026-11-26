<script lang="ts">
  import Icon from './Icon.svelte';
  import { EMOJI_GROUPS, searchEmojis } from '../lib/emojis';
  import { tactile } from '../lib/haptics';

  /*
   * Choisir un émoji : une recherche en mots de tous les jours (« boulangerie », « piscine », « mamie »), sinon
   * tous les émojis rangés par thème. Pour une liste de Mes lieux.
   */
  let { value, label, onpick }: { value: string; label: string; onpick: (e: string) => void } = $props();
  let q = $state('');
  const found = $derived(q.trim() ? searchEmojis(q) : null);
</script>

<div class="picker">
  <label class="find">
    <Icon name="search" size={15} />
    <span class="visually-hidden">Chercher un émoji</span>
    <input bind:value={q} type="search" placeholder="Chercher : boulangerie, piscine, mamie…" enterkeyhint="search" onkeydown={(e) => e.key === 'Enter' && found?.[0] && onpick(found[0])} />
  </label>
  <div class="scroll" role="radiogroup" aria-label={label}>
    {#if found}
      {#if found.length}
        <div class="grid">
          {#each found as e (e)}
            <button use:tactile type="button" class="emo" class:on={value === e} role="radio" aria-checked={value === e} aria-label={e} onclick={() => onpick(e)}>{e}</button>
          {/each}
        </div>
      {:else}
        <p class="none">Aucun émoji pour « {q.trim()} ». Essaie un mot plus simple.</p>
      {/if}
    {:else}
      {#each EMOJI_GROUPS as g (g.name)}
        <p class="g">{g.name}</p>
        <div class="grid">
          {#each g.items as [e] (e)}
            <button use:tactile type="button" class="emo" class:on={value === e} role="radio" aria-checked={value === e} aria-label={e} onclick={() => onpick(e)}>{e}</button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .picker {
    display: grid;
    gap: 8px;
    padding: 8px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.08);
    animation: open 300ms var(--spring) backwards;
  }
  @keyframes open {
    from {
      opacity: 0;
      translate: 0 -4px;
    }
  }
  .find {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.1);
  }
  .find input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: #fff;
    font: inherit;
    font-size: 0.9375rem;
  }
  .find input::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }
  .find:focus-within {
    box-shadow: 0 0 0 2px var(--tint);
  }
  .scroll {
    max-height: 216px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 0 2px;
  }
  .g {
    margin: 8px 4px 4px;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }
  .g:first-child {
    margin-top: 2px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 2px;
  }
  .emo {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 12px;
    font-size: 1.375rem;
    transition:
      background-color 160ms var(--ease-out),
      transform 220ms var(--spring-bouncy);
  }
  @media (hover: hover) {
    .emo:hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
  .emo:active {
    transform: scale(0.88);
  }
  .emo.on {
    background: color-mix(in srgb, var(--tint) 45%, transparent);
  }
  .none {
    margin: 8px 4px;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.6);
  }
  @media (prefers-reduced-motion: reduce) {
    .picker {
      animation: none;
    }
  }
</style>
