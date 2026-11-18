<script lang="ts">
  import RollingNumber from './RollingNumber.svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { duration, kmValue, km, NNBSP } from '../lib/format';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const r = $derived(app.route);
  const f = $derived(app.follow);
  const done = $derived(f?.progress ?? 0);
  const left = $derived(Math.max(0, (r?.lengthM ?? 0) - done));
  const ratio = $derived(r ? Math.min(1, done / r.lengthM) : 0);
  const off = $derived(f?.offset != null && f.offset > 45 ? f.offset : null);
  const finished = $derived(!!r && left < 40 && done > r.lengthM * 0.9);
</script>

<div class="hud glass glass-panel" role="status" aria-live="polite">
  {#if f?.error}
    <p class="err"><Icon name="warning" size={18} />{f.error}</p>
  {:else if !f?.position}
    <p class="wait">Recherche du signal GPS…</p>
  {:else}
    <div class="main">
      <div>
        <span class="big rounded"><RollingNumber value={kmValue(left)} /><small>{NNBSP}km</small></span>
        <span class="cap">{finished ? 'Arrivée !' : 'restants'}</span>
      </div>
      <div class="side tabular">
        <span><b>{km(done)}</b> faits</span>
        <span>{duration((now - f.startedAt) / 1000)}</span>
      </div>
    </div>
    <div class="track" aria-hidden="true"><span style:transform="scaleX({ratio})"></span></div>
    {#if off}
      <p class="off"><Icon name="warning" size={16} />Hors parcours · à {Math.round(off)}{NNBSP}m du tracé</p>
    {/if}
  {/if}
</div>

<div class="dock">
  {#if !app.followCamera}
    <button type="button" class="round glass" aria-label="Recentrer sur ma position" onclick={() => (app.followCamera = true)}>
      <Icon name="locate" fill />
    </button>
  {/if}
  <button type="button" class="stop glass" onclick={() => app.stopFollow()}>
    <Icon name="stop" size={18} />Terminer
  </button>
</div>

<style>
  .hud {
    position: fixed;
    z-index: 25;
    top: calc(var(--safe-top) + 8px);
    left: 8px;
    right: 8px;
    max-width: 520px;
    margin: 0 auto;
    padding: 14px 18px 16px;
    border-radius: 28px;
    display: grid;
    gap: 10px;
  }
  .main {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
  }
  .big {
    display: block;
    font-size: 3rem;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1;
  }
  .big small {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--label-2);
    letter-spacing: 0;
  }
  .cap {
    font-size: 0.875rem;
    color: var(--label-2);
  }
  .side {
    display: grid;
    justify-items: end;
    gap: 2px;
    font-size: 0.9375rem;
    color: var(--label-2);
  }
  .side b {
    color: var(--label);
    font-weight: 650;
  }
  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--fill);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--tint);
    transform-origin: left;
    transition: transform 600ms var(--ease-out);
  }
  .off,
  .err {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--warn);
  }
  .err {
    color: var(--label);
    font-weight: 500;
  }
  .wait {
    margin: 0;
    color: var(--label-2);
  }
  .dock {
    position: fixed;
    z-index: 25;
    bottom: calc(max(12px, var(--safe-bottom)) + 4px);
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    pointer-events: none;
  }
  .dock > * {
    pointer-events: auto;
  }
  .stop {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 52px;
    padding: 0 26px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 1.0625rem;
    color: var(--tint);
  }
  .round {
    width: 52px;
    height: 52px;
    color: var(--location);
  }
</style>
