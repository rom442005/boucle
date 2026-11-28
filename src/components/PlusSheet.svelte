<script lang="ts">
  import Icon from './Icon.svelte';
  import AdCard from './AdCard.svelte';
  import { promo } from '../lib/promo.svelte';
  import { app } from '../lib/state.svelte';
  import { priceOfMonth, PLUS_FLOOR, PLUS_FLOOR_MONTH, PLUS_START, PLUS_STEP } from '../lib/plus';
  import { profileWords } from '../lib/ads';
  import { asSwitch, haptic, tactile } from '../lib/haptics';

  /*
   * Boucle+ en simulation : le prix qui baisse chaque mois d'affilée (une barre par mois, le mois en cours
   * allumé), les boutons pour avancer dans le temps, et l'aperçu des publicités ciblées (ce que l'app
   * déduit du profil, la publicité choisie et pourquoi). Rien n'est payé ni envoyé.
   */
  const euro = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const MONTHS = Array.from({ length: PLUS_FLOOR_MONTH + 1 }, (_, i) => i + 1);
  const maxP = PLUS_START;
  /** mois d'affilée en cours (1 = premier mois) ; 0 si pas abonné */
  const n = $derived(promo.sim.active ? Math.max(1, promo.streak) : 0);
  const monthName = (m: string) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${m}-15T12:00:00`));
  const saved = $derived(n > 1 ? Math.round((PLUS_START - priceOfMonth(n)) * 100) / 100 : 0);
  const words = $derived(profileWords(promo.signals));
  const ad = $derived(promo.ads[0] ?? null);
  const close = () => (promo.open = false);
  function step() {
    haptic('tick');
    promo.advance();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />
<button type="button" class="scrim" aria-label="Fermer" onclick={close}></button>
<div class="sheet glass photo-card on-photo" role="dialog" aria-modal="true" aria-labelledby="plus-title">
  <header>
    <h2 id="plus-title">Boucle<span class="plus">+</span> <small>simulation</small></h2>
    <button use:tactile type="button" class="x" aria-label="Fermer" onclick={close}><Icon name="close" size={16} /></button>
  </header>

  <div class="body">
    <!-- Le prix du mois, en héros, et ce qu'il deviendra. -->
    <section class="sec hero">
      <span class="k">{promo.sim.active ? `${monthName(promo.sim.now)} · mois ${n} d’affilée` : `À partir de ${monthName(promo.sim.now)}`}</span>
      <b class="price rounded tabular">{euro(promo.price)}<small>/mois</small></b>
      <span class="k">
        {#if promo.sim.active}
          {promo.nextPrice < promo.price ? `Le mois prochain : ${euro(promo.nextPrice)}` : 'Prix le plus bas atteint'}{saved ? ` · ${euro(saved)} de moins qu’au début` : ''}
        {:else}
          −{euro(PLUS_STEP)} chaque mois d’affilée, jusqu’à {euro(PLUS_FLOOR)}
        {/if}
      </span>
      <!-- Une barre par mois : le prix qui descend ; le mois en cours en rose. -->
      <div class="ladder" role="img" aria-label="Prix mois par mois : de {euro(PLUS_START)} à {euro(PLUS_FLOOR)} au {PLUS_FLOOR_MONTH}e mois">
        {#each MONTHS as m (m)}
          <span class="bar" class:past={m < n} class:now={m === n} style:--h={priceOfMonth(m) / maxP}>
            <i></i><em>{m}</em>
          </span>
        {/each}
      </div>
      <p class="rule">Un mois entier sans abonnement et le prix repart à {euro(PLUS_START)}.</p>
    </section>

    <div class="actions">
      {#if promo.sim.active}
        <button use:tactile type="button" class="btn" onclick={() => promo.cancel()}>Arrêter</button>
      {:else}
        <button use:tactile type="button" class="btn primary" onclick={() => promo.subscribe()}>S’abonner à {euro(promo.price)}</button>
      {/if}
      <button use:tactile type="button" class="btn" onclick={step}>Mois suivant <Icon name="chevron" size={14} /></button>
    </div>
    <button use:tactile type="button" class="reset" onclick={() => promo.reset()}>Remettre la simulation à zéro</button>

    <section class="sec">
      <h3 class="field-label">Avec Boucle+</h3>
      <ul class="perks">
        <li><span aria-hidden="true">🚫</span>Aucune publicité</li>
        <li><span aria-hidden="true">🎯</span>Parcours adaptés à ta séance (à venir)</li>
        <li><span aria-hidden="true">📈</span>Suivi de ta progression (à venir)</li>
      </ul>
    </section>

    <!-- Publicités : l'aperçu, ce que l'app déduit du profil, et la publicité qu'elle choisirait. -->
    <section class="sec">
      <h3 class="field-label">Publicités (aperçu)</h3>
      <div class="group">
        <label class="row">
          <span class="row-label">Afficher l’aperçu des publicités</span>
          <input class="switch" type="checkbox" use:asSwitch checked={!!app.flags.pubSim} onchange={(e) => promo.setAds((e.currentTarget as HTMLInputElement).checked)} />
        </label>
        <label class="row">
          <span class="row-label">Choisies d’après mon profil</span>
          <input class="switch" type="checkbox" use:asSwitch checked={promo.personal} onchange={(e) => promo.setPersonal((e.currentTarget as HTMLInputElement).checked)} />
        </label>
      </div>
      {#if promo.personal}
        <p class="k">Ce que Boucle déduit de toi (sur ton appareil seulement) :</p>
        <ul class="words">
          {#each words as w (w)}<li>{w}</li>{/each}
        </ul>
      {:else}
        <p class="k">Sans profil : la publicité ne dépend que de la sortie affichée.</p>
      {/if}
      {#if promo.sim.active}
        <p class="k">Abonné Boucle+ : aucune publicité.</p>
      {:else if ad}
        <AdCard {ad} />
      {/if}
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: rgba(0, 0, 0, 0.6);
    animation: fade 200ms var(--ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .sheet {
    position: fixed;
    z-index: 45;
    left: 8px;
    right: 8px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    max-height: min(88dvh, 780px);
    display: flex;
    flex-direction: column;
    border-radius: 32px;
    color: #fff;
    --g-bg: rgba(22, 23, 25, 0.9);
    --blur: 30px;
    overflow: hidden;
    animation: up 400ms var(--spring) backwards;
  }
  @keyframes up {
    from {
      opacity: 0;
      translate: 0 48px;
    }
  }
  @media (min-width: 860px) {
    .sheet {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      width: 460px;
      translate: -50% -50%;
      animation: pop 400ms var(--spring) backwards;
    }
    @keyframes pop {
      from {
        opacity: 0;
        scale: 0.95;
      }
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px 20px;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 750;
    letter-spacing: -0.01em;
  }
  h2 .plus {
    color: var(--tint);
  }
  h2 small {
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    vertical-align: 3px;
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.8);
  }
  .x {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 12px;
    padding: 4px 14px 18px;
  }
  .sec {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.07);
  }
  .sec h3 {
    margin: 0;
  }
  .k {
    margin: 0;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.7);
  }
  .price {
    font-size: 2.5rem;
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }
  .price small {
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin-left: 4px;
  }
  .ladder {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    align-items: end;
    gap: 4px;
    height: 92px;
    margin-top: 6px;
  }
  .bar {
    display: grid;
    grid-template-rows: 1fr auto;
    height: 100%;
    gap: 4px;
  }
  .bar i {
    align-self: end;
    height: calc(var(--h) * 100%);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.18);
    transition:
      background-color 240ms var(--ease-out),
      height 240ms var(--ease-out);
  }
  .bar.past i {
    background: color-mix(in srgb, var(--tint) 45%, transparent);
  }
  .bar.now i {
    background: var(--tint);
    box-shadow: 0 0 14px color-mix(in srgb, var(--tint) 60%, transparent);
  }
  .bar em {
    font-style: normal;
    font-size: 0.625rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
  }
  .bar.now em {
    color: #fff;
    font-weight: 700;
  }
  .rule {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .btn {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 999px;
    font-weight: 650;
    font-size: 0.9375rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
  .btn.primary {
    background: var(--tint);
  }
  .reset {
    justify-self: center;
    min-height: 36px;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.65);
  }
  .perks,
  .words {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .perks {
    display: grid;
    gap: 8px;
    font-size: 0.9375rem;
  }
  .perks li {
    display: flex;
    gap: 10px;
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .words li {
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.12);
  }
  .sec :global(.group) {
    margin: 0 -8px;
    background: transparent;
  }
</style>
