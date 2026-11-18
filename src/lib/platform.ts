/* Plateforme, lue une fois au chargement. */

const ua = navigator.userAgent;

/** iPhone ou iPad (l'iPad se présente comme un Mac, mais tactile). */
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/** Lancée depuis l'écran d'accueil (ou le Dock), sans l'interface du navigateur. */
export const isStandalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Ordinateur (souris ou pavé tactile) : un QR code y sert à ouvrir l'app sur l'iPhone. */
export const isDesktop = !isIOS && !isAndroid && matchMedia('(pointer: fine)').matches;
