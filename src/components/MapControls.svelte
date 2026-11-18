<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';
</script>

<div class="ctrls glass" class:wide={app.wide} role="toolbar" aria-label="Carte">
  <button type="button" class="round" aria-label="Me localiser" aria-busy={app.locating} onclick={() => app.locateButton()}>
    <span class:spin={app.locating}><Icon name="locate" size={20} fill={!!app.userPos} /></span>
  </button>
  <span class="sep" aria-hidden="true"></span>
  <button type="button" class="round" aria-pressed={app.terrain3d} aria-label="Relief en 3D" onclick={() => (app.terrain3d = !app.terrain3d)}>
    <span class="three">3D</span>
  </button>
  {#if Math.abs(app.bearing) > 2}
    <span class="sep" aria-hidden="true"></span>
    <button type="button" class="round" aria-label="Remettre le nord en haut" onclick={() => app.northTick++}>
      <span class="compass" style:transform="rotate({-app.bearing}deg)"><Icon name="compass" size={22} /></span>
    </button>
  {/if}
</div>

<style>
  .ctrls {
    position: fixed;
    z-index: 15;
    right: 12px;
    top: calc(var(--safe-top) + 72px);
    display: flex;
    flex-direction: column;
    border-radius: 24px;
    padding: 2px;
  }
  .ctrls.wide {
    top: 12px;
  }
  .ctrls .round {
    color: var(--location);
  }
  .ctrls .round[aria-pressed='true'] {
    color: var(--tint);
  }
  .sep {
    height: 0.5px;
    margin: 0 10px;
    background: var(--separator);
  }
  .three {
    font-family: var(--font-rounded);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: -0.02em;
    color: var(--label);
  }
  .round[aria-pressed='true'] .three {
    color: var(--tint);
  }
  .compass {
    display: inline-grid;
    color: var(--label);
    transition: transform 120ms linear;
  }
  .spin {
    display: inline-grid;
    animation: blink 1s ease-in-out infinite alternate;
  }
  @keyframes blink {
    to {
      opacity: 0.35;
    }
  }
</style>
