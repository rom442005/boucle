/*
 * Horaires d'ouverture OpenStreetMap (clé opening_hours), lus pour dire d'un coup d'œil « Ouvert · jusqu'à 20 h »
 * ou « Fermé · ouvre demain à 8 h 30 », et donner les horaires du jour.
 *
 * Formes lues (les plus courantes en France) : 24/7 ; règles séparées par « ; » (une règle plus loin remplace les
 * précédentes pour les jours qu'elle couvre) ou par « , » (règle additionnelle, elle s'ajoute) ; périodes de
 * l'année (Jul-Aug, Oct 23-Nov 17, Sep-Jun, Jan 01) ; jours (Mo-Fr, Sa,Su) ; plages (08:30-12:00,14:00-18:00) ;
 * off / closed. Les jours fériés (PH) sont ignorés faute de calendrier. Une forme inconnue (sunrise, week…) ne
 * donne pas d'état : les horaires sont alors montrés tels quels, traduits.
 */

export interface Hours {
  /** ouvert maintenant ; null si on ne sait pas le dire */
  open: boolean | null;
  /** « Ouvert · jusqu'à 20 h », « Fermé · ouvre à 14 h », « Ouvert 24 h/24 »… */
  label: string;
  /** horaires du jour (« 8 h 30 – 17 h 30 »), « fermé », ou null */
  today: string | null;
  /** version courte, pour une petite carte (« Ouvre demain 8 h 30 », « Jusqu'à 19 h ») */
  short: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAY_FR: Record<string, string> = { Mo: 'lun.', Tu: 'mar.', We: 'mer.', Th: 'jeu.', Fr: 'ven.', Sa: 'sam.', Su: 'dim.', PH: 'fériés' };

interface Rule {
  /** périodes de l'année, en mois*100+jour (1er janvier = 101) ; vide : toute l'année */
  dates: [number, number][];
  /** jours de la semaine (0 = dimanche) ; null : tous ; vide : seulement des fériés (ignorée) */
  days: Set<number> | null;
  /** plages en minutes ; vide : fermé */
  ranges: [number, number][];
  /** règle additionnelle (séparée par une virgule) */
  add: boolean;
}

const MONTH_RE = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
/** la même, sans groupe capturant (pour découper sans garder le mois dans les morceaux) */
const MONTH_NC = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

/** « Oct 23-Nov 17 », « Jul-Aug », « Jan 01 », « Sep-Jun » → périodes. */
function parseDates(s: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(new RegExp(`^${MONTH_RE}(?:\\s*(\\d{1,2}))?(?:\\s*-\\s*${MONTH_RE}?(?:\\s*(\\d{1,2}))?)?$`));
    if (!m) return null;
    const m1 = MONTHS.indexOf(m[1]) + 1;
    const d1 = m[2] ? Number(m[2]) : 1;
    let m2: number;
    let d2: number;
    if (m[3] || m[4]) {
      m2 = m[3] ? MONTHS.indexOf(m[3]) + 1 : m1;
      d2 = m[4] ? Number(m[4]) : 31;
    } else {
      // Un mois seul : tout le mois ; une date seule : ce jour-là.
      m2 = m1;
      d2 = m[2] ? d1 : 31;
    }
    out.push([m1 * 100 + d1, m2 * 100 + d2]);
  }
  return out;
}

/** « Mo-Fr », « Sa,Su,PH » → jours (0 = dimanche). */
function parseDays(s: string): Set<number> | null {
  const set = new Set<number>();
  for (const part of s.split(',')) {
    const p = part.trim();
    if (p === 'PH') continue;
    const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      set.add(d);
      if (d === b) break;
    }
  }
  return set;
}

const toMin = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};

/** « 08:30-12:00,14:00-18:00 » → plages en minutes (une plage qui passe minuit s'arrête à minuit). */
function parseRanges(s: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = toMin(m[1]);
    let b = toMin(m[2]);
    if (b <= a) b = 24 * 60;
    out.push([a, b]);
  }
  return out;
}

function parseRule(raw: string, add: boolean): Rule | null {
  let s = raw.trim().replace(/:\s/g, ' ').replace(/:$/, '');
  if (!s) return null;
  // Période de l'année, en tête.
  let dates: [number, number][] = [];
  const dm = s.match(new RegExp(`^((?:${MONTH_RE}(?:\\s*\\d{1,2})?(?:\\s*-\\s*${MONTH_RE}?(?:\\s*\\d{1,2})?)?\\s*,?\\s*)+)(?=\\s|$)`));
  if (dm && dm[1].trim()) {
    const d = parseDates(dm[1].trim().replace(/,$/, ''));
    if (!d) return null;
    dates = d;
    s = s.slice(dm[1].length).trim();
  }
  // Jours de la semaine.
  let days: Set<number> | null = null;
  const wm = s.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)(?=\s|$)/);
  if (wm) {
    days = parseDays(wm[1].replace(/,$/, ''));
    if (!days) return null;
    s = s.slice(wm[1].length).trim();
  }
  // Plages, ou fermé.
  if (/^(off|closed)$/i.test(s)) return { dates, days, ranges: [], add };
  if (!s) return null;
  const ranges = parseRanges(s);
  if (!ranges) return null;
  return { dates, days, ranges, add };
}

/** Les règles, ou null si une seule n'est pas comprise. */
function parse(oh: string): Rule[] | null {
  const rules: Rule[] = [];
  for (const block of oh.split(';')) {
    // Virgule suivie d'une espace puis d'un mois ou d'un jour : une règle additionnelle.
    const parts = block.split(new RegExp(`,\\s+(?=(?:${MONTH_NC}|Mo|Tu|We|Th|Fr|Sa|Su|PH)\\b)`));
    for (const [i, p] of parts.entries()) {
      if (!p.trim()) continue;
      const r = parseRule(p, i > 0);
      if (!r) return null;
      rules.push(r);
    }
  }
  return rules.length ? rules : null;
}

const inDates = (dates: [number, number][], md: number) =>
  !dates.length || dates.some(([a, b]) => (a <= b ? md >= a && md <= b : md >= a || md <= b));

/** Les plages d'un jour donné. */
function rangesOn(rules: Rule[], day: Date): [number, number][] {
  const md = (day.getMonth() + 1) * 100 + day.getDate();
  const wd = day.getDay();
  let out: [number, number][] = [];
  for (const r of rules) {
    if (r.days && !r.days.size) continue; // fériés seulement
    if (!inDates(r.dates, md)) continue;
    if (r.days && !r.days.has(wd)) continue;
    out = r.add ? [...out, ...r.ranges] : [...r.ranges];
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** 510 → « 8 h 30 », 1200 → « 12 h ». */
export function hm(min: number): string {
  if (min >= 24 * 60) return 'minuit';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Les horaires tels quels, en français (quand on ne sait pas les lire). */
export function humanize(oh: string): string {
  return oh
    .replace(/\bMo-Su\b/g, 'tous les jours')
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY_FR[d])
    .replace(new RegExp(`\\b${MONTH_RE}\\b`, 'g'), (m) => MONTH_FR[MONTHS.indexOf(m)])
    .replace(/\boff\b|\bclosed\b/g, 'fermé')
    .replace(/sunrise/g, 'lever du soleil')
    .replace(/sunset/g, 'coucher du soleil')
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => hm(Number(h) * 60 + Number(m)))
    .replace(/\s*;\s*/g, ' · ');
}

/** Ouvert maintenant ? Et les horaires du jour. */
export function readHours(oh: string | null | undefined, now = new Date()): Hours | null {
  const s = oh?.trim();
  if (!s) return null;
  if (/^24\/7$/.test(s)) return { open: true, label: 'Ouvert 24 h/24', today: '24 h/24', short: 'Ouvert 24 h/24' };
  const rules = parse(s);
  if (!rules) {
    const h = humanize(s);
    return { open: null, label: h, today: null, short: h };
  }
  const today = rangesOn(rules, now);
  const t = now.getHours() * 60 + now.getMinutes();
  const todayText = today.length ? today.map(([a, b]) => `${hm(a)} – ${hm(b)}`).join(', ') : 'fermé';
  const cur = today.find(([a, b]) => t >= a && t < b);
  if (cur) {
    const until = cur[1] >= 24 * 60 ? 'minuit' : hm(cur[1]);
    return { open: true, label: `Ouvert · jusqu’à ${until}`, today: todayText, short: `Ouvert · ${until}` };
  }
  const next = today.find(([a]) => a > t);
  if (next) return { open: false, label: `Fermé · ouvre à ${hm(next[0])}`, today: todayText, short: `Ouvre à ${hm(next[0])}` };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tm = rangesOn(rules, tomorrow);
  return tm.length
    ? { open: false, label: `Fermé · ouvre demain à ${hm(tm[0][0])}`, today: todayText, short: `Ouvre demain ${hm(tm[0][0])}` }
    : { open: false, label: 'Fermé aujourd’hui', today: todayText, short: 'Fermé aujourd’hui' };
}
