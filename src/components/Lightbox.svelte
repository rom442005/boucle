<script lang="ts">
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import { community } from '../lib/community.svelte';
  import { app } from '../lib/state.svelte';
  import { ago } from '../lib/community/time';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Photos en plein écran : glisser pour passer de l'une à l'autre (flèches et clavier sur Mac), l'auteur et
   * sa légende en bas, « Voir sur la carte » pour une photo placée sur le parcours.
   */
  const lb = $derived(community.lightbox!);
  const p = $derived(lb.list[lb.index]);
  const many = $derived(lb.list.length > 1);
  const onRoute = $derived(app.route?.communityId === p.routeId && (app.phase === 'results' || app.phase === 'detail'));
  const route = $derived(community.current?.id === p.routeId ? community.current : null);
  const mine = $derived(!!community.me && community.me.id === p.authorId);
  const canDelete = $derived(mine || (!!community.me && route?.authorId === community.me.id));

  let dx = $state(0);
  let dragging = $state(false);
  let x0 = 0;
  let confirm = $state(false);

  const close = () => (community.lightbox = null);
  function go(step: number) {
    const i = lb.index + step;
    if (i < 0 || i >= lb.list.length) return;
    haptic('tap');
    confirm = false;
    community.lightbox = { ...lb, index: i };
  }

  function down(e: PointerEvent) {
    if (!many || e.button !== 0) return;
    dragging = true;
    x0 = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const d = e.clientX - x0;
    // Au bout de la série, la photo résiste.
    const edge = (d > 0 && lb.index === 0) || (d < 0 && lb.index === lb.list.length - 1);
    dx = edge ? d / 3 : d;
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    dx = 0;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }

  function showOnMap() {
    if (!p.at) return;
    community.photoFocus = { id: p.id, at: p.at, tick: Date.now() };
    close();
  }
</script>

<svelte:window onkeydown={key} />

<div class="lb" role="dialog" aria-modal="true" aria-label="Photo {lb.index + 1} sur {lb.list.length}">
  <div class="top">
    <button use:tactile type="button" class="round dark" aria-label="Fermer" onclick={close}><Icon name="close" size={20} /></button>
    {#if many}<span class="count tabular">{lb.index + 1} / {lb.list.length}</span>{/if}
    <span class="sp"></span>
  </div>

  <div
    class="stage"
    class:dragging
    role="presentation"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    {#key p.id}
      <img src={p.url} alt={p.caption ?? `Photo de ${p.authorName}`} style:translate="{dx}px 0" draggable="false" />
    {/key}
  </div>

  {#if many}
    <button use:tactile type="button" class="nav prev round dark" aria-label="Photo précédente" disabled={lb.index === 0} onclick={() => go(-1)}><Icon name="caretLeft" size={22} /></button>
    <button use:tactile type="button" class="nav next round dark" aria-label="Photo suivante" disabled={lb.index === lb.list.length - 1} onclick={() => go(1)}><Icon name="caretRight" size={22} /></button>
  {/if}

  <div class="foot">
    <button use:tactile type="button" class="who" onclick={() => {
        close();
        void community.openProfile(p.authorId);
      }}>
      <Avatar id={p.authorId} name={p.authorName} src={p.authorAvatar} size={34} />
      <span><b>{p.authorName}</b><span class="when">{ago(p.createdAt)}</span></span>
    </button>
    {#if p.caption}<p class="cap">{p.caption}</p>{/if}
    <div class="acts">
      {#if p.at && onRoute}
        <button use:tactile type="button" class="chip" onclick={showOnMap}><Icon name="pin" size={16} />Voir sur la carte</button>
      {:else if !onRoute}
        <button use:tactile type="button" class="chip" onclick={() => {
            close();
            void community.openRoute(p.routeId);
          }}><Icon name="path" size={16} />Voir le parcours</button>
      {/if}
      {#if canDelete}
        {#if confirm}
          <button use:tactile type="button" class="chip danger" onclick={() => {
              confirm = false;
              void community.deletePhoto(p);
            }}><Icon name="trash" size={16} />Retirer pour de bon</button>
        {:else}
          <button use:tactile type="button" class="chip" onclick={() => (confirm = true)}><Icon name="trash" size={16} />Retirer</button>
        {/if}
      {:else if community.me}
        <button use:tactile type="button" class="chip" onclick={() => {
            close();
            community.startReport({ photoId: p.id }, `la photo de ${p.authorName}`);
          }}><Icon name="report" size={16} />Signaler</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .lb {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #fff;
    background: rgba(0, 0, 0, 0.94);
    animation: lb-in 260ms var(--ease-out) backwards;
  }
  @keyframes lb-in {
    from {
      opacity: 0;
    }
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 6px;
  }
  .sp {
    flex: 1;
  }
  .count {
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .dark {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .stage {
    position: relative;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    touch-action: pan-y;
    user-select: none;
  }
  .stage img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: translate 320ms var(--spring);
    animation: img-in 360ms var(--ease-out) backwards;
  }
  .dragging img {
    transition: none;
  }
  @keyframes img-in {
    from {
      opacity: 0;
      scale: 0.97;
    }
  }
  .nav {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    display: none;
  }
  .nav:disabled {
    opacity: 0.3;
  }
  .prev {
    left: 16px;
  }
  .next {
    right: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .nav {
      display: grid;
    }
  }
  .foot {
    display: grid;
    gap: 8px;
    padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px);
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-self: start;
    color: #fff;
    text-align: left;
  }
  .who span {
    display: grid;
  }
  .when {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.65);
  }
  .cap {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.14);
  }
  .chip.danger {
    background: #ff3b30;
  }
  @media (prefers-reduced-motion: reduce) {
    .lb,
    .stage img {
      animation: none;
    }
  }
</style>
