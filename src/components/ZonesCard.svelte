<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { km } from '../lib/format';
  import { ZONE_ORDER, ZONES } from '../lib/zones';

  /*
   * Sous la météo, une petite barre de verre à icônes seules (Romain : « très minimaliste », sans défiler) :
   * pistes d'athlétisme, parcs, eau, forêts, fontaines, toilettes. Un toucher allume ces lieux sur la carte et
   * la carte va montrer le plus proche (mise au point) ; la bulle dessous dit lequel, à quelle distance, et
   * passe au suivant. Les petits chiffres disent combien de pistes, fontaines ou toilettes sont à l'écran.
   */
  $effect(() => {
    app.zonesShown = true;
    return () => {
      app.zonesShown = false;
    };
  });

  const f = $derived(app.zoneFocus);
  const fz = $derived(f ? ZONES[f.kind] : null);
</script>

<div class="zones-col">
  <div class="zones glass photo-card on-photo" role="group" aria-label="Lieux à voir sur la carte">
    {#each ZONE_ORDER as k, i (k)}
      {@const z = ZONES[k]}
      {@const on = app.zones.includes(k)}
      {@const n = z.look !== 'area' ? app.zoneCounts[k] : undefined}
      <span class="slot" style:--i={i}
        ><button
          use:tactile
          type="button"
          class="zone"
          class:on
          style:--c={z.color}
          aria-pressed={on}
          aria-label="{z.long}{on && n != null ? ` : ${n} à l’écran` : ''}"
          title={z.long}
          onclick={() => {
            haptic('tap');
            app.toggleZone(k);
          }}
        >
          <Icon name={z.icon} size={20} fill={on} />
          {#if on && n}<span class="n tabular" aria-hidden="true">{n > 99 ? '99+' : n}</span>{/if}
        </button></span
      >
    {/each}
  </div>

  {#if f && fz}
    {#key f.kind}
      <div class="focus glass photo-card on-photo" style:--c={fz.color} role="status" aria-live="polite">
        <span class="f-ic" aria-hidden="true"><Icon name={fz.icon} size={16} fill /></span>
        {#if f.n}
          <span class="f-txt">
            <b>{f.name}</b>
            <small class="tabular">à {km(f.dist)}{f.n > 1 ? ` · ${f.i + 1}/${f.n}` : ''}</small>
          </span>
          {#if f.n > 1}
            <button use:tactile type="button" class="step" aria-label="Lieu précédent" onclick={() => app.stepZone(-1)}><Icon name="caretLeft" size={16} /></button>
            <button use:tactile type="button" class="step" aria-label="Lieu suivant" onclick={() => app.stepZone(1)}><Icon name="caretRight" size={16} /></button>
          {/if}
        {:else}
          <span class="f-txt"><b>{fz.long}</b><small>aucun près d’ici</small></span>
        {/if}
      </div>
    {/key}
  {/if}
</div>

<style>
  .zones-col {
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .zones {
    display: flex;
    gap: 1px;
    padding: 4px;
    border-radius: 999px;
    --g-bg: rgba(24, 26, 28, 0.62);
    --blur: 22px;
    animation: zones-in 640ms var(--spring) 320ms backwards;
  }
  @keyframes zones-in {
    from {
      opacity: 0;
      translate: 0 -10px;
      scale: 0.96;
    }
  }
  /* À l'arrivée, les icônes entrent l'une après l'autre (sur leur emplacement, pour ne pas rejouer). */
  .slot {
    display: flex;
    animation: zone-in 520ms var(--spring) backwards;
    animation-delay: calc(380ms + var(--i) * 45ms);
  }
  @keyframes zone-in {
    from {
      opacity: 0;
      scale: 0.6;
    }
  }
  .zone {
    position: relative;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.86);
    transition:
      background-color 240ms var(--ease-out),
      color 240ms var(--ease-out),
      box-shadow 240ms var(--ease-out),
      transform 300ms var(--spring-bouncy);
  }
  .zone:active {
    transform: scale(0.88);
  }
  /* Montré : l'icône pleine sur la couleur du lieu, qui rebondit. */
  .zone.on {
    color: #fff;
    background: color-mix(in srgb, var(--c) 84%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 6px 16px -8px var(--c);
    animation: zone-pop 460ms var(--spring-bouncy);
  }
  @keyframes zone-pop {
    from {
      transform: scale(0.8);
    }
  }
  .n {
    position: absolute;
    top: -3px;
    right: -4px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #fff;
    color: #1c1c1e;
    font-size: 0.625rem;
    font-weight: 800;
    box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.35);
    animation: count-in 360ms var(--spring-bouncy);
  }
  @keyframes count-in {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }
  /* Bulle du lieu mis au point : sa couleur, son nom, sa distance, et les flèches vers les suivants. */
  .focus {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 5px 5px 5px 6px;
    border-radius: 999px;
    color: #fff;
    --g-bg: rgba(24, 26, 28, 0.66);
    --blur: 22px;
    animation: focus-in 520ms var(--spring) backwards;
  }
  @keyframes focus-in {
    from {
      opacity: 0;
      translate: 0 -8px;
      scale: 0.94;
    }
  }
  .f-ic {
    width: 28px;
    height: 28px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent);
  }
  .f-txt {
    min-width: 0;
    display: grid;
    line-height: 1.15;
    padding-right: 4px;
  }
  .f-txt b {
    font-size: 0.8125rem;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .f-txt small {
    font-size: 0.6875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.72);
  }
  .step {
    width: 30px;
    height: 30px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    transition: transform 240ms var(--spring-bouncy);
  }
  .step:active {
    transform: scale(0.86);
  }
  @media (hover: hover) {
    .zone:not(.on):hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .zones,
    .slot,
    .zone.on,
    .n,
    .focus {
      animation: none;
    }
  }
</style>
