<script lang="ts">
  import Icon from './Icon.svelte';
  import { tactile } from '../lib/haptics';
  import { app } from '../lib/state.svelte';
  import { searchPlaces } from '../lib/services';
  import type { Place } from '../lib/types';
  import { saved } from '../lib/saved.svelte';

  const kind = $derived(app.search!);
  const TITLE = { start: 'Choisir le départ', destination: 'Choisir l’arrivée', via: 'Choisir un point de passage', save: 'Enregistrer un lieu' } as const;
  const FIELD = { start: 'Adresse de départ', destination: 'Adresse d’arrivée', via: 'Adresse du point de passage', save: 'Adresse du lieu à enregistrer' } as const;
  const HINT = { start: 'Adresse, lieu, parc…', destination: 'Où veux-tu aller ?', via: 'Par où veux-tu passer ?', save: 'Adresse, école, salle…' } as const;

  /** Mes lieux en tête (Mes adresses d'abord), filtrés par ce qui est tapé : un toucher, et c'est choisi. */
  const mine = $derived.by(() => {
    if (kind === 'save') return [];
    const t = q.trim().toLowerCase();
    const order = new Map(saved.lists.map((l, i) => [l.id, i]));
    return saved.places
      .filter((p) => !t || p.name.toLowerCase().includes(t) || (p.detail ?? '').toLowerCase().includes(t))
      .sort((a, b) => (order.get(a.list) ?? 99) - (order.get(b.list) ?? 99) || b.t - a.t)
      .slice(0, t ? 4 : 8);
  });
  let q = $state('');
  let results = $state<Place[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let input: HTMLInputElement | undefined = $state();
  let ctrl: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    input?.focus();
  });

  function onInput() {
    clearTimeout(timer);
    ctrl?.abort();
    failed = false;
    const text = q.trim();
    if (text.length < 3) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const near = app.start?.coord ?? app.userPos;
        results = await searchPlaces(text, near, ctrl.signal);
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') failed = true;
      } finally {
        loading = false;
      }
    }, 260);
  }

  function close() {
    const k = kind;
    ctrl?.abort();
    app.search = null;
    if (k === 'save') app.saveHint = {};
  }
  function choose(p: Place) {
    const k = kind;
    ctrl?.abort();
    app.search = null;
    app.setPlace(k, p);
  }
  async function myPosition() {
    const k = kind;
    ctrl?.abort();
    app.search = null;
    await app.useMyPosition(k);
  }
  function onMap() {
    ctrl?.abort();
    app.startPick(kind);
  }
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="scrim" class:wide={app.wide} onclick={close} aria-hidden="true"></div>
<div class="search glass glass-panel" class:wide={app.wide} role="dialog" aria-modal="true" aria-label={TITLE[kind]}>
  <div class="bar">
    <label class="field">
      <Icon name="search" size={18} />
      <span class="visually-hidden">{FIELD[kind]}</span>
      <input
        bind:this={input}
        bind:value={q}
        oninput={onInput}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder={HINT[kind]}
      />
    </label>
    <button use:tactile type="button" class="text-btn" onclick={close}>Annuler</button>
  </div>

  {#snippet mapRow()}
    <button use:tactile type="button" class="row" onclick={onMap}>
      <span class="ic" class:map-ic={kind !== 'start'}><Icon name="crosshair" size={18} /></span>
      <span class="row-label">
        Choisir sur la carte
      </span>
    </button>
  {/snippet}
  {#snippet mineRow()}
    <button use:tactile type="button" class="row" onclick={myPosition}>
      <span class="ic loc"><Icon name="locate" size={18} fill /></span>
      <span class="row-label">Ma position</span>
    </button>
  {/snippet}
  <div class="group quick">
    <!-- Pour une destination, la carte d'abord : « Ma position » y sert rarement (et jamais pour un point de passage). -->
    {#if kind === 'destination'}
      {@render mapRow()}
      {@render mineRow()}
    {:else if kind === 'via'}
      {@render mapRow()}
    {:else if kind === 'save'}
      {@render mineRow()}
      {@render mapRow()}
    {:else}
      {@render mineRow()}
      {@render mapRow()}
    {/if}
  </div>

  <div class="results" aria-live="polite">
    {#if mine.length}
      <p class="k mine-k">Mes lieux</p>
      <div class="group">
        {#each mine as p, i (p.id)}
          <button use:tactile type="button" class="row cascade" style:--i={Math.min(i, 8)} onclick={() => choose({ name: p.name, detail: p.detail, coord: p.coord, kind: 'search' })}>
            <span class="ic emo" aria-hidden="true">{p.emoji}</span>
            <span class="row-label">{p.name}<span class="row-sub">{saved.listOf(p.list).emoji} {saved.listOf(p.list).name}{p.detail ? ` · ${p.detail}` : ''}</span></span>
          </button>
        {/each}
      </div>
    {/if}
    {#if loading}
      <p class="hint state">Recherche…</p>
    {:else if failed}
      <p class="hint state">Recherche indisponible pour le moment. Vérifie ta connexion.</p>
    {:else if q.trim().length >= 3 && !results.length}
      <p class="hint state">Aucun lieu trouvé pour « {q.trim()} ».</p>
    {:else if results.length}
      <div class="group">
        {#each results as p, i (i)}
          <button use:tactile type="button" class="row cascade" style:--i={Math.min(i, 8)} onclick={() => choose(p)}>
            <span class="ic"><Icon name="pin" size={16} /></span>
            <span class="row-label">{p.name}{#if p.detail}<span class="row-sub">{p.detail}</span>{/if}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes search-in {
    from {
      opacity: 0;
      translate: 0 -10px;
      scale: 0.98;
    }
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 39;
    background: rgba(0, 0, 0, 0.18);
  }
  /* Sur Mac, seule la colonne est voilée : la carte reste cliquable pour choisir un point. */
  .scrim.wide {
    right: auto;
    width: 408px;
  }
  /* La recherche s'ouvre en se posant, sans saut. */
  .search {
    animation: search-in 420ms var(--spring) backwards;
    position: fixed;
    z-index: 40;
    left: 8px;
    right: 8px;
    top: calc(var(--safe-top) + 8px);
    bottom: 8px;
    border-radius: 30px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }
  .search.wide {
    left: 12px;
    top: 12px;
    bottom: auto;
    right: auto;
    width: 384px;
    max-height: calc(100vh - 24px);
    border-radius: 28px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .field {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--fill-2);
    color: var(--label-2);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 1.0625rem;
    color: var(--label);
  }
  input::placeholder {
    color: var(--label-3);
  }
  input::-webkit-search-cancel-button {
    filter: grayscale(1);
  }
  .row {
    width: 100%;
    text-align: left;
  }
  .row:active {
    background: var(--fill-2);
  }
  .ic {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--fill);
    color: var(--label-2);
    flex: none;
  }
  .ic.loc {
    background: var(--location);
    color: #fff;
  }
  .ic.map-ic {
    background: var(--tint-soft);
    color: var(--tint);
  }
  .results {
    overflow-y: auto;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 12px;
  }
  .ic.emo {
    font-size: 1rem;
    background: var(--fill-2);
  }
  .mine-k {
    margin: 0 0 -6px 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .state {
    padding: 8px 4px;
    margin: 0;
  }
</style>
