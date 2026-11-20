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
  const already = $derived(r ? community.published[r.id] : undefined);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!r || busy) return;
    busy = true;
    await community.publish(r, { name, description, hideStart });
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
