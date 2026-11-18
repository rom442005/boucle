<script lang="ts">
  import type { LngLat } from '../lib/types';
  import { localProjector, simplify } from '../lib/geo';

  let { coords, size = 44, active = false }: { coords: LngLat[]; size?: number; active?: boolean } = $props();

  const d = $derived.by(() => {
    if (coords.length < 2) return { path: '', start: [0, 0] as [number, number] };
    const proj = localProjector(coords[0]);
    const pts = simplify(coords, 25).map((c) => proj.to(c));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const pad = 5;
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const k = (size - pad * 2) / span;
    const ox = (size - (maxX - minX) * k) / 2;
    const oy = (size - (maxY - minY) * k) / 2;
    const tr = ([px, py]: [number, number]): [number, number] => [ox + (px - minX) * k, size - (oy + (py - minY) * k)];
    const tp = pts.map(tr);
    return { path: tp.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' '), start: tp[0] };
  });
</script>

<svg class="glyph" class:active width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
  <path d={d.path} />
  <circle cx={d.start[0]} cy={d.start[1]} r="3.2" />
</svg>

<style>
  .glyph {
    flex: none;
    display: block;
    border-radius: 12px;
    background: var(--fill-2);
  }
  path {
    fill: none;
    stroke: var(--label-3);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  circle {
    fill: var(--label-3);
  }
  .active path {
    stroke: var(--tint);
  }
  .active circle {
    fill: var(--tint);
  }
</style>
