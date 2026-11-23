<script lang="ts">
  /** Légende des bâtiments en volume (mode 3D) : la couleur dit la hauteur, donc le type de bâtiment. */
  import { app } from '../lib/state.svelte';
  import { BUILDING_COLORS, type Theme } from '../lib/mapstyle';

  const dark = matchMedia('(prefers-color-scheme: dark)');
  let theme = $state<Theme>(dark.matches ? 'dark' : 'light');
  $effect(() => {
    const on = () => (theme = dark.matches ? 'dark' : 'light');
    dark.addEventListener('change', on);
    return () => dark.removeEventListener('change', on);
  });
  const c = $derived(BUILDING_COLORS[theme]);
  // Sur iPhone, juste au-dessus du panneau ; sur Mac, en haut à gauche de la carte.
  const bottom = $derived(app.wide ? undefined : `${Math.max(12, app.padding.bottom - 14 - app.band)}px`);
</script>

<div class="legend glass" class:wide={app.wide} style:bottom role="note" aria-label="Bâtiments en volume, colorés selon leur hauteur">
  <span title="Moins de 10 m : 1 à 2 étages"><i style:background={c[0]}></i>Maison</span>
  <span title="De 10 à 30 m : 3 à 8 étages"><i style:background={c[1]}></i>Immeuble</span>
  <span title="30 m et plus : 9 étages et plus"><i style:background={c[2]}></i>Tour</span>
</div>

<style>
  .legend {
    position: fixed;
    z-index: 14;
    left: var(--gutter);
    display: flex;
    gap: 12px;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label);
    animation: legend-in 420ms var(--spring-soft) backwards;
    transition: bottom 620ms var(--sheet-ease);
  }
  .legend.wide {
    left: 408px;
    top: 12px;
  }
  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  i {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 0.5px rgba(0, 0, 0, 0.18),
      0 1px 2px rgba(0, 0, 0, 0.12);
  }
  @keyframes legend-in {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
</style>
