/*
 * Les émojis proposés pour une liste ou un lieu, rangés par thème, chacun avec ses mots en français pour la
 * recherche (« boulangerie » trouve 🥖, « piscine » trouve 🏊, « maman » trouve 👩).
 */

export interface EmojiGroup {
  name: string;
  items: [emoji: string, words: string][];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: 'Lieux de vie',
    items: [
      ['🏠', 'maison domicile chez moi foyer logement'],
      ['🏡', 'maison jardin pavillon campagne'],
      ['🏘️', 'quartier maisons lotissement voisins'],
      ['🏢', 'bureau immeuble travail entreprise'],
      ['💼', 'travail boulot job bureau mallette'],
      ['🏫', 'école collège lycée classe'],
      ['🎓', 'école université fac études diplôme campus'],
      ['🏥', 'hôpital clinique urgences santé'],
      ['🩺', 'médecin docteur cabinet santé kiné'],
      ['💊', 'pharmacie médicament'],
      ['🦷', 'dentiste dent'],
      ['🏦', 'banque argent'],
      ['🏛️', 'musée mairie monument institution'],
      ['🏤', 'poste courrier'],
      ['📮', 'boîte aux lettres poste courrier'],
      ['🏨', 'hôtel nuit séjour'],
      ['⛺', 'camping tente bivouac'],
      ['🏕️', 'camping nature bivouac'],
      ['🛖', 'cabane refuge hutte'],
      ['🏰', 'château fort'],
      ['⛪', 'église chapelle'],
      ['🕌', 'mosquée'],
      ['🕍', 'synagogue'],
      ['🛕', 'temple'],
      ['🏭', 'usine industrie zone'],
      ['🏗️', 'chantier grue construction'],
      ['🏬', 'magasin centre commercial grand magasin'],
      ['🏪', 'épicerie supérette commerce'],
      ['🛒', 'courses supermarché caddie'],
      ['🛍️', 'shopping boutique achats'],
      ['💈', 'coiffeur barbier'],
      ['💇', 'coiffeur coupe cheveux salon'],
      ['📚', 'bibliothèque médiathèque livres'],
      ['🎭', 'théâtre spectacle'],
      ['🎬', 'cinéma film'],
      ['🎵', 'musique concert'],
      ['🎤', 'karaoké concert chanteur'],
      ['🎨', 'art atelier peinture galerie'],
      ['🖼️', 'galerie exposition tableau'],
      ['🎡', 'fête foraine manège parc attractions'],
      ['🎢', 'parc attractions montagnes russes'],
      ['🎪', 'cirque chapiteau'],
      ['🗿', 'monument statue'],
      ['🗽', 'statue monument'],
      ['⛲', 'fontaine place'],
      ['🌉', 'pont'],
      ['🗼', 'tour phare'],
      ['🏟️', 'stade arène'],
      ['⛽', 'station essence carburant'],
      ['🔌', 'borne recharge électrique'],
      ['🅿️', 'parking stationnement'],
      ['🚻', 'toilettes wc'],
      ['🚰', 'eau potable point eau fontaine robinet'],
    ],
  },
  {
    name: 'Gens',
    items: [
      ['👪', 'famille parents'],
      ['👨‍👩‍👧‍👦', 'famille enfants'],
      ['👩', 'maman mère femme'],
      ['👨', 'papa père homme'],
      ['👵', 'grand-mère mamie mémé'],
      ['👴', 'grand-père papi pépé'],
      ['👶', 'bébé crèche nounou'],
      ['🧒', 'enfant'],
      ['👫', 'amis couple copains'],
      ['💑', 'couple amoureux'],
      ['❤️', 'amour cœur favori préféré'],
      ['🧡', 'cœur orange'],
      ['💛', 'cœur jaune'],
      ['💚', 'cœur vert'],
      ['💙', 'cœur bleu'],
      ['💜', 'cœur violet'],
      ['🖤', 'cœur noir'],
      ['🤝', 'rendez-vous rencontre accord'],
      ['🧑‍🍳', 'cuisinier chef'],
      ['🧑‍🏫', 'professeur prof enseignant'],
      ['🧑‍⚕️', 'soignant infirmier médecin'],
      ['🧑‍💻', 'travail télétravail ordinateur développeur'],
      ['👮', 'police gendarmerie commissariat'],
      ['🧑‍🚒', 'pompiers caserne'],
      ['🐶', 'chien toutou promenade'],
      ['🐱', 'chat'],
      ['🐴', 'cheval équitation centre équestre poney'],
    ],
  },
  {
    name: 'Sport',
    items: [
      ['🏃', 'course running footing courir jogging'],
      ['🏃‍♀️', 'course runneuse courir femme'],
      ['🚴', 'vélo cyclisme route'],
      ['🚵', 'vtt vélo tout terrain gravel'],
      ['🥾', 'randonnée rando marche chaussures trail'],
      ['🚶', 'marche promenade balade piéton'],
      ['🧗', 'escalade grimpe bloc salle'],
      ['🏊', 'piscine natation nager'],
      ['🏄', 'surf vague'],
      ['🚣', 'aviron canoë kayak'],
      ['🛶', 'canoë kayak'],
      ['⛵', 'voile bateau port'],
      ['🏋️', 'musculation salle de sport muscu gym'],
      ['🤸', 'gym gymnastique'],
      ['🧘', 'yoga méditation pilates'],
      ['🥊', 'boxe combat'],
      ['🥋', 'judo karaté arts martiaux dojo'],
      ['🤺', 'escrime'],
      ['⚽', 'foot football terrain'],
      ['🏀', 'basket basketball'],
      ['🏐', 'volley volleyball'],
      ['🏉', 'rugby'],
      ['🎾', 'tennis'],
      ['🏓', 'ping-pong tennis de table'],
      ['🏸', 'badminton'],
      ['⛳', 'golf'],
      ['🏒', 'hockey'],
      ['⛸️', 'patinoire patin glace'],
      ['🛹', 'skate skatepark'],
      ['🛼', 'roller patins'],
      ['⛷️', 'ski station neige'],
      ['🏂', 'snowboard surf neige'],
      ['🎳', 'bowling'],
      ['🏆', 'trophée victoire compétition'],
      ['🥇', 'médaille or premier record'],
      ['🏅', 'médaille course finisher'],
      ['⏱️', 'chrono temps fractionné'],
      ['🎽', 'maillot course dossard'],
      ['👟', 'baskets chaussures running'],
      ['🏁', 'arrivée ligne course drapeau'],
    ],
  },
  {
    name: 'Nature',
    items: [
      ['🌳', 'parc arbre forêt jardin'],
      ['🌲', 'forêt sapin bois'],
      ['🌴', 'palmier vacances'],
      ['🌿', 'nature plante herbe réserve'],
      ['🍀', 'trèfle chance'],
      ['🌷', 'fleur jardin tulipe'],
      ['🌸', 'fleur cerisier printemps'],
      ['🌻', 'tournesol champ fleur'],
      ['🍂', 'automne feuilles'],
      ['🍄', 'champignon cueillette'],
      ['⛰️', 'montagne sommet colline'],
      ['🏔️', 'montagne neige sommet'],
      ['🌋', 'volcan'],
      ['🏞️', 'vallée parc naturel paysage lac rivière'],
      ['🏜️', 'désert dune'],
      ['🏖️', 'plage sable mer'],
      ['🏝️', 'île plage'],
      ['🌊', 'mer océan vague'],
      ['💧', 'eau goutte source'],
      ['🦆', 'canard étang mare'],
      ['🐟', 'poisson pêche'],
      ['🎣', 'pêche'],
      ['🦋', 'papillon'],
      ['🐦', 'oiseau observatoire'],
      ['🌅', 'lever de soleil aube'],
      ['🌄', 'point de vue panorama'],
      ['🌇', 'coucher de soleil ville'],
      ['🌙', 'nuit lune'],
      ['⭐', 'étoile favori préféré'],
      ['☀️', 'soleil été beau temps'],
      ['🌈', 'arc-en-ciel'],
      ['❄️', 'neige hiver froid'],
      ['🔥', 'feu tendance chaud'],
    ],
  },
  {
    name: 'Manger, boire',
    items: [
      ['☕', 'café pause'],
      ['🍵', 'thé salon de thé'],
      ['🥐', 'croissant boulangerie viennoiserie'],
      ['🥖', 'boulangerie pain baguette'],
      ['🍰', 'pâtisserie gâteau'],
      ['🧁', 'cupcake pâtisserie'],
      ['🍦', 'glace glacier'],
      ['🍫', 'chocolat chocolatier'],
      ['🍕', 'pizza pizzeria'],
      ['🍔', 'burger fast-food'],
      ['🌮', 'tacos mexicain'],
      ['🍣', 'sushi japonais'],
      ['🍜', 'ramen nouilles asiatique'],
      ['🥗', 'salade healthy'],
      ['🍝', 'pâtes italien'],
      ['🥩', 'boucherie viande'],
      ['🧀', 'fromage fromagerie'],
      ['🐟', 'poissonnerie poisson'],
      ['🍎', 'fruits primeur pomme'],
      ['🥕', 'légumes marché potager'],
      ['🧺', 'marché panier pique-nique'],
      ['🍽️', 'restaurant resto repas'],
      ['🍷', 'vin bar cave'],
      ['🍺', 'bière bar pub'],
      ['🍹', 'cocktail bar'],
      ['🥤', 'boisson soda'],
      ['🍾', 'fête champagne'],
    ],
  },
  {
    name: 'Transports',
    items: [
      ['🚗', 'voiture'],
      ['🚙', 'voiture 4x4'],
      ['🚌', 'bus car arrêt'],
      ['🚋', 'tram tramway'],
      ['🚆', 'train gare'],
      ['🚉', 'gare quai'],
      ['🚇', 'métro'],
      ['🚲', 'vélo bicyclette station'],
      ['🛴', 'trottinette'],
      ['🛵', 'scooter'],
      ['🏍️', 'moto'],
      ['✈️', 'avion aéroport voyage'],
      ['🚢', 'bateau ferry'],
      ['⛴️', 'ferry navette bac'],
      ['⚓', 'port ancre marine'],
      ['🚕', 'taxi'],
      ['🚏', 'arrêt bus'],
      ['🛣️', 'route autoroute'],
      ['🚦', 'feu carrefour'],
    ],
  },
  {
    name: 'Repères',
    items: [
      ['📍', 'repère lieu point épingle'],
      ['🚩', 'drapeau repère objectif'],
      ['🏳️', 'drapeau blanc'],
      ['🎯', 'objectif cible but'],
      ['🗺️', 'carte itinéraire voyage'],
      ['🧭', 'boussole orientation'],
      ['🔭', 'observatoire point de vue'],
      ['📸', 'photo spot photo'],
      ['🎒', 'sac à dos voyage aventure'],
      ['🧳', 'valise voyage vacances'],
      ['🎁', 'cadeau'],
      ['🎉', 'fête soirée'],
      ['🎂', 'anniversaire'],
      ['🔑', 'clé location appartement'],
      ['🔒', 'secret privé'],
      ['💡', 'idée'],
      ['📌', 'punaise à voir à faire'],
      ['✅', 'fait vu visité'],
      ['❓', 'à découvrir mystère'],
      ['💤', 'repos sieste'],
      ['🛏️', 'dormir lit nuit'],
      ['🚿', 'douche vestiaire'],
      ['🧺', 'laverie linge'],
      ['💻', 'ordinateur coworking'],
      ['📞', 'téléphone appel'],
      ['💰', 'argent économie'],
      ['🙂', 'sourire content'],
      ['😍', 'coup de cœur adore'],
      ['😎', 'cool détente'],
      ['🤩', 'génial incroyable'],
      ['👍', 'bien pouce top'],
    ],
  },
];

/** Tous les émojis, sans doublon, dans l'ordre des thèmes. */
export const ALL_EMOJIS: [string, string][] = (() => {
  const seen = new Map<string, string>();
  for (const g of EMOJI_GROUPS) for (const [e, w] of g.items) seen.set(e, seen.has(e) ? `${seen.get(e)} ${w}` : w);
  return [...seen];
})();

const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Les émojis qui vont avec un texte, du plus au moins juste : un mot exact d'abord, puis un mot qui commence
 * pareil, puis un mot qui le contient (le premier mot, sens principal, passe devant à égalité) ; tous les mots cherchés doivent trouver (« salle sport » → 🏋️).
 */
export function searchEmojis(q: string, limit = 48): string[] {
  const terms = fold(q).split(/[\s,'’-]+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: [string, number][] = [];
  for (const [e, w] of ALL_EMOJIS) {
    const words = fold(w).split(/[\s-]+/);
    let total = 0;
    for (const t of terms) {
      let best = 0;
      for (const [i, x] of words.entries()) {
        // Le premier mot est le sens principal de l'émoji : à égalité, il passe devant.
        const lead = i === 0 ? 0.5 : 0;
        if (x === t) best = Math.max(best, 3 + lead);
        else if (x.startsWith(t)) best = Math.max(best, 2 + lead);
        else if ((t.length >= 3 && x.includes(t)) || (x.length >= 4 && t.startsWith(x))) best = Math.max(best, 1 + lead);
      }
      if (!best) {
        total = 0;
        break;
      }
      total += best;
    }
    if (total) scored.push([e, total]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([e]) => e);
}
