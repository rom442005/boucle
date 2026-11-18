/*
 * Retour haptique.
 * - Android et autres : API Vibration.
 * - iPhone : Safari n'a pas d'API de vibration. Basculer un interrupteur natif
 *   (<input type="checkbox" switch>) joue le « tic » du système : on en bascule un, caché.
 *   Apple ne le permet plus depuis iOS 26.5 quand la bascule vient du code ; seuls les vrais
 *   interrupteurs touchés du doigt vibrent encore (voir Composer, options).
 */
import { isIOS } from './platform';

export type Haptic = 'tick' | 'tap' | 'success' | 'warn';

const PATTERN: Record<Haptic, number | number[]> = {
  tick: 6,
  tap: 10,
  success: [10, 70, 16],
  warn: [18, 50, 18],
};

let label: HTMLLabelElement | null = null;
function iosTick() {
  if (!label) {
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:-20px;top:-20px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'haptique';
    input.tabIndex = -1;
    label = document.createElement('label');
    label.htmlFor = 'haptique';
    wrap.append(input, label);
    document.body.append(wrap);
  }
  label.click();
}

let last = 0;

/** Petit retour tactile. Les « tick » rapprochés (curseur qu'on fait glisser) sont espacés d'au moins 45 ms. */
export function haptic(kind: Haptic = 'tick') {
  const now = performance.now();
  if (kind === 'tick' && now - last < 45) return;
  last = now;
  try {
    if (typeof navigator.vibrate === 'function' && !isIOS) {
      navigator.vibrate(PATTERN[kind]);
    } else if (isIOS) {
      iosTick();
      if (kind === 'success' || kind === 'warn') setTimeout(iosTick, 80);
    }
  } catch {
    /* sans retour haptique */
  }
}

/** Interrupteur natif d'iOS (vibre au toucher sur iPhone) : Safari 17.4 et suivants. */
export const nativeSwitch = isIOS && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;

/** Action Svelte : transforme une case à cocher en interrupteur natif quand c'est possible. */
export function asSwitch(node: HTMLInputElement) {
  node.setAttribute('switch', '');
  if (nativeSwitch) node.classList.add('native');
}
