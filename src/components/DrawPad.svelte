<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import Ruler from './Ruler.svelte';
  import { app } from '../lib/state.svelte';
  import { asSwitch, haptic, nativeSwitch, tactile } from '../lib/haptics';
  import { SPORTS } from '../lib/sports';
  import { kmSetting } from '../lib/format';
  import { hasDrawing, isStroke, presetDrawing, simplifyPts, smoothStroke, type DrawPreset, type Pt } from '../lib/drawing';
  import { localIdeas, type Idea } from '../lib/shapes';
  import { community } from '../lib/community.svelte';
  import { CommunityError } from '../lib/community/types';
  import type { IconName } from '../lib/icons';

  /*
   * Mode Dessin, replié tant qu'on ne le touche pas : une ligne « Dessiner le parcours » qui déplie un carnet.
   * On y dessine au doigt (iPhone) ou à la souris (Mac) ; les traits s'enchaînent dans l'ordre (liaisons en
   * pointillés) et le dernier revient au point de départ (rond blanc). Quatre formes toutes prêtes, annuler
   * le dernier trait, tout effacer. Déplié avec un dessin, la boucle créée suit le dessin.
   * En haut, une discussion : on écrit la forme voulue (« un diamant », « 2027 ») et des idées de dessins
   * s'affichent (bibliothèque de l'app, et l'IA quand elle est branchée sur le serveur).
   * Épuré : pas d'exemples ni de départ à changer ici (le départ se règle en haut des réglages).
   */
  const PRESETS: { k: DrawPreset; icon: IconName; label: string }[] = [
    { k: 'circle', icon: 'circle', label: 'Rond' },
    { k: 'square', icon: 'square', label: 'Carré' },
    { k: 'heart', icon: 'heart', label: 'Cœur' },
    { k: 'star', icon: 'star', label: 'Étoile' },
  ];

  let pad: HTMLDivElement | undefined = $state();
  let size = $state(300);
  /** trait en cours (coordonnées du carnet) */
  let live = $state.raw<Pt[] | null>(null);
  let pointer = -1;
  /** rejoue le tracé animé quand une forme toute prête est choisie */
  let drawKey = $state(0);

  const strokes = $derived(app.drawing?.strokes.filter(isStroke) ?? []);
  const preset = $derived(app.drawing?.preset);
  /** forme toute prête ou idée choisie : elle garde ses angles et se dessine d'un trait */
  const sharp = $derived(!!(app.drawing?.preset || app.drawing?.name));
  const all = $derived(live && live.length > 1 ? [...strokes, live] : strokes);
  const empty = $derived(!all.length);

  const f = (p: Pt) => `${(p[0] * 100).toFixed(2)} ${(p[1] * 100).toFixed(2)}`;
  /** Trait à main levée adouci (courbes par les milieux) ; une forme toute prête garde ses angles. */
  function pathOf(pts: Pt[], sharp: boolean): string {
    if (pts.length < 2) return '';
    let d = `M${f(pts[0])}`;
    if (sharp || pts.length < 3) {
      for (let i = 1; i < pts.length; i++) d += `L${f(pts[i])}`;
      return d;
    }
    for (let i = 1; i < pts.length - 1; i++) d += `Q${f(pts[i])} ${f([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2])}`;
    return d + `L${f(pts[pts.length - 1])}`;
  }
  /** Liaisons entre traits, puis retour au départ : en pointillés (on les courra aussi). */
  const links = $derived.by(() => {
    const out: [Pt, Pt][] = [];
    for (let i = 1; i < all.length; i++) out.push([all[i - 1][all[i - 1].length - 1], all[i][0]]);
    if (all.length && !live) {
      const a = all[all.length - 1][all[all.length - 1].length - 1];
      const b = all[0][0];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.02) out.push([a, b]);
    }
    return out;
  });
  const startPt = $derived(all[0]?.[0] ?? null);
  /**
   * Un pixel en unités du dessin (le carnet est carré). Le trait est épaissi dans ces unités plutôt qu'avec
   * `vector-effect` : celui-ci fausse les pointillés de `pathLength`, et la forme se dessinerait avec des trous.
   */
  const unit = $derived(100 / Math.max(size, 1));

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  function at(e: PointerEvent): Pt {
    const r = pad!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  }
  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    pointer = e.pointerId;
    pad!.setPointerCapture(e.pointerId);
    live = [at(e)];
  }
  function move(e: PointerEvent) {
    if (e.pointerId !== pointer || !live) return;
    const next = live.slice();
    // Points intermédiaires du geste (souris ou doigt rapides) : un trait sans facettes.
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const p = at(ev);
      const last = next[next.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) next.push(p);
    }
    if (next.length !== live.length) live = next;
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    const s = live;
    live = null;
    if (!s || !isStroke(s)) return;
    const clean = simplifyPts(smoothStroke(s, 2), 0.0012);
    // Un trait ajouté à une forme toute prête en fait un dessin à main levée.
    app.setDrawing({ strokes: [...strokes, clean] });
    haptic('tick');
  }
  function choose(k: DrawPreset) {
    haptic('tap');
    app.setDrawing(presetDrawing(k));
    drawKey++;
  }
  // Discussion : la forme demandée devient des idées de dessins à toucher.
  let prompt = $state('');
  let ideas = $state.raw<Idea[]>([]);
  let asked = $state('');
  let asking = $state(false);
  let askNote = $state<string | null>(null);
  async function ask(text = prompt) {
    const t = text.trim();
    if (!t || asking) return;
    prompt = t;
    asked = t;
    askNote = null;
    haptic('tap');
    asking = true;
    try {
      const mine = await localIdeas(t);
      if (asked !== t) return;
      ideas = mine;
      const ai = await community.drawIdeas(t);
      if (asked !== t) return;
      if (ai?.length) ideas = [...ai.map((i) => ({ name: i.name, drawing: { strokes: i.strokes }, ai: true })), ...ideas].slice(0, 6);
    } catch (e) {
      if (asked === t) askNote = e instanceof CommunityError ? e.message : null;
    } finally {
      if (asked === t) asking = false;
    }
  }
  function useIdea(i: Idea) {
    haptic('tap');
    app.setDrawing({ strokes: i.drawing.strokes, name: i.name });
    drawKey++;
  }
  const thumb = (st: Pt[][]) => st.map((p) => p.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' '));

  function undo() {
    haptic('tap');
    const rest = strokes.slice(0, -1);
    app.setDrawing(rest.length ? { strokes: rest } : null);
  }
  function clear() {
    haptic('tap');
    app.setDrawing(null);
  }

  // Où poser le dessin : au départ, ou au meilleur endroit dans un rayon (« c'est l'aventure »).
  const bike = $derived(SPORTS[app.params.sport].bike);
  const reachMax = $derived(bike ? 40 : 15);
  const reachStep = $derived(bike ? 1 : 0.5);
  const reach = $derived(Math.min(app.drawReach, reachMax));
</script>

<div class="draw" class:open={app.drawOpen}>
  <button
    use:tactile
    type="button"
    class="toggle"
    aria-expanded={app.drawOpen}
    aria-controls="draw-sheet"
    onclick={() => {
      haptic('tap');
      app.toggleDraw();
    }}
  >
    <span class="t-ic" aria-hidden="true"><Icon name="scribble" size={18} /></span>
    <span class="t-label">Dessiner le parcours</span>
    {#if app.drawOpen && hasDrawing(app.drawing)}<span class="t-on">Activé</span>{/if}
    <span class="chev" aria-hidden="true"><Icon name="down" size={16} /></span>
  </button>

  {#if app.drawOpen}
    <div id="draw-sheet" class="sheet" transition:slide={{ duration: 420, easing: cubicOut }}>
      <form
        class="ask"
        onsubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <span class="a-ic" class:busy={asking} aria-hidden="true"><Icon name="sparkle" size={16} fill /></span>
        <input bind:value={prompt} maxlength="80" enterkeyhint="send" autocomplete="off" placeholder="Un diamant, 2027, un chat…" aria-label="Décris la forme que tu veux courir" />
        <button use:tactile type="submit" class="send" disabled={!prompt.trim() || asking} aria-label="Proposer des dessins"><Icon name="arrowUp" size={15} /></button>
      </form>
      {#if ideas.length}
        <div class="ideas" role="group" aria-label="Dessins proposés pour « {asked} »">
          {#each ideas as idea, i (idea.name + i)}
            <button use:tactile type="button" class="idea" style:--i={i} aria-label="Courir ce dessin : {idea.name}" onclick={() => useIdea(idea)}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                {#each thumb(idea.drawing.strokes) as pts, k (k)}<polyline points={pts} />{/each}
              </svg>
              <span class="i-name">{#if idea.ai}<Icon name="sparkle" size={10} fill />{/if}{idea.name}</span>
            </button>
          {/each}
        </div>
      {:else if asked && !asking}
        <p class="ask-note">Aucune idée pour « {asked} » : dessine-la ci-dessous.</p>
      {/if}
      {#if askNote}<p class="ask-note">{askNote}</p>{/if}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="pad"
        class:empty
        bind:this={pad}
        bind:clientWidth={size}
        role="img"
        aria-label={empty ? 'Zone de dessin vide' : `Ton dessin : ${strokes.length} trait${strokes.length > 1 ? 's' : ''}`}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {#each links as [a, b], i (i)}
            <line class="link" x1={a[0] * 100} y1={a[1] * 100} x2={b[0] * 100} y2={b[1] * 100} />
          {/each}
          {#key drawKey}
            {#each all as s, i (i)}
              <path class="glow" d={pathOf(s, sharp)} stroke-width={unit * 14} />
              <path class="ink" class:fresh={sharp && drawKey > 0} d={pathOf(s, sharp)} pathLength="1" stroke-width={unit * 4.5} />
            {/each}
          {/key}
          {#if startPt}
            <circle class="start" cx={startPt[0] * 100} cy={startPt[1] * 100} r={unit * 7} />
          {/if}
        </svg>
        {#if empty}
          <span class="invite" aria-hidden="true"><Icon name="scribble" size={44} /></span>
        {/if}
      </div>
      <div class="tools">
        <div class="presets" role="group" aria-label="Formes toutes prêtes">
          {#each PRESETS as p (p.k)}
            <button use:tactile type="button" class="tool" class:on={preset === p.k} aria-pressed={preset === p.k} aria-label={p.label} title={p.label} onclick={() => choose(p.k)}>
              <Icon name={p.icon} size={18} fill={preset === p.k} />
            </button>
          {/each}
        </div>
        <div class="edit">
          <button use:tactile type="button" class="tool" aria-label="Annuler le dernier trait" title="Annuler" disabled={!strokes.length} onclick={undo}><Icon name="undo" size={18} /></button>
          <button use:tactile type="button" class="tool" aria-label="Tout effacer" title="Effacer" disabled={!strokes.length} onclick={clear}><Icon name="trash" size={18} /></button>
        </div>
      </div>

      <div class="where">
        <Ruler
          id="reach"
          label="Lieu du dessin"
          value={reach}
          min={0}
          max={reachMax}
          step={reachStep}
          every={bike ? 10 : 5}
          display={reach === 0 ? 'Au\u00a0départ' : `≤ ${kmSetting(reach)}`}
          unit={reach === 0 ? '' : 'km'}
          valuetext={reach === 0 ? 'Le dessin passe par le départ' : `Le dessin se pose au meilleur endroit, à ${kmSetting(reach)} kilomètres du départ au plus`}
          onchange={(v) => app.setDrawPrefs({ reach: v })}
        />
        {#if reach > 0}
          <label class="row approach" transition:slide={{ duration: 300, easing: cubicOut }}>
            <span class="row-icon"><Icon name="path" /></span>
            <span class="row-label">Y aller depuis le départ</span>
            <input
              class="switch"
              type="checkbox"
              use:asSwitch
              checked={app.drawApproach}
              onchange={() => {
                app.setDrawPrefs({ approach: !app.drawApproach });
                if (!nativeSwitch) haptic('tap');
              }}
            />
          </label>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .draw {
    display: grid;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px 0 6px;
    border-radius: 16px;
    color: var(--label);
    font-size: 0.9375rem;
    font-weight: 600;
    text-align: left;
    transition:
      background-color 220ms var(--ease-out),
      transform 240ms var(--spring);
  }
  .toggle:active {
    transform: scale(0.98);
  }
  .t-ic {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--tint);
    background: var(--tint-soft);
    transition:
      background-color 260ms var(--ease-out),
      color 260ms var(--ease-out);
  }
  .open .t-ic {
    color: #fff;
    background: var(--tint);
  }
  .t-label {
    flex: 1;
    min-width: 0;
  }
  .t-on {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--tint);
    animation: on-in 360ms var(--spring-bouncy);
  }
  @keyframes on-in {
    from {
      opacity: 0;
      scale: 0.7;
    }
  }
  .chev {
    display: grid;
    color: var(--label-2);
    transition: rotate 380ms var(--spring);
  }
  .open .chev {
    rotate: 180deg;
  }
  .sheet {
    display: grid;
    gap: 10px;
    padding-top: 8px;
  }
  /* Le carnet : papier pointé, le trait en rose lumineux, les liaisons en pointillés. */
  .pad {
    position: relative;
    /* Toujours carré : le dessin garde ses proportions sur la carte. */
    width: min(100%, 440px);
    justify-self: center;
    aspect-ratio: 1;
    border-radius: 20px;
    overflow: hidden;
    touch-action: none;
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
    background-color: rgba(255, 255, 255, 0.05);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--label) 22%, transparent) 1px, transparent 1.3px);
    background-size: 22px 22px;
    background-position: 11px 11px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--label) 10%, transparent);
  }
  .pad svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .ink,
  .glow,
  .link {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .link {
    vector-effect: non-scaling-stroke;
  }
  .ink {
    stroke: var(--tint);
  }
  .glow {
    stroke: var(--tint);
    opacity: 0.22;
    filter: blur(3px);
  }
  /* Forme toute prête : elle se dessine d'un trait. */
  .ink.fresh {
    stroke-dasharray: 1;
    animation: ink-in 900ms cubic-bezier(0.45, 0, 0.2, 1) backwards;
  }
  @keyframes ink-in {
    from {
      stroke-dashoffset: 1;
    }
  }
  .link {
    stroke: color-mix(in srgb, var(--label) 55%, transparent);
    stroke-width: 2px;
    stroke-dasharray: 2 6;
  }
  .start {
    fill: #fff;
    stroke: var(--tint);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
    transform-box: fill-box;
    transform-origin: center;
    animation: start-in 420ms var(--spring-bouncy);
  }
  @keyframes start-in {
    from {
      transform: scale(0);
    }
  }
  /* Carnet vide : le gribouillis invite à dessiner, en respirant doucement. */
  .invite {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--label-3);
    pointer-events: none;
    animation: breathe 2600ms ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.45;
      scale: 0.94;
    }
  }
  .tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .presets,
  .edit {
    display: flex;
    gap: 6px;
  }
  .tool {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label);
    background: var(--fill-2);
    transition:
      background-color 220ms var(--ease-out),
      color 220ms var(--ease-out),
      transform 260ms var(--spring-bouncy),
      opacity 200ms var(--ease-out);
  }
  .tool:active {
    transform: scale(0.9);
  }
  .tool.on {
    color: #fff;
    background: var(--tint);
  }
  .tool:disabled {
    opacity: 0.35;
  }
  /* Discussion : une bulle de saisie, puis les idées en vignettes qui défilent si elles débordent. */
  .ask {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 5px 5px 5px 12px;
    border-radius: 999px;
    background: var(--fill-2);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--label) 8%, transparent);
    transition: box-shadow 220ms var(--ease-out);
  }
  .ask:focus-within {
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--tint) 70%, transparent),
      0 0 0 4px var(--tint-soft);
  }
  .a-ic {
    display: grid;
    color: var(--tint);
  }
  .a-ic.busy {
    animation: twinkle 900ms ease-in-out infinite;
  }
  @keyframes twinkle {
    50% {
      opacity: 0.35;
      scale: 0.8;
      rotate: 25deg;
    }
  }
  .ask input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--label);
    font: inherit;
    font-size: 0.9375rem;
  }
  .ask input::placeholder {
    color: var(--label-3);
  }
  .send {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--tint);
    transition:
      opacity 200ms var(--ease-out),
      transform 260ms var(--spring-bouncy);
  }
  .send:disabled {
    opacity: 0.35;
  }
  .send:active {
    transform: scale(0.88);
  }
  .ideas {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -2px;
    padding: 2px;
  }
  .ideas::-webkit-scrollbar {
    display: none;
  }
  .idea {
    flex: none;
    width: 84px;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 8px 4px 6px;
    border-radius: 16px;
    background: var(--fill-2);
    color: var(--label);
    animation: idea-in 460ms var(--spring) backwards;
    animation-delay: calc(var(--i) * 55ms);
    transition: transform 260ms var(--spring-bouncy);
  }
  @keyframes idea-in {
    from {
      opacity: 0;
      translate: 0 8px;
      scale: 0.9;
    }
  }
  .idea:active {
    transform: scale(0.93);
  }
  .idea svg {
    width: 52px;
    height: 52px;
  }
  .idea polyline {
    fill: none;
    stroke: var(--tint);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .i-name {
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.6875rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .i-name :global(.icon) {
    color: var(--tint);
  }
  .ask-note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .where {
    display: grid;
    gap: 10px;
    padding-top: 4px;
  }
  .approach {
    padding: 4px 4px 4px 8px;
    min-height: 44px;
  }
  @media (hover: hover) {
    .toggle:hover {
      background: var(--fill-2);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ink.fresh,
    .start,
    .invite,
    .t-on,
    .idea,
    .a-ic.busy {
      animation: none;
    }
  }
</style>
