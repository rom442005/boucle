<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { ZONE_ORDER, ZONES } from '../lib/zones';

  /*
   * Sous la météo, une petite barre de verre à icônes seules (Romain : « très minimaliste », sans défiler) :
   * pistes d'athlétisme, parcs, eau, forêts, fontaines. Un toucher colore ces lieux sur la carte (MapView pose
   * aussi un repère sur les petits) ; l'icône prend la couleur du lieu. Pour les pistes et les fontaines, un
   * petit chiffre dit combien il y en a à l'écran. Le nom s'affiche au survol sur Mac et se lit à l'écran.
   */
  $effect(() => {
    app.zonesShown = true;
    return () => {
      app.zonesShown = false;
    };
  });
</script>

<div class="zones glass photo-card on-photo" role="group" aria-label="Lieux à voir sur la carte">
  {#each ZONE_ORDER as k, i (k)}
    {@const z = ZONES[k]}
    {@const on = app.zones.includes(k)}
    {@const n = z.pin ? app.zoneCounts[k] : undefined}
    <span class="slot" style:--i={i}
      ><button
        use:tactile
        type="button"
        class="zone"
        class:on
        style:--c={z.color}
        aria-pressed={on}
        aria-label="{z.long}{n != null ? ` : ${n} à l’écran` : ''}"
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

<style>
  .zones {
    justify-self: start;
    display: flex;
    gap: 2px;
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
    width: 40px;
    height: 40px;
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
  @media (hover: hover) {
    .zone:not(.on):hover {
      background: rgba(255, 255, 255, 0.12);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .zones,
    .slot,
    .zone.on,
    .n {
      animation: none;
    }
  }
</style>
