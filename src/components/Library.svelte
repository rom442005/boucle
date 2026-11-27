<script lang="ts">
  import CountUp from './CountUp.svelte';
  import Icon from './Icon.svelte';
  import { tactile } from '../lib/haptics';
  import RouteGlyph from './RouteGlyph.svelte';
  import { app } from '../lib/state.svelte';
  import { cumulative, decodePolyline } from '../lib/geo';
  import { dateShort, duration, km, NNBSP, pace, speed } from '../lib/format';
  import { SPORTS } from '../lib/sports';
  import { elevationStats } from '../lib/elevation';
  import { SPORT_EMOJI } from '../lib/scenes';
  import ActivityBars from './ActivityBars.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import { LIST_EMOJIS, saved, SUGGESTED } from '../lib/saved.svelte';
  import { haversine } from '../lib/geo';

  let editing = $state(false);

  const favorites = $derived(
    app.library.map((s) => {
      const coords = decodePolyline(s.p, s.q);
      const cum = cumulative(coords);
      return { s, coords, length: cum[cum.length - 1] ?? 0, ascent: elevationStats({ step: s.es, ele: s.e }).ascent };
    }),
  );

  const outings = $derived(
    app.history.map((h) => {
      const coords = decodePolyline(h.route.p, h.route.q);
      const kmDone = h.distanceM / 1000;
      const bike = SPORTS[h.route.s].bike;
      const rate = h.durationS && kmDone > 0.2 ? (bike ? speed(kmDone / (h.durationS / 3600)) : pace(h.durationS / kmDone)) : null;
      return { h, coords, rate };
    }),
  );

  /** Totaux du mois en cours. */
  const month = $derived.by(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const list = app.history.filter((h) => h.date >= from);
    return {
      label: new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(now),
      km: list.reduce((s, h) => s + h.distanceM, 0) / 1000,
      count: list.length,
      time: list.reduce((s, h) => s + (h.durationS ?? 0), 0),
    };
  });

  /** Le sport le plus pratiqué, pour l'émoji du résumé. */
  const mainSport = $derived.by(() => {
    const n: Record<string, number> = {};
    for (const h of app.history) n[h.route.s] = (n[h.route.s] ?? 0) + 1;
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof SPORT_EMOJI | undefined;
    return top ? SPORT_EMOJI[top] : '🏃';
  });

  const monthTitle = $derived(month.label.charAt(0).toUpperCase() + month.label.slice(1));
  const dateLong = (t: number) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(t);

  let file: HTMLInputElement | undefined = $state();
  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) await app.importGPX(f);
    if (file) file.value = '';
  }

  $effect(() => {
    void app.libTab;
    editing = false;
  });

  /* Mes lieux : la liste ouverte, ses lieux (avec leur distance), les adresses encore à ajouter. */
  const openList = $derived(saved.listOf(saved.openList));
  const listPlaces = $derived(
    saved.placesIn(openList.id).map((p) => ({ p, dist: app.userPos ? haversine(app.userPos, p.coord) : null })),
  );
  const missing = $derived(openList.id === 'adresses' ? SUGGESTED.filter((s) => !saved.places.some((p) => p.name.toLowerCase() === s.name.toLowerCase())) : []);
  let newList = $state<null | { name: string; emoji: string }>(null);
  function createList() {
    if (!newList?.name.trim()) return;
    const l = saved.addList(newList.name, newList.emoji);
    saved.openList = l.id;
    newList = null;
  }
  /** le choix d'émoji ouvert : pour la nouvelle liste, ou la liste qu'on modifie */
  let picking = $state<'new' | 'edit' | null>(null);
  let listName = $state('');
  $effect(() => {
    listName = openList.name;
  });
</script>

<input bind:this={file} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" class="visually-hidden" tabindex="-1" onchange={onFile} />

<div class="cards">
  <!-- Le mois en un coup d'œil, puis les 28 derniers jours en barres, comme les blocs d'une app santé. -->
  <section class="card wide glass photo-card" aria-label="Ce mois-ci">
    <div class="card-top"><span class="k">🗓️ {monthTitle}</span><span class="k">⏱️ {month.time ? duration(month.time) : '0 min'}</span></div>
    <div class="m">
      <span class="emo" aria-hidden="true">{mainSport}</span>
      <b class="big rounded"><CountUp value={month.km} decimals={month.km < 100 ? 1 : 0} /><small>km</small></b>
      <span class="side"><b class="rounded"><CountUp value={month.count} /></b> sortie{month.count > 1 ? 's' : ''}</span>
    </div>
    <div class="sep"></div>
    <span class="k">28 derniers jours</span>
    <ActivityBars />
  </section>

  <button use:tactile type="button" class="card tabcard glass photo-card" class:on={app.libTab === 'favoris'} aria-pressed={app.libTab === 'favoris'} onclick={() => (app.libTab = 'favoris')}>
    <span class="k">Favoris</span><span class="nrow"><span class="emo-s" aria-hidden="true">⭐</span><b class="n rounded"><CountUp value={app.library.length} /></b></span>
  </button>
  <button use:tactile type="button" class="card tabcard glass photo-card" class:on={app.libTab === 'historique'} aria-pressed={app.libTab === 'historique'} onclick={() => (app.libTab = 'historique')}>
    <span class="k">Sorties</span><span class="nrow"><span class="emo-s" aria-hidden="true">🕒</span><b class="n rounded"><CountUp value={app.history.length} /></b></span>
  </button>
  <button use:tactile type="button" class="card tabcard glass photo-card" class:on={app.libTab === 'lieux'} aria-pressed={app.libTab === 'lieux'} onclick={() => (app.libTab = 'lieux')}>
    <span class="k">Lieux</span><span class="nrow"><span class="emo-s" aria-hidden="true">📍</span><b class="n rounded"><CountUp value={saved.places.length} /></b></span>
  </button>

  <section class="card wide glass photo-card list-card" aria-label={app.libTab === 'favoris' ? 'Parcours favoris' : app.libTab === 'lieux' ? 'Mes lieux' : 'Historique des sorties'}>
{#if app.libTab === 'lieux'}
  <div class="list-head">
    <h3 class="k">Mes lieux</h3>
    <button use:tactile type="button" class="text-btn" onclick={() => (editing = !editing)}>{editing ? 'OK' : 'Modifier'}</button>
  </div>
  <!-- Les listes, comme des onglets : émoji, nom, nombre de lieux. -->
  <div class="lists" role="tablist" aria-label="Listes de lieux">
    {#each saved.lists as l (l.id)}
      <button use:tactile type="button" class="lchip" class:on={l.id === openList.id} role="tab" aria-selected={l.id === openList.id} onclick={() => (saved.openList = l.id)}>
        <span aria-hidden="true">{l.emoji}</span>{l.name}<small class="tabular">{saved.placesIn(l.id).length}</small>
      </button>
    {/each}
    {#if !newList}
      <button use:tactile type="button" class="lchip add" aria-label="Nouvelle liste" onclick={() => (newList = { name: '', emoji: LIST_EMOJIS[0] })}><Icon name="plus" size={14} />Liste</button>
    {/if}
  </div>
  {#if newList}
    <div class="lform">
      <button use:tactile type="button" class="lemo" class:open={picking === 'new'} aria-label="Changer l’émoji ({newList.emoji})" aria-expanded={picking === 'new'} onclick={() => (picking = picking === 'new' ? null : 'new')}>{newList.emoji}</button>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={newList.name} maxlength="30" placeholder="Nom de la nouvelle liste" aria-label="Nom de la nouvelle liste" autofocus enterkeyhint="done" onkeydown={(e) => e.key === 'Enter' && createList()} />
      <button use:tactile type="button" class="lok" aria-label="Créer la liste" disabled={!newList.name.trim()} onclick={createList}>Créer</button>
      <button use:tactile type="button" class="lx" aria-label="Annuler" onclick={() => ((newList = null), (picking = null))}><Icon name="close" size={14} /></button>
    </div>
    {#if picking === 'new'}
      <EmojiPicker value={newList.emoji} label="Émoji de la nouvelle liste" onpick={(e) => newList && ((newList.emoji = e), (picking = null))} />
    {/if}
  {:else if editing}
    <div class="lform">
      <button use:tactile type="button" class="lemo" class:open={picking === 'edit'} aria-label="Changer l’émoji de la liste ({openList.emoji})" aria-expanded={picking === 'edit'} onclick={() => (picking = picking === 'edit' ? null : 'edit')}>{openList.emoji}</button>
      <input bind:value={listName} maxlength="30" aria-label="Nom de la liste" onchange={() => saved.renameList(openList.id, listName, openList.emoji)} />
      {#if saved.lists.length > 1}
        <button use:tactile type="button" class="lx danger" aria-label="Supprimer la liste {openList.name} et ses lieux" onclick={() => {
          const snap = saved.snapshot();
          const name = openList.name;
          saved.removeList(openList.id);
          app.showToast(`Liste ${name} supprimée`, () => saved.restore(snap));
        }}><Icon name="trash" size={15} /></button>
      {/if}
    </div>
    {#if picking === 'edit'}
      <EmojiPicker value={openList.emoji} label="Émoji de la liste {openList.name}" onpick={(e) => (saved.renameList(openList.id, listName, e), (picking = null))} />
    {/if}
  {/if}
  {#if listPlaces.length || missing.length}
    <ul class="list" aria-label="Lieux de la liste {openList.name}">
      {#each listPlaces as it, i (it.p.id)}
        <li class="li" style:--i={Math.min(i, 8)}>
          {#if editing}
            <button use:tactile type="button" class="del" aria-label="Retirer {it.p.name}" onclick={() => {
              const snap = saved.snapshot();
              saved.remove(it.p.id);
              app.showToast(`${it.p.name} retiré`, () => saved.restore(snap));
            }}><Icon name="remove" size={24} /></button>
          {/if}
          <button use:tactile type="button" class="item" disabled={editing} onclick={() => app.showSavedPlace(it.p.id)}>
            <span class="pemo" aria-hidden="true">{saved.emojiOf(it.p)}</span>
            <span class="txt">
              <span class="name">{it.p.name}</span>
              <span class="meta tabular">{[it.p.detail, it.dist != null ? `à ${km(it.dist)}` : ''].filter(Boolean).join(' · ') || 'Lieu enregistré'}</span>
            </span>
            {#if !editing}<Icon name="chevron" size={16} />{/if}
          </button>
          {#if editing}
            <button use:tactile type="button" class="del edit" aria-label="Modifier {it.p.name}" onclick={() => saved.edit({ id: it.p.id, name: it.p.name, detail: it.p.detail, coord: it.p.coord })}><Icon name="pencil" size={18} /></button>
          {/if}
        </li>
      {/each}
      {#each missing as m (m.name)}
        <li class="li">
          <button use:tactile type="button" class="item ghost" onclick={() => app.addSavedPlace({ name: m.name, emoji: m.emoji, list: 'adresses' })}>
            <span class="pemo dim" aria-hidden="true">{m.emoji}</span>
            <span class="txt"><span class="name">Ajouter {m.name}</span></span>
            <Icon name="plus" size={14} />
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty small">
      <span class="empty-ic" aria-hidden="true">{openList.emoji}</span>
      <h3>Aucun lieu dans {openList.name}</h3>
    </div>
  {/if}
  <button use:tactile type="button" class="pill import" onclick={() => app.addSavedPlace({ list: openList.id })}><Icon name="plus" size={16} />Ajouter un lieu</button>
{:else if app.libTab === 'favoris'}
  {#if favorites.length}
    <div class="list-head">
      <h3 class="k">Parcours favoris</h3>
      <button use:tactile type="button" class="text-btn" onclick={() => (editing = !editing)}>{editing ? 'OK' : 'Modifier'}</button>
    </div>
    <ul class="list" aria-label="Parcours favoris">
      {#each favorites as it, i (it.s.id)}
        <li class="li" style:--i={Math.min(i, 8)}>
          {#if editing}
            <button use:tactile type="button" class="del" aria-label="Retirer {it.s.n} des favoris" onclick={() => app.removeSaved(it.s.id)}><Icon name="remove" size={24} /></button>
          {/if}
          <button use:tactile type="button" class="item" disabled={editing} onclick={() => app.openSaved(it.s.id)}>
            <RouteGlyph coords={it.coords} size={48} active />
            <span class="txt">
              <span class="name">{it.s.n}</span>
              <span class="meta tabular">{km(it.length)} · {it.ascent}{NNBSP}m D+ · {SPORTS[it.s.s].label} · {dateShort(it.s.t)}</span>
            </span>
            {#if !editing}<Icon name="chevron" size={16} />{/if}
          </button>
        </li>
      {/each}
    </ul>
    <button use:tactile type="button" class="pill import" onclick={() => file?.click()}><Icon name="upload" size={18} />Importer un GPX</button>
  {:else}
    <div class="empty">
      <svg viewBox="0 0 120 84" width="120" height="84" aria-hidden="true">
        <path d="M22 62c-9-10-6-30 8-36 13-6 20 6 32 2s14-18 30-12c15 6 14 30 0 40-12 9-26 2-38 6S30 72 22 62Z" fill="none" stroke="var(--tint)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 7" />
        <circle cx="22" cy="62" r="6" fill="var(--tint)" />
        <circle cx="22" cy="62" r="10" fill="none" stroke="var(--tint)" stroke-opacity=".25" stroke-width="3" />
      </svg>
      <h3>Aucun favori</h3>
      <div class="empty-actions">
        <button use:tactile type="button" class="pill is-on" onclick={() => app.closeLibrary()}>Créer un parcours</button>
        <button use:tactile type="button" class="pill" onclick={() => file?.click()}><Icon name="upload" size={18} />Importer un GPX</button>
      </div>
    </div>
  {/if}
{:else if outings.length}
  <div class="list-head">
    <h3 class="k">Sorties</h3>
    <button use:tactile type="button" class="text-btn" onclick={() => (editing = !editing)}>{editing ? 'OK' : 'Modifier'}</button>
  </div>
  <ul class="list" aria-label="Historique des sorties">
    {#each outings as o, i (o.h.id)}
      <li class="li" style:--i={Math.min(i, 8)}>
        {#if editing}
          <button use:tactile type="button" class="del" aria-label="Supprimer la sortie du {dateLong(o.h.date)}" onclick={() => app.removeHistory(o.h.id)}><Icon name="remove" size={24} /></button>
        {/if}
        <button use:tactile type="button" class="item" disabled={editing} onclick={() => app.openHistory(o.h.id)}>
          <RouteGlyph coords={o.coords} size={48} active={o.h.complete} />
          <span class="txt">
            <span class="when">{dateLong(o.h.date)}{#if !o.h.complete}<span class="partial"> · partiel</span>{/if}</span>
            <span class="name">{o.h.route.n}</span>
            <span class="meta tabular">{km(o.h.distanceM)}{#if o.h.durationS} · {duration(o.h.durationS)}{/if}{#if o.rate} · {o.rate}{/if} · {SPORTS[o.h.route.s].label}</span>
          </span>
          {#if !editing}<Icon name="chevron" size={16} />{/if}
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <div class="empty">
    <span class="empty-ic" aria-hidden="true"><Icon name="history" size={40} /></span>
    <h3>Aucune sortie pour l’instant</h3>
    <div class="empty-actions">
      <button use:tactile type="button" class="pill is-on" onclick={() => app.closeLibrary()}>Créer un parcours</button>
    </div>
  </div>
{/if}
  </section>
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding-bottom: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    min-width: 0;
    border-radius: 26px;
    padding: 14px 16px;
    text-align: left;
    color: var(--label);
    animation: card-in 380ms var(--spring) backwards;
  }
  .cards > :nth-child(2) { animation-delay: 70ms; }
  .cards > :nth-child(3) { animation-delay: 110ms; }
  .cards > :nth-child(n + 4) { animation-delay: 160ms; }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 14px;
      scale: 0.97;
    }
  }
  .wide {
    grid-column: 1 / -1;
  }
  .k {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--label-2);
  }
  .card-top {
    display: flex;
    justify-content: space-between;
  }
  .m {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .emo {
    font-size: 2.25rem;
    line-height: 1;
  }
  .big {
    font-size: 2.75rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .big small {
    font-family: var(--font);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0;
    color: var(--label-2);
    margin-left: 4px;
  }
  .side {
    margin-left: auto;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .side b {
    font-size: 1.25rem;
    font-weight: 650;
    color: var(--label);
  }
  .sep {
    height: 0.5px;
    margin: 6px 0 4px;
    background: var(--separator);
  }
  .tabcard {
    transition:
      transform 260ms var(--spring),
      box-shadow 260ms var(--ease-out);
  }
  .tabcard:active {
    transform: scale(0.97);
  }
  .tabcard.on {
    box-shadow:
      var(--shadow-glass),
      inset 0 0 0 2px rgba(255, 255, 255, 0.85);
  }
  /* Comme les blocs-onglets de Communauté : étiquette seule en haut, l'émoji à côté du chiffre. */
  .tabcard {
    padding: 13px;
  }
  .nrow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .emo-s {
    font-size: 1.125rem;
    line-height: 1;
  }
  .tabcard .n {
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  /* La liste se fond dans son bloc de verre. */
  .list-card .list {
    margin: 0 -10px;
    background: transparent;
  }
  .list-card :global(.glyph) {
    background: rgba(255, 255, 255, 0.1);
  }
  .list-card :global(.glyph path) {
    stroke: #fff;
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 4px;
  }
  .list-head h3 {
    margin: 0;
  }
  .list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    border-radius: 20px;
    background: var(--fill-group);
    overflow: hidden;
  }
  .li {
    display: flex;
    align-items: center;
    /* Longues listes (historique) : les lignes hors de l'écran ne se dessinent pas. */
    content-visibility: auto;
    contain-intrinsic-size: auto 64px;
  }
  .li + .li {
    border-top: 0.5px solid var(--separator);
  }
  .del {
    flex: none;
    width: 44px;
    height: 44px;
    margin-left: 6px;
    display: grid;
    place-items: center;
    color: #ff3b30;
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px 10px 10px;
    text-align: left;
    color: var(--label-3);
  }
  .item:disabled {
    cursor: default;
  }
  .item:active:not(:disabled) {
    background: var(--fill-2);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--tint-deep);
  }
  .when::first-letter {
    text-transform: uppercase;
  }
  .partial {
    color: var(--label-2);
    font-weight: 500;
  }
  .meta {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .import {
    width: 100%;
  }
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 10px;
    padding: 18px 12px 8px;
  }
  .empty h3 {
    margin: 6px 0 0;
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .empty-ic {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--tint);
    background: var(--tint-soft);
  }
  /* Mes lieux : les listes en pastilles de verre (choisie : blanche pleine), les lieux à leur émoji. */
  .lists {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .lchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--label);
    background: var(--fill-2);
    transition: transform 240ms var(--spring-bouncy);
  }
  .lchip small {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .lchip.on {
    color: #1c1c1e;
    background: #fff;
  }
  .lchip.on small {
    color: rgba(28, 28, 30, 0.55);
  }
  .lchip:active {
    transform: scale(0.95);
  }
  .lchip.add {
    color: var(--label-2);
  }
  .lform {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  .lform input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    outline: none;
    font-size: 0.9375rem;
    color: var(--label);
    background: var(--fill-2);
  }
  .lemo.open {
    box-shadow: 0 0 0 2px var(--tint);
  }
  .lemo,
  .lx {
    width: 38px;
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--fill-2);
    font-size: 1.1rem;
    color: var(--label-2);
  }
  .lx.danger {
    color: #ff453a;
  }
  .lok {
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    font-weight: 600;
    color: #1c1c1e;
    background: #fff;
  }
  .lok:disabled {
    opacity: 0.4;
  }
  .pemo {
    width: 44px;
    height: 44px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 1.35rem;
    background: rgba(255, 255, 255, 0.92);
  }
  .pemo.dim {
    opacity: 0.55;
    background: rgba(255, 255, 255, 0.16);
  }
  .ghost .name {
    color: var(--label-2);
    font-weight: 560;
  }
  .del.edit {
    margin: 0 6px 0 0;
    color: var(--label-2);
  }
  .empty.small {
    padding: 8px 12px 14px;
  }
  .empty.small .empty-ic {
    width: 56px;
    height: 56px;
    font-size: 1.6rem;
    background: rgba(255, 255, 255, 0.12);
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
  /* Téléphone : des blocs un peu plus compacts (Romain, 23/11). */
  @media (max-width: 859px) {
    .cards {
      gap: 8px;
    }
    .card {
      padding: 12px 14px;
      border-radius: 24px;
    }
    .k {
      font-size: 0.75rem;
    }
    .big {
      font-size: 2.375rem;
    }
    .tabcard {
      padding: 11px 12px;
    }
    .tabcard .n {
      font-size: 1.75rem;
    }
    .emo {
      font-size: 2rem;
    }
  }
</style>
