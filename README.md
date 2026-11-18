# Boucle

Crée des parcours de course et de vélo sur mesure, sur iPhone comme sur Mac : on choisit le sport, la distance, le dénivelé, le milieu traversé, le type de sol et la forme, et Boucle propose trois parcours qui respectent la demande. On peut ensuite les comparer, les enregistrer, les exporter en GPX ou les suivre en direct.

## Installer l'app

L'app est une web app installable : pas d'App Store, mises à jour automatiques.

- **iPhone** : ouvrir l'adresse de l'app dans Safari, toucher le bouton Partager, puis « Sur l'écran d'accueil ». Une icône Boucle apparaît : elle s'ouvre en plein écran, comme une app. Autoriser la localisation au premier lancement. Depuis le Mac, le bouton en forme de téléphone (en haut de la colonne) affiche un QR code à viser avec l'appareil photo de l'iPhone.
- **Mac (Safari)** : menu Fichier, puis « Ajouter au Dock ».
- **Mac (Chrome)** : icône d'installation à droite de la barre d'adresse.

## Utilisation

1. **Départ** : ta position, une adresse, un point touché sur la carte, ou un appui long sur la carte (clic droit sur Mac). Le point de départ se déplace aussi en le faisant glisser.
2. **Sport** : course, trail, vélo de route, gravel ou VTT. Chaque sport utilise un réseau différent (trottoirs et parcs, sentiers, routes goudronnées, chemins).
3. **Distance** et **dénivelé positif** : le dénivelé reste « indifférent » tant qu'on ne touche pas son curseur. Le cercle en pointillés sur la carte montre jusqu'où la boucle peut aller.
4. **Milieu** : forêt, bord de l'eau, parcs, campagne ou ville. Les parcours passent en priorité par ces milieux quand il y en a autour du départ.
5. **Forme** : boucle, aller-retour, ou vers un lieu (avec une destination).
6. **Sol** et **options** : bitume, mixte ou chemins ; éviter les grands axes ; rues éclairées pour courir de nuit ; points d'eau ; départ face au vent (vélo) ; allure ou vitesse pour estimer la durée.

Chaque proposition affiche la distance, le dénivelé, la durée estimée, ce qu'elle respecte de la demande, les milieux traversés, la répartition des sols et le profil d'altitude. Le tracé est coloré selon la pente, du rose clair (plat) au grenat (montée raide), comme le profil. Glisser le doigt sur le profil déplace une loupe sur la carte.

Actions :

- **Favori** : le parcours rejoint « Mes parcours », onglet Favoris.
- **Fait** : ajoute la sortie du jour à l'historique.
- **GPX** : fichier pour Garmin Connect, Coros, Suunto, Strava ou Kiprun. Sur iPhone, la feuille de partage permet de l'envoyer directement à l'app de la montre ou de l'enregistrer dans Fichiers.
- **Partager** : un lien qui contient tout le parcours. L'ouvrir sur l'autre appareil (iPhone ou Mac), puis toucher Enregistrer. C'est ainsi qu'on passe un parcours du Mac à l'iPhone.
- **Inverser** : même parcours dans l'autre sens.
- **Suivre ce parcours** : position en direct sur le tracé, distance faite et restante, alerte si l'on s'écarte du tracé. L'écran reste allumé pendant le suivi.
- **Mes parcours** : onglet **Favoris** (parcours gardés, import GPX) et onglet **Historique** (sorties faites, avec date, distance, temps, allure et le total du mois). Une sortie s'ajoute toute seule quand on termine un suivi en direct de plus de 300 m. « Modifier » permet de supprimer.

## Comment ça marche

Tout se passe dans le navigateur, sans compte ni serveur à nous :

- **Itinéraires** : [Valhalla](https://valhalla1.openstreetmap.de) (serveur public de FOSSGIS, données OpenStreetMap). Boucle place des points de passage autour du départ, choisit les directions selon le relief, les milieux et le vent, ajuste le rayon jusqu'à tomber à quelques pour cent de la distance demandée, puis garde les trois meilleures propositions. Les petits allers-retours vers un point de passage (impasse, petite rue, jusqu'à 900 m aller et retour) sont retirés du tracé.
- **Carte et milieux** : tuiles vectorielles [OpenFreeMap](https://openfreemap.org) (OpenMapTiles). Les forêts, l'eau, les parcs, les champs, la ville et les chemins sont lus dans ces tuiles pour orienter les parcours et calculer les répartitions.
- **Relief** : tuiles d'altitude Terrarium (Mapzen, AWS Open Data) pour l'ombrage et la 3D ; altitudes des parcours fournies par Valhalla.
- **Adresses** : [Photon](https://photon.komoot.io) (komoot, OpenStreetMap).
- **Vent** : [Open-Meteo](https://open-meteo.com).
- **Points d'eau** : Overpass API (OpenStreetMap).

Ces services sont gratuits pour un usage raisonnable : une création de parcours envoie une dizaine de requêtes.

## Limites connues

- Favoris et historique ne sont pas synchronisés automatiquement entre l'iPhone et le Mac : utiliser **Partager** pour un parcours. Une synchronisation automatique demanderait un compte et un serveur.
- Le dénivelé vient d'un modèle de terrain (précision de quelques mètres) : il peut différer de celui d'une montre à baromètre.
- Si le relief autour du départ ne permet pas le dénivelé demandé, Boucle le dit au lieu d'inventer.
- Le suivi en direct fonctionne app ouverte ; iOS coupe la localisation des web apps en arrière-plan.

## Développement

```sh
npm install          # sur ce Mac : npm_config_cache=/tmp/npm-cache npm install (cache npm système en root)
npm run dev          # http://localhost:5173
npm run check        # vérification des types
npm test             # tests unitaires du moteur
LIVE=1 npx vitest run tests/unit/live.test.ts   # générations réelles contre les services publics
npm run e2e          # parcours complets dans Chromium (Mac) et WebKit (iPhone)
npm run build        # version de production dans dist/
npm run icons        # regénère les icônes depuis scripts/make-icons.mjs
```

Chaque `git push` sur `main` publie l'app sur GitHub Pages (workflow `.github/workflows/deploy.yml`).

## Crédits

Données © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL). Icônes [Phosphor](https://phosphoricons.com) (MIT). Carte [MapLibre GL JS](https://maplibre.org) (BSD-3).
