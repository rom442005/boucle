<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import { community } from '../lib/community.svelte';
  import { LEVELS, type CommunityRoute } from '../lib/community/types';
  import { ago } from '../lib/community/time';
  import { decodePolyline, haversine } from '../lib/geo';
  import { km, NNBSP } from '../lib/format';
  import { SPORTS, SHAPES } from '../lib/sports';
  import { tactile } from '../lib/haptics';
  import type { LngLat } from '../lib/types';

  /** Un parcours dans le fil : qui l'a publié, sa forme, ses chiffres, ses j'aime et commentaires. */
  let { r, i = 0, from = null, author = true }: { r: CommunityRoute; i?: number; from?: LngLat | null; author?: boolean } = $props();

  const coords = $derived(decodePolyline(r.data.p, r.data.q));
  const away = $derived(from ? haversine(from, r.start) : null);
</script>

<li class="c-li li" style:--i={Math.min(i, 8)}>
  <button use:tactile type="button" class="c-open" onclick={() => community.openRoute(r.id, r)}>
    {#if author}
      <span class="c-author">
        <Avatar id={r.authorId} name={r.authorName} src={r.authorAvatar} size={30} />
        <span class="c-who">
          <span class="c-name-a">{r.authorName}</span>
          <span class="c-sub">{LEVELS[r.authorLevel]}{r.authorCity ? ` · ${r.authorCity}` : ''} · {ago(r.createdAt)}</span>
        </span>
      </span>
    {/if}
    <span class="c-route">
      <RouteGlyph {coords} size={54} active />
      <span class="c-txt">
        <span class="c-title">{r.name}</span>
        <span class="c-meta tabular">{km(r.distanceM)} · {r.ascentM}{NNBSP}m D+ · {SPORTS[r.sport].label} · {SHAPES[r.shape].label.toLowerCase()}</span>
        {#if away != null}<span class="c-meta tabular">Départ à {away < 1000 ? `${Math.round(away / 10) * 10}${NNBSP}m` : km(away)}{!author ? ` · ${ago(r.createdAt)}` : ''}</span>
        {:else if !author}<span class="c-meta">{ago(r.createdAt)}</span>{/if}
      </span>
      {#if r.cover}<img class="c-cover" src={r.cover} alt="" width="54" height="54" loading="lazy" decoding="async" />{/if}
    </span>
  </button>
  <div class="c-foot">
    <button use:tactile type="button" class="c-act" class:on={r.likedByMe} aria-pressed={r.likedByMe} aria-label="J’aime ({r.likes})" onclick={() => community.toggleLike(r)}>
      <Icon name="heart" size={18} fill={r.likedByMe} /><span class="tabular">{r.likes}</span>
    </button>
    <button use:tactile type="button" class="c-act" aria-label="Commentaires ({r.comments})" onclick={() => community.openRoute(r.id, r)}>
      <Icon name="chat" size={18} /><span class="tabular">{r.comments}</span>
    </button>
    {#if r.photos}<span class="c-act c-ph" aria-label="{r.photos} photo{r.photos > 1 ? 's' : ''}"><Icon name="images" size={18} /><span class="tabular">{r.photos}</span></span>{/if}
    {#if r.uses}<span class="c-uses tabular">Repris {r.uses}{NNBSP}fois</span>{/if}
  </div>
</li>

<style>
  .c-cover {
    flex: none;
    width: 54px;
    height: 54px;
    margin-left: auto;
    border-radius: 12px;
    object-fit: cover;
    background: var(--fill-2);
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.1);
  }
  .c-ph {
    pointer-events: none;
  }
  .c-li {
    display: grid;
  }
  .c-open {
    display: grid;
    gap: 10px;
    padding: 12px 14px 6px 12px;
    text-align: left;
    color: var(--label-3);
  }
  .c-open:active {
    background: var(--fill-2);
  }
  .c-author {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .c-who {
    display: grid;
    min-width: 0;
  }
  .c-name-a {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--label);
  }
  .c-sub {
    font-size: 0.75rem;
    color: var(--label-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-route {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .c-txt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .c-title {
    font-weight: 650;
    font-size: 1rem;
    letter-spacing: -0.01em;
    color: var(--label);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .c-meta {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .c-foot {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px 6px 4px;
  }
  .c-act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 40px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--label-2);
    transition:
      color 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .c-act:active {
    transform: scale(0.92);
  }
  .c-act.on {
    color: var(--tint);
  }
  .c-act.on :global(.icon) {
    animation: c-pop 420ms var(--spring-bouncy);
  }
  @keyframes c-pop {
    from {
      transform: scale(0.6);
    }
  }
  .c-uses {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--label-2);
  }
</style>
