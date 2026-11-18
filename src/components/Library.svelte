<script lang="ts">
  import Icon from './Icon.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import { app } from '../lib/state.svelte';
  import { decodePolyline } from '../lib/geo';
  import { dateShort, km } from '../lib/format';
  import { SPORTS } from '../lib/sports';
  import { elevationStats } from '../lib/elevation';
  import { cumulative } from '../lib/geo';

  const items = $derived(
    app.library.map((s) => {
      const coords = decodePolyline(s.p, s.q);
      const cum = cumulative(coords);
      return { s, coords, length: cum[cum.length - 1] ?? 0, ascent: elevationStats({ step: s.es, ele: s.e }).ascent };
    }),
  );

  let file: HTMLInputElement | undefined = $state();
  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) await app.importGPX(f);
    if (file) file.value = '';
  }
</script>

<input bind:this={file} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" class="visually-hidden" tabindex="-1" onchange={onFile} />

{#if items.length}
  <ul class="list" aria-label="Parcours enregistrés">
    {#each items as it (it.s.id)}
      <li>
        <button type="button" class="item" onclick={() => app.openSaved(it.s.id)}>
          <RouteGlyph coords={it.coords} size={48} active />
          <span class="txt">
            <span class="name">{it.s.n}</span>
            <span class="meta tabular">{km(it.length)} · {it.ascent} m D+ · {SPORTS[it.s.s].label} · {dateShort(it.s.t)}</span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </li>
    {/each}
  </ul>
  <button type="button" class="pill import" onclick={() => file?.click()}><Icon name="upload" size={18} />Importer un GPX</button>
  <p class="hint foot">Enregistrés sur cet appareil. Pour retrouver un parcours sur ton autre appareil, ouvre-le puis touche Partager.</p>
{:else}
  <div class="empty">
    <svg viewBox="0 0 120 84" width="120" height="84" aria-hidden="true">
      <path d="M22 62c-9-10-6-30 8-36 13-6 20 6 32 2s14-18 30-12c15 6 14 30 0 40-12 9-26 2-38 6S30 72 22 62Z" fill="none" stroke="var(--tint)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 7" />
      <circle cx="22" cy="62" r="6" fill="var(--tint)" />
      <circle cx="22" cy="62" r="10" fill="none" stroke="var(--tint)" stroke-opacity=".25" stroke-width="3" />
    </svg>
    <h3>Aucun parcours enregistré</h3>
    <p class="hint">Crée un parcours puis touche <b>Enregistrer</b> : il t’attendra ici.</p>
    <div class="empty-actions">
      <button type="button" class="pill is-on" onclick={() => app.closeLibrary()}>Créer un parcours</button>
      <button type="button" class="pill" onclick={() => file?.click()}><Icon name="upload" size={18} />Importer un GPX</button>
    </div>
  </div>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    border-radius: 20px;
    background: var(--fill-group);
    overflow: hidden;
  }
  li + li .item {
    border-top: 0.5px solid var(--separator);
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px 10px 10px;
    text-align: left;
    color: var(--label-3);
  }
  .item:active {
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
  .meta {
    font-size: 0.8125rem;
    color: var(--label-2);
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
    padding: 24px 12px 8px;
  }
  .empty h3 {
    margin: 6px 0 0;
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .empty .hint {
    max-width: 30ch;
    margin: 0;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }
</style>
