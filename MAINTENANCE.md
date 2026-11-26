# Maintenance de Boucle

Ce document dit ce qui fait tourner Boucle, ce qui est surveillé automatiquement, et quoi faire quand une alerte arrive. Il est écrit pour quelqu'un qui n'a pas construit l'app.

## Ce qui est installé

Boucle n'a **pas de serveur à nous** : pas de PHP, pas de WordPress, pas de base de données à mettre à jour. C'est un site statique (des fichiers HTML, CSS et JavaScript) que l'on ne peut pas « pirater » côté serveur, avec trois appuis extérieurs.

| Brique | Rôle | Où | Ce qui peut casser |
|---|---|---|---|
| Le site | L'app elle-même, construite avec Vite, Svelte et TypeScript | GitHub Pages (dépôt `rom442005/boucle`) | Une mise à jour d'une bibliothèque |
| Supabase | Comptes (e-mail, code, mot de passe), profils, parcours publiés, photos, données de santé envoyées par les téléphones | Projet `vnbriibagpmxkuwfjawv`, région Paris | Un changement d'offre ou de réglage |
| Brevo | Envoi des e-mails de connexion (code à 6 chiffres) | Compte Brevo de Romain | Clé SMTP expirée (20/11/2027, ou 90 jours sans envoi) |
| Santé du téléphone | Pas, fréquence au repos, VO2 max, sorties avec distance et calories (dont celles de Strava, Garmin, Samsung Health… qui écrivent dans la santé du téléphone). Lecture seule, envoi à Supabase (table `health_days`), affichage dans le profil partout | Apps natives : Apple Santé sur iPhone (droit HealthKit), Health Connect sur Android (module `@capgo/capacitor-health`). Un site web n'y a pas accès | Une mise à jour d'iOS, d'Android, de Health Connect ou du module |
| Strava (en attente) | Connexion directe : fonction Supabase `strava` déployée, table `strava_links` | Masquée tant que la variable `VITE_STRAVA_CLIENT_ID` est vide | L'API Strava est réservée aux abonnés depuis 2026 : il faudra un abonnement, puis créer l'application sur strava.com/settings/api |
| Services publics gratuits | Carte (OpenFreeMap), itinéraires (Valhalla), adresses (Photon), météo (Open-Meteo), relief, points d'eau (Overpass), photos aériennes (IGN), globe (NASA) | Chez leurs éditeurs | Un service qui change d'adresse ou de règles |

Les bibliothèques utilisées sont listées dans `package.json` ; leurs versions exactes sont figées dans `package-lock.json`, pour que la même construction donne toujours le même résultat.

## Voir les membres et leurs données

Tout est dans Supabase, accessible depuis Chrome :

- **Une ligne par membre, avec tout ce qui le concerne** : tableau de bord Supabase, Table Editor, choisir le schéma `admin` en haut à gauche, puis la vue `membres` (e-mail, inscription, dernière connexion, mot de passe choisi ou non, prénom, ville, niveau, sports, année de naissance, présentation, nombre de parcours, photos, j'aime, commentaires, abonnés, dernier envoi de santé, Strava relié, signalements ouverts). En SQL : `select * from admin.membres;`
- **Le détail** : les tables du schéma `public` (`profiles`, `routes`, `route_photos`, `comments`, `health_days`…) et Authentication, Users pour les comptes.
- **Les mots de passe ne se lisent nulle part**, ni par Romain ni par Claude : Supabase n'en garde qu'une empreinte (bcrypt). C'est voulu : une fuite de la base ne livrerait aucun mot de passe.
- Le schéma `admin` n'est pas publié par l'API : l'app et les visiteurs n'y ont pas accès (vérifié : « Invalid schema: admin »).

## Écran verrouillé pendant le suivi (app du téléphone)

- **Côté page** : `src/lib/live.ts` envoie les chiffres de la sortie (au plus toutes les 5 s, tout de suite à la pause) au module natif `BoucleLive`, et reçoit ses boutons (pause, reprise, fin) et ses positions GPS (qui continuent écran éteint). Sur le site, rien.
- **Android** (fait, testé sur émulateur) : `LiveTrackPlugin.java` + `LiveTrackService.java` (service au premier plan de type position, notification « Suivi en direct », silencieuse, visible écran verrouillé, chrono qui tourne seul, boutons Pause/Terminer), enregistré dans `MainActivity.java` ; droits `FOREGROUND_SERVICE_LOCATION` et `POST_NOTIFICATIONS` dans le manifeste.
- **iPhone** (code prêt, à finir dans Xcode, pas encore compilé) : `ios/App/App/LiveTrackPlugin.swift` (Activité en direct + GPS en arrière-plan, `UIBackgroundModes = location`, `NSSupportsLiveActivities`), enregistré par `BoucleViewController.swift` (classe de la vue dans `Main.storyboard`). Reste une fois dans Xcode : File › New › Target › Widget Extension, nom « BoucleLive », cocher « Include Live Activity » ; remplacer le fichier créé par `ios/App/BoucleLive/BoucleLiveWidget.swift` ; cocher la cible BoucleLive pour `App/BoucleLiveAttributes.swift` ; iOS 16.2 au moins pour l'extension.

## Découverte (lieux emblématiques) et horaires

- **Sources** : OpenStreetMap par Overpass (lieux qui ont un article Wikipédia et un genre qui se visite, horaires `opening_hours` ; plus les lieux touristiques qui n'ont qu'une fiche Wikidata, comme la Tour LU), Wikidata pour ces derniers seulement (article français s'il existe, sinon photo Commons, description et nombre de langues où ils ont un article) et l'API de Wikipédia en français (photo, description, longueur de l'article, 50 lieux par appel ; la vignette des photos Commons vient du même appel). `src/lib/discover.ts`, `src/lib/hours.ts`.
- **Requêtes** : rien tant que la section est fermée ; une zone nouvelle = 1 requête Overpass + 1 Wikidata s'il y a des lieux sans article français + 1 à 4 Wikipédia (au-delà de 50 lieux, seulement ceux qui peuvent encore entrer dans les 24 ; centre de Nantes : 2 Wikipédia) ; une zone déjà vue = aucune ; zone découpée en cases de 0,05° gardées 14 jours sur l'appareil (`boucle.decouverte.v3`), articles et fiches gardés 30 jours ; zone ramenée à 12 km de côté au plus ; photos gardées un mois par le service hors ligne (cache `decouverte`). Horaires d'une fiche de la carte : 1 petite requête par lieu, gardée 30 jours (`boucle.horaires.v1`).
- **Serveurs Overpass** : `overpass.openstreetmap.fr` d'abord (rapide), puis `overpass-api.de` et `overpass.private.coffee` ; un serveur qui refuse (403, 429) ou échoue est mis au repos 10 minutes. Ce serveur bloque une adresse qui l'interroge trop souvent : ne pas boucler de tests réels dessus (les tests utilisent des réponses enregistrées, `tests/e2e/fixtures/`).
- **Affichage** : 4 lieux par page (deux colonnes, deux rangs), flèches haut/bas ; tous les lieux en pastilles sur la carte tant que la Découverte est ouverte (`app.spots`, calque `spot-pins`, effacés en dessous du zoom 10,4 ; leurs images d'émoji sont créées avant les données, sinon la tuile se dessine sans elles). Survol (Mac) : la carte s'approche du lieu (zoom 14 à 16 selon sa taille) après 140 ms de pose, puis revient à la vue d'avant. « Voir sur la carte » seulement sur iPhone.
- **Classement** : genre du lieu (musée, château, jardin, grue, tour…) × notoriété (longueur de l'article ; sans article français, 8 ko par langue où le lieu en a un) × photo ; écartés : tombes, plaques, immeubles d'habitation, écoles, gares. Les vues des pages ne servent pas (Wikipédia ne les donne que pour une dizaine de pages par appel).

## Communauté d'aperçu (fictive)

- 24/11/2026 : 10 membres fictifs (Léa, Hugo, Inès, Malik, Chloé, Thomas, Sarah, Julien, Emma, Nicolas), 14 parcours réels autour de Nantes (tracés par le moteur de l'app : course, trail, vélo, gravel), 59 j'aime, 16 commentaires, abonnements ; Romain en suit 4 et 3 le suivent. Comptes sans mot de passe, adresses `@boucle.invalid` : personne ne peut s'y connecter.
- **Avant d'ouvrir l'app au public, tout effacer** (éditeur SQL) : `delete from auth.users where email like '%@boucle.invalid';` (profils, parcours, j'aime, commentaires et abonnements suivent).

## Données Santé simulées

- 24/11/2026 : 28 jours (27/10 au 24/11) insérés dans `health_days` pour le compte de Romain (source `ios`, sorties « Strava » du plan marathon), depuis l'éditeur SQL. Les vraies données de Santé les remplacent jour par jour. Pour les effacer : `delete from public.health_days where user_id = (select id from public.profiles where first_name ilike 'romain%' limit 1);`

## Connexion par Santé (app du téléphone)

- Dans l'app iPhone ou Android, « Continuer avec Apple Santé / Health Connect » demande l'accord de Santé, puis ouvre un **compte anonyme de Supabase** (`signInAnonymously`) : pas d'e-mail ni de mot de passe, la session reste sur le téléphone. Le profil (prénom, année, sport) reste demandé.
- **À activer une fois** : tableau de bord Supabase, Authentication, Sign In / Providers, « Allow anonymous sign-ins ». Tant que ce n'est pas fait, le bouton répond « La connexion par Santé n'est pas encore ouverte ».
- Ces comptes ont `is_anonymous = true` ; les règles d'accès (`to authenticated`) s'appliquent pareil. Ils n'ont pas de déconnexion (le compte serait perdu) ; supprimer le compte reste possible. Santé ne donne aucune identité : sur un autre appareil (Mac), il faut un compte par e-mail.
- Tests : `globalThis.__boucleHealth = { platform: 'ios', days: [...] }` posé avant le chargement simule Santé (test e2e « app du téléphone »).

## Santé sur l'iPhone sans l'app (raccourci « Boucle Sante »)

Apple ne laisse pas un site lire Santé. Sur l'iPhone, tant que l'app n'est pas installée, un raccourci de l'app Raccourcis fait le lien :

- **Ce qu'il fait** : il lit les 28 derniers jours (pas, distance à pied, énergie active, exercice, fréquence au repos, VO2 max, totaux et moyennes du jour calculés par Santé) et les envoie à Supabase avec la clé personnelle du membre (fonction `health_push`). Le profil les affiche ensuite partout, Mac compris.
- **Côté membre** : Profil, « Apple Santé », Relier : créer et copier sa clé, ajouter le raccourci (il demande la clé à l'import), le lancer une fois (autoriser Santé et l'envoi), puis, si on veut, une automatisation « tous les soirs à 21 h ».
- **La clé** n'est gardée que hachée (table `health_keys`, inaccessible à l'app) ; une nouvelle remplace l'ancienne ; « Ne plus relier Santé » efface la clé et les journées (`health_unlink`). Colonne `sante_raccourci` dans `admin.membres`.
- **Refaire le raccourci** (nouvelle mesure, autre adresse) : `python3 scripts/make-shortcut.py`. Il lit l'adresse et la clé publique de Supabase dans `.env.native.local`, écrit puis signe `public/sante/Boucle Sante.shortcut` (il faut être connecté à iCloud sur le Mac). Garder un nom **sans accent** : un « é » enregistré décomposé par macOS n'est plus trouvé par GitHub Pages, et l'app lance le raccourci par ce nom.
- **Tester la réception sans rien écrire** : dans l'éditeur SQL de Supabase, un bloc `do $$ … $$` qui crée une clé d'essai, appelle `health_push`, lit `health_days`, puis lève une exception : tout est annulé.

## IA des dessins (fonction « dessin »)

La discussion du mode Dessin propose des formes de sa bibliothèque. Pour qu'une IA (Claude) en propose aussi :

1. Crée une clé sur console.anthropic.com (payant à l'usage : quelques centimes par demande ; chaque membre est limité à 20 demandes par jour).
2. Dans Supabase › Edge Functions › Secrets, ajoute `ANTHROPIC_API_KEY` avec cette clé.
3. Dans Supabase › Edge Functions › dessin › Settings, désactive « Verify JWT with legacy secret » (la fonction vérifie elle-même que le membre est connecté ; c'est le réglage recommandé par Supabase), puis Save changes.

Sans clé, la fonction répond « not_configured » et l'app garde sa bibliothèque. Code : `supabase/functions/dessin/index.ts`, compteur : table `dessin_usage`.

## Index des pistes d'athlétisme

Les pistes de la barre des lieux viennent d'un fichier tiré d'OpenStreetMap une fois pour toutes, `public/data/pistes.json` (France et pays voisins, du 6° O au 10° E et du 41° N au 51° N) : toutes s'affichent à tout zoom, sans attendre. Hors de ce rectangle, l'app les reconnaît encore dans les tuiles de la carte, de plus près. Pour le mettre à jour (une ou deux fois par an suffit) :

1. `scripts/pistes-telecharger.sh /tmp/pistes` (10 à 30 minutes selon les serveurs Overpass ; relancer reprend où ça s'est arrêté).
2. `node scripts/pistes.mjs /tmp/pistes` : réécrit `public/data/pistes.json` et dit combien de pistes sont gardées.

Photos des fiches : vue du ciel de l'IGN (France), photo au sol de Panoramax (photos de rue libres) ou de Wikimedia Commons, avec leur auteur. Rien à configurer, pas de clé.

## Changer les photos de fond

Les sources sont dans `public/scenes/SOURCES.md`. Télécharger depuis Unsplash en 4096 × 2731 (`sN-l.jpg`, `fit=crop&crop=entropy&q=86&fm=jpg&cs=srgb`) et 1440 × 3120 (`sN-m.jpg`, `q=84`), vérifier que l'original est assez grand (`?fm=json` donne `PixelWidth`), mettre à jour la teinte dans `src/lib/scenes.ts`, puis **changer `SCENES_V`** (scenes.ts) **et le nom du cache** `scenes-N` (vite.config.ts) : sinon les téléphones gardent les anciennes photos hors ligne.

## Construire et tester l'app Android

Outils installés sur le Mac : SDK Android dans `~/Library/Android/sdk`, Java 21 (`/opt/homebrew/opt/openjdk@21`), émulateur `boucle` (Android 16, Health Connect intégré).

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
npm run android                          # construit le site pour l'app et le copie dans android/
cd android && ./gradlew assembleDebug    # app-debug.apk dans android/app/build/outputs/apk/debug/
$ANDROID_HOME/emulator/emulator -avd boucle -no-window -no-audio &   # émulateur sans fenêtre
$ANDROID_HOME/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
$ANDROID_HOME/platform-tools/adb shell am start -n fr.boucle.parcours/.SeedHealthActivity   # données d'essai
```

- La version de test (debug) contient un écran `SeedHealthActivity` qui dépose 28 jours de données d'essai dans Health Connect (pas, pouls, VO2 max, 14 sorties) ; la version publiée (release) ne l'a pas et ne fait que lire.
- L'émulateur prend 2 à 4 Go de mémoire : l'arrêter après usage (`adb emu kill`), surtout avant les tests Playwright, sinon le Mac sature.
- Pour piloter l'app depuis le Mac : `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` puis Chrome DevTools sur `localhost:9333`.

## Ce qui est surveillé automatiquement

1. **Avant chaque mise en ligne** (`.github/workflows/deploy.yml`) : recherche de failles connues dans ce qui part chez les utilisateurs, vérification des types, tests, construction. Si une étape échoue, rien n'est publié : l'ancienne version reste en ligne.
2. **Chaque lundi à 7 h** (`.github/workflows/sante.yml`) : l'app entière est remise à l'épreuve, failles connues, tests, génération réelle de parcours contre les services publics, et parcours complets dans un vrai navigateur, version Mac et version iPhone. Si un service a changé ou si une faille est apparue, le contrôle échoue et **GitHub envoie un e-mail** au propriétaire du dépôt.
3. **Alertes de failles et correctifs de sécurité** (Dependabot, activés sur le dépôt) : quand une faille est publiée dans une bibliothèque utilisée, GitHub prévient et propose la correction.
4. **Mises à jour proposées chaque lundi** (`.github/dependabot.yml`) : les petites mises à jour arrivent groupées, les grandes (celles qui peuvent casser) une par une. Chaque proposition passe les mêmes contrôles que la mise en ligne.
5. **Garde-fou de la carte** : un test vérifie que la carte se dessine sans erreur et qu'un parcours trouvé tient bien à l'écran. C'est ce test qui a montré, lors du passage à MapLibre 6, que la carte restait vide.

## Quoi faire quand…

**Une proposition de mise à jour arrive (Dependabot).** Regarder si les contrôles sont verts. Si oui, l'accepter (« Merge »). Si une grande mise à jour échoue, la confier à quelqu'un (ou à Claude) avec ce document : il faut adapter le code, pas forcer la mise à jour.

**Le contrôle du lundi échoue.** Ouvrir l'onglet « Actions » du dépôt, cliquer sur le contrôle en rouge : l'étape en échec dit si c'est une faille, un test ou un service extérieur. Un service public momentanément indisponible peut faire échouer un lundi sans que l'app soit cassée : relancer le contrôle (« Re-run ») avant de s'inquiéter.

**Un membre a oublié son mot de passe.** Dans l'app : Se connecter, « Mot de passe oublié », un code arrive par e-mail et le nouveau mot de passe se choisit avec. Rien à faire de ton côté.

**Les e-mails de connexion n'arrivent plus.** Dans Supabase, Logs, Auth : une erreur `535` signifie que la clé Brevo n'est plus valable. Générer une nouvelle clé SMTP dans Brevo et la coller dans Supabase (Authentication, Emails, SMTP Settings, champ Password).

**On ajoute un nouveau service extérieur.** L'ajouter aussi aux règles de sécurité de la page (`index.html`, balise `Content-Security-Policy`), sinon le navigateur le bloquera ; le garde-fou de la carte le signale.

## Règles de sécurité en place

- La page ne charge du code que d'elle-même et ne contacte que les services listés (`Content-Security-Policy` dans `index.html`).
- Dans Supabase, chaque table a des règles d'accès ligne par ligne : chacun ne modifie que ce qui est à lui (`supabase/schema.sql`). Les images ne s'écrivent que dans le dossier de leur propriétaire.
- Les photos envoyées sont réencodées sur l'appareil : leurs informations cachées (position GPS comprise) disparaissent.
- Un parcours publié commence et finit à 300 m du départ réel de son auteur.
- La clé Supabase présente dans l'app est la clé publique, faite pour être visible ; la clé secrète n'est jamais dans le code.

## Failles connues et acceptées

Au 22/11/2026, `npm audit` signale 4 failles modérées dans `glob` et `minimatch`, utilisés seulement par l'outil qui fabrique la version hors ligne de l'app (`vite-plugin-pwa`), sur la machine de construction. Elles ne partent pas chez les utilisateurs. La correction proposée ferait revenir à une ancienne version de l'outil : on attend sa prochaine mise à jour, que Dependabot proposera.

## Journal

- **25/11/2026** : création de boucle refaite (blocs de verre aussi sur Mac, bloc « Le parcours » qui regroupe forme, distance, dénivelé et milieu) ; Découverte des lieux emblématiques (OpenStreetMap + Wikipédia, en cache) ; horaires d'ouverture sur les fiches des lieux de la carte ; serveur Overpass d'OpenStreetMap France en premier (les deux autres étaient en panne : les points d'eau ne marchaient plus). Vérifié ensuite sur les vraies données du centre de Nantes : Wikipédia complète tous les lieux qui peuvent entrer dans la liste (pas seulement les 50 premiers, les grues Titan en manquaient), Wikidata ramène la Tour LU (pas d'article français), grues un peu plus haut dans le classement ; Jardin des Plantes 4e, Machines 5e, grues Titan 14e et 15e, Tour LU 16e, Tour Bretagne 21e.
- **26/11/2026** : Découverte : pastilles de tous les lieux sur la carte, survol qui zoome sur le lieu, pages de 4 de haut en bas, plus de « Voir sur la carte » sur Mac. Émojis des listes : 250 émojis par thème et une recherche en mots (`src/lib/emojis.ts`, `EmojiPicker.svelte`, dans Enregistrer le lieu et Mes lieux).
- **26/11/2026** : épuré. Dessiner le parcours : plus de départ à changer ni d'exemples ; Dénivelé + et Milieu masqués (plus grisés) quand un dessin est actif. Descriptif d'un parcours : « En bref » (relief, milieu dominant, sentiers ou points d'eau), 3 chiffres, ce que la proposition tient de la demande, la météo en pastilles ; altitude, côtes, milieux et sols dans « Plus de détails », replié. Cartes des propositions : nom, chiffres et étiquette seulement.
- **24/11/2026** : panneau du suivi condensé (3 chiffres + une ligne) ; écran de poche (noir, maintenir pour revenir) ; app web : notification « Sortie en cours » sur l'écran verrouillé quand l'écran s'éteint (iOS endort la page : le suivi y reprend au retour) ; « Nouveau lieu » sur la carte avec les lieux trouvés en pastilles (`app.addPins`, calque `add-pins`).
- **24/11/2026** : plus d'écran blanc au lancement (images de démarrage de l'iPhone dans public/splash, exclues du cache hors ligne ; écrans de démarrage natifs sombres) ; « Enregistrer un lieu » refait en blocs (AddPlace) ; communauté d'aperçu insérée dans Supabase (voir « Communauté d'aperçu »).
- **24/11/2026** : nouvelle ouverture (3,3 à 5 s, `scripts/intro.py` la régénère dans index.html) : une sortie se trace sur un plan de ville, chiffres en compteur, éclat, « Boucle », puis plongée dans la boucle ; la carte se pose d'un zoom (MapView, `boucle:intro-out`) et l'interface arrive élément par élément (`data-arrive`, `html.arrive` dans app.css).
- **24/11/2026** : fluidité, 2e passe. Mesures (Chromium) : le code de l'app ne prend que 4 à 14 ms par appui, le style et la mise en page 2 ms au plus ; le coût est dans la carte graphique (jusqu'à 26 blocs de verre floutés sur Communauté). Donc : carte rendue à 2× au plus (iPhone 3×) et 8,3 Mpx au plus, dérive de la photo en pause dès qu'on agit (1,5 s), lignes hors écran non dessinées dans Mes parcours.
- **24/11/2026** : animation d'ouverture (boucle qui se trace, dans index.html, retirée par main.ts quand la carte est prête) ; détail de chaque donnée de Santé (feuille HealthDetail, 7 ou 28 jours) ; fluidité : plus de flou animé en plein écran (photo de fond, propositions), dérive de la photo en pause pendant un défilement ; parcours toujours cadré même avec un panneau haut (marges réduites au lieu de « Map cannot fit »).
- **24/11/2026** : suivi en direct refait (panneau du bas : distance, chrono, allure ou vitesse, moyenne, restant, D+, heure d'arrivée, Pause) ; écran verrouillé dans l'app du téléphone (Android : notification permanente testée sur émulateur ; iPhone : Activité en direct à finir dans Xcode) ; magnétisme des points posés vers les lieux mis en valeur ; idées de dessins en silhouettes (124 formes) ; données Santé simulées (28 jours) sur le compte de Romain.
- **23/11/2026** : fiche « Enregistrer le lieu » réduite au nom et aux listes (l'émoji d'une liste se change par sa pastille crayon, les lieux prennent l'émoji de leur liste) ; Mes lieux s'effacent de la carte vue de loin ; voile du haut de la carte allégé ; dans l'app du téléphone, connexion par l'accord d'Apple Santé ou de Health Connect (compte du téléphone, sans e-mail ni mot de passe, compte anonyme de Supabase : réglage « Allow anonymous sign-ins » à activer).
- **23/11/2026** : Mac : réglages fermés par défaut, ouverts par « Créer un parcours » en bas de la carte ; menu sans logo ni bouton iPhone, avec « Enregistrer un lieu ».
- **23/11/2026** : bande vide en bas de l'app installée sur iPhone (iOS 26, bug WebKit 301108) corrigée par une page aussi haute que l'écran en mode app ; bouton « Enregistrer un lieu » dans la barre d'onglets, 3D sous la flèche, haut des écrans un peu plus bas.
- **23/11/2026** : iPhone épuré : onglets en icônes seules et plus bas, bande grise du bas d'iOS 26 recouverte par la carte (mesurée au lancement), météo retirée de l'accueil iPhone, barre des lieux en haut, fiche du lieu le plus proche à la place de la bulle, bouton « Enregistrer un lieu » sur la carte (iPhone et Mac), crédits de la carte en petit texte au lieu du bouton (i), blocs plus compacts.
- **23/11/2026** : onglets de l'iPhone plus sûrs (changement au doigt levé) ; une nouvelle version ne recharge plus l'app au changement d'onglet (au lancement, ou en arrière-plan). Passe d'harmonisation : marges communes, fenêtres de recherche et « Enregistrer » plus opaques, blocs-onglets de Mes parcours comme ceux de Communauté.
- **23/11/2026** : pistes d'athlétisme de France toutes visibles (index tiré d'OpenStreetMap, en grappes de loin) et redessinées comme vues du ciel (anneau, couloirs, ligne d'arrivée, terrain). Toucher un lieu ouvre sa fiche : zoom, vue du ciel IGN et photo au sol tournée vers le lieu (Panoramax ou Wikimedia Commons), « Partir d'ici », « Enregistrer ». Mes lieux (Mes parcours › Lieux) : adresses et lieux rangés dans des listes à émoji (Mes adresses, Favoris, À essayer, et les siennes), sur la carte et en tête de la recherche du départ ; gardés sur l'appareil.
- **23/11/2026** : mode Dessin refait pour être fidèle (liaisons qui suivent le dessin, plus de dessin géant), recherche du meilleur endroit jusqu'à 15 km (40 km à vélo) autour du départ choisi, trajet d'accès en option, idées de dessins à partir d'une phrase (bibliothèque de formes ; IA Claude prête, voir « IA des dessins »). Lieux sur la carte : pistes d'athlétisme reconnues à leur forme, parcs publics seulement, toilettes ajoutées, mise au point sur le lieu le plus proche.
- **22/11/2026** : mode Dessin (« Dessiner le parcours », replié par défaut) : la boucle reproduit un dessin fait au doigt ou à la souris, ou une forme toute prête. Calcul sur l'appareil (carte des rues lue dans les tuiles de la carte) puis « map matching » Valhalla ; 3 à 9 requêtes, première proposition en 2 à 4 s. Banc réel : `LIVE=1 npx vitest run tests/unit/art.live.test.ts`. Barre des lieux en icônes seules, Milieu sur une ligne, règles sans graduations moyennes blanches.
- **22/11/2026** : santé sur l'iPhone sans l'app par le raccourci « Boucle Sante » (clé personnelle hachée, fonctions `health_key_new`, `health_push`, `health_unlink`, testées) et bloc Santé du profil (anneau, semaine, distance, énergie, exercice). Photos de fond en haute définition (7 remplacées), règles graduées pour la distance et le D+, rubrique « Sol » retirée, bloc des lieux sur la carte (pistes, parcs, eau, forêts, fontaines), lentille des onglets refaite sur un ressort continu, colonne Créer pleine hauteur sur Mac, animations d'apparition partout.
- **22/11/2026** : mot de passe à la création du compte (reconnexion sans code), « Mot de passe oublié » par code, changement dans Modifier, Compte. Vue `admin.membres` dans Supabase. Premier lancement sur Mac : seul l'accueil est affiché. 20 photos de fond au lieu de 7.
- **22/11/2026** : santé du téléphone sur Android (Health Connect) en plus de l'iPhone, testée sur émulateur : lecture, envoi, accès retiré (rien n'est effacé), règles d'accès de `health_days` vérifiées. Correction d'un blocage « Accord… » sur les deux téléphones.

- **22/11/2026** : Apple Santé dans le profil (app iPhone). Strava passe par Santé (gratuit) ; la connexion directe est prête mais masquée, faute d'abonnement Strava.
- **22/11/2026** : MapLibre (la carte) passe de 5.24 à 6.19 pour corriger une faille critique (XSS). Adaptations : fichier de calcul des tuiles servi avec l'app, cadrage des parcours recalculé. Mises à jour mineures de Svelte, Vite, Supabase, Capacitor, Playwright. Ajout des règles de sécurité de la page, du contrôle du lundi, de Dependabot et de ce document.
