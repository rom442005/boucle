<script lang="ts">
  import Icon from './Icon.svelte';
  import { promo } from '../lib/promo.svelte';
  import { app } from '../lib/state.svelte';
  import { AD_CATEGORY_LABEL, type Ad } from '../lib/ads';
  import { tactile } from '../lib/haptics';

  /*
   * Une publicité en simulation : marquée « Sponsorisé », la marque (inventée), un visuel en dégradé avec son
   * émoji, une phrase, un bouton. « Pourquoi ? » dit ce qui l'a choisie ; « × » la masque pour la visite.
   */
  let { ad, compact = false }: { ad: Ad; compact?: boolean } = $props();
  let why = $state(false);
  const reason = $derived(promo.personal ? ad.why(promo.signals) : 'Choisie d’après la sortie affichée seulement (profil non utilisé).');
</script>

<aside class="ad" class:compact aria-label="Publicité de {ad.brand} (simulation)">
  <div class="top">
    <span class="tag">Sponsorisé · simulation</span>
    <span class="cat">{AD_CATEGORY_LABEL[ad.category]}</span>
    <button use:tactile type="button" class="hide" aria-label="Masquer cette publicité" onclick={() => promo.hide(ad.id)}><Icon name="close" size={12} /></button>
  </div>
  <div class="main">
    <span class="visual" style:--a={ad.colors[0]} style:--b={ad.colors[1]} aria-hidden="true">{ad.emoji}</span>
    <div class="txt">
      <span class="brand">{ad.brand} <small>marque fictive</small></span>
      <b class="title">{ad.title}</b>
      {#if !compact}<span class="text">{ad.text}</span>{/if}
    </div>
  </div>
  <div class="bottom">
    <button use:tactile type="button" class="why" aria-expanded={why} onclick={() => (why = !why)}>Pourquoi cette pub ?</button>
    <button use:tactile type="button" class="cta" onclick={() => app.showToast('Simulation : aucun lien ouvert')}>{ad.cta}</button>
  </div>
  {#if why}<p class="reason">{reason}</p>{/if}
  <button use:tactile type="button" class="noads" onclick={() => (promo.open = true)}>Sans publicité avec Boucle<b>+</b></button>
</aside>

<style>
  .ad {
    display: grid;
    gap: 10px;
    padding: 12px 14px 12px;
    border-radius: 22px;
    background: var(--fill-group);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--label) 8%, transparent);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tag {
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.02em;
    color: var(--label-2);
  }
  .cat {
    flex: 1;
    font-size: 0.6875rem;
    color: var(--label-3, var(--label-2));
  }
  .hide {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--label-2);
    background: var(--fill-2);
  }
  .main {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .visual {
    flex: none;
    width: 58px;
    height: 58px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    font-size: 1.75rem;
    background: linear-gradient(135deg, var(--a), var(--b));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .brand {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .brand small {
    font-weight: 500;
    opacity: 0.8;
  }
  .title {
    font-size: 0.9375rem;
    font-weight: 650;
    line-height: 1.25;
  }
  .text {
    font-size: 0.8125rem;
    line-height: 1.35;
    color: var(--label-2);
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .why {
    flex: none;
    white-space: nowrap;
    min-height: 36px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--label-2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .cta {
    flex: none;
    min-height: 36px;
    padding: 0 16px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 650;
    color: var(--label);
    background: var(--fill-2);
  }
  .noads {
    justify-self: start;
    min-height: 32px;
    margin-top: -6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--label-2);
  }
  .noads b {
    color: var(--tint);
  }
  .reason {
    margin: -2px 0 0;
    padding: 8px 10px;
    border-radius: 12px;
    font-size: 0.8125rem;
    line-height: 1.35;
    background: var(--fill-2);
    animation: in 200ms var(--ease-out);
  }
  @keyframes in {
    from {
      opacity: 0;
      translate: 0 -4px;
    }
  }
</style>
