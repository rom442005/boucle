<script lang="ts">
  /*
   * Pastille d'un membre : sa photo de profil, sinon l'initiale de son prénom sur une teinte des milieux
   * (même personne, même couleur).
   */
  let { id, name, size = 40, src = null }: { id: string; name: string; size?: number; src?: string | null } = $props();

  const HUES = ['--env-forest', '--env-water', '--env-park', '--env-fields', '--env-urban'];
  const hue = $derived.by(() => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HUES[h % HUES.length];
  });
  const initial = $derived((name.trim()[0] ?? '?').toLocaleUpperCase('fr-FR'));
  let broken = $state<string | null>(null);
  const shown = $derived(src && broken !== src ? src : null);
</script>

<span class="avatar" class:has-photo={!!shown} style:--size="{size}px" style:background="var({hue})" aria-hidden="true">
  {#if shown}
    <img src={shown} alt="" width={size} height={size} loading="lazy" decoding="async" onerror={() => (broken = shown)} />
  {:else}
    {initial}
  {/if}
</span>

<style>
  .avatar {
    flex: none;
    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: #fff;
    font-weight: 700;
    font-size: calc(var(--size) * 0.45);
    letter-spacing: -0.02em;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  }
  .avatar.has-photo {
    background: var(--fill-2) !important;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .avatar.has-photo::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.14);
  }
</style>
