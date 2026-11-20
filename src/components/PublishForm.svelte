<script lang="ts">
  import Icon from './Icon.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import { community } from '../lib/community.svelte';
  import { app } from '../lib/state.svelte';
  import { km, NNBSP } from '../lib/format';
  import { SPORTS, SHAPES } from '../lib/sports';
  import { asSwitch, tactile } from '../lib/haptics';

  /** Publier le parcours affiché dans la Communauté, avec sa zone privée. */
  const r = app.route;
  let name = $state(r?.name ?? '');
  let description = $state('');
  let hideStart = $state(true);
  let busy = $state(false);
  /** photos de la sortie, envoyées juste après la publication */
  let photos = $state<{ file: File; url: string }[]>([]);
  let picker = $state<HTMLInputElement>();

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const room = 10 - photos.length;
    photos = [...photos, ...files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))];
  }
  function drop(i: number) {
    URL.revokeObjectURL(photos[i].url);
    photos = photos.filter((_, k) => k !== i);
  }
  $effect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)));
  const already = $derived(r ? community.published[r.id] : undefined);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!r || busy) return;
    busy = true;
    await community.publish(r, { name, description, hideStart, photos: photos.map((p) => p.file) });
    busy = false;
  }
</script>

{#if !r}
  <p class="hint">Aucun parcours à publier.</p>
{:else}
  <form class="pub" onsubmit={submit} novalidate>
    <div class="what">
      <RouteGlyph coords={r.coords} size={56} active />
      <span class="txt">
        <span class="t">{SPORTS[r.sport].label} · {SHAPES[r.shape].label}</span>
        <span class="m tabular">{km(r.lengthM)} · {r.ascent}{NNBSP}m D+</span>
      </span>
    </div>

    {#if already}
      <div class="banner" role="status"><span class="icon"><Icon name="check" size={18} /></span><span>Ce parcours est déjà publié.</span></div>
      <button use:tactile type="button" class="pill" onclick={() => community.openRoute(already)}>Le voir dans la Communauté</button>
    {/if}

    <label class="field">
      <span class="field-label">Nom</span>
      <input class="input" bind:value={name} maxlength="80" required />
    </label>
    <label class="field">
      <span class="field-label">Description <span class="opt">facultatif</span></span>
      <textarea class="input" rows="3" maxlength="500" placeholder="Ce qui le rend agréable, un passage à connaître…" bind:value={description}></textarea>
    </label>

    <div class="field">
      <span class="field-label">Photos de ta sortie <span class="opt">facultatif</span></span>
      <div class="pics">
        {#each photos as p, i (p.url)}
          <span class="pic">
            <img src={p.url} alt="" />
            <button use:tactile type="button" class="x" aria-label="Retirer cette photo" onclick={() => drop(i)}><Icon name="close" size={13} /></button>
          </span>
        {/each}
        {#if photos.length < 10}
          <button use:tactile type="button" class="pic add" aria-label="Ajouter des photos" onclick={() => picker?.click()}><Icon name="camera" size={22} /></button>
        {/if}
      </div>
      <input bind:this={picker} type="file" accept="image/*" multiple hidden onchange={pick} />
    </div>

    <div class="group">
      <label class="row">
        <span class="row-icon"><Icon name="eyeSlash" size={20} /></span>
        <span class="row-label">Masquer mon départ<span class="row-sub">Le parcours publié commence et finit à 300{NNBSP}m de ton départ : ton adresse reste privée.</span></span>
        <input type="checkbox" class="switch" use:asSwitch bind:checked={hideStart} />
      </label>
    </div>

    <p class="hint">Visible par toute la communauté. Tu pourras le retirer à tout moment depuis ton profil.</p>
    <button use:tactile type="submit" class="cta" disabled={busy}><Icon name="users" size={18} fill />{busy ? 'Publication…' : 'Publier'}</button>
  </form>
{/if}

<style>
  .pics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pic {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 14px;
    overflow: hidden;
    background: var(--fill-2);
    animation: pic-in 360ms var(--spring) both;
  }
  @keyframes pic-in {
    from {
      opacity: 0;
      scale: 0.85;
    }
  }
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .pic.add {
    display: grid;
    place-items: center;
    color: var(--tint);
    background: var(--tint-soft);
  }
  .x {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
  }
  .pub {
    display: grid;
    gap: 14px;
  }
  .what {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--label-3);
  }
  .txt {
    display: grid;
    gap: 2px;
  }
  .t {
    font-weight: 600;
    color: var(--label);
  }
  .m {
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .opt {
    font-weight: 400;
    font-size: 0.8125rem;
    color: var(--label-2);
    margin-left: 4px;
  }
  textarea.input {
    resize: vertical;
    min-height: 80px;
    padding-top: 10px;
    line-height: 1.4;
  }
  .row {
    cursor: pointer;
  }
  .pub > .hint {
    margin: 0 4px;
  }
</style>
