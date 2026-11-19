<script lang="ts">
  /** Légende des pentes : descentes de la lavande à l'indigo, plat en rose clair, montées du rose au grenat. */
  import { RAMP, RAMP_DOWN } from '../lib/elevation';

  const cells = [...[...RAMP_DOWN].reverse(), ...RAMP];
</script>

<div
  class="sl"
  role="img"
  aria-label="Couleur de la pente : descentes de la lavande à l’indigo, plat en rose clair, montées du rose au grenat, par paliers de 2, 5, 8 et 12 %"
>
  <div class="bar" aria-hidden="true">
    {#each cells as c, i (i)}<span style:background={c}></span>{/each}
  </div>
  <div class="lbl" aria-hidden="true"><span>Descente raide</span><span>Plat</span><span>Montée raide</span></div>
</div>

<style>
  .sl {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .bar {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 2px;
  }
  .bar span {
    height: 6px;
    border-radius: 2px;
  }
  .bar span:first-child {
    border-radius: 3px 2px 2px 3px;
  }
  .bar span:last-child {
    border-radius: 2px 3px 3px 2px;
  }
  .lbl {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--label-2);
    white-space: nowrap;
  }
</style>
