<script lang="ts">
  import Icon from './Icon.svelte';
  import RouteGlyph from './RouteGlyph.svelte';
  import ElevationProfile from './ElevationProfile.svelte';
  import Breakdown from './Breakdown.svelte';
  import RollingNumber from './RollingNumber.svelte';
  import SlopeLegend from './SlopeLegend.svelte';
  import { climbsOf, slopeColor, SLOPE_WORDS } from '../lib/elevation';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { duration, km, kmValue, meters, pace, percent, speed, NNBSP } from '../lib/format';
  import { ENVS, ENV_ORDER, SHAPES, SPORTS } from '../lib/sports';
  import { cumulative, nearestOnRoute } from '../lib/geo';
  import { daylightLine, weatherLine, type Line } from '../lib/conditions';
  import type { EnvClass, Route } from '../lib/types';
  import Avatar from './Avatar.svelte';
  import Comments from './Comments.svelte';
  import PhotoStrip from './PhotoStrip.svelte';
  import { community } from '../lib/community.svelte';
  import { LEVELS } from '../lib/community/types';
  import { ago } from '../lib/community/time';
  import { ENV_EMOJI } from '../lib/scenes';

  const r = $derived(app.route);
  /** parcours de la Communauté affiché (auteur, j'aime, commentaires) */
  const cr = $derived(app.detailFrom?.kind === 'communaute' && community.current && community.current.id === app.route?.communityId ? community.current : null);
  const crMine = $derived(!!cr && community.me?.id === cr.authorId);
  /** mes parcours : on peut les publier (la Communauté est là) */
  const canPublish = $derived(community.available && !cr && !!r && r.lengthM > 300);
  /** La première proposition est là, les autres se cherchent encore. */
  const searching = $derived(app.generating && app.phase === 'results');
  const many = $derived(app.routes.length > 1 || searching);

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
      text: exact ? '📏 Distance tenue' : `📏 Distance à ${percent(Math.max(dErr, 0.01))} près`,
      short: exact ? 'Distance tenue' : `Distance ±${percent(Math.max(dErr, 0.01))}`,
    });
    // Les points de passage choisis (souvent au milieu d'un parc ou d'une place) : tenus si le tracé passe à moins de 120 m.
    const cum = x.vias?.length ? cumulative(x.coords) : null;
    for (const v of x.vias ?? []) {
      const near = nearestOnRoute(x.coords, cum!, v.coord).dist <= 120;
      const name = v.name.length > 24 ? v.name.slice(0, 23) + '…' : v.name;
      out.push({ ok: near, text: near ? `📍 Passe par ${v.name}` : `📍 Passe près de ${v.name}`, short: `Par ${name}` });
    }
    if (p.elevation != null) {
      const ok = Math.abs(x.ascent - p.elevation) <= Math.max(25, p.elevation * 0.2);
      out.push({ ok, text: `⛰️ ${meters(x.ascent)} de D+ pour ${meters(p.elevation)} visés`, short: `D+ ${Math.round(x.ascent)} / ${meters(p.elevation)}` });
    }
    if (p.envs.length) {
      const share = p.envs.reduce((s, e) => s + (x.env[e] ?? 0), 0);
      const names = p.envs.map((e: EnvClass) => ENVS[e].short).join(' et ');
      out.push({ ok: share >= 0.3, text: `${p.envs.map((e: EnvClass) => ENV_EMOJI[e]).join('')} ${percent(share)} en ${names}`, short: `${percent(share)} ${names}` });
    }
    if (p.water) {
      const n = x.waterPoints.length;
      const t = n ? `${n} point${n > 1 ? 's' : ''} d’eau` : 'Pas de point d’eau connu';
      out.push({ ok: n > 0, text: `💧 ${t}`, short: n ? t : 'Sans point d’eau' });
    }
    return out;
  }
  const fits = $derived(r ? fitsOf(r) : []);
  /** Côtes et descentes notables du parcours sélectionné. */
  const cl = $derived(r ? climbsOf(r) : []);
  const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${NNBSP}%`;
  function focus(i: number) {
    haptic('tap');
    app.focusClimb = app.focusClimb === i ? null : i;
    // Sur iPhone, le panneau agrandi cache la carte : il redescend pour montrer la côte.
    if (!app.wide && app.focusClimb != null && app.detent === 'full') app.detent = 'half';
  }

  /** Si l'on part maintenant : météo au départ et lumière du jour au retour (pas pour une sortie déjà faite). */
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(t);
  });
  const conds = $derived.by((): Line[] => {
    if (!r || app.detailFrom?.kind === 'historique') return [];
    const out: Line[] = [];
    if (app.weather) out.push(weatherLine(app.weather));
    const d = daylightLine(now, r.coords[0][1], r.coords[0][0], r.durationS);
    if (d) out.push(d);
    return out;
  });

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

  /** Favori ou Fait tout juste activé : une onde part de l'icône. */
  let burst = $state<'star' | 'done' | null>(null);

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
      <button use:tactile type="button" class="card" class:sel={i === app.selected} role="option" aria-selected={i === app.selected} style:--i={i} onclick={() => app.select(i)}>
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
    {#if searching}
      <!-- Place réservée : les autres propositions prennent sa place en arrivant, sans que rien ne saute. -->
      <div class="card ghost" aria-hidden="true" style:--i={app.routes.length}>
        <span class="g-glyph"></span>
        <span class="c-txt">
          <span class="c-name">Autres propositions…</span>
          <span class="g-line"></span>
          <span class="g-line short"></span>
        </span>
      </div>
    {/if}
  </div>
  {#if searching}<p class="visually-hidden" role="status">Recherche d’autres propositions</p>{/if}
{/if}

{#if r}
  <article class="detail" aria-label="Parcours sélectionné">
    {#if cr}
      <div class="author">
        <button use:tactile type="button" class="who" onclick={() => community.openProfile(cr.authorId)}>
          <Avatar id={cr.authorId} name={cr.authorName} src={cr.authorAvatar} size={38} />
          <span class="who-t"><b>{cr.authorName}</b><span>{LEVELS[cr.authorLevel]}{cr.authorCity ? ` · ${cr.authorCity}` : ''} · {ago(cr.createdAt)}</span></span>
        </button>
        {#if !crMine}
          {@const followed = community.following.includes(cr.authorId)}
          <button use:tactile type="button" class="pill follow" class:is-on={!followed} aria-label={followed ? `Ne plus suivre ${cr.authorName}` : `Suivre ${cr.authorName}`} onclick={() => community.toggleFollow(cr.authorId)}>{followed ? 'Abonné' : 'Suivre'}</button>
        {/if}
      </div>
    {/if}
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
        {#if !cr}<button use:tactile type="button" class="round edit" aria-label="Renommer le parcours" onclick={startEdit}><Icon name="pencil" size={18} /></button>{/if}
      {/if}
    </div>
    <p class="kind">{SPORTS[r.sport].long} · {SHAPES[r.shape].label}</p>
    {#if cr?.description}<p class="desc">{cr.description}</p>{/if}
    {#if cr}<PhotoStrip r={cr} />{/if}
    {#if doneText}<p class="done-line"><Icon name="done" size={16} fill />{doneText}</p>{/if}
    {/if}

    {#if !app.wide}
      <div class="prof" data-fold>
        <ElevationProfile route={r} height={100} readout="header" />
        <SlopeLegend />
      </div>
    {/if}

    <dl class="stats">
      <div><dt>Distance</dt><dd class="rounded"><RollingNumber value={kmValue(r.lengthM * app.revealK)} /><small>km</small></dd></div>
      <div><dt>Dénivelé +</dt><dd class="rounded"><RollingNumber value={String(Math.round(r.ascent * app.revealK))} /><small>m</small></dd></div>
      <div><dt>Durée estimée</dt><dd class="rounded"><RollingNumber value={duration(r.durationS * app.revealK)} /></dd></div>
    </dl>
    <p class="sub tabular">D− {meters(r.descent)} · Altitude {r.minEle} à {meters(r.maxEle)} · Pente max {Math.round(r.maxGrade)}{NNBSP}%</p>

    {#if fits.length}
      <ul class="fits" aria-label="Respect de ta demande">
        {#each fits as f, i (i)}
          <li class:ok={f.ok}><span class="mark" aria-hidden="true"><Icon name={f.ok ? 'check' : 'approx'} size={12} /></span>{f.text}</li>
        {/each}
      </ul>
    {/if}

    {#if conds.length}
      <section class="conds" aria-labelledby="conds-h">
        <h3 id="conds-h" class="field-label">Si tu pars maintenant</h3>
        <div class="group">
          {#each conds as c, i (i)}
            <div class="row">
              <span class="row-icon" class:warn={c.warn} class:emo={!!c.emoji}>{#if c.emoji}{c.emoji}{:else}<Icon name={c.icon} size={20} />{/if}</span>
              <span class="row-label">{c.title}<span class="row-sub">{c.sub}</span></span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <div class="actions" style:--n={cr ? 6 : canPublish ? 6 : 5}>
      {#if cr}
        <button use:tactile type="button" class="act" aria-pressed={cr.likedByMe} aria-label="J’aime ({cr.likes})" onclick={() => community.toggleLike(cr)}>
          <span class="act-ic like" class:on={cr.likedByMe}><Icon name="heart" fill={cr.likedByMe} /></span><span class="tabular">{cr.likes ? `${cr.likes} j’aime` : 'J’aime'}</span>
        </button>
      {/if}
      <button use:tactile type="button" class="act" aria-pressed={app.isSaved(r)} onclick={() => {
        const on = !app.isSaved(r);
        haptic(on ? 'success' : 'tap');
        app.toggleSave(r);
        if (on) burst = 'star';
      }}>
        <span class="act-ic" class:burst={burst === 'star'} onanimationend={(e) => e.animationName.endsWith('act-burst') && (burst = null)}
          ><Icon name="star" fill={app.isSaved(r)} /></span
        >Favori
      </button>
      <button use:tactile type="button" class="act" aria-pressed={app.isDoneToday(r)} onclick={() => {
        const on = !app.isDoneToday(r);
        haptic(on ? 'success' : 'tap');
        app.markDone(r);
        if (on) burst = 'done';
      }}>
        <span class="act-ic ok" class:burst={burst === 'done'} onanimationend={(e) => e.animationName.endsWith('act-burst') && (burst = null)}
          ><Icon name="done" fill={app.isDoneToday(r)} /></span
        >Fait
      </button>
      <button use:tactile type="button" class="act" onclick={() => app.exportGPX(r)}>
        <span class="act-ic"><Icon name="download" /></span>GPX
      </button>
      <button use:tactile type="button" class="act" onclick={() => app.shareLink(r)}>
        <span class="act-ic"><Icon name="share" /></span>Partager
      </button>
      {#if cr}
        <button use:tactile type="button" class="act" onclick={() => community.reuseSettings(cr)}>
          <span class="act-ic"><Icon name="reuse" /></span>Réutiliser
        </button>
      {:else}
        {#if canPublish}
          <button use:tactile type="button" class="act" onclick={() => community.startPublish()}>
            <span class="act-ic" class:on={!!community.published[r.id]}><Icon name="users" fill={!!community.published[r.id]} /></span>{community.published[r.id] ? 'Publié' : 'Publier'}
          </button>
        {/if}
        <button use:tactile type="button" class="act" onclick={() => app.reverseSelected()}>
          <span class="act-ic"><Icon name="swap" /></span>Inverser
        </button>
      {/if}
    </div>
    {#if cr}
      <div class="cr-meta">
        {#if cr.uses}<span class="tabular">Repris {cr.uses}{NNBSP}fois</span>{/if}
        {#if crMine}
          <button use:tactile type="button" class="mini" onclick={() => community.unpublish(cr)}>Retirer de la Communauté</button>
        {:else}
          <button use:tactile type="button" class="mini" onclick={() => community.startReport({ routeId: cr.id }, 'ce parcours')}>Signaler</button>
          <button use:tactile type="button" class="mini" onclick={() => community.toggleBlock(cr.authorId, cr.authorName)}>Masquer {cr.authorName}</button>
        {/if}
      </div>
    {/if}

    <section class="climbs" aria-labelledby="climbs-h">
      <div class="climbs-head">
        <h3 id="climbs-h" class="field-label">Côtes et descentes</h3>
        <span class="tot tabular">+{r.ascent}{NNBSP}m · −{r.descent}{NNBSP}m</span>
      </div>
      {#if cl.length}
        <ul class="climb-list" aria-label="Côtes et descentes du parcours">
          {#each cl as c, i (i)}
            <li>
              <button use:tactile type="button" class="climb" class:on={app.focusClimb === i} aria-pressed={app.focusClimb === i} onclick={() => focus(i)}>
                <span class="c-ic" style:background={slopeColor(c.cls)}><Icon name={c.up ? 'rise' : 'fall'} size={14} /></span>
                <span class="c-txt">
                  <span class="c-title">{c.up ? 'Montée' : 'Descente'} {SLOPE_WORDS[Math.abs(c.cls)]}</span>
                  <span class="c-sub tabular">km {kmValue(c.from)} · {km(c.to - c.from)} à {pct(c.avg)} · max {pct(c.max)}</span>
                </span>
                <span class="c-gain rounded tabular">{c.up ? '+' : '−'}{c.gain}<small>m</small></span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if Object.keys(r.env).length}
      <Breakdown title="Milieux traversés" items={envItems(r)} />
    {/if}
    {#if r.surface}
      <Breakdown title="Sols" items={surfItems(r)} note={r.busy != null ? `Grands axes : ${percent(r.busy)}` : undefined} />
    {/if}
    {#if cr}<Comments r={cr} />{/if}
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
  /* Les propositions arrivent l'une après l'autre, du flou au net. */
  .card {
    animation: card-in 520ms var(--ease-out) both;
    animation-delay: calc(var(--i, 0) * 70ms + 80ms);
  }
  @keyframes card-in {
    from {
      opacity: 0;
      translate: 0 12px;
      filter: blur(6px);
    }
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
  /* Place réservée pendant la recherche : un reflet la parcourt, comme le bouton qui cherche. */
  .card.ghost {
    position: relative;
    overflow: hidden;
    pointer-events: none;
    color: var(--label-2);
  }
  .card.ghost::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--label) 7%, transparent) 50%, transparent 80%);
    translate: -100% 0;
    animation: ghost-sheen 1.3s var(--ease-out) infinite;
  }
  @keyframes ghost-sheen {
    to {
      translate: 100% 0;
    }
  }
  .g-glyph {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1.5px dashed var(--label-3);
    opacity: 0.7;
  }
  .ghost .c-name {
    font-weight: 500;
  }
  .g-line {
    display: block;
    height: 8px;
    width: 120px;
    border-radius: 4px;
    background: var(--fill-2);
  }
  .g-line.short {
    width: 72px;
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
  .conds {
    display: grid;
    gap: 8px;
  }
  .conds h3 {
    margin: 0;
  }
  .conds .row-label {
    font-size: 0.9375rem;
    font-weight: 500;
  }
  .conds .row-icon {
    display: grid;
    color: var(--label-2);
  }
  /* Départ ou retour dans le noir : l'icône passe à l'ambre des avertissements. */
  .conds .row-icon.warn {
    color: var(--warn);
  }
  .conds .row-icon.emo {
    font-size: 1.375rem;
    line-height: 1;
    place-items: center;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(var(--n, 5), 1fr);
    gap: 2px;
  }
  .act-ic.like.on,
  .act-ic.on {
    background: var(--tint-soft);
  }
  .act-ic.like.on :global(.icon) {
    animation: act-pop 480ms var(--spring-bouncy);
  }
  .author {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  .who-t {
    display: grid;
    min-width: 0;
    font-size: 0.9375rem;
  }
  .who-t span {
    font-size: 0.75rem;
    color: var(--label-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .follow {
    min-height: 36px;
    padding: 0 14px;
    font-size: 0.875rem;
  }
  .desc {
    margin: -6px 0 0;
    font-size: 0.9375rem;
    line-height: 1.4;
  }
  .cr-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    margin-top: -6px;
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .mini {
    min-height: 32px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--label-2);
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
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--fill-2);
    color: var(--tint);
  }
  .act-ic.ok {
    --burst: var(--ok);
  }
  /* Activé : une onde quitte l'icône et un éclat l'entoure, une fois. */
  .act-ic.burst::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid var(--burst, var(--tint));
    animation: act-burst 640ms var(--ease-out) forwards;
    pointer-events: none;
  }
  .act-ic.burst::before {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--burst, var(--tint)) 30%, transparent) 0 40%, transparent 70%);
    animation: act-glow 640ms var(--ease-out) forwards;
    pointer-events: none;
  }
  @keyframes act-burst {
    from {
      transform: scale(0.85);
      opacity: 1;
    }
    to {
      transform: scale(1.75);
      opacity: 0;
    }
  }
  @keyframes act-glow {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
    30% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.2);
    }
  }
  .climbs {
    display: grid;
    gap: 8px;
  }
  .climbs-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .climbs-head h3 {
    margin: 0;
  }
  .tot {
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .climb-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 18px;
    background: var(--fill-group);
    overflow: hidden;
  }
  .climb-list li + li {
    border-top: 0.5px solid var(--separator);
  }
  .climb {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px 9px 10px;
    text-align: left;
    transition: background-color 200ms var(--ease-out);
  }
  .climb:active {
    background: var(--fill-2);
  }
  .climb.on {
    background: var(--fill-2);
  }
  .c-ic {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
  }
  .c-txt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .c-title {
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .c-title::first-letter {
    text-transform: uppercase;
  }
  .c-sub {
    font-size: 0.75rem;
    color: var(--label-2);
  }
  .c-gain {
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .c-gain small {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
    margin-left: 1px;
  }
  .prof {
    display: grid;
    gap: 6px;
  }
  .act[aria-pressed='true'] .act-ic {
    background: var(--tint-soft);
    animation: act-pop 480ms var(--spring-bouncy);
  }
  @keyframes act-pop {
    from {
      transform: scale(0.82);
    }
  }
  dd {
    display: flex;
    align-items: baseline;
  }
  /* iPhone : détail plus dense, le parcours reste visible au-dessus. */
  @media (max-width: 859px) {
    .strip {
      margin-bottom: 10px;
    }
    .card {
      padding: 8px 12px 8px 8px;
      gap: 10px;
      border-radius: 20px;
    }
    .c-name {
      font-size: 0.875rem;
    }
    .c-meta {
      font-size: 0.75rem;
    }
    .detail {
      gap: 12px;
    }
    dd {
      font-size: 1.375rem;
    }
    dd small {
      font-size: 0.75rem;
    }
    dt {
      font-size: 0.6875rem;
    }
    .act-ic {
      width: 42px;
      height: 42px;
    }
    .act {
      font-size: 0.6875rem;
    }
    h2 {
      font-size: 1.1875rem;
    }
  }
</style>
