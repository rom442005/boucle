<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import Ruler from './Ruler.svelte';
  import EnvChips from './EnvChips.svelte';
  import InstallGuide from './InstallGuide.svelte';
  import Stops from './Stops.svelte';
  import DrawPad from './DrawPad.svelte';
  import Discover from './Discover.svelte';
  import { app } from '../lib/state.svelte';
  import { isDesktop, isIOS, isStandalone } from '../lib/platform';
  import { asSwitch, haptic, nativeSwitch, tactile } from '../lib/haptics';
  import { SHAPES, SPORTS, SPORT_ORDER } from '../lib/sports';
  import { kmSetting, pace, speed } from '../lib/format';
  import type { Shape } from '../lib/types';
  import type { IconName } from '../lib/icons';

  const SPORT_ICON: Record<string, IconName> = { run: 'run', walk: 'walk', trail: 'hike', road: 'bicycle', gravel: 'bike' };

  // Dans Safari sur iPhone (pas encore installée) : rappel pour l'ajouter à l'écran d'accueil.
  const installHint = $derived(isIOS && !isStandalone && !app.flags.installVu);
  // Sur Mac : bandeau qui affiche le QR code à scanner avec l'iPhone.
  const qrHint = $derived(isDesktop && !app.flags.qrVu);

  /**
   * En blocs de verre partout, comme Profil et Communauté : sur le paysage (iPhone, le sport choisit la photo),
   * sur la carte (Mac, un verre plus dense pour rester lisible).
   */
  const cards = true;
  const p = $derived(app.params);
  const def = $derived(SPORTS[p.sport]);

  function setDistance(v: number) {
    app.params.distanceKm = v;
    app.persist();
  }
  function setElevation(v: number | null) {
    app.params.elevation = v;
    app.persist();
  }
  function setShape(s: Shape) {
    app.params.shape = s;
    // Un dessin se court en boucle : le carnet se replie pour un aller-retour ou un aller simple.
    if (s !== 'loop') app.drawOpen = false;
    app.persist();
  }
  function toggle(key: 'avoidBusy' | 'lit' | 'water' | 'headwind') {
    app.params[key] = !app.params[key];
    app.persist();
    // Sur iPhone, l'interrupteur natif vibre déjà de lui-même.
    if (!nativeSwitch) haptic('tap');
  }

  const isRun = $derived(!def.bike);
  const paceKey = $derived(p.sport === 'run' ? 'paceRun' : p.sport === 'walk' ? 'paceWalk' : p.sport === 'trail' ? 'paceTrail' : p.sport === 'road' ? 'speedRoad' : 'speedGravel');
  const paceValue = $derived(app.settings[paceKey]);
  function stepPace(dir: 1 | -1) {
    const s = app.settings;
    if (isRun) s[paceKey] = Math.min(p.sport === 'walk' ? 1200 : 720, Math.max(180, s[paceKey] + dir * 10));
    else s[paceKey] = Math.min(45, Math.max(8, s[paceKey] + dir));
    app.saveSettings();
    haptic('tick');
  }
</script>

<div class="composer" class:cards class:wide={app.wide}>
  {#if installHint}
    <InstallGuide mode="banner" />
  {:else if qrHint}
    <InstallGuide mode="mac" />
  {/if}
  <!-- Le sport d'abord : il règle tout le reste (distances, sols, vitesse). -->
  <section class="block glass photo-card" aria-label="Sport">
    <Segmented
      label="Sport"
      tall
      value={p.sport}
      options={SPORT_ORDER.map((s) => ({ value: s, label: SPORTS[s].label, icon: SPORT_ICON[s] }))}
      onchange={(s) => app.setSport(s)}
    />
  </section>

  <!--
    Le parcours, d'un seul bloc et dans l'ordre où on le pense : sa forme, sa distance, son dénivelé, le milieu
    traversé. Chaque rang a la même étiquette et le même filet.
  -->
  <section class="block glass photo-card course" aria-label="Le parcours">
    <div class="sub">
      <h3 id="shape-l" class="field-label">Forme</h3>
      <Segmented
        label="Forme du parcours"
        value={p.shape}
        options={(Object.keys(SHAPES) as Shape[]).map((s) => ({ value: s, label: SHAPES[s].label }))}
        onchange={setShape}
      />
      {#if p.shape === 'loop'}
        <DrawPad />
      {/if}
    </div>

    <!-- Repère de mi-hauteur du panneau : sous la distance quand le dénivelé est masqué (dessin). -->
    <div class="sub" data-fold={app.drawActive ? '' : undefined}>
      <Ruler
        id="distance"
        label="Distance"
        value={p.distanceKm}
        min={def.distance.min}
        max={def.distance.max}
        step={def.distance.step}
        every={def.ruler.km.every}
        display={kmSetting(p.distanceKm)}
        unit="km"
        valuetext="{kmSetting(p.distanceKm)} kilomètres"
        onchange={setDistance}
      />
    </div>

    <!-- Un dessin décide seul du chemin : le relief et le milieu ne comptent plus, ils disparaissent. -->
    {#if !app.drawActive}
    <div class="sub" data-fold>
      <Ruler
        id="elevation"
        label="Dénivelé +"
        spoken="Dénivelé positif"
        value={p.elevation ?? 0}
        min={0}
        max={def.elevation.max}
        step={def.elevation.step}
        every={def.ruler.dplus.every}
        display={(p.elevation ?? 0).toLocaleString('fr-FR')}
        unit="m"
        off={p.elevation == null}
        valuetext="{p.elevation ?? 0} mètres de dénivelé positif"
        onchange={(v) => setElevation(v)}
        onreset={() => setElevation(null)}
      />
    </div>

    <div class="sub" aria-labelledby="env-l">
      <h3 id="env-l" class="field-label">Milieu</h3>
      <EnvChips selected={p.envs} ontoggle={(e) => app.toggleEnv(e)} />
    </div>
    {/if}

    <!-- Sur Mac, ces lieux sont en haut de la colonne, sous le départ. Un dessin n'a pas de point de passage. -->
    {#if !app.wide && !app.drawActive}
      <div class="sub"><Stops /></div>
    {/if}
  </section>

  <!-- Découverte : les lieux emblématiques autour, à ajouter au parcours (pas pour un dessin). -->
  {#if !app.drawActive}
    <section class="block glass photo-card">
      <Discover />
    </section>
  {/if}

  <section class="block glass photo-card" aria-labelledby="opt-l">
    <h3 id="opt-l" class="field-label">Options</h3>
    <div class="group">
      <label class="row">
        <span class="row-icon"><Icon name="road" /></span>
        <span class="row-label">Éviter les grands axes</span>
        <input class="switch" type="checkbox" use:asSwitch checked={p.avoidBusy} onchange={() => toggle('avoidBusy')} />
      </label>
      {#if p.sport === 'run' || p.sport === 'walk'}
        <label class="row">
          <span class="row-icon"><Icon name="bulb" /></span>
          <span class="row-label">Rues éclairées</span>
          <input class="switch" type="checkbox" use:asSwitch checked={p.lit} onchange={() => toggle('lit')} />
        </label>
      {/if}
      <label class="row">
        <span class="row-icon"><Icon name="drop" /></span>
        <span class="row-label">Points d’eau</span>
        <input class="switch" type="checkbox" use:asSwitch checked={p.water} onchange={() => toggle('water')} />
      </label>
      {#if def.bike && p.shape !== 'oneway'}
        <label class="row">
          <span class="row-icon"><Icon name="wind" /></span>
          <span class="row-label">Partir face au vent</span>
          <input class="switch" type="checkbox" use:asSwitch checked={p.headwind} onchange={() => toggle('headwind')} />
        </label>
      {/if}
      <div class="row">
        <span class="row-icon"><Icon name="gauge" /></span>
        <span class="row-label">{isRun ? 'Allure' : 'Vitesse moyenne'}</span>
        <div class="stepper" role="group" aria-label={isRun ? 'Allure' : 'Vitesse moyenne'}>
          <button use:tactile type="button" aria-label={isRun ? 'Allure plus rapide' : 'Moins vite'} onclick={() => stepPace(-1)}><Icon name="minus" size={14} /></button>
          <output class="tabular" aria-live="polite">{isRun ? pace(paceValue) : speed(paceValue)}</output>
          <button use:tactile type="button" aria-label={isRun ? 'Allure plus lente' : 'Plus vite'} onclick={() => stepPace(1)}><Icon name="plus" size={14} /></button>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .composer {
    display: grid;
    gap: 12px;
    padding-top: 4px;
  }
  /* Les blocs arrivent l'un après l'autre, juste derrière le panneau qui monte. */
  .composer > :global(*) {
    animation: set-in 520ms var(--ease-out) backwards;
  }
  .composer > :global(*:nth-child(1)) { animation-delay: 140ms; }
  .composer > :global(*:nth-child(2)) { animation-delay: 190ms; }
  .composer > :global(*:nth-child(3)) { animation-delay: 240ms; }
  .composer > :global(*:nth-child(4)) { animation-delay: 290ms; }
  .composer > :global(*:nth-child(n + 5)) { animation-delay: 340ms; }
  @keyframes set-in {
    from {
      opacity: 0;
      translate: 0 18px;
    }
  }
  .block {
    display: grid;
    gap: 10px;
    padding: 14px 14px 16px;
  }
  /* Mac : les blocs flottent sur la carte ; un verre plus dense pour que le texte reste lisible. */
  .wide .block {
    --g-bg: rgba(22, 23, 25, 0.8);
    border-radius: 26px;
  }
  /* Le parcours : quatre rangs alignés, séparés d'un même filet. */
  .course {
    gap: 0;
    padding-top: 6px;
    padding-bottom: 8px;
  }
  .sub {
    display: grid;
    gap: 10px;
    padding: 12px 0;
  }
  .sub + .sub {
    border-top: 0.5px solid rgba(255, 255, 255, 0.16);
  }
  .block :global(.group) {
    margin: 0 -6px -6px;
    background: transparent;
  }
  .block h3 {
    margin: 0;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--fill-2);
    border-radius: 999px;
    padding: 3px;
  }
  .stepper button {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--label);
  }
  .stepper button:active {
    background: var(--fill);
  }
  .stepper output {
    min-width: 76px;
    text-align: center;
    font-size: 0.9375rem;
    font-weight: 600;
  }
  @media (max-width: 859px) {
    .composer {
      padding-top: 2px;
    }
    .sub {
      gap: 8px;
      padding: 11px 0;
    }
    .stepper button {
      width: 32px;
      height: 32px;
    }
    .stepper output {
      min-width: 68px;
      font-size: 0.875rem;
    }
  }
</style>
