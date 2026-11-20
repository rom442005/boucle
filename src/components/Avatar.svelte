<script lang="ts">
  /* Pastille d'un membre : l'initiale de son prénom, sur une teinte des milieux (même personne, même couleur). */
  let { id, name, size = 40 }: { id: string; name: string; size?: number } = $props();

  const HUES = ['--env-forest', '--env-water', '--env-park', '--env-fields', '--env-urban'];
  const hue = $derived.by(() => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HUES[h % HUES.length];
  });
  const initial = $derived((name.trim()[0] ?? '?').toLocaleUpperCase('fr-FR'));
</script>

<span class="avatar" style:--size="{size}px" style:background="var({hue})" aria-hidden="true">{initial}</span>

<style>
  .avatar {
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    font-weight: 700;
    font-size: calc(var(--size) * 0.45);
    letter-spacing: -0.02em;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  }
</style>
