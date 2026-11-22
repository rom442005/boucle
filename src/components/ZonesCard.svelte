<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { haptic, tactile } from '../lib/haptics';
  import { ZONE_ORDER, ZONES } from '../lib/zones';

  /*
   * Sous la météo, un petit bloc de verre : des pastilles pour mettre en valeur sur la carte les pistes
   * d'athlétisme, les parcs, l'eau, les forêts et les fontaines (MapView colore les lieux et pose un repère
   * sur les petits). Pour les pistes et les fontaines, la pastille dit combien il y en a à l'écran.
   */
  $effect(() => {
    app.zonesShown = true;
    return () => {
      app.zonesShown = false;
    };
  });
</script>

<section class="zones glass photo-card on-photo" aria-label="Lieux à voir sur la carte">
  <div class="row" role="group" aria-label="Mettre en valeur sur la carte">
    {#each ZONE_ORDER as k, i (k)}
      {@const z = ZONES[k]}
      {@const on = app.zones.includes(k)}
      {@const n = z.pin ? app.zoneCounts[k] : undefined}
      <span class="slot" style:--i={i}><button
        use:tactile
        type="button"
        class="chip"
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
        <span class="emo" aria-hidden="true">{z.emoji}</span>{z.label}{#if n}<span class="n tabular" aria-hidden="true">{n}</span>{/if}
      </button></span>
    {/each}
  </div>
</section>

<style>
  .zones {
    display: grid;
    padding: 6px;
    border-radius: 22px;
    --g-bg: rgba(24, 26, 28, 0.62);
    --blur: 22px;
    animation: zones-in 640ms var(--spring) 320ms backwards;
  }
  @keyframes zones-in {
    from {
      opacity: 0;
      translate: 0 -10px;
      scale: 0.97;
    }
  }
  /* Une seule ligne qui défile si elle déborde, ses bords s'estompent. */
  .row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
    padding-right: 16px;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 11px 0 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
    transition:
      background-color 240ms var(--ease-out),
      box-shadow 240ms var(--ease-out),
      transform 300ms var(--spring-bouncy);
  }
  /* À l'arrivée, les pastilles entrent l'une après l'autre (sur leur emplacement, pour ne pas rejouer). */
  .slot {
    flex: none;
    display: flex;
    animation: chip-in 520ms var(--spring) backwards;
    animation-delay: calc(380ms + var(--i) * 45ms);
  }
  @keyframes chip-in {
    from {
      opacity: 0;
      translate: -8px 0;
    }
  }
  .chip:active {
    transform: scale(0.93);
  }
  .emo {
    font-size: 0.9375rem;
    line-height: 1;
  }
  /* Choisi : la pastille prend la couleur du lieu sur la carte, et rebondit. */
  .chip.on {
    background: color-mix(in srgb, var(--c) 82%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 6px 16px -8px var(--c);
    animation: chip-pop 460ms var(--spring-bouncy);
  }
  @keyframes chip-pop {
    from {
      transform: scale(0.88);
    }
  }
  .n {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    margin-left: 1px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    font-size: 0.6875rem;
    font-weight: 700;
    animation: count-in 360ms var(--spring-bouncy);
  }
  @keyframes count-in {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .zones,
    .slot,
    .chip.on,
    .n {
      animation: none;
    }
  }
</style>
