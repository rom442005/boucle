import { isNativeApp } from './platform';

/*
 * Apple Santé (HealthKit) : seulement dans l'app iPhone (Capacitor) ; un site web n'y a pas accès.
 * Lecture seule : pas, fréquence cardiaque au repos, VO2 max, entraînements course et vélo.
 */
export const healthPossible = isNativeApp && /iPhone|iPad|iPod/.test(navigator.userAgent);

export interface HealthData {
  /** moyenne de pas par jour sur 7 jours */
  steps: number;
  restingHr: number | null;
  vo2max: number | null;
  /** entraînements course et vélo sur 28 jours */
  workouts: { count: number; distance: number; time: number };
  /** dernière sortie, avec l'app qui l'a enregistrée (Strava, Montre, Kiprun…) */
  last: { sport: 'run' | 'ride' | 'walk'; distance: number; time: number; date: string; source: string | null } | null;
}

const READ = ['steps', 'restingHeartRate', 'vo2Max', 'workouts', 'distance'] as const;

async function plugin() {
  return (await import('@capgo/capacitor-health')).Health;
}

export async function connectHealth(): Promise<boolean> {
  const H = await plugin();
  const ok = await H.isAvailable();
  if (!ok.available) return false;
  await H.requestAuthorization({ read: [...READ] });
  return true;
}

export async function readHealth(): Promise<HealthData> {
  const H = await plugin();
  const now = new Date();
  const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const [steps, rest, vo2, wk] = await Promise.all([
    H.queryAggregated({ dataType: 'steps', startDate: iso(7), endDate: now.toISOString(), bucket: 'day', aggregation: 'sum' }).catch(() => null),
    H.readSamples({ dataType: 'restingHeartRate', startDate: iso(14), limit: 1 }).catch(() => null),
    H.readSamples({ dataType: 'vo2Max', startDate: iso(180), limit: 1 }).catch(() => null),
    H.queryWorkouts({ startDate: iso(28), limit: 200 }).catch(() => null),
  ]);
  const days = (steps as { samples?: { value?: number }[] } | null)?.samples ?? [];
  const total = days.reduce((a, s) => a + (s.value ?? 0), 0);
  const last = (r: unknown) => ((r as { samples?: { value?: number }[] } | null)?.samples?.[0]?.value ?? null);
  const moves = (wk?.workouts ?? []).filter((w) => /running|cycling|hiking|walking|trackAndField|bikingStationary|runningTreadmill/.test(w.workoutType));
  const l = [...moves].sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate))[0];
  return {
    steps: days.length ? Math.round(total / days.length) : 0,
    restingHr: last(rest),
    vo2max: last(vo2),
    workouts: {
      count: moves.length,
      distance: moves.reduce((a, w) => a + (w.totalDistance ?? 0), 0),
      time: moves.reduce((a, w) => a + (w.duration ?? 0), 0),
    },
    last: l
      ? {
          sport: /cycling|biking/i.test(l.workoutType) ? 'ride' : /walking|hiking/i.test(l.workoutType) ? 'walk' : 'run',
          distance: l.totalDistance ?? 0,
          time: l.duration ?? 0,
          date: l.startDate,
          source: l.sourceName ?? null,
        }
      : null,
  };
}
