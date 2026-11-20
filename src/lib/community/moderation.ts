/*
 * Premier filtre des textes publiés (noms, descriptions, commentaires), comme l'exige l'App Store pour
 * un contenu créé par les membres : insultes et injures sont refusées avant l'envoi (pas les simples
 * jurons, ni les mots qui ont un autre sens, comme « retard »). Le reste
 * passe par les signalements, lus par l'éditeur, et par le blocage d'une personne.
 */

const WORDS = [
  'connard',
  'connasse',
  'conne',
  'con',
  'salope',
  'salaud',
  'pute',
  'encule',
  'enculé',
  'enculer',
  'batard',
  'bâtard',
  'nique',
  'niquer',
  'ntm',
  'fdp',
  'pd',
  'pédé',
  'tapette',
  'gouine',
  'negre',
  'nègre',
  'bougnoule',
  'youpin',
  'bicot',
  'chintok',
  'debile',
  'débile',
  'abruti',
  'fuck',
  'fucking',
  'bitch',
  'asshole',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'whore',
  'slut',
];

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Lettres déguisées : 4 → a, 3 → e, 1 → i, 0 → o, $ → s, @ → a.
    .replace(/[4@]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/\$/g, 's');

const BANNED = new Set(WORDS.map(strip));

/** Un texte acceptable, ou la raison du refus. */
export function checkText(text: string): string | null {
  const words = strip(text).split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BANNED.has(w))) return 'Ce texte contient des mots blessants : reformule-le pour le publier.';
  // Liens : refusés (publicité, hameçonnage).
  if (/https?:\/\/|www\.|\.(com|fr|net|org|io)\b/i.test(text)) return 'Les liens ne sont pas acceptés.';
  return null;
}
