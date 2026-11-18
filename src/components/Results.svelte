<script lang="ts">
  import Icon from './Icon.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import ElevationProfile from './ElevationProfile.svelte';
  import Breakdown from './Breakdown.svelte';
  import { app } from '../lib/state.svelte';
  import { duration, km, meters, pace, percent, speed, NNBSP } from '../lib/format';
  import { ENVS, ENV_ORDER, SHAPES, SPORTS } from '../lib/sports';
  import type { EnvClass, Route } from '../lib/types';

  const r = $derived(app.route);
  const many = $derived(app.routes.length > 1);

  const envItems = (x: Route) => [
    ...ENV_ORDER.map((e) => ({ key: e, label: ENVS[e].label, color: `var(--env-${e})`, value: x.env[e] ?? 0 })),
    { key: 'other', label: 'Autre', color: 'var(--env-other)', value: x.env.other ?? 0 },
  ];
  const surfItems = (x: Route) =>
    x.surface
      ? [
          { key: 'paved', label: 'Bitume', color: 'var(--surf-paved)', value: x.surface.paved },
          { key: 'compacted', label: 'Stabilisé', color: 'var(--surf-compacted)', value: x.surface.compacted },
          { key: 'dirt', label: 'Terre, sentier', color: 'var(--surf-dirt)', value: x.surface.dirt },
        ]
      : [];

  interface Fit {
    ok: boolean;
    /** version longue (détail) */
    text: string;
    /** version courte (carte) */
    short: string;
  }

  /** Ce que la proposition tient de la demande, en clair. */
  function fitsOf(x: Route): Fit[] {
    if (!x.params) return [];
    const p = x.params;
    const out: Fit[] = [];
    const dErr = Math.abs(x.lengthM / 1000 - p.distanceKm) / p.distanceKm;
    const exact = dErr < 0.005;
    out.push({
      ok: dErr <= 0.06,
      text: exact ? 'Distance tenue' : `Distance à ${percent(Math.max(dErr, 0.01))} près`,
      short: exact ? 'Distance tenue' : `Distance ±${percent(Math.max(dErr, 0.01))}`,
    });
    if (p.elevation != null) {
      const ok = Math.abs(x.ascent - p.elevation) <= Math.max(25, p.elevation * 0.2);
      out.push({ ok, text: `${meters(x.ascent)} de D+ pour ${meters(p.elevation)} visés`, short: `D+ ${Math.round(x.ascent)} / ${meters(p.elevation)}` });
    }
    if (p.envs.length) {
      const share = p.envs.reduce((s, e) => s + (x.env[e] ?? 0), 0);
      const names = p.envs.map((e: EnvClass) => ENVS[e].short).join(' et ');
      out.push({ ok: share >= 0.3, text: `${percent(share)} en ${names}`, short: `${percent(share)} ${names}` });
    }
    if (p.water) {
      const n = x.waterPoints.length;
      const t = n ? `${n} point${n > 1 ? 's' : ''} d’eau` : 'Pas de point d’eau connu';
      out.push({ ok: n > 0, text: t, short: n ? t : 'Sans point d’eau' });
    }
    return out;
  }
  const fits = $derived(r ? fitsOf(r) : []);

  /** Sortie de l'historique affichée en détail. */
  const done = $derived(app.detailFrom?.kind === 'historique' ? app.history.find((h) => h.id === app.detailFrom?.id) ?? null : null);
  const doneText = $derived.by(() => {
    if (!done || !r) return '';
    const when = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(done.date);
    const parts = [`Fait le ${when}`, km(done.distanceM)];
    if (done.durationS) {
      parts.push(duration(done.durationS));
      const kmDone = done.distanceM / 1000;
      if (kmDone > 0.2) parts.push(SPORTS[r.sport].bike ? speed(kmDone / (done.durationS / 3600)) : pace(done.durationS / kmDone));
    }
    return parts.join(' · ') + (done.complete ? '' : ' · parcours partiel');
  });

  let strip: HTMLDivElement | undefined = $state();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!strip || app.wide) return;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      [...strip.children].forEach((c, i) => {
        const el = c as HTMLElement;
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      app.select(best);
    }, 110);
  }
  $effect(() => {
    const i = app.selected;
    if (!strip || app.wide) return;
    const el = strip.children[i] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    if (Math.abs(strip.scrollLeft - target) > 4) strip.scrollTo({ left: target, behavior: 'smooth' });
  });

  let editing = $state(false);
  let draft = $state('');
  function startEdit() {
    if (!r) return;
    draft = r.name;
    editing = true;
  }
  function commit() {
    if (r && draft.trim()) app.rename(r, draft);
    editing = false;
  }
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

{#if app.note}
  <div class="banner" role="status"><span class="icon"><Icon name="warning" size={18} /></span><span>{app.note}</span></div>
{/if}

{#if many}
  <div class="strip" class:wide={app.wide} bind:this={strip} onscroll={onScroll} role="listbox" aria-label="Propositions" aria-orientation={app.wide ? 'vertical' : 'horizontal'}>
    {#each app.routes as x, i (x.id)}
      <button type="button" class="card" class:sel={i === app.selected} role="option" aria-selected={i === app.selected} onclick={() => app.select(i)}>
        <RouteGlyph coords={x.coords} active={i === app.selected} />
        <span class="c-txt">
          <span class="c-name">{x.name}</span>
          <span class="c-meta tabular">{km(x.lengthM)} · {meters(x.ascent)} D+ · {duration(x.durationS)}</span>
          <span class="c-fit">
            {#if x.tags?.length}<span class="c-tag" class:best={x.tags[0] === 'Meilleur accord'}>{x.tags[0]}</span>{/if}
            {#each fitsOf(x) as f, k (k)}
              <span class="c-f" class:ok={f.ok}><Icon name={f.ok ? 'check' : 'approx'} size={10} />{f.short}</span>
            {/each}
          </span>
        </span>
      </button>
    {/each}
  </div>
{/if}

{#if r}
  <article class="detail" aria-label="Parcours sélectionné">
    {#if !many}
    <div class="title">
      {#if editing}
        <input
          class="name-input"
          bind:value={draft}
          maxlength="80"
          aria-label="Nom du parcours"
          use:focusOnMount
          onkeydown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') editing = false;
          }}
          onblur={commit}
        />
      {:else}
        <h2>{r.name}</h2>
        <button type="button" class="round edit" aria-label="Renommer le parcours" onclick={startEdit}><Icon name="pencil" size={18} /></button>
      {/if}
    </div>
    <p class="kind">{SPORTS[r.sport].long} · {SHAPES[r.shape].label}</p>
    {#if doneText}<p class="done-line"><Icon name="done" size={16} fill />{doneText}</p>{/if}
    {/if}

    {#if !app.wide}
      <div class="prof"><ElevationProfile route={r} height={118} readout="header" /></div>
    {/if}

    <dl class="stats">
      <div><dt>Distance</dt><dd class="rounded tabular">{km(r.lengthM).replace(`${NNBSP}km`, '')}<small>km</small></dd></div>
      <div><dt>Dénivelé +</dt><dd class="rounded tabular">{Math.round(r.ascent)}<small>m</small></dd></div>
      <div><dt>Durée estimée</dt><dd class="rounded tabular">{duration(r.durationS)}</dd></div>
    </dl>
    <p class="sub tabular">D− {meters(r.descent)} · Altitude {r.minEle} à {meters(r.maxEle)} · Pente max {Math.round(r.maxGrade)}{NNBSP}%</p>

    {#if fits.length}
      <ul class="fits" aria-label="Respect de ta demande">
        {#each fits as f, i (i)}
          <li class:ok={f.ok}><span class="mark" aria-hidden="true"><Icon name={f.ok ? 'check' : 'approx'} size={12} /></span>{f.text}</li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      <button type="button" class="act" aria-pressed={app.isSaved(r)} onclick={() => app.toggleSave(r)}>
        <span class="act-ic"><Icon name="star" fill={app.isSaved(r)} /></span>Favori
      </button>
      <button type="button" class="act" aria-pressed={app.isDoneToday(r)} onclick={() => app.markDone(r)}>
        <span class="act-ic"><Icon name="done" fill={app.isDoneToday(r)} /></span>Fait
      </button>
      <button type="button" class="act" onclick={() => app.exportGPX(r)}>
        <span class="act-ic"><Icon name="download" /></span>GPX
      </button>
      <button type="button" class="act" onclick={() => app.shareLink(r)}>
        <span class="act-ic"><Icon name="share" /></span>Partager
      </button>
      <button type="button" class="act" onclick={() => app.reverseSelected()}>
        <span class="act-ic"><Icon name="swap" /></span>Inverser
      </button>
    </div>

    {#if Object.keys(r.env).length}
      <Breakdown title="Milieux traversés" items={envItems(r)} />
    {/if}
    {#if r.surface}
      <Breakdown title="Sols" items={surfItems(r)} note={r.busy != null ? `Grands axes : ${percent(r.busy)}` : undefined} />
    {/if}
    {#if r.overlap > 0.12 && r.shape === 'loop'}
      <p class="hint">{percent(r.overlap)} du tracé repasse au même endroit.</p>
    {/if}
  </article>
{/if}

<style>
  .banner {
    margin-bottom: 12px;
  }
  .strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    margin: 0 -16px 14px;
    padding: 2px 16px 4px;
    scroll-padding: 0 16px;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .strip.wide {
    flex-direction: column;
    overflow: visible;
    margin: 0 0 16px;
    padding: 0;
  }
  .card {
    flex: 0 0 calc(100% - 44px);
    scroll-snap-align: center;
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 14px 10px 10px;
    border-radius: 22px;
    background: var(--fill-group);
    text-align: left;
    box-shadow: inset 0 0 0 1px transparent;
    transition:
      box-shadow 200ms var(--ease-out),
      background-color 200ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .strip.wide .card {
    flex: none;
  }
  .card:active {
    transform: scale(0.98);
  }
  .card.sel {
    box-shadow: inset 0 0 0 2px var(--tint);
  }
  .c-txt {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .c-name {
    font-weight: 600;
    font-size: 0.9375rem;
    line-height: 1.25;
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
  .c-fit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin-top: 2px;
  }
  .c-f {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .c-f.ok {
    color: var(--label);
  }
  .c-f :global(.icon) {
    color: var(--label-3);
  }
  .c-f.ok :global(.icon) {
    color: var(--ok);
  }
  .c-tag {
    justify-self: start;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--fill-2);
    color: var(--label-2);
  }
  .c-tag.best {
    background: var(--tint-soft);
    color: var(--tint-deep);
  }

  .detail {
    display: grid;
    gap: 14px;
  }
  .title {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    text-wrap: balance;
  }
  .edit {
    width: 36px;
    height: 36px;
    color: var(--label-2);
    background: var(--fill-2);
    margin-top: -2px;
  }
  .name-input {
    flex: 1;
    font-size: 1.25rem;
    font-weight: 650;
    padding: 6px 12px;
    border-radius: 12px;
    border: 0;
    background: var(--fill-2);
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tint);
  }
  .kind {
    margin: -10px 0 0;
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 0;
    gap: 8px;
  }
  .stats div {
    display: grid;
    gap: 2px;
  }
  .stats div + div {
    padding-left: 12px;
    border-left: 0.5px solid var(--separator);
  }
  dt {
    font-size: 0.75rem;
    color: var(--label-2);
    font-weight: 500;
  }
  dd {
    margin: 0;
    font-size: 1.625rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.1;
    white-space: nowrap;
  }
  dd small {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--label-2);
    margin-left: 2px;
  }
  .sub {
    margin: -6px 0 0;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .fits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fits li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 6px;
    border-radius: 999px;
    background: var(--fill-2);
    font-size: 0.8125rem;
    color: var(--label);
  }
  .mark {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--label-2);
    background: var(--fill);
  }
  .fits li.ok .mark {
    background: var(--ok);
    color: #fff;
  }
  .prof {
    margin-top: 2px;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
  }
  .done-line {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: -6px 0 0;
    font-size: 0.875rem;
    line-height: 1.35;
    color: var(--label);
  }
  .done-line :global(.icon) {
    color: var(--ok);
    margin-top: 1px;
  }
  .act {
    display: grid;
    justify-items: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--label);
    padding: 2px 0;
    transition: transform 240ms var(--spring);
  }
  .act:active {
    transform: scale(0.92);
  }
  .act-ic {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--fill-2);
    color: var(--tint);
  }
  .act[aria-pressed='true'] .act-ic {
    background: var(--tint-soft);
  }
</style>
