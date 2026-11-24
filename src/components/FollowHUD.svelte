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
  let sheetH = $state(330);

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

{#if st}
  <section class="sheet glass glass-panel modal-glass" class:paused={st.paused} aria-label="Suivi en direct" bind:clientHeight={sheetH}>
    <div class="prog" aria-hidden="true"><span style:transform="scaleX({st.ratio})"></span></div>

    <div class="hero">
      <div>
        <span class="k">{st.finished ? 'Arrivée !' : 'Distance'}</span>
        <b class="big rounded tabular"><RollingNumber value={kmValue(st.done)} /><small>{NNBSP}km</small></b>
        <span class="cap tabular">faits sur {km(r!.lengthM)}</span>
      </div>
      <div class="time">
        <span class="k">{st.paused ? 'En pause' : 'Durée'}</span>
        <b class="big rounded tabular" aria-label="Durée {chrono(st.moving)}">{chrono(st.moving)}</b>
        <span class="cap">{st.paused ? 'chrono arrêté' : 'en mouvement'}</span>
      </div>
    </div>

    <dl class="tiles">
      <div class="tile">
        <dt class="k">{bike ? 'Vitesse' : 'Allure'}</dt>
        <dd class="tabular">{bike ? speedValue(st.speed) : paceValue(st.speed)}<small>{bike ? 'km/h' : '/km'}</small></dd>
      </div>
      <div class="tile">
        <dt class="k">Moyenne</dt>
        <dd class="tabular">{bike ? speedValue(st.avg) : paceValue(st.avg)}<small>{bike ? 'km/h' : '/km'}</small></dd>
      </div>
      <div class="tile">
        <dt class="k">Restant</dt>
        <dd class="tabular">{kmValue(st.left)}<small>km</small></dd>
      </div>
      <div class="tile">
        <dt class="k">D+</dt>
        <dd class="tabular">{st.climbed}<small>/{NNBSP}{st.climb}{NNBSP}m</small></dd>
      </div>
      <div class="tile">
        <dt class="k">Arrivée</dt>
        <dd class="tabular">{st.eta ? clock(st.eta) : '–'}</dd>
      </div>
      <div class="tile">
        {#if bike}
          <dt class="k">Max</dt>
          <dd class="tabular">{st.maxSpeed ? speedValue(st.maxSpeed) : '–'}<small>km/h</small></dd>
        {:else}
          <dt class="k">Fait</dt>
          <dd class="tabular">{Math.round(st.ratio * 100)}<small>%</small></dd>
        {/if}
      </div>
    </dl>

    <div class="acts">
      <button use:tactile type="button" class="pause" class:on={st.paused} onclick={togglePause}>
        <Icon name={st.paused ? 'play' : 'pause'} size={18} />{st.paused ? 'Reprendre' : 'Pause'}
      </button>
      <button use:tactile type="button" class="stop" onclick={() => app.stopFollow()}>
        <Icon name="stop" size={16} />Terminer
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
    padding: 14px 16px 14px;
    border-radius: 32px;
    display: grid;
    gap: 12px;
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
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    padding-top: 2px;
  }
  .time {
    text-align: right;
  }
  .big {
    display: block;
    font-size: 2.75rem;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.02;
  }
  .big small {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--label-2);
    letter-spacing: 0;
  }
  .cap {
    display: block;
    margin-top: 2px;
    font-size: 0.8125rem;
    color: var(--label-2);
  }
  .paused .time .big {
    color: var(--label-2);
    animation: blink 1.6s ease-in-out infinite;
  }
  .tiles {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .tile {
    min-width: 0;
    padding: 9px 11px 10px;
    border-radius: 18px;
    background: var(--fill-2);
  }
  .tile dt {
    margin-bottom: 2px;
  }
  .tile dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 680;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile small {
    margin-left: 2px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
    letter-spacing: 0;
  }
  .acts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .pause,
  .stop {
    min-height: 50px;
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
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .note,
    .dot,
    .paused .time .big {
      animation: none;
    }
  }
</style>
