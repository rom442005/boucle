<script lang="ts">
  import Icon from './Icon.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { app } from '../lib/state.svelte';
  import { searchPlaces } from '../lib/services';
  import { saved } from '../lib/saved.svelte';
  import { haversine } from '../lib/geo';
  import { km } from '../lib/format';
  import type { Place } from '../lib/types';

  /*
   * « Enregistrer un lieu », dans le fil rouge : sur la photo (iPhone) ou en colonne de verre (Mac), des blocs
   * comme ailleurs dans l'app. En tête, la question et le champ ; puis deux tuiles (ma position, sur la carte) ;
   * la liste où le ranger (préchoisie dans la fiche qui suit) ; enfin les lieux trouvés, chacun avec son émoji et
   * sa distance. Un lieu choisi ouvre la fiche « Enregistrer le lieu » (nom et liste).
   */
  let q = $state('');
  let results = $state<Place[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let input: HTMLInputElement | undefined = $state();
  let ctrl: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** liste choisie pour le lieu (sinon celle par défaut de la fiche) */
  let list = $state<string | null>(app.saveHint.list ?? null);

  $effect(() => {
    // Sur iPhone, pas de clavier qui surgit avant d'avoir vu les choix : seulement sur Mac.
    if (matchMedia('(pointer: fine)').matches) input?.focus();
  });

  const near = $derived(app.userPos ?? app.start?.coord ?? null);
  const counts = $derived(new Map(saved.lists.map((l) => [l.id, saved.placesIn(l.id).length])));

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
        results = await searchPlaces(text, near, ctrl.signal);
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') failed = true;
      } finally {
        loading = false;
      }
    }, 260);
  }

  /** L'émoji d'un lieu trouvé, d'après son genre (OpenStreetMap) ou son nom. */
  function emojiOf(p: Place): string {
    const t = `${p.tag ?? ''} ${p.name} ${p.detail ?? ''}`.toLowerCase();
    const rules: [RegExp, string][] = [
      [/school|college|university|lycée|école|ecole|collège|université|campus/, '🎓'],
      [/railway|station|gare|tram|subway|métro|metro/, '🚉'],
      [/stadium|track|pitch|stade|piste/, '🏟️'],
      [/fitness|sports_centre|gym|salle de sport|basic-fit|piscine|swimming/, '🏋️'],
      [/park|garden|jardin|parc|square/, '🌳'],
      [/forest|wood|bois|forêt/, '🌲'],
      [/water|river|lake|lac|loire|plage|beach/, '🌊'],
      [/cafe|café|coffee|bar|pub/, '☕'],
      [/restaurant|fast_food|boulangerie|bakery/, '🍽️'],
      [/hospital|clinic|pharmacy|hôpital|médecin|doctor/, '🏥'],
      [/office|bureau|company|coworking|industrial/, '💼'],
      [/shop|supermarket|mall|commerce|marché/, '🛍️'],
      [/place:house|building|residential|place:street|highway|rue|avenue|boulevard|allée|chemin|impasse/, '🏠'],
      [/place:city|place:town|place:village|boundary/, '🏙️'],
    ];
    return rules.find(([r]) => r.test(t))?.[1] ?? '📍';
  }

  function close() {
    ctrl?.abort();
    app.search = null;
    app.saveHint = {};
  }
  function hint() {
    if (list) app.saveHint = { ...app.saveHint, list };
  }
  function choose(p: Place) {
    haptic('tap');
    ctrl?.abort();
    hint();
    app.search = null;
    app.setPlace('save', p);
  }
  async function here() {
    haptic('tap');
    ctrl?.abort();
    hint();
    app.search = null;
    await app.useMyPosition('save');
  }
  function onMap() {
    haptic('tap');
    ctrl?.abort();
    hint();
    app.startPick('save');
  }
  function pickList(id: string) {
    haptic('tick');
    list = list === id ? null : id;
  }
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onkey} />

{#if app.wide}<div class="scrim" onclick={close} aria-hidden="true"></div>{/if}
<div class="add" class:wide={app.wide} role="dialog" aria-modal="true" aria-label="Enregistrer un lieu">
  <div class="col">
    <!-- En tête : la question, comme le gros chiffre d'un bloc santé. -->
    <section class="card glass photo-card head" style:--i={0}>
      <div class="top">
        <span class="k">📍 Nouveau lieu</span>
        <button use:tactile type="button" class="x" aria-label="Fermer" onclick={close}><Icon name="close" size={15} /></button>
      </div>
      <h2 class="big rounded">Où est-ce ?</h2>
      <p class="sub">Domicile, école, salle de sport, chez un proche…</p>
      <label class="field">
        <Icon name="search" size={18} />
        <span class="visually-hidden">Adresse ou nom du lieu</span>
        <input bind:this={input} bind:value={q} oninput={onInput} type="search" enterkeyhint="search" autocomplete="off" placeholder="Adresse, lieu, nom…" />
      </label>
    </section>

    <!-- Deux façons rapides : ici, ou un point de la carte. -->
    <div class="pair">
      <button use:tactile type="button" class="card glass photo-card tile" style:--i={1} onclick={here}>
        <span class="k">Ma position</span>
        <span class="nrow"><span class="emo" aria-hidden="true">🧭</span><b class="n rounded">Ici</b></span>
      </button>
      <button use:tactile type="button" class="card glass photo-card tile" style:--i={2} onclick={onMap}>
        <span class="k">Sur la carte</span>
        <span class="nrow"><span class="emo" aria-hidden="true">🗺️</span><b class="n rounded">Toucher</b></span>
      </button>
    </div>

    {#if q.trim().length >= 3}
      <section class="card glass photo-card found" style:--i={3} aria-live="polite">
        <div class="top">
          <span class="k">Lieux trouvés</span>
          {#if results.length && !loading}<span class="k">{results.length}</span>{/if}
        </div>
        {#if loading}
          <p class="state">Recherche…</p>
        {:else if failed}
          <p class="state">Recherche indisponible pour le moment. Vérifie ta connexion.</p>
        {:else if !results.length}
          <p class="state">Aucun lieu trouvé pour « {q.trim()} ».</p>
        {:else}
          <ul class="rows">
            {#each results as p, i (i)}
              <li style:--i={i}>
                <button use:tactile type="button" class="row" onclick={() => choose(p)}>
                  <span class="pemo" aria-hidden="true">{emojiOf(p)}</span>
                  <span class="rt"><span class="rn">{p.name}</span>{#if p.detail}<span class="rd">{p.detail}</span>{/if}</span>
                  {#if near}<span class="dist tabular">{km(haversine(near, p.coord))}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- La liste où le ranger : préchoisie dans la fiche qui suit. -->
    <section class="card glass photo-card lists" style:--i={4}>
      <div class="top">
        <span class="k">Ranger dans</span>
        {#if list}<span class="k">{saved.listOf(list).emoji} {saved.listOf(list).name}</span>{/if}
      </div>
      <div class="chips" role="radiogroup" aria-label="Liste du lieu">
        {#each saved.lists as l (l.id)}
          <button use:tactile type="button" class="chip" class:on={list === l.id} role="radio" aria-checked={list === l.id} onclick={() => pickList(l.id)}>
            <span aria-hidden="true">{l.emoji}</span>{l.name}<small class="tabular">{counts.get(l.id) ?? 0}</small>
          </button>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0 auto 0 0;
    width: 420px;
    z-index: 39;
    background: rgba(0, 0, 0, 0.28);
    animation: fade 260ms var(--ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  /* iPhone : tout l'écran, sur la photo, sous l'heure. */
  .add {
    position: fixed;
    z-index: 40;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: calc(var(--safe-top) + 22px) var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 24px);
    color: #fff;
  }
  /* Mac : une colonne de verre à gauche, la carte reste visible et cliquable à droite. */
  .add.wide {
    inset: 12px auto 12px 12px;
    width: 396px;
    padding: 0;
    border-radius: 30px;
  }
  .col {
    display: grid;
    gap: 10px;
    max-width: 520px;
    margin: 0 auto;
  }
  .card {
    display: grid;
    gap: 6px;
    border-radius: 26px;
    padding: 14px 16px;
    min-width: 0;
    animation: card-in 560ms var(--spring) calc(var(--i) * 55ms) backwards;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 16px;
      scale: 0.97;
    }
  }
  .wide .card {
    --g-bg: rgba(22, 23, 25, 0.82);
  }
  /* Mac : la liste où le ranger avant les lieux trouvés (la colonne a la hauteur pour tout voir). */
  .wide .lists {
    order: 3;
  }
  .wide .found {
    order: 4;
  }
  .wide .col {
    padding-bottom: 12px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .k {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.72);
  }
  .x {
    width: 30px;
    height: 30px;
    margin: -4px -6px -4px 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }
  .big {
    margin: 2px 0 0;
    font-size: 2.125rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .sub {
    margin: 0 0 6px;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.72);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    padding: 0 16px;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.2);
  }
  .field:focus-within {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.75);
  }
  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: none;
    font-size: 1.0625rem;
    color: #fff;
  }
  .field input::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .tile {
    text-align: left;
    color: #fff;
    gap: 4px;
    transition: transform 220ms var(--spring);
  }
  .tile:active {
    transform: scale(0.97);
  }
  .nrow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .emo {
    font-size: 1.5rem;
  }
  .n {
    font-size: 1.625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .state {
    margin: 4px 0 2px;
    font-size: 0.9375rem;
    color: rgba(255, 255, 255, 0.78);
  }
  .rows {
    margin: 2px -8px -6px;
    padding: 0;
    list-style: none;
  }
  .rows li {
    animation: row-in 420ms var(--spring) calc(var(--i) * 40ms) backwards;
  }
  @keyframes row-in {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
  .rows li + li {
    border-top: 0.5px solid rgba(255, 255, 255, 0.12);
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 8px;
    border-radius: 16px;
    text-align: left;
    color: #fff;
  }
  .row:active {
    background: rgba(255, 255, 255, 0.1);
  }
  .pemo {
    width: 38px;
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 1.2rem;
    background: rgba(255, 255, 255, 0.14);
  }
  .rt {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .rn {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rd {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dist {
    flex: none;
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.72);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.9375rem;
    font-weight: 600;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    transition:
      background-color 200ms var(--ease-out),
      color 200ms var(--ease-out);
  }
  .chip small {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .chip.on {
    color: #1c1c1e;
    background: #fff;
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .rows li,
    .scrim {
      animation: none;
    }
  }
</style>
