/*
 * Lentille de verre liquide des onglets, recopiée de Deezer (iOS 26) d'après la vidéo de Romain, image par
 * image : au changement d'onglet, la pastille sombre de l'onglet allumé devient une lentille de verre
 * transparente, plus haute que la barre, qui grossit ce qu'elle couvre (bords irisés). Elle glisse vers le
 * nouvel onglet en s'étirant (jusqu'à 1,6 fois sa largeur), puis se rétracte en pastille. Environ 0,55 s.
 *
 * Safari ne sait pas déformer le fond à travers un filtre : la loupe montre une copie des onglets, agrandie
 * et recalée sur ceux du dessous, image par image (les deux animations sont affines, elles restent alignées).
 */

/** Grossissement de la loupe. */
const MAG = 1.24;

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

/** La lentille de la barre (créée une fois), et sa vue agrandie : une copie des onglets. */
function lensOf(nav: HTMLElement, tabs: HTMLElement[]): { lens: HTMLElement; view: HTMLElement } {
  let lens = nav.querySelector<HTMLElement>(':scope > .lens');
  if (!lens) {
    lens = document.createElement('span');
    lens.className = 'lens';
    lens.setAttribute('aria-hidden', 'true');
    nav.append(lens);
  }
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

/**
 * La lentille part de l'onglet `from` et se pose sur l'onglet `to`. La pastille au repos s'efface pendant le
 * trajet et réapparaît sous la lentille quand celle-ci se rétracte.
 */
export function liquidMove(nav: HTMLElement | null | undefined, from: number, to: number) {
  if (!nav || from === to || from < 0 || reduce()) return;
  const tabs = [...nav.querySelectorAll<HTMLElement>(':scope > .tab')];
  const a = tabs[from];
  const b = tabs[to];
  if (!a || !b) return;
  const { lens, view } = lensOf(nav, tabs);
  const A = box(a);
  const B = box(b);
  // D'après la vidéo : gonfle sur place, s'étire en route, arrive encore grosse, se rétracte.
  const steps: [number, Box, number][] = [
    [0, A, 0],
    [0.14, grow(A, 1.2, 1.36), 1],
    [0.5, grow(between(A, B, 0.6), 1.62, 1.3), 1],
    [0.78, grow(B, 1.18, 1.3), 1],
    [1, B, 0],
  ];
  const ease = 'cubic-bezier(0.32, 0.72, 0.24, 1)';
  const timing: KeyframeAnimationOptions = { duration: 560, easing: 'linear' };
  lens.animate(
    steps.map(([offset, x, opacity]) => ({ offset, easing: ease, opacity, left: `${x.left}px`, top: `${x.top}px`, width: `${x.width}px`, height: `${x.height}px` })),
    timing,
  );
  // La copie agrandie autour du centre de la lentille : un point p des onglets s'affiche en c + MAG·(p − c).
  view.animate(
    steps.map(([offset, x]) => {
      const cx = x.left + x.width / 2;
      const cy = x.top + x.height / 2;
      return { offset, easing: ease, transform: `translate(${x.width / 2 - MAG * cx}px, ${x.height / 2 - MAG * cy}px) scale(${MAG})` };
    }),
    timing,
  );
  const pill = nav.querySelector<HTMLElement>(':scope > .pill-on, :scope > .tab-on');
  pill?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration: 560, easing: 'ease-out' });
}

/** Sous le doigt, sur l'onglet déjà allumé : la lentille gonfle sur place, puis se rétracte au relâché. */
export function liquidPress(nav: HTMLElement | null | undefined, index: number) {
  if (!nav || index < 0 || reduce()) return;
  const tabs = [...nav.querySelectorAll<HTMLElement>(':scope > .tab')];
  const t = tabs[index];
  if (!t) return;
  const { lens, view } = lensOf(nav, tabs);
  const A = box(t);
  const steps: [number, Box, number][] = [
    [0, A, 0],
    [0.4, grow(A, 1.22, 1.36), 1],
    [1, A, 0],
  ];
  const timing: KeyframeAnimationOptions = { duration: 520, easing: 'linear' };
  const ease = 'cubic-bezier(0.32, 0.72, 0.24, 1)';
  lens.animate(
    steps.map(([offset, x, opacity]) => ({ offset, easing: ease, opacity, left: `${x.left}px`, top: `${x.top}px`, width: `${x.width}px`, height: `${x.height}px` })),
    timing,
  );
  view.animate(
    steps.map(([offset, x]) => {
      const cx = x.left + x.width / 2;
      const cy = x.top + x.height / 2;
      return { offset, easing: ease, transform: `translate(${x.width / 2 - MAG * cx}px, ${x.height / 2 - MAG * cy}px) scale(${MAG})` };
    }),
    timing,
  );
}
