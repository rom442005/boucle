<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import { community } from '../lib/community.svelte';
  import { LEVELS, type CommunityRoute } from '../lib/community/types';
  import { ago } from '../lib/community/time';
  import { decodePolyline, haversine } from '../lib/geo';
  import { km, kmValue, NNBSP } from '../lib/format';
  import { SPORT_EMOJI, SPORT_TONE } from '../lib/scenes';
  import type { Shape } from '../lib/types';

  const SHAPE_EMOJI: Record<Shape, string> = { loop: '🔁', outback: '↩️', oneway: '➡️' };
  import { SPORTS, SHAPES } from '../lib/sports';
  import { tactile } from '../lib/haptics';
  import type { LngLat } from '../lib/types';

  /** Un parcours dans le fil : qui l'a publié, sa forme, ses chiffres, ses j'aime et commentaires. */
  let { r, i = 0, from = null, author = true }: { r: CommunityRoute; i?: number; from?: LngLat | null; author?: boolean } = $props();

  const coords = $derived(decodePolyline(r.data.p, r.data.q));
  const away = $derived(from ? haversine(from, r.start) : null);
</script>

<li class="c-li li glass photo-card" style:--i={Math.min(i, 8)}>
  <button use:tactile type="button" class="c-open" onclick={() => community.openRoute(r.id, r)}>
    <!-- La sortie en image : sa première photo, sinon le tracé en grand sur la teinte du sport. -->
    <span class="c-media" class:photo={!!r.cover} style:--tone={SPORT_TONE[r.sport]}>
      {#if r.cover}<img src={r.cover} alt="" loading="lazy" decoding="async" />{/if}
      <span class="c-trace" class:small={!!r.cover}><RouteGlyph {coords} size={r.cover ? 52 : 120} active /></span>
      <span class="c-chip glass">{SPORT_EMOJI[r.sport]} {SPORTS[r.sport].label}</span>
      <span class="c-stats glass rounded tabular"><b>{kmValue(r.distanceM)}</b> km · ⛰️ <b>{r.ascentM}</b> m</span>
    </span>
    <span class="c-txt">
      <span class="c-title">{r.name}</span>
      <span class="c-meta tabular">{SHAPE_EMOJI[r.shape]} {SHAPES[r.shape].label}{#if away != null}{' · 📍 '}{away < 1000 ? `${Math.round(away / 10) * 10}${NNBSP}m` : km(away)}{/if}{#if !author}{' · '}{ago(r.createdAt)}{/if}</span>
    </span>
    {#if author}
      <span class="c-author">
        <Avatar id={r.authorId} name={r.authorName} src={r.authorAvatar} size={26} />
        <span class="c-name-a">{r.authorName}</span>
        <span class="c-sub">{LEVELS[r.authorLevel]}{r.authorCity ? ` · ${r.authorCity}` : ''} · {ago(r.createdAt)}</span>
      </span>
    {/if}
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
  .c-media {
    position: relative;
    display: grid;
    place-items: center end;
    padding-right: 24px;
    height: 168px;
    border-radius: 20px;
    overflow: hidden;
    background:
      radial-gradient(120% 90% at 20% 0%, rgba(255, 255, 255, 0.22), transparent 60%),
      linear-gradient(160deg, color-mix(in srgb, var(--tone) 70%, #fff), var(--tone));
  }
  .c-media img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 400ms var(--ease-out);
  }
  .c-open:active .c-media img {
    transform: scale(1.03);
  }
  .c-trace {
    position: relative;
    display: grid;
  }
  .c-trace :global(.glyph) {
    background: transparent;
  }
  .c-trace :global(.glyph path) {
    stroke: #fff;
    stroke-width: 3;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
  }
  .c-trace :global(.glyph circle) {
    fill: var(--tint);
    stroke: #fff;
    stroke-width: 1.5;
  }
  .c-trace.small {
    position: absolute;
    right: 10px;
    top: 10px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.28);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
  }
  .c-chip,
  .c-stats {
    position: absolute;
    left: 10px;
    --g-bg: rgba(20, 20, 22, 0.32);
    --blur: 14px;
    --rim-hi: rgba(255, 255, 255, 0.55);
    --rim-lo: rgba(255, 255, 255, 0.14);
    --rim-hi2: rgba(255, 255, 255, 0.3);
    color: #fff;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .c-chip {
    top: 10px;
    padding: 5px 11px;
  }
  .c-stats {
    bottom: 10px;
    padding: 6px 12px;
    font-weight: 500;
  }
  .c-stats b {
    font-size: 1rem;
    font-weight: 700;
  }
  .c-ph {
    pointer-events: none;
  }
  /* Un bloc de verre par parcours, sur la photo ; hors de l'écran, il n'est pas dessiné (défilement fluide). */
  .c-li {
    display: grid;
    content-visibility: auto;
    contain-intrinsic-size: auto 300px;
  }
  .c-li.photo-card {
    padding: 0;
  }
  .c-open {
    display: grid;
    gap: 10px;
    padding: 8px 8px 4px;
    text-align: left;
    color: var(--label-3);
  }
  .c-open:active {
    background: var(--fill-2);
  }
  .c-author {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .c-txt {
    min-width: 0;
    display: grid;
    gap: 3px;
    padding: 0 6px;
  }
  .c-author {
    padding: 0 6px;
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
