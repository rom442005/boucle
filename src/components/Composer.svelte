<script lang="ts">
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import RangeField from './RangeField.svelte';
  import EnvChips from './EnvChips.svelte';
  import InstallGuide from './InstallGuide.svelte';
  import Stops from './Stops.svelte';
  import { app } from '../lib/state.svelte';
  import { isDesktop, isIOS, isStandalone } from '../lib/platform';
  import { asSwitch, haptic, nativeSwitch } from '../lib/haptics';
  import { elevationLevel, SHAPES, SPORTS, SPORT_ORDER } from '../lib/sports';
  import { kmSetting, pace, speed } from '../lib/format';
  import type { Shape, Surface } from '../lib/types';
  import type { IconName } from '../lib/icons';

  const SPORT_ICON: Record<string, IconName> = { run: 'run', trail: 'hike', road: 'bicycle', gravel: 'bike' };

  // Dans Safari sur iPhone (pas encore installée) : rappel pour l'ajouter à l'écran d'accueil.
  const installHint = $derived(isIOS && !isStandalone && !app.flags.installVu);
  // Sur Mac : bandeau qui affiche le QR code à scanner avec l'iPhone.
  const qrHint = $derived(isDesktop && !app.flags.qrVu);

  const p = $derived(app.params);
  const def = $derived(SPORTS[p.sport]);
  const elevKm = $derived(p.elevation != null ? p.elevation / Math.max(p.distanceKm, 0.1) : 0);

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
    if (s === 'oneway' && !app.destination) app.search = 'destination';
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

<div class="composer">
  {#if installHint}
    <InstallGuide mode="banner" />
  {:else if qrHint}
    <InstallGuide mode="mac" />
  {/if}
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
  >
    {#snippet sub()}
      <span>{elevationLevel(p.elevation ?? 0, p.distanceKm)}</span>
      <span class="tabular">{Math.round(elevKm)} m par km</span>
    {/snippet}
  </RangeField>
  </div>

  <section class="block" aria-labelledby="env-l">
    <h3 id="env-l" class="field-label">Milieu</h3>
    <EnvChips selected={p.envs} ontoggle={(e) => app.toggleEnv(e)} />
    <p class="hint">{p.envs.length ? 'Les parcours passent en priorité par ces milieux, s’il y en a autour du départ.' : 'Peu importe : touche un milieu pour le privilégier.'}</p>
  </section>

  <section class="block" aria-labelledby="shape-l">
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
    <section class="block" aria-labelledby="surf-l">
      <h3 id="surf-l" class="field-label">Sol</h3>
      <Segmented
        label="Type de sol"
        value={p.surface}
        options={(['a', 'b', 'c'] as Surface[]).map((s) => ({ value: s, label: def.surfaces![s] }))}
        onchange={setSurface}
      />
      <p class="hint">{def.surfaceHint[p.surface]}</p>
    </section>
  {/if}

  <section class="block" aria-labelledby="opt-l">
    <h3 id="opt-l" class="field-label">Options</h3>
    <div class="group">
      <label class="row">
        <span class="row-icon"><Icon name="road" /></span>
        <span class="row-label">Éviter les grands axes<span class="row-sub">Routes à fort trafic évitées quand c’est possible</span></span>
        <input class="switch" type="checkbox" use:asSwitch checked={p.avoidBusy} onchange={() => toggle('avoidBusy')} />
      </label>
      {#if p.sport === 'run'}
        <label class="row">
          <span class="row-icon"><Icon name="bulb" /></span>
          <span class="row-label">Rues éclairées<span class="row-sub">Pour courir à la nuit tombée</span></span>
          <input class="switch" type="checkbox" use:asSwitch checked={p.lit} onchange={() => toggle('lit')} />
        </label>
      {/if}
      <label class="row">
        <span class="row-icon"><Icon name="drop" /></span>
        <span class="row-label">Points d’eau<span class="row-sub">Fontaines connues sur le parcours</span></span>
        <input class="switch" type="checkbox" use:asSwitch checked={p.water} onchange={() => toggle('water')} />
      </label>
      {#if def.bike && p.shape !== 'oneway'}
        <label class="row">
          <span class="row-icon"><Icon name="wind" /></span>
          <span class="row-label">Partir face au vent<span class="row-sub">Vent dans le dos pour rentrer, selon la météo du moment</span></span>
          <input class="switch" type="checkbox" use:asSwitch checked={p.headwind} onchange={() => toggle('headwind')} />
        </label>
      {/if}
      <div class="row">
        <span class="row-icon"><Icon name="gauge" /></span>
        <span class="row-label">{isRun ? 'Allure' : 'Vitesse moyenne'}<span class="row-sub">Pour estimer la durée</span></span>
        <div class="stepper" role="group" aria-label={isRun ? 'Allure' : 'Vitesse moyenne'}>
          <button type="button" aria-label={isRun ? 'Allure plus rapide' : 'Moins vite'} onclick={() => stepPace(-1)}><Icon name="minus" size={14} /></button>
          <output class="tabular" aria-live="polite">{isRun ? pace(paceValue) : speed(paceValue)}</output>
          <button type="button" aria-label={isRun ? 'Allure plus lente' : 'Plus vite'} onclick={() => stepPace(1)}><Icon name="plus" size={14} /></button>
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
  .block {
    display: grid;
    gap: 10px;
  }
  .block h3 {
    margin: 0;
  }
  .hint {
    margin: -2px 0 0;
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
