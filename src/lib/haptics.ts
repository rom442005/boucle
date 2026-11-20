/*
 * Retour haptique.
 * - Android et autres : API Vibration.
 * - iPhone : Safari n'a pas d'API de vibration. Basculer un interrupteur natif
 *   (<input type="checkbox" switch>) joue le « tic » du système.
 *   - iOS 17.4 à 26.4 : on peut le basculer depuis le code (étiquette cliquée par script).
 *   - Depuis iOS 26.5, seul un vrai toucher sur l'interrupteur ou sur son étiquette le fait vibrer.
 *     D'où `tactile` : une étiquette invisible posée sur un bouton ; le doigt qui touche le bouton
 *     touche en fait l'étiquette, qui bascule l'interrupteur caché (le tic), puis le clic remonte
 *     au bouton comme d'habitude. Les vrais interrupteurs (options) vibrent d'eux-mêmes.
 *   Un curseur qu'on fait glisser ne peut plus vibrer sur iPhone : son retour est visuel.
 * - App iPhone (App Store) : le moteur de vibrations du système, partout, curseurs compris.
 */
import { isIOS, isNativeApp } from './platform';

export type Haptic = 'tick' | 'tap' | 'success' | 'warn';

const PATTERN: Record<Haptic, number | number[]> = {
  tick: 6,
  tap: 10,
  success: [10, 70, 16],
  warn: [18, 50, 18],
};

/** Interrupteur natif d'iOS (vibre au toucher sur iPhone) : Safari 17.4 et suivants (pas dans l'app native). */
export const nativeSwitch = !isNativeApp && isIOS && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;

/** Vibrations de l'app native (Capacitor), chargées à la demande. */
type NativeHaptics = typeof import('@capacitor/haptics');
let native: Promise<NativeHaptics> | null = isNativeApp ? import('@capacitor/haptics') : null;
function nativeHaptic(kind: Haptic) {
  void native
    ?.then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
      if (kind === 'warn') return Haptics.notification({ type: NotificationType.Warning });
      if (kind === 'tick') return Haptics.selectionChanged();
      return Haptics.impact({ style: ImpactStyle.Light });
    })
    .catch(() => (native = null));
}

const SWITCH_ID = 'haptique';
let label: HTMLLabelElement | null = null;
/** Dernier toucher passé par une étiquette tactile : le tic a déjà été joué par le système. */
let viaLabel = 0;

function ensureSwitch(): HTMLLabelElement {
  if (label) return label;
  const wrap = document.createElement('div');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:fixed;left:-20px;top:-20px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = SWITCH_ID;
  input.tabIndex = -1;
  label = document.createElement('label');
  label.htmlFor = SWITCH_ID;
  wrap.append(input, label);
  document.body.append(wrap);
  // Un toucher sur une étiquette tactile : noté avant que le bouton ne réagisse (phase de capture).
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.classList?.contains('tactile')) viaLabel = performance.now();
    },
    true,
  );
  return label;
}

let last = 0;

/** Petit retour tactile. Les « tick » rapprochés (curseur qu'on fait glisser) sont espacés d'au moins 45 ms. */
export function haptic(kind: Haptic = 'tick') {
  const now = performance.now();
  if (kind === 'tick' && now - last < 45) return;
  last = now;
  try {
    if (native) {
      nativeHaptic(kind);
    } else if (typeof navigator.vibrate === 'function' && !isIOS) {
      navigator.vibrate(PATTERN[kind]);
    } else if (isIOS) {
      // Le doigt vient de toucher une étiquette tactile : iOS a déjà joué son tic.
      if (now - viaLabel < 80) return;
      ensureSwitch().click();
      if (kind === 'success' || kind === 'warn') setTimeout(() => label?.click(), 80);
    }
  } catch {
    /* sans retour haptique */
  }
}

/**
 * Action Svelte (iPhone) : une étiquette invisible couvre l'élément touché. Le toucher bascule
 * l'interrupteur caché, et iOS joue son tic, y compris depuis iOS 26.5. Sans effet ailleurs.
 */
export function tactile(node: HTMLElement) {
  if (!nativeSwitch) return;
  ensureSwitch();
  const l = document.createElement('label');
  l.htmlFor = SWITCH_ID;
  l.className = 'tactile';
  l.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
  node.append(l);
  return {
    destroy() {
      l.remove();
    },
  };
}

/** Action Svelte : transforme une case à cocher en interrupteur natif quand c'est possible. */
export function asSwitch(node: HTMLInputElement) {
  node.setAttribute('switch', '');
  if (nativeSwitch) node.classList.add('native');
}
