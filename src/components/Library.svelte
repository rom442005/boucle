<script lang="ts">
  import Icon from './Icon.svelte';
  import { tactile } from '../lib/haptics';
  import RouteGlyph from './RouteGlyph.svelte';
  import Segmented from './Segmented.svelte';
  import { app } from '../lib/state.svelte';
  import { cumulative, decodePolyline } from '../lib/geo';
  import { dateShort, duration, km, NNBSP, pace, speed } from '../lib/format';
  import { SPORTS } from '../lib/sports';
  import { elevationStats } from '../lib/elevation';

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
</script>

<input bind:this={file} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" class="visually-hidden" tabindex="-1" onchange={onFile} />

<div class="tabs">
  <Segmented
    label="Mes parcours"
    value={app.libTab}
    options={[
      { value: 'favoris', label: `Favoris${app.library.length ? ` (${app.library.length})` : ''}` },
      { value: 'historique', label: `Historique${app.history.length ? ` (${app.history.length})` : ''}` },
    ]}
    onchange={(v) => (app.libTab = v)}
  />
</div>

{#if app.libTab === 'favoris'}
  {#if favorites.length}
    <div class="list-head">
      <h3 class="field-label">Parcours favoris</h3>
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
    <p class="hint foot">Favoris enregistrés sur cet appareil. Pour retrouver un parcours sur ton autre appareil, ouvre-le puis touche Partager.</p>
  {:else}
    <div class="empty">
      <svg viewBox="0 0 120 84" width="120" height="84" aria-hidden="true">
        <path d="M22 62c-9-10-6-30 8-36 13-6 20 6 32 2s14-18 30-12c15 6 14 30 0 40-12 9-26 2-38 6S30 72 22 62Z" fill="none" stroke="var(--tint)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 7" />
        <circle cx="22" cy="62" r="6" fill="var(--tint)" />
        <circle cx="22" cy="62" r="10" fill="none" stroke="var(--tint)" stroke-opacity=".25" stroke-width="3" />
      </svg>
      <h3>Aucun favori</h3>
      <p class="hint">Sur un parcours, touche <b>Favori</b> : il t’attendra ici.</p>
      <div class="empty-actions">
        <button use:tactile type="button" class="pill is-on" onclick={() => app.closeLibrary()}>Créer un parcours</button>
        <button use:tactile type="button" class="pill" onclick={() => file?.click()}><Icon name="upload" size={18} />Importer un GPX</button>
      </div>
    </div>
  {/if}
{:else if outings.length}
  <section class="month" aria-label="Ce mois-ci">
    <h3 class="field-label">En {month.label}</h3>
    <dl class="mstats">
      <div><dt>Distance</dt><dd class="rounded tabular">{month.km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}<small>km</small></dd></div>
      <div><dt>Sorties</dt><dd class="rounded tabular">{month.count}</dd></div>
      <div><dt>Temps suivi</dt><dd class="rounded tabular">{month.time ? duration(month.time) : '—'}</dd></div>
    </dl>
  </section>
  <div class="list-head">
    <h3 class="field-label">Sorties</h3>
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
  <p class="hint foot">Une sortie s’ajoute quand tu termines un suivi en direct (au-delà de 300 m) ou quand tu touches <b>Fait</b> sur un parcours.</p>
{:else}
  <div class="empty">
    <span class="empty-ic" aria-hidden="true"><Icon name="history" size={40} /></span>
    <h3>Aucune sortie pour l’instant</h3>
    <p class="hint">Suis un parcours en direct, ou touche <b>Fait</b> sur un parcours que tu as couru : il apparaîtra ici avec la date, la distance et le temps.</p>
    <div class="empty-actions">
      <button use:tactile type="button" class="pill is-on" onclick={() => app.closeLibrary()}>Créer un parcours</button>
    </div>
  </div>
{/if}

<style>
  .tabs {
    margin: 2px 0 16px;
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
  .month {
    display: grid;
    gap: 8px;
    margin-bottom: 18px;
  }
  .month h3 {
    margin: 0;
  }
  .mstats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
    padding: 12px 14px;
    border-radius: 18px;
    background: var(--fill-group);
  }
  .mstats div + div {
    padding-left: 12px;
    border-left: 0.5px solid var(--separator);
  }
  .mstats dt {
    font-size: 0.75rem;
    color: var(--label-2);
    font-weight: 500;
  }
  .mstats dd {
    margin: 2px 0 0;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .mstats small {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--label-2);
    margin-left: 2px;
  }
  .import {
    width: 100%;
  }
  .foot {
    margin: 12px 4px 0;
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
  .empty .hint {
    max-width: 32ch;
    margin: 0;
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
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
</style>
