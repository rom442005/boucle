<script lang="ts">
  import { untrack } from 'svelte';

  /*
   * Un chiffre qui monte jusqu'à sa valeur quand il apparaît (puis glisse d'une valeur à l'autre) : les données
   * du profil s'animent comme les widgets de Santé. Les lecteurs d'écran lisent la valeur finale.
   */
  let {
    value,
    decimals = 0,
    duration = 900,
    delay = 120,
  }: { value: number; decimals?: number; duration?: number; delay?: number } = $props();

  const fmt = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  let shown = $state(untrack(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0)));
  let raf = 0;

  $effect(() => {
    const to = value;
    const from = untrack(() => shown);
    cancelAnimationFrame(raf);
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown = to;
      return;
    }
    // Courbe de sortie : vite au début, se pose doucement sur la valeur.
    let t0 = 0;
    const wait = untrack(() => (shown === 0 ? delay : 0));
    const step = (now: number) => {
      if (!t0) t0 = now + wait;
      const k = Math.min(1, Math.max(0, (now - t0) / duration));
      shown = from + (to - from) * (1 - (1 - k) ** 4);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<span class="count tabular"><span class="visually-hidden">{fmt(value)}</span><span aria-hidden="true">{fmt(shown)}</span></span>
