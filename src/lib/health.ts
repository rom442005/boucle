import { isNativeApp } from './platform';
import type { HealthDay, HealthWorkout } from './community/types';

/*
 * Santé du téléphone, dans l'app native (Capacitor) : Apple Santé sur iPhone, Health Connect sur Android
 * (Samsung, Pixel, Xiaomi… : toutes les apps de santé y écrivent). Un site web n'y a pas accès : l'app lit,
 * puis envoie au serveur de Boucle, et le profil affiche ces données sur tous les appareils.
 * Lecture seule : pas, fréquence au repos, VO2 max, sorties (course, vélo, marche).
 */
export const healthPlatform: 'ios' | 'android' | null = isNativeApp ? (/Android/i.test(navigator.userAgent) ? 'android' : 'ios') : null;

// Calories : Android ne calcule la distance d'une sortie qu'avec ce droit (sinon, calcul de secours plus lent).
const READ = ['steps', 'restingHeartRate', 'vo2Max', 'workouts', 'distance', 'calories', 'totalCalories'] as const;

/*
 * Le module est chargé à la demande. Attention : le module natif (Health) ne doit jamais être la valeur
 * d'une promesse. Capacitor répond à toute propriété, y compris « then », et la promesse croirait tenir
 * une autre promesse (« Health.then() is not implemented »). On passe donc par le module entier.
 */
let loaded: Promise<typeof import('@capgo/capacitor-health')> | null = null;
const healthModule = () => (loaded ??= import('@capgo/capacitor-health'));

export type HealthAccess = 'ok' | 'unavailable' | 'denied';

/** Demande l'accord (la feuille de Santé ou de Health Connect s'ouvre). */
export async function askHealth(): Promise<HealthAccess> {
  const { Health: H } = await healthModule();
  const a = await H.isAvailable();
  if (!a.available) return 'unavailable';
  const st = await H.requestAuthorization({ read: [...READ] });
  return st.readAuthorized.length || healthPlatform === 'ios' ? 'ok' : 'denied';
}

/** Ouvre Health Connect (Android), où l'on donne ou retire l'accord. */
export async function openHealthSettings() {
  const { Health: H } = await healthModule();
  await H.openHealthConnectSettings().catch(() => {});
}

/** Android 13 et avant : Health Connect s'installe (ou se met à jour) depuis le Play Store. */
export function installHealthConnect() {
  location.href = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';
}

/** L'accord tient-il encore ? Android le dit ; l'iPhone ne dit jamais ce qui est refusé en lecture. */
export async function healthStillAllowed(): Promise<boolean> {
  if (healthPlatform !== 'android') return true;
  const { Health: H } = await healthModule();
  const st = await H.checkAuthorization({ read: [...READ] }).catch(() => null);
  return !st || st.readAuthorized.length > 0;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function sportOf(type: string): HealthWorkout['sport'] {
  if (/cycl|bik/i.test(type)) return 'ride';
  if (/walk|hik/i.test(type)) return 'walk';
  if (/run|track/i.test(type)) return 'run';
  return 'other';
}

/*
 * Nom lisible de l'app qui a enregistré une sortie. Android ne donne que l'identifiant de l'app
 * (« com.strava ») ; l'iPhone donne déjà un nom, gardé tel quel.
 */
const APPS: Record<string, string> = {
  'com.strava': 'Strava',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.huawei.health': 'Huawei Santé',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.polar.polarflow': 'Polar Flow',
  'com.stt.android.suunto': 'Suunto',
  'com.withings.wiscale2': 'Withings',
  'com.ouraring.oura': 'Oura',
  'com.nike.plusgps': 'Nike Run Club',
  'com.runtastic.android': 'adidas Running',
  'com.komoot.android': 'komoot',
  'com.whoop.android': 'WHOOP',
  'fr.boucle.parcours': 'Boucle',
};
const VAGUE = new Set(['android', 'google', 'sec', 'app', 'apps', 'mobile', 'samsung', 'health']);

export function appName(source: string | null | undefined): string | null {
  if (!source) return null;
  if (APPS[source]) return APPS[source];
  if (!/^[a-z]\w*(\.\w+)+$/i.test(source)) return source;
  const part = source.split('.').slice(1).find((p) => p.length > 2 && !VAGUE.has(p.toLowerCase()));
  return part ? part[0].toUpperCase() + part.slice(1) : null;
}

/** Le jour d'une tranche : son milieu, pour qu'un changement d'heure ne la fasse pas glisser d'un jour. */
const middle = (from: string, to?: string) => new Date((Date.parse(from) + Date.parse(to ?? from)) / 2);

/** Les 28 derniers jours, jour par jour, prêts à envoyer. */
export async function readHealthDays(): Promise<HealthDay[]> {
  const { Health: H } = await healthModule();
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 27);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const [steps, rest, vo2, wk, walk, kcal] = await Promise.all([
    H.queryAggregated({ dataType: 'steps', ...range, bucket: 'day', aggregation: 'sum' }).catch(() => null),
    H.readSamples({ dataType: 'restingHeartRate', ...range, limit: 200 }).catch(() => null),
    H.readSamples({ dataType: 'vo2Max', ...range, limit: 50 }).catch(() => null),
    H.queryWorkouts({ ...range, limit: 300 }).catch(() => null),
    H.queryAggregated({ dataType: 'distance', ...range, bucket: 'day', aggregation: 'sum' }).catch(() => null),
    H.queryAggregated({ dataType: 'calories', ...range, bucket: 'day', aggregation: 'sum' }).catch(() => null),
  ]);
  // Tout a échoué (accord retiré, Health Connect saturé) : rien à envoyer, le serveur garde le dernier envoi.
  if (!steps && !rest && !vo2 && !wk) throw new Error('Santé illisible pour le moment');
  const src = healthPlatform ?? 'ios';
  const days = new Map<string, HealthDay>();
  const at = (when: Date) => {
    const k = dayKey(when);
    let d = days.get(k);
    if (!d) days.set(k, (d = { day: k, steps: null, restingHr: null, vo2max: null, distance: 0, workouts: [], source: src, walkM: null, activeKcal: null, exerciseMin: null }));
    return d;
  };
  for (let i = 0; i < 28; i++) at(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
  for (const s of steps?.samples ?? []) at(middle(s.startDate, s.endDate)).steps = Math.round(s.value);
  for (const s of walk?.samples ?? []) at(middle(s.startDate, s.endDate)).walkM = Math.round(s.value);
  for (const s of kcal?.samples ?? []) at(middle(s.startDate, s.endDate)).activeKcal = Math.round(s.value);
  for (const s of rest?.samples ?? []) {
    const d = at(new Date(s.startDate));
    if (d.restingHr == null) d.restingHr = s.value;
  }
  for (const s of vo2?.samples ?? []) {
    const d = at(new Date(s.startDate));
    if (d.vo2max == null) d.vo2max = s.value;
  }
  const outings = (wk?.workouts ?? []).map((w) => ({ w, sport: sportOf(w.workoutType) })).filter((o) => o.sport !== 'other');
  // Sans le droit « calories » (refusé dans Health Connect), Android ne donne pas la distance d'une sortie :
  // on l'additionne alors nous-mêmes sur la durée de la sortie.
  const meters = await Promise.all(
    outings.map(async ({ w }) => {
      if (w.totalDistance != null) return w.totalDistance;
      const r = await H.queryAggregated({ dataType: 'distance', startDate: w.startDate, endDate: w.endDate, bucket: 'day', aggregation: 'sum' }).catch(() => null);
      return (r?.samples ?? []).reduce((a, s) => a + (s.value ?? 0), 0);
    }),
  );
  outings.forEach(({ w, sport }, i) => {
    const d = at(new Date(w.startDate));
    d.workouts.push({ sport, distance: Math.round(meters[i]), time: Math.round(w.duration ?? 0), start: w.startDate, source: appName(w.sourceName), kcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : null });
    d.distance += Math.round(meters[i]);
  });
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Ce que le profil affiche, d'après les journées reçues. */
export interface HealthSummary {
  /** le jour affiché : aujourd'hui s'il a des données, sinon le dernier jour reçu */
  today: { day: string; isToday: boolean; steps: number | null; walkM: number | null; kcal: number | null; exercise: number | null };
  /** les 7 derniers jours, du plus ancien au plus récent (pas) */
  week: { day: string; steps: number }[];
  /** moyenne des pas par jour sur 7 jours */
  steps: number;
  restingHr: number | null;
  vo2max: number | null;
  /** sorties des 28 derniers jours (m, app native) */
  distance: number;
  /** marche et course des 28 derniers jours (m) */
  walk28: number;
  last: (HealthWorkout & { day: string }) | null;
  source: 'ios' | 'android';
  /** dernier envoi reçu */
  updatedAt: string | null;
}

export function summarize(days: HealthDay[]): HealthSummary | null {
  if (!days.length) return null;
  const lastOf = <K extends 'restingHr' | 'vo2max'>(k: K) => [...days].reverse().find((d) => d[k] != null)?.[k] ?? null;
  const all = days.flatMap((d) => d.workouts.map((w) => ({ ...w, day: d.day })));
  all.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const now = new Date();
  const todayKey = dayKey(now);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const shown = byDay.get(todayKey) ?? [...days].reverse().find((d) => d.steps != null || d.walkM != null) ?? days[days.length - 1];
  const week = Array.from({ length: 7 }, (_, i) => {
    const k = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i));
    return { day: k, steps: byDay.get(k)?.steps ?? 0 };
  });
  const recent = days.slice(-7).filter((d) => d.steps != null);
  const updated = days.map((d) => d.updatedAt).filter(Boolean).sort().pop() ?? null;
  return {
    today: {
      day: shown.day,
      isToday: shown.day === todayKey,
      steps: shown.steps,
      walkM: shown.walkM ?? null,
      kcal: shown.activeKcal ?? null,
      exercise: shown.exerciseMin ?? null,
    },
    week,
    steps: recent.length ? Math.round(recent.reduce((a, d) => a + (d.steps ?? 0), 0) / recent.length) : 0,
    restingHr: lastOf('restingHr'),
    vo2max: lastOf('vo2max'),
    distance: days.reduce((a, d) => a + d.distance, 0),
    walk28: days.reduce((a, d) => a + (d.walkM ?? 0), 0),
    last: all[0] ? { ...all[0], source: appName(all[0].source) } : null,
    source: days[days.length - 1].source,
    updatedAt: updated,
  };
}
