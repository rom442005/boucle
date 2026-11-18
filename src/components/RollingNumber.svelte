<script lang="ts">
  /**
   * Chiffres qui défilent comme un compteur quand la valeur change.
   * Les caractères sont alignés à droite : quand le nombre gagne un chiffre, les unités ne bougent pas.
   * Les lecteurs d'écran lisent la valeur telle quelle.
   */
  let { value }: { value: string } = $props();

  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const chars = $derived(
    [...value]
      .reverse()
      .map((ch, i) => ({ ch, key: i, digit: ch >= '0' && ch <= '9' ? Number(ch) : -1 }))
      .reverse(),
  );
</script>

<span class="roll"
  ><span class="visually-hidden">{value}</span
  >{#each chars as c (c.key)}{#if c.digit >= 0}<span class="col" aria-hidden="true"
        ><span class="strip" style:transform="translateY({-c.digit * 10}%)"
          >{#each DIGITS as d (d)}<span>{d}</span>{/each}</span
        ></span
      >{:else}<span class="ch" aria-hidden="true">{c.ch}</span>{/if}{/each}</span
>

<style>
  .roll {
    display: inline-flex;
    align-items: baseline;
    font-variant-numeric: tabular-nums;
    white-space: pre;
  }
  .col {
    display: block;
    height: 1.15em;
    line-height: 1.15em;
    overflow: clip;
    animation: col-in 320ms var(--spring-bouncy);
  }
  .strip {
    display: flex;
    flex-direction: column;
    transition: transform 520ms var(--spring-bouncy);
    will-change: transform;
  }
  .strip span {
    display: block;
    height: 1.15em;
  }
  .ch {
    line-height: 1.15em;
  }
  /* Un chiffre qui apparaît (9 → 10) glisse en place. */
  @keyframes col-in {
    from {
      opacity: 0;
      translate: 0 0.35em;
    }
  }
</style>
