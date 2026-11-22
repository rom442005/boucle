/*
 * Lentille de verre liquide des onglets, recopiée de Deezer (iOS 26) d'après la vidéo de Romain, image par
 * image : au changement d'onglet, la pastille sombre de l'onglet allumé devient une lentille de verre
 * transparente, plus haute que la barre, qui grossit ce qu'elle couvre (bords irisés). Elle glisse vers le
 * nouvel onglet en s'étirant, puis se rétracte en pastille.
 *
 * Fluidité (Romain : « cool mais lent ») : elle part dès que le doigt touche l'onglet, dure 0,4 s, et
 * n'anime que des transformations (déplacement, échelle) et l'opacité, que la carte graphique fait seule,
 * sans recalcul de mise en page. Safari ne sait pas déformer le fond à travers un filtre : la loupe montre
 * une copie des onglets, agrandie et recalée sur ceux du dessous.
 */

/** Grossissement de la loupe. */
const MAG = 1.24;
const DURATION = 400;
const EASE = 'cubic-bezier(0.3, 0.75, 0.25, 1)';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function box(el: HTMLElement): Box {
  return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}
/** La boîte agrandie autour de son centre. */
function grow(b: Box, sx: number, sy: number): Box {
  return { left: b.left + (b.width * (1 - sx)) / 2, top: b.top + (b.height * (1 - sy)) / 2, width: b.width * sx, height: b.height * sy };
}
function between(a: Box, b: Box, k: number): Box {
  return { left: a.left + (b.left - a.left) * k, top: a.top + (b.top - a.top) * k, width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k };
}

/** La lentille de la barre (créée une fois, à la taille d'un onglet), et sa vue agrandie : une copie des onglets. */
function lensOf(nav: HTMLElement, tabs: HTMLElement[], base: Box): { lens: HTMLElement; view: HTMLElement } {
  let lens = nav.querySelector<HTMLElement>(':scope > .lens');
  if (!lens) {
    lens = document.createElement('span');
    lens.className = 'lens';
    lens.setAttribute('aria-hidden', 'true');
    nav.append(lens);
  }
  lens.style.width = `${base.width}px`;
  lens.style.height = `${base.height}px`;
  // La copie est refaite à chaque passage : l'onglet allumé et la photo du profil ont pu changer.
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
    c.tabIndex = -1;
    view.append(c);
  }
  lens.replaceChildren(view);
  return { lens, view };
}

/** Une étape : la lentille posée sur la boîte X (transformation de sa taille d'onglet), et sa vue agrandie. */
function frames(steps: [number, Box, number][], base: Box) {
  const lens: Keyframe[] = [];
  const view: Keyframe[] = [];
  for (const [offset, x, opacity] of steps) {
    const sx = x.width / base.width;
    const sy = x.height / base.height;
    lens.push({ offset, easing: EASE, opacity, transform: `translate(${x.left}px, ${x.top}px) scale(${sx}, ${sy})` });
    // Un point p des onglets s'affiche en c + MAG·(p − c), c centre de la lentille, une fois l'échelle de la lentille compensée.
    const cx = x.left + x.width / 2;
    const cy = x.top + x.height / 2;
    view.push({
      offset,
      easing: EASE,
      transform: `translate(${((1 - MAG) * cx - x.left) / sx}px, ${((1 - MAG) * cy - x.top) / sy}px) scale(${MAG / sx}, ${MAG / sy})`,
    });
  }
  return { lens, view };
}

function play(nav: HTMLElement, steps: [number, Box, number][], base: Box, tabs: HTMLElement[]) {
  const { lens, view } = lensOf(nav, tabs, base);
  const k = frames(steps, base);
  const timing: KeyframeAnimationOptions = { duration: DURATION, easing: 'linear' };
  lens.getAnimations().forEach((a) => a.cancel());
  lens.animate(k.lens, timing);
  view.animate(k.view, timing);
}

/**
 * La lentille part de l'onglet `from` et se pose sur l'onglet `to`. La pastille au repos s'efface pendant le
 * trajet et réapparaît sous la lentille quand celle-ci se rétracte.
 */
export function liquidMove(nav: HTMLElement | null | undefined, from: number, to: number) {
  if (!nav || from === to || from < 0 || to < 0 || reduce()) return;
  const tabs = [...nav.querySelectorAll<HTMLElement>(':scope > .tab')];
  const a = tabs[from];
  const b = tabs[to];
  if (!a || !b) return;
  const A = box(a);
  const B = box(b);
  // D'après la vidéo : gonfle sur place, s'étire en route, arrive encore grosse, se rétracte.
  play(
    nav,
    [
      [0, A, 0],
      [0.12, grow(A, 1.18, 1.34), 1],
      [0.5, grow(between(A, B, 0.62), 1.55, 1.28), 1],
      [0.8, grow(B, 1.15, 1.26), 1],
      [1, B, 0],
    ],
    A,
    tabs,
  );
  const pill = nav.querySelector<HTMLElement>(':scope > .pill-on, :scope > .tab-on');
  pill?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.78 }, { opacity: 1 }], { duration: DURATION, easing: 'ease-out' });
}

/** Sous le doigt, sur l'onglet déjà allumé : la lentille gonfle sur place, puis se rétracte. */
export function liquidPress(nav: HTMLElement | null | undefined, index: number) {
  if (!nav || index < 0 || reduce()) return;
  const tabs = [...nav.querySelectorAll<HTMLElement>(':scope > .tab')];
  const t = tabs[index];
  if (!t) return;
  const A = box(t);
  play(
    nav,
    [
      [0, A, 0],
      [0.4, grow(A, 1.2, 1.34), 1],
      [1, A, 0],
    ],
    A,
    tabs,
  );
}

/**
 * Onglets qui lancent la lentille dès le toucher (avant le clic) : le changement d'onglet qui suit ne la
 * relance pas. Renvoie `true` si la lentille vient déjà de partir vers cet onglet.
 */
let launched: { nav: HTMLElement; to: number; at: number } | null = null;
export function liquidStart(nav: HTMLElement | null | undefined, from: number, to: number) {
  if (!nav) return;
  if (from === to) liquidPress(nav, to);
  else {
    liquidMove(nav, from, to);
    launched = { nav, to, at: performance.now() };
  }
}
export function liquidAlready(nav: HTMLElement | null | undefined, to: number): boolean {
  return !!launched && launched.nav === nav && launched.to === to && performance.now() - launched.at < 900;
}
