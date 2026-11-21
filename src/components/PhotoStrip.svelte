<script lang="ts">
  import Icon from './Icon.svelte';
  import { community } from '../lib/community.svelte';
  import { tactile } from '../lib/haptics';
  import type { CommunityRoute } from '../lib/community/types';

  /**
   * Photos des sorties faites sur ce parcours, comme sur Strava : une bande à faire défiler, la première case
   * pour ajouter les tiennes. Une photo touchée s'ouvre en plein écran.
   */
  let { r }: { r: CommunityRoute } = $props();

  let picker = $state<HTMLInputElement>();
  /** les plus récentes d'abord */
  const list = $derived(community.photos.filter((p) => p.routeId === r.id).reverse());

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void community.addPhotos(files, r);
  }
</script>

<section class="photos" aria-label="Photos des sorties">
  <h3 class="field-label head">
    Photos des sorties{#if list.length}<span class="n tabular">{list.length}</span>{/if}
  </h3>
  <div class="strip">
    <button use:tactile type="button" class="tile add" aria-label="Ajouter tes photos de cette sortie" onclick={() => picker?.click()}>
      <Icon name="camera" size={24} />
      <span>Ajouter</span>
    </button>
    {#each Array(community.uploading) as _, k (k)}
      <span class="tile wait" role="status" aria-label="Photo en cours d’envoi"></span>
    {/each}
    {#each list as p, i (p.id)}
      <button use:tactile type="button" class="tile" style:--i={Math.min(i, 8)} aria-label="Photo de {p.authorName}{p.caption ? ` : ${p.caption}` : ''}" onclick={() => community.openPhotos(list, i)}>
        <img src={p.thumb} alt="" width="104" height="104" loading="lazy" decoding="async" />
        {#if p.at}<span class="pin" aria-hidden="true"><Icon name="pin" size={12} /></span>{/if}
      </button>
    {/each}
  </div>
  <input bind:this={picker} type="file" accept="image/*" multiple hidden onchange={pick} />
</section>

<style>
  .photos {
    margin: 4px 0 16px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
  }
  .n {
    font-weight: 500;
    color: var(--label-2);
  }
  .strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    margin: 0 -16px;
    padding: 2px 16px 4px;
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .tile {
    position: relative;
    flex: none;
    width: 104px;
    height: 104px;
    border-radius: 16px;
    overflow: hidden;
    scroll-snap-align: start;
    background: var(--fill-2);
    transition: transform 240ms var(--spring);
    animation: tile-in 420ms var(--spring) calc(var(--i, 0) * 40ms) both;
  }
  @keyframes tile-in {
    from {
      opacity: 0;
      scale: 0.9;
    }
  }
  .tile:active {
    transform: scale(0.94);
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .add {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 4px;
    color: var(--tint);
    font-size: 0.8125rem;
    font-weight: 600;
    background: var(--tint-soft);
  }
  .wait {
    background: linear-gradient(100deg, var(--fill-2) 30%, var(--fill) 50%, var(--fill-2) 70%) 0 0 / 300% 100%;
    animation: shimmer 1.2s linear infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -150% 0;
    }
  }
  .pin {
    position: absolute;
    left: 6px;
    bottom: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  @media (prefers-reduced-motion: reduce) {
    .tile,
    .wait {
      animation: none;
    }
  }
</style>
