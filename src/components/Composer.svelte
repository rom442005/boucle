<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import RangeField from './RangeField.svelte';
  import EnvChips from './EnvChips.svelte';
  import InstallGuide from './InstallGuide.svelte';
  import Stops from './Stops.svelte';
  import { app } from '../lib/state.svelte';
  import { isDesktop, isIOS, isStandalone } from '../lib/platform';
  import { asSwitch, haptic, nativeSwitch, tactile } from '../lib/haptics';
  import { SHAPES, SPORTS, SPORT_ORDER } from '../lib/sports';
  import { kmSetting, pace, speed } from '../lib/format';
  import type { Shape, Surface } from '../lib/types';
  import type { IconName } from '../lib/icons';

  const SPORT_ICON: Record<string, IconName> = { run: 'run', trail: 'hike', road: 'bicycle', gravel: 'bike' };

  // Dans Safari sur iPhone (pas encore installée) : rappel pour l'ajouter à l'écran d'accueil.
  const installHint = $derived(isIOS && !isStandalone && !app.flags.installVu);
  // Sur Mac : bandeau qui affiche le QR code à scanner avec l'iPhone.
  const qrHint = $derived(isDesktop && !app.flags.qrVu);

  /** iPhone : les réglages flottent en blocs de verre sur un paysage (le sport choisit la photo). */
  const cards = $derived(!app.wide);
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
    app.persist();
  }
  function setSurface(s: Surface) {
    app.params.surface = s;
    app.persist();
  }
  function toggle(key: 'avoidBusy' | 'lit' | 'water' | 'headwind') {
    app.params[key] = !app.params[key];
    app.persist();
    // Sur iPhone, l'interrupteur natif vibre déjà de lui-même.
    if (!nativeSwitch) haptic('tap');
  }

  const isRun = $derived(!def.bike);
  const paceKey = $derived(p.sport === 'run' ? 'paceRun' : p.sport === 'trail' ? 'paceTrail' : p.sport === 'road' ? 'speedRoad' : 'speedGravel');
  const paceValue = $derived(app.settings[paceKey]);
  function stepPace(dir: 1 | -1) {
    const s = app.settings;
    if (isRun) s[paceKey] = Math.min(720, Math.max(180, s[paceKey] + dir * 10));
    else s[paceKey] = Math.min(45, Math.max(8, s[paceKey] + dir));
    app.saveSettings();
    haptic('tick');
  }
</script>

<div class="composer" class:cards>
  {#if installHint}
    <InstallGuide mode="banner" />
  {:else if qrHint}
    <InstallGuide mode="mac" />
  {/if}
  <div class="set" class:glass={cards} class:photo-card={cards}>
  <Segmented
    label="Sport"
    tall
    value={p.sport}
    options={SPORT_ORDER.map((s) => ({ value: s, label: SPORTS[s].label, icon: SPORT_ICON[s] }))}
    onchange={(s) => app.setSport(s)}
  />

  <RangeField
    id="distance"
    label="Distance"
    value={p.distanceKm}
    min={def.distance.min}
    max={def.distance.max}
    step={def.distance.step}
    display={kmSetting(p.distanceKm)}
    unit="km"
    valuetext="{kmSetting(p.distanceKm)} kilomètres"
    tickEvery={def.bike ? 5 : 1}
    onchange={setDistance}
  />

  <div class="fold" data-fold>
  <RangeField
    id="elevation"
    label="Dénivelé positif"
    value={p.elevation ?? 0}
    min={0}
    max={def.elevation.max}
    step={def.elevation.step}
    display={String(p.elevation ?? 0)}
    unit="m"
    off={p.elevation == null}
    valuetext="{p.elevation ?? 0} mètres de dénivelé positif"
    tickEvery={def.bike ? 100 : 50}
    onchange={(v) => setElevation(v)}
    onreset={() => setElevation(null)}
  />
  </div>
  </div>

  <section class="block" class:glass={cards} class:photo-card={cards} aria-labelledby="env-l">
    <h3 id="env-l" class="field-label">Milieu</h3>
    <EnvChips selected={p.envs} ontoggle={(e) => app.toggleEnv(e)} />
  </section>

  <section class="block" class:glass={cards} class:photo-card={cards} aria-labelledby="shape-l">
    <h3 id="shape-l" class="field-label">Forme</h3>
    <Segmented
      label="Forme du parcours"
      value={p.shape}
      options={(Object.keys(SHAPES) as Shape[]).map((s) => ({ value: s, label: SHAPES[s].label }))}
      onchange={setShape}
    />
    <!-- Sur Mac, ces lieux sont en haut de la colonne, sous le départ. -->
    {#if !app.wide}
      <Stops />
    {/if}
  </section>

  {#if def.surfaces && def.surfaceHint}
    <section class="block" class:glass={cards} class:photo-card={cards} aria-labelledby="surf-l">
      <h3 id="surf-l" class="field-label">Sol</h3>
      <Segmented
        label="Type de sol"
        value={p.surface}
        options={(['a', 'b', 'c'] as Surface[]).map((s) => ({ value: s, label: def.surfaces![s] }))}
        onchange={setSurface}
      />
    </section>
  {/if}

  <section class="block" class:glass={cards} class:photo-card={cards} aria-labelledby="opt-l">
    <h3 id="opt-l" class="field-label">Options</h3>
    <div class="group">
      <label class="row">
        <span class="row-icon"><Icon name="road" /></span>
        <span class="row-label">Éviter les grands axes</span>
        <input class="switch" type="checkbox" use:asSwitch checked={p.avoidBusy} onchange={() => toggle('avoidBusy')} />
      </label>
      {#if p.sport === 'run'}
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
    gap: 16px;
    padding-top: 4px;
  }
  /* Les réglages arrivent l'un après l'autre, juste derrière le panneau qui monte. */
  .composer > :global(*) {
    animation: set-in 520ms var(--ease-out) backwards;
  }
  .composer > :global(*:nth-child(1)) { animation-delay: 140ms; }
  .composer > :global(*:nth-child(2)) { animation-delay: 190ms; }
  .composer > :global(*:nth-child(3)) { animation-delay: 240ms; }
  .composer > :global(*:nth-child(4)) { animation-delay: 290ms; }
  .composer > :global(*:nth-child(5)) { animation-delay: 340ms; }
  .composer > :global(*:nth-child(6)) { animation-delay: 390ms; }
  .composer > :global(*:nth-child(n + 7)) { animation-delay: 440ms; }
  @keyframes set-in {
    from {
      opacity: 0;
      translate: 0 18px;
    }
  }
  .block,
  .set {
    display: grid;
    gap: 10px;
  }
  .set {
    gap: 16px;
  }
  /* En blocs sur la photo : plus d'air entre eux, les listes se fondent dans leur bloc. */
  .cards {
    gap: 12px;
  }
  .cards .block,
  .cards .set {
    padding: 14px 14px 16px;
  }
  .cards .block :global(.group) {
    margin: 0 -6px -6px;
    background: transparent;
  }
  .cards .block h3 {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--label-2);
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
  .fold {
    display: grid;
  }
  @media (max-width: 859px) {
    .composer {
      gap: 14px;
      padding-top: 2px;
    }
    .block {
      gap: 8px;
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
