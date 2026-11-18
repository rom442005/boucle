<script lang="ts">
  import { ICONS, ICONS_FILL, type IconName } from '../lib/icons';

  let { name, size = 22, fill = false, label }: { name: IconName; size?: number; fill?: boolean; label?: string } = $props();
  const svg = $derived((fill && ICONS_FILL[name]) || ICONS[name]);
</script>

<span
  class="icon"
  style:width="{size}px"
  style:height="{size}px"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {@html svg}
</span>

<style>
  .icon {
    display: inline-grid;
    place-items: center;
    flex: none;
    line-height: 0;
  }
  .icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
