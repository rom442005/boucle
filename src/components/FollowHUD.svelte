<script lang="ts">
  import RollingNumber from './RollingNumber.svelte';
  import Icon from './Icon.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { app } from '../lib/state.svelte';
  import { km, kmValue, NNBSP } from '../lib/format';
  import { climbsOf, slopeColor, SLOPE_WORDS } from '../lib/elevation';
  import { ascentProfile, chrono, clock, followStats, paceValue, speedValue } from '../lib/follow';
  import { SPORTS } from '../lib/sports';

  /*
   * Suivi en direct, comme l'écran d'enregistrement de Strava : la carte en haut, un panneau de verre en bas
   * avec la distance faite et le chrono en grand, puis l'allure (ou la vitesse à vélo), la moyenne, le restant,
   * le D+ fait, l'heure d'arrivée et la meilleure vitesse ou la part faite. Pause arrête le chrono. En haut,
   * une bulle prévient d'une côte à venir ou d'un écart au tracé.
   */
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const r = $derived(app.route);
  const f = $derived(app.follow);
  const bike = $derived(r ? SPORTS[r.sport].bike : false);
  const cum = $derived(r ? ascentProfile(r) : new Float64Array());
  const st = $derived(r && f ? followStats(r, f, cum, bike, now) : null);
  const off = $derived(f?.offset != null && f.offset > 45 ? f.offset : null);

  /** La côte (ou descente) en cours, sinon la prochaine à moins de 1,5 km. */
  const ahead = $derived.by(() => {
    if (!r || !f?.position) return null;
    const done = f.progress;
    const cs = climbsOf(r);
    const cur = cs.find((c) => done >= c.from && done < c.to);
    if (cur) return { c: cur, now: true, dist: cur.to - done };
    const next = cs.find((c) => c.from > done && c.from - done <= 1500);
    return next ? { c: next, now: false, dist: next.from - done } : null;
  });
  const meters = (d: number) => (d < 1000 ? `${Math.max(10, Math.round(d / 10) * 10)}${NNBSP}m` : km(d));

  /** hauteur du panneau : le bouton Recentrer se pose juste au-dessus */
  let sheetH = $state(220);
  /**
   * Écran de poche : la sortie continue (l'écran reste allumé, donc le GPS suit), mais tout est noir avec les
   * chiffres atténués, comme un écran verrouillé. Un appui maintenu d'une seconde ramène au suivi.
   */
  let pocket = $state(false);
  let holding = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  function holdStart() {
    holding = true;
    holdTimer = setTimeout(() => {
      holding = false;
      pocket = false;
      haptic('success');
    }, 900);
  }
  function holdEnd() {
    holding = false;
    clearTimeout(holdTimer);
  }

  function togglePause() {
    haptic(st?.paused ? 'success' : 'tap');
    if (st?.paused) app.resumeFollow();
    else app.pauseFollow();
  }
</script>

<!-- En haut : ce qu'il faut savoir maintenant (signal, écart au tracé, côte). -->
{#if f?.error || !f?.position || off || ahead}
  <div class="note glass" class:warn={!!off || !!f?.error} role="status">
    {#if f?.error}
      <Icon name="warning" size={16} /><span>{f.error}</span>
    {:else if !f?.position}
      <span class="dot" aria-hidden="true"></span><span>Recherche du signal GPS…</span>
    {:else if off}
      <Icon name="warning" size={16} /><span>Hors parcours · à {meters(off)} du tracé</span>
    {:else if ahead}
      {@const c = ahead.c}
      <span class="a-ic" style:background={slopeColor(c.cls)}><Icon name={c.up ? 'rise' : 'fall'} size={13} /></span>
      <span>
        {#if ahead.now}
          {c.up ? 'Montée' : 'Descente'} {SLOPE_WORDS[Math.abs(c.cls)]} : encore <b>{meters(ahead.dist)}</b>
        {:else}
          {c.up ? 'Montée' : 'Descente'} dans <b>{meters(ahead.dist)}</b> · {km(c.to - c.from)} à {c.avg.toLocaleString('fr-FR')}{NNBSP}%
        {/if}
      </span>
    {/if}
  </div>
{/if}

{#if !app.followCamera}
  <button use:tactile type="button" class="recenter round glass" style:--sheet-h="{sheetH}px" aria-label="Recentrer sur ma position" onclick={() => (app.followCamera = true)}>
    <Icon name="locate" fill />
  </button>
{/if}

{#if st && pocket}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pocket-screen" role="dialog" aria-label="Écran de poche (Échap pour revenir)" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (pocket = false)} onpointerdown={holdStart} onpointerup={holdEnd} onpointercancel={holdEnd} onpointerleave={holdEnd}>
    <span class="p-clock tabular">{clock(now)}</span>
    <div class="p-main">
      <b class="p-big rounded tabular">{kmValue(st.done)}<small>km</small></b>
      <span class="p-row tabular">{chrono(st.moving)} · {bike ? `${speedValue(st.speed)} km/h` : `${paceValue(st.speed)} /km`}</span>
      <span class="p-row dim tabular">Reste {km(st.left)}</span>
    </div>
    <span class="p-hold" class:on={holding}>Maintiens pour revenir</span>
  </div>
{/if}

{#if st}
  <!-- Condensé : trois chiffres en grand, une ligne pour la suite, les boutons. -->
  <section class="sheet glass glass-panel modal-glass" class:paused={st.paused} aria-label="Suivi en direct" bind:clientHeight={sheetH}>
    <div class="prog" aria-hidden="true"><span style:transform="scaleX({st.ratio})"></span></div>
    <dl class="hero">
      <div>
        <dd class="big rounded tabular"><RollingNumber value={kmValue(st.done)} /><small>km</small></dd>
        <dt class="k">{st.finished ? 'Arrivée !' : 'Distance'}</dt>
      </div>
      <div class="mid">
        <dd class="big rounded tabular" aria-label="Durée {chrono(st.moving)}">{chrono(st.moving)}</dd>
        <dt class="k">{st.paused ? 'En pause' : 'Durée'}</dt>
      </div>
      <div class="end">
        <dd class="big rounded tabular">{bike ? speedValue(st.speed) : paceValue(st.speed)}<small>{bike ? 'km/h' : '/km'}</small></dd>
        <dt class="k">{bike ? 'Vitesse' : 'Allure'}</dt>
      </div>
    </dl>
    <p class="line tabular">Reste <b>{km(st.left)}</b>{#if st.eta}{' · arrivée '}<b>{clock(st.eta)}</b>{/if}</p>
    <div class="acts">
      <button use:tactile type="button" class="pause" class:on={st.paused} onclick={togglePause}>
        <Icon name={st.paused ? 'play' : 'pause'} size={17} />{st.paused ? 'Reprendre' : 'Pause'}
      </button>
      <button use:tactile type="button" class="stop" onclick={() => app.stopFollow()}>
        <Icon name="stop" size={15} />Terminer
      </button>
      <button use:tactile type="button" class="pocket" aria-label="Écran de poche : la sortie continue, écran noir" title="Écran de poche" onclick={() => (pocket = true)}>
        <Icon name="moon" size={18} />
      </button>
    </div>
  </section>
{/if}

<style>
  /* Bulle du haut : signal, écart au tracé, côte à venir. */
  .note {
    position: fixed;
    z-index: 25;
    top: calc(var(--safe-top) + 14px);
    left: 50%;
    translate: -50% 0;
    max-width: calc(100vw - 2 * var(--gutter));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px 9px 12px;
    border-radius: 999px;
    font-size: 0.875rem;
    color: var(--label);
    white-space: nowrap;
    animation: drop 520ms var(--spring) backwards;
  }
  .note.warn {
    color: var(--warn);
    font-weight: 600;
    white-space: normal;
  }
  @keyframes drop {
    from {
      opacity: 0;
      translate: -50% -14px;
    }
  }
  .dot {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    background: var(--location);
    animation: blink 1.2s ease-in-out infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
    }
  }
  .a-ic {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
  }

  .recenter {
    position: fixed;
    z-index: 25;
    right: var(--gutter);
    bottom: calc(max(10px, env(safe-area-inset-bottom) - 14px) + var(--sheet-h, 330px) + 12px);
    width: 50px;
    height: 50px;
    color: var(--location);
  }

  /* Panneau du bas : tout ce qui compte pendant la sortie, lisible d'un coup d'œil. */
  .sheet {
    position: fixed;
    z-index: 25;
    left: var(--gutter);
    right: var(--gutter);
    bottom: calc(max(10px, env(safe-area-inset-bottom) - 14px));
    max-width: 520px;
    margin: 0 auto;
    padding: 14px 14px 12px;
    border-radius: 30px;
    display: grid;
    gap: 10px;
    overflow: hidden;
    animation: up 640ms var(--spring) backwards;
  }
  @keyframes up {
    from {
      opacity: 0;
      translate: 0 30px;
    }
  }
  .prog {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 4px;
    background: var(--fill);
  }
  .prog span {
    display: block;
    height: 100%;
    background: var(--tint);
    transform-origin: left;
    transition: transform 600ms var(--ease-out);
  }
  .k {
    display: block;
    margin-top: 1px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--label-2);
  }
  .hero {
    margin: 0;
    padding-top: 2px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 8px;
  }
  .hero dd {
    margin: 0;
  }
  .mid {
    text-align: center;
  }
  .end {
    text-align: right;
  }
  .big {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.02;
    white-space: nowrap;
  }
  .big small {
    margin-left: 2px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--label-2);
    letter-spacing: 0;
  }
  .paused .mid .big {
    color: var(--label-2);
    animation: blink 1.6s ease-in-out infinite;
  }
  .line {
    margin: 0;
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .line b {
    font-weight: 650;
    color: var(--label);
  }
  .acts {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
  }
  .pocket {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label);
    background: var(--fill);
  }
  .pause,
  .stop {
    min-height: 46px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 1.0625rem;
    font-weight: 650;
  }
  .pause {
    color: var(--label);
    background: var(--fill);
  }
  .pause.on {
    color: #fff;
    background:
      radial-gradient(90% 70% at 32% 12%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%),
      var(--tint);
  }
  .stop {
    color: var(--tint);
    background: var(--fill);
  }
  /* Écran de poche : noir (l'écran OLED s'éteint presque), chiffres gris, aucun bouton à toucher par erreur. */
  .pocket-screen {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    padding: calc(var(--safe-top) + 18px) 24px calc(env(safe-area-inset-bottom, 0px) + 28px);
    background: #000;
    color: #7c7c80;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    animation: fade-in 420ms ease-out;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  .p-clock {
    font-size: 1.125rem;
    font-weight: 600;
  }
  .p-main {
    align-self: center;
    display: grid;
    justify-items: center;
    gap: 6px;
  }
  .p-big {
    font-size: 5rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    color: #a1a1a6;
  }
  .p-big small {
    margin-left: 6px;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .p-row {
    font-size: 1.375rem;
    font-weight: 600;
  }
  .p-row.dim {
    font-size: 1rem;
    color: #55555a;
  }
  .p-hold {
    padding: 12px 22px;
    border-radius: 999px;
    font-size: 0.9375rem;
    color: #8e8e93;
    background: #111;
    box-shadow: inset 0 0 0 1px #222;
    transition:
      background-color 900ms linear,
      color 300ms;
  }
  .p-hold.on {
    color: #fff;
    background: #ff2d55;
  }
  @media (prefers-reduced-motion: reduce) {
    .pocket-screen,
    .sheet,
    .note,
    .dot,
    .paused .mid .big {
      animation: none;
    }
  }
</style>
