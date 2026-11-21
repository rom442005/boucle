<script lang="ts">
  import { SCENES, sceneUrl, type Scene } from '../lib/scenes';

  /*
   * Un paysage en plein écran sous le verre : il passe d'une photo à l'autre en fondu (le sport change,
   * l'écran change) et dérive très lentement, comme une prise de vue en drone. La teinte dominante attend
   * la photo ; un voile discret en bas garde les blocs lisibles.
   */
  let { scene }: { scene: Scene } = $props();

  /** photos déjà chargées : la suivante n'apparaît qu'une fois prête */
  let ready = $state<Record<string, boolean>>({});
</script>

<div class="backdrop" style:background={SCENES[scene].tone} aria-hidden="true">
  {#key scene}
    <img
      src={sceneUrl(scene)}
      alt=""
      decoding="async"
      fetchpriority="high"
      class:in={ready[scene]}
      onload={() => (ready = { ...ready, [scene]: true })}
    />
  {/key}
  <div class="veil"></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 6;
    overflow: hidden;
    transition: background-color 600ms var(--ease-out);
    animation: bd-in 520ms var(--ease-out) both;
  }
  @keyframes bd-in {
    from {
      opacity: 0;
    }
  }
  img {
    position: absolute;
    inset: -3%;
    width: 106%;
    height: 106%;
    object-fit: cover;
    opacity: 0;
    filter: saturate(1.04);
    transition:
      opacity 900ms var(--ease-out),
      filter 900ms var(--ease-out);
    animation: drift 48s ease-in-out infinite alternate;
  }
  img.in {
    opacity: 1;
  }
  @keyframes drift {
    from {
      transform: scale(1) translate(0, 0);
    }
    to {
      transform: scale(1.06) translate(-1.2%, -1%);
    }
  }
  .veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0) 22%),
      linear-gradient(to top, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0) 46%);
  }
  @media (prefers-reduced-motion: reduce) {
    img {
      animation: none;
    }
  }
</style>
