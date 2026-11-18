<script lang="ts">
  import { encode } from 'uqr';
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte';

  /** banner : rappel dans Safari sur iPhone ; card : QR code à scanner depuis le Mac */
  let { mode, onclose }: { mode: 'banner' | 'card'; onclose?: () => void } = $props();

  const url = `${location.origin}${location.pathname}`;
  const qr = $derived.by(() => {
    if (mode !== 'card') return null;
    const { data, size } = encode(url, { ecc: 'M', border: 1 });
    let d = '';
    data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
    return { d, size };
  });

  function dismiss() {
    app.setFlag('installVu');
    onclose?.();
  }
</script>

{#if mode === 'banner'}
  <div class="banner install" role="note">
    <span class="ic" aria-hidden="true"><Icon name="phone" size={20} /></span>
    <span class="txt">
      <b>Comme une app :</b> touche <span class="kbd" aria-label="Partager"><Icon name="share" size={15} /></span> puis « Sur l’écran d’accueil ».
    </span>
    <button type="button" class="x" aria-label="Masquer ce conseil" onclick={dismiss}><Icon name="close" size={16} /></button>
  </div>
{:else if qr}
  <div class="card glass glass-panel" role="dialog" aria-label="Installer Boucle sur l’iPhone">
    <div class="qr" aria-hidden="true">
      <svg viewBox="0 0 {qr.size} {qr.size}" width="148" height="148" shape-rendering="crispEdges"><rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#1c1c1e" /></svg>
    </div>
    <div class="steps">
      <h3>Sur ton iPhone</h3>
      <ol>
        <li>Vise ce code avec l’appareil photo, puis ouvre le lien.</li>
        <li>Dans Safari, touche Partager <span class="kbd"><Icon name="share" size={14} /></span>.</li>
        <li>Choisis « Sur l’écran d’accueil ».</li>
      </ol>
      <p class="hint">Boucle s’ouvre alors comme une app, en plein écran, avec ta position.</p>
    </div>
    <button type="button" class="round x-card" aria-label="Fermer" onclick={() => onclose?.()}><Icon name="close" size={16} /></button>
  </div>
{/if}

<style>
  .install {
    align-items: center;
    background: var(--tint-soft);
    margin-bottom: 2px;
  }
  .install .ic {
    color: var(--tint);
    display: grid;
  }
  .install .txt {
    flex: 1;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  .kbd {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    vertical-align: -6px;
    border-radius: 6px;
    background: var(--fill);
    color: var(--location);
  }
  .x {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--label-2);
  }
  .card {
    position: absolute;
    z-index: 30;
    left: 12px;
    right: 12px;
    top: 56px;
    display: flex;
    gap: 14px;
    padding: 16px 14px 16px 16px;
    border-radius: 22px;
  }
  .qr {
    flex: none;
    padding: 8px;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08);
    line-height: 0;
  }
  .qr svg {
    width: 132px;
    height: 132px;
  }
  .steps {
    min-width: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  .steps h3 {
    margin: 0 0 6px;
    font-size: 0.9375rem;
    font-weight: 650;
  }
  ol {
    margin: 0 0 8px;
    padding-left: 18px;
    display: grid;
    gap: 4px;
  }
  .steps .hint {
    margin: 0;
  }
  .x-card {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 32px;
    height: 32px;
    color: var(--label-2);
  }
</style>
