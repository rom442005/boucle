import { SCENES, SCENE_MS, sceneAt } from './scenes';

/*
 * La photo du moment, la même partout (fil rouge, DESIGN.md) : le fond des écrans à photo la montre, et la
 * carte Paysage en prend la teinte (bords voilés, ciel en 3D). Elle change toutes les cinq minutes.
 */
export const sceneNow = $state({ i: sceneAt() });

/** Teinte dominante de la photo du moment. */
export const sceneTone = () => SCENES[sceneNow.i].tone;

if (typeof window !== 'undefined') {
  const next = () => {
    sceneNow.i = sceneAt();
    setTimeout(next, SCENE_MS - (Date.now() % SCENE_MS) + 50);
  };
  setTimeout(next, SCENE_MS - (Date.now() % SCENE_MS) + 50);
  // Retour sur l'app après une pause : la photo du moment.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sceneNow.i = sceneAt();
  });
}

/** Mélange de deux couleurs hexadécimales (t = part de la seconde). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, '0')).join('');
}
