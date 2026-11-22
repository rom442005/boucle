/*
 * Lentille de verre liquide des onglets, recopiée de Deezer (iOS 26) d'après la vidéo de Romain, relevée image
 * par image (60 par seconde) : au toucher, la pastille sombre de l'onglet allumé se soulève en une lentille de
 * verre claire, plus haute que la barre, qui grossit ce qu'elle couvre (bords irisés). Elle file vers l'onglet
 * touché en s'étirant (un dixième de seconde), s'y attarde tant que le doigt est posé, puis redescend en
 * pastille au relâchement. Sur iPhone, le doigt peut aussi glisser le long de la barre : la lentille le suit et
 * choisit l'onglet où il se lève. La page change d'un coup pendant le trajet, sans fondu, comme chez Deezer.
 *
 * Fluidité (Romain : « un peu saccadé ») : un seul mouvement continu, celui d'un ressort, calculé d'avance
 * image par image (120 par seconde) et joué par la carte graphique (déplacement, échelle, opacité) : rien ne
 * ralentit pour repartir, et le travail de la nouvelle page ne peut pas le freiner. Safari ne sait pas déformer
 * le fond à travers un filtre : la loupe montre une copie des onglets, agrandie et recalée sur ceux du dessous.
 */

/** Grossissement dans la lentille. */
const MAG = 1.22;
/** Lentille soulevée, par rapport à un onglet : plus large, et plus haute que la barre. */
const LIFT_W = 1.36;
const LIFT_H = 1.3;
/** Étirement le plus fort en route (part de la largeur), et vitesse (px/s) qui le donne. */
const STRETCH_MAX = 0.42;
const STRETCH_SPEED = 2900;
/** Montée de la lentille, trajet (ressort), redescente en pastille. */
const LIFT_MS = 70;
const UP_MS = 230;
const DOWN_MS = 190;
/** Ressort du trajet : vif, à peine un rebond (ω en rad/s, ζ amortissement). */
const TRAVEL = { w: 32, z: 0.8 };
const SETTLE = { w: 40, z: 0.9 };
const STEP = 1000 / 120;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Un instant de la lentille : centre, soulèvement (0 pastille, 1 lentille), vitesse, opacités. */
interface Frame {
  cx: number;
  lift: number;
  v: number;
  op: number;
  pill: number;
}
interface Bar {
  nav: HTMLElement;
  lens: HTMLElement;
  view: HTMLElement;
  pill: HTMLElement | null;
  base: Box;
  centers: number[];
}

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Réponse d'un ressort lâché de 0 vers 1 : position et vitesse (par seconde) au temps s (secondes). */
function spring(s: number, { w, z }: { w: number; z: number }) {
  if (s <= 0) return { p: 0, dp: 0 };
  const wd = w * Math.sqrt(1 - z * z);
  const e = Math.exp(-z * w * s);
  return {
    p: 1 - e * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s)),
    dp: ((w * e) / Math.sqrt(1 - z * z)) * Math.sin(wd * s),
  };
}

const tabsOf = (nav: HTMLElement) => [...nav.querySelectorAll<HTMLElement>(':scope > .tab')];

/** La barre, mesurée, avec sa lentille (créée une fois) et la copie des onglets refaite à chaque geste. */
function barOf(nav: HTMLElement): Bar | null {
  const tabs = tabsOf(nav);
  if (!tabs.length) return null;
  const t0 = tabs[0];
  const base = { left: t0.offsetLeft, top: t0.offsetTop, width: t0.offsetWidth, height: t0.offsetHeight };
  let lens = nav.querySelector<HTMLElement>(':scope > .lens');
  if (!lens) {
    lens = document.createElement('span');
    lens.className = 'lens';
    lens.setAttribute('aria-hidden', 'true');
    nav.append(lens);
  }
  lens.style.width = `${base.width}px`;
  lens.style.height = `${base.height}px`;
  // L'onglet allumé et la photo du profil ont pu changer : la copie est refaite.
  const view = document.createElement('span');
  view.className = 'lens-view';
  view.setAttribute('inert', '');
  const cs = getComputedStyle(nav);
  view.style.width = `${nav.clientWidth}px`;
  view.style.height = `${nav.clientHeight}px`;
  view.style.padding = cs.padding;
  view.style.gridTemplateColumns = cs.gridTemplateColumns;
  for (const t of tabs) {
    const c = t.cloneNode(true) as HTMLElement;
    c.removeAttribute('aria-current');
    c.removeAttribute('id');
    c.tabIndex = -1;
    view.append(c);
  }
  lens.replaceChildren(view);
  return {
    nav,
    lens,
    view,
    pill: nav.querySelector<HTMLElement>(':scope > .pill-on, :scope > .tab-on'),
    base,
    centers: tabs.map((t) => t.offsetLeft + t.offsetWidth / 2),
  };
}

/** La boîte de la lentille à un instant : soulevée, elle grandit ; en route, elle s'étire et s'aplatit un peu. */
function boxAt(b: Bar, f: Frame): Box {
  const stretch = Math.min(STRETCH_MAX, Math.abs(f.v) / STRETCH_SPEED) * f.lift;
  const width = b.base.width * (1 + (LIFT_W - 1) * f.lift) * (1 + stretch);
  const height = (b.base.height * (1 + (LIFT_H - 1) * f.lift)) / (1 + 0.35 * stretch);
  return { left: f.cx - width / 2, top: b.base.top + b.base.height / 2 - height / 2, width, height };
}

/** Les transformations de la lentille et de sa vue agrandie (qui reste calée sur les onglets du dessous). */
function styleAt(b: Bar, f: Frame) {
  const x = boxAt(b, f);
  const sx = x.width / b.base.width;
  const sy = x.height / b.base.height;
  // Un point p des onglets s'affiche en c + MAG·(p − c), c centre de la lentille, échelle de la lentille compensée.
  const cx = x.left + x.width / 2;
  const cy = x.top + x.height / 2;
  return {
    lens: `translate(${x.left.toFixed(2)}px, ${x.top.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
    view: `translate(${(((1 - MAG) * cx - x.left) / sx).toFixed(2)}px, ${(((1 - MAG) * cy - x.top) / sy).toFixed(2)}px) scale(${(MAG / sx).toFixed(4)}, ${(MAG / sy).toFixed(4)})`,
  };
}

/** Montée : la lentille se soulève (de l0 à 1) et file de x0 à x1 sur un ressort. */
function upAt(t: number, x0: number, x1: number, l0: number, op0: number): Frame {
  const s = spring((t - 12) / 1000, TRAVEL);
  return {
    cx: x0 + (x1 - x0) * s.p,
    v: (x1 - x0) * s.dp,
    lift: l0 + (1 - l0) * easeOut(clamp01(t / LIFT_MS)),
    op: op0 + (1 - op0) * clamp01(t / 45),
    pill: 0,
  };
}

/** Redescente : la lentille se pose sur x1 (ressort court si le doigt l'a lâchée entre deux onglets) et redevient pastille. */
function downAt(t: number, x0: number, x1: number, l0: number): Frame {
  const u = clamp01(t / DOWN_MS);
  const s = spring(t / 1000, SETTLE);
  return {
    cx: x0 + (x1 - x0) * s.p,
    v: (x1 - x0) * s.dp,
    lift: l0 * (1 - easeInOut(u)),
    op: u < 0.42 ? 1 : 1 - easeInOut((u - 0.42) / 0.58),
    pill: easeOut(clamp01((u - 0.3) / 0.6)),
  };
}

/** Une phase, échantillonnée 120 fois par seconde, prête pour la carte graphique. */
function keyframes(b: Bar, ms: number, at: (t: number) => Frame) {
  const lens: Keyframe[] = [];
  const view: Keyframe[] = [];
  const pill: Keyframe[] = [];
  const n = Math.max(2, Math.ceil(ms / STEP));
  for (let i = 0; i <= n; i++) {
    const t = (ms * i) / n;
    const f = at(t);
    const st = styleAt(b, f);
    const offset = i / n;
    lens.push({ offset, transform: st.lens, opacity: f.op });
    view.push({ offset, transform: st.view });
    pill.push({ offset, opacity: f.pill });
  }
  return { lens, view, pill };
}

/**
 * Le geste en cours sur une barre : la montée (ou le glissé du doigt), puis la redescente programmée ; de quoi
 * savoir où se trouve la lentille à tout instant, pour qu'un nouveau geste reparte de là sans saut.
 */
interface Gesture {
  bar: Bar;
  t0: number;
  up: { x0: number; x1: number; l0: number; op0: number };
  drag: { x: number; v: number; lift: number } | null;
  down: { start: number; x0: number; x1: number; l0: number } | null;
  anims: Animation[];
  /** onglet visé par le toucher */
  to: number;
}

const gestures = new WeakMap<HTMLElement, Gesture>();

function stop(g: Gesture) {
  for (const a of g.anims) a.cancel();
  g.anims = [];
}

/** Où en est la lentille maintenant. */
function now(g: Gesture): Frame {
  const t = performance.now();
  if (g.down && t >= g.down.start) return downAt(Math.min(t - g.down.start, DOWN_MS), g.down.x0, g.down.x1, g.down.l0);
  if (g.drag) return { cx: g.drag.x, v: g.drag.v, lift: g.drag.lift, op: 1, pill: 0 };
  return upAt(Math.min(t - g.t0, UP_MS), g.up.x0, g.up.x1, g.up.l0, g.up.op0);
}

function play(g: Gesture, ms: number, at: (t: number) => Frame, delay: number, withPill: boolean) {
  const k = keyframes(g.bar, ms, at);
  // « forwards » seulement : pendant son délai, la phase suivante laisse jouer la précédente (pas de saut).
  const timing: KeyframeAnimationOptions = { duration: ms, delay, easing: 'linear', fill: 'forwards' };
  const a = [g.bar.lens.animate(k.lens, timing), g.bar.view.animate(k.view, timing)];
  if (g.bar.pill && withPill) a.push(g.bar.pill.animate(k.pill, timing));
  g.anims.push(...a);
  return a[0];
}

/** La pastille reste effacée (sous la lentille). */
function hidePill(g: Gesture, from: number) {
  if (g.bar.pill) g.anims.push(g.bar.pill.animate([{ opacity: from }, { opacity: 0 }], { duration: from > 0 ? 60 : 1, fill: 'forwards' }));
}

/** Le doigt se pose sur l'onglet `to` (l'onglet allumé est `from`) : la lentille se soulève et y file. */
function press(nav: HTMLElement, from: number, to: number): Gesture | null {
  const bar = barOf(nav);
  if (!bar || from < 0 || to < 0 || to >= bar.centers.length) return null;
  const prev = gestures.get(nav);
  // Un geste encore en cours : on repart d'où se trouve la lentille, sans repasser par la pastille.
  const f = prev ? now(prev) : null;
  if (prev) {
    prev.drag = null;
    stop(prev);
  }
  const live = !!f && f.op > 0.05;
  const g: Gesture = {
    bar,
    t0: performance.now(),
    up: { x0: live ? f!.cx : bar.centers[from], x1: bar.centers[to], l0: live ? f!.lift : 0, op0: live ? f!.op : 0 },
    drag: null,
    down: null,
    anims: [],
    to,
  };
  gestures.set(nav, g);
  const { x0, x1, l0, op0 } = g.up;
  play(g, UP_MS, (t) => upAt(t, x0, x1, l0, op0), 0, false);
  hidePill(g, f ? f.pill : 1);
  return g;
}

/** Le doigt se lève : la lentille finit son trajet, puis redescend en pastille sur l'onglet `to`. */
function release(nav: HTMLElement, to: number) {
  const g = gestures.get(nav);
  if (!g || g.down) return;
  const t = performance.now();
  let start = t;
  let x0: number;
  let l0: number;
  if (!g.drag && to === g.to) {
    // La redescente s'enchaîne exactement à la fin de la montée, réglée d'avance sur la carte graphique :
    // le travail de la nouvelle page ne peut pas la retarder.
    start = Math.max(t, g.t0 + UP_MS);
    x0 = g.up.x1;
    l0 = 1;
  } else {
    const f = now(g);
    g.drag = null;
    stop(g);
    g.bar.lens.style.removeProperty('transform');
    g.bar.lens.style.removeProperty('opacity');
    g.bar.view.style.removeProperty('transform');
    hidePill(g, 0);
    x0 = f.cx;
    l0 = f.lift;
  }
  const x1 = g.bar.centers[to];
  g.down = { start, x0, x1, l0 };
  const last = play(g, DOWN_MS, (u) => downAt(u, x0, x1, l0), start - t, true);
  last.onfinish = () => {
    if (gestures.get(nav) !== g) return;
    stop(g);
    gestures.delete(nav);
  };
}

/** Un changement d'onglet venu d'ailleurs (bulle rose, clavier, retour) : la lentille fait tout le trajet. */
export function liquidMove(nav: HTMLElement | null | undefined, from: number, to: number) {
  if (!nav || from === to || from < 0 || to < 0 || reduce()) return;
  if (press(nav, from, to)) release(nav, to);
}

/*
 * Glisser le doigt le long de la barre (iPhone) : la lentille, soulevée, suit le doigt sur un ressort court et
 * s'étire avec sa vitesse ; elle choisira l'onglet où le doigt se lève.
 */
function drag(nav: HTMLElement, g: Gesture, pointerX: () => number) {
  const f = now(g);
  stop(g);
  hidePill(g, 0);
  const d = (g.drag = { x: f.cx, v: f.v, lift: f.lift });
  const b = g.bar;
  const lo = b.centers[0];
  const hi = b.centers[b.centers.length - 1];
  let last = performance.now();
  const frame = () => {
    if (gestures.get(nav) !== g || g.drag !== d) return;
    const t = performance.now();
    const dt = Math.min(0.032, (t - last) / 1000);
    last = t;
    const target = Math.min(hi, Math.max(lo, pointerX() - nav.getBoundingClientRect().left));
    // Ressort critique (ω = 38) : suit le doigt sans retard visible et sans trembler.
    const w = 38;
    d.v += (w * w * (target - d.x) - 2 * w * d.v) * dt;
    d.x += d.v * dt;
    d.lift += (1 - d.lift) * Math.min(1, dt * 18);
    const st = styleAt(b, { cx: d.x, lift: d.lift, v: d.v, op: 1, pill: 0 });
    b.lens.style.transform = st.lens;
    b.lens.style.opacity = '1';
    b.view.style.transform = st.view;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** L'onglet le plus proche d'une position (dans la barre). */
const nearest = (b: Bar, x: number) => b.centers.reduce((best, c, i) => (Math.abs(c - x) < Math.abs(b.centers[best] - x) ? i : best), 0);

/**
 * Action Svelte sur la barre d'onglets (`.tab` enfants directs, pastille `.pill-on` ou `.tab-on`) :
 * `active` l'onglet allumé, `pick(i)` choisit un onglet (après un glissé du doigt ; le simple toucher passe
 * par le clic de l'onglet, comme d'habitude).
 */
export function liquidTabs(nav: HTMLElement, params: { active: number; pick: (i: number) => void }) {
  let p = params;
  let shown = p.active;
  /** dernier choix fait par un glissé : le clic qui suit est ignoré */
  let picked = 0;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || reduce()) return;
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab');
    const tabs = tabsOf(nav);
    const i = tab ? tabs.indexOf(tab) : -1;
    if (i < 0) return;
    const g = press(nav, p.active, i);
    if (!g) return;
    shown = i;
    const startX = e.clientX;
    let px = e.clientX;
    let dragging = false;
    const move = (m: PointerEvent) => {
      if (m.pointerId !== e.pointerId) return;
      px = m.clientX;
      if (!dragging && e.pointerType !== 'mouse' && Math.abs(px - startX) > 10 && gestures.get(nav) === g && !g.down) {
        dragging = true;
        drag(nav, g, () => px);
      }
    };
    const up = (u: PointerEvent) => {
      if (u.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (gestures.get(nav) !== g) return;
      if (dragging) {
        const to = nearest(g.bar, now(g).cx);
        release(nav, to);
        shown = to;
        picked = performance.now();
        if (to !== p.active) p.pick(to);
      } else if (u.type === 'pointercancel') {
        // Geste repris par le système (défilement) : la lentille revient sur l'onglet allumé.
        shown = p.active;
        release(nav, p.active);
      } else release(nav, i);
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  // Après un glissé, le clic éventuel sur l'onglet de départ ne doit rien changer.
  const onClick = (e: MouseEvent) => {
    if (performance.now() - picked < 500) {
      e.stopPropagation();
      e.preventDefault();
      picked = 0;
    }
  };
  nav.addEventListener('pointerdown', onDown);
  nav.addEventListener('click', onClick, true);
  return {
    update(next: { active: number; pick: (i: number) => void }) {
      const before = p.active;
      p = next;
      // Changement venu d'ailleurs (pas du doigt sur la barre) : la lentille fait le trajet.
      if (next.active !== before && next.active !== shown) liquidMove(nav, before, next.active);
      shown = next.active;
    },
    destroy() {
      nav.removeEventListener('pointerdown', onDown);
      nav.removeEventListener('click', onClick, true);
      const g = gestures.get(nav);
      if (g) stop(g);
      gestures.delete(nav);
    },
  };
}
