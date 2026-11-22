<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { LIST_EMOJIS, PLACE_EMOJIS, saved, SUGGESTED } from '../lib/saved.svelte';
  import { haptic, tactile } from '../lib/haptics';

  /*
   * Enregistrer un lieu dans Mes lieux (ou le modifier) : son nom, son émoji, sa liste — comme les listes de
   * Google Maps. Une nouvelle liste se crée sur place. Domicile, Travail, École sont proposés tant qu'ils manquent.
   */
  const d = $derived(saved.draft!);
  let name = $state('');
  let emoji = $state('📍');
  let list = $state('favoris');
  let adding = $state(false);
  let newName = $state('');
  let newEmoji = $state(LIST_EMOJIS[0]);
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    const cur = d;
    name = cur.name;
    emoji = cur.emoji;
    list = cur.list;
    adding = false;
  });
  $effect(() => {
    if (!d.name) input?.focus();
  });

  const suggest = $derived(SUGGESTED.filter((s) => !saved.places.some((p) => p.name.toLowerCase() === s.name.toLowerCase() && p.id !== d.id)));
  const counts = $derived(new Map(saved.lists.map((l) => [l.id, saved.places.filter((p) => p.list === l.id).length])));

  function pick(s: (typeof SUGGESTED)[number]) {
    haptic('tap');
    name = s.name;
    emoji = s.emoji;
    if (saved.lists.some((l) => l.id === 'adresses')) list = 'adresses';
  }
  function cycleEmoji() {
    haptic('tick');
    newEmoji = LIST_EMOJIS[(LIST_EMOJIS.indexOf(newEmoji) + 1) % LIST_EMOJIS.length];
  }
  function createList() {
    if (!newName.trim()) return;
    haptic('tap');
    const l = saved.addList(newName, newEmoji);
    list = l.id;
    adding = false;
    newName = '';
  }
  function commit() {
    haptic('success');
    const l = saved.listOf(list);
    const p = saved.commit({ ...d, name, emoji, list });
    app.showToast(`${p.name} : enregistré dans ${l.emoji} ${l.name}`);
  }
  function remove() {
    if (!d.id) return;
    haptic('warn');
    const n = d.name;
    saved.remove(d.id);
    if (app.place?.savedId === d.id) app.closePlace();
    saved.draft = null;
    app.showToast(`${n} retiré de Mes lieux`);
  }
  const close = () => (saved.draft = null);
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onkey} />

<button type="button" class="scrim" aria-label="Fermer" onclick={close}></button>
<div class="sheet glass photo-card on-photo" role="dialog" aria-modal="true" aria-labelledby="save-title">
  <header>
    <h2 id="save-title">{d.id ? 'Modifier le lieu' : 'Enregistrer le lieu'}</h2>
    <button use:tactile type="button" class="x" aria-label="Annuler" onclick={close}><Icon name="close" size={16} /></button>
  </header>

  <div class="who">
    <span class="emo-big" aria-hidden="true">{emoji}</span>
    <label class="name">
      <span class="visually-hidden">Nom du lieu</span>
      <input bind:this={input} bind:value={name} maxlength="40" placeholder="Nom : Domicile, École…" enterkeyhint="done" onkeydown={(e) => e.key === 'Enter' && commit()} />
    </label>
  </div>
  {#if d.detail}<p class="addr">{d.detail}</p>{/if}

  {#if suggest.length && !d.id}
    <div class="chips" aria-label="Noms proposés">
      {#each suggest as s (s.name)}
        <button use:tactile type="button" class="chip" class:on={name === s.name} onclick={() => pick(s)}>{s.emoji} {s.name}</button>
      {/each}
    </div>
  {/if}

  <div class="emojis" role="radiogroup" aria-label="Émoji du lieu">
    {#each PLACE_EMOJIS as e (e)}
      <button use:tactile type="button" class="emo" class:on={emoji === e} role="radio" aria-checked={emoji === e} aria-label={e} onclick={() => (emoji = e)}>{e}</button>
    {/each}
  </div>

  <p class="k">Liste</p>
  <div class="lists" role="radiogroup" aria-label="Liste">
    {#each saved.lists as l (l.id)}
      <button use:tactile type="button" class="li" class:on={list === l.id} role="radio" aria-checked={list === l.id} onclick={() => (list = l.id)}>
        <span class="li-emo" aria-hidden="true">{l.emoji}</span>
        <span class="li-name">{l.name}</span>
        <small class="tabular">{counts.get(l.id) ?? 0}</small>
        <span class="tick" aria-hidden="true">{#if list === l.id}<Icon name="check" size={16} />{/if}</span>
      </button>
    {/each}
    {#if adding}
      <div class="li new">
        <button use:tactile type="button" class="li-emo cyc" aria-label="Changer l’émoji de la liste ({newEmoji})" onclick={cycleEmoji}>{newEmoji}</button>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={newName} maxlength="30" placeholder="Nom de la liste" aria-label="Nom de la nouvelle liste" autofocus enterkeyhint="done" onkeydown={(e) => e.key === 'Enter' && createList()} />
        <button use:tactile type="button" class="ok" aria-label="Créer la liste" disabled={!newName.trim()} onclick={createList}>Créer</button>
      </div>
    {:else}
      <button use:tactile type="button" class="li add" onclick={() => (adding = true)}>
        <span class="li-emo" aria-hidden="true"><Icon name="plus" size={14} /></span>
        <span class="li-name">Nouvelle liste</span>
      </button>
    {/if}
  </div>

  <div class="foot">
    {#if d.id}<button use:tactile type="button" class="del" onclick={remove}><Icon name="trash" size={16} />Retirer</button>{/if}
    <button use:tactile type="button" class="save" onclick={commit}>Enregistrer</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: rgba(0, 0, 0, 0.32);
    animation: fade 240ms var(--ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .sheet {
    position: fixed;
    z-index: 45;
    left: 8px;
    right: 8px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - 24px);
    overflow-y: auto;
    padding: 16px 16px 14px;
    border-radius: 32px;
    color: #fff;
    display: grid;
    gap: 12px;
    --g-bg: rgba(22, 24, 26, 0.72);
    --blur: 30px;
    animation: up 520ms var(--spring) backwards;
  }
  @keyframes up {
    from {
      opacity: 0;
      translate: 0 40px;
    }
  }
  @media (min-width: 860px) {
    .sheet {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      width: 420px;
      translate: -50% -50%;
      animation: pop 460ms var(--spring) backwards;
    }
    @keyframes pop {
      from {
        opacity: 0;
        scale: 0.94;
      }
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .x {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .emo-big {
    width: 48px;
    height: 48px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #fff;
    font-size: 1.6rem;
    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.5);
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  input {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    outline: none;
    font-size: 1rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  input:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
  }
  .addr {
    margin: -4px 0 0 58px;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.7);
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 560;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  .chip.on {
    color: #1c1c1e;
    background: #fff;
  }
  .emojis {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .emo {
    aspect-ratio: 1;
    min-height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 1.25rem;
    transition: transform 240ms var(--spring-bouncy);
  }
  .emo.on {
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 0 0 2px #fff;
  }
  .emo:active {
    transform: scale(0.86);
  }
  .k {
    margin: 2px 0 -6px 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
  }
  .lists {
    display: grid;
    gap: 4px;
  }
  .li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px 0 6px;
    border-radius: 999px;
    text-align: left;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    transition: background-color 200ms var(--ease-out);
  }
  .li.on {
    background: rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.8);
  }
  .li-emo {
    width: 34px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    font-size: 1.05rem;
  }
  .li-name {
    flex: 1;
    min-width: 0;
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .li small {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8125rem;
  }
  .tick {
    width: 18px;
    display: grid;
    place-items: center;
  }
  .new input {
    height: 36px;
    flex: 1;
  }
  .ok {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-weight: 600;
    color: #1c1c1e;
    background: #fff;
  }
  .ok:disabled {
    opacity: 0.4;
  }
  .add {
    color: rgba(255, 255, 255, 0.86);
  }
  .foot {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
  .save,
  .del {
    min-height: 48px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .save {
    flex: 1;
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%),
      var(--tint);
  }
  .del {
    padding: 0 18px;
    color: #ff6b81;
    background: rgba(255, 255, 255, 0.1);
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .scrim {
      animation: none;
    }
  }
</style>
