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

- **23/11/2026** : mode Dessin refait pour être fidèle (liaisons qui suivent le dessin, plus de dessin géant), recherche du meilleur endroit jusqu'à 15 km (40 km à vélo) autour du départ choisi, trajet d'accès en option, idées de dessins à partir d'une phrase (bibliothèque de formes ; IA Claude prête, voir « IA des dessins »). Lieux sur la carte : pistes d'athlétisme reconnues à leur forme, parcs publics seulement, toilettes ajoutées, mise au point sur le lieu le plus proche.
- **22/11/2026** : mode Dessin (« Dessiner le parcours », replié par défaut) : la boucle reproduit un dessin fait au doigt ou à la souris, ou une forme toute prête. Calcul sur l'appareil (carte des rues lue dans les tuiles de la carte) puis « map matching » Valhalla ; 3 à 9 requêtes, première proposition en 2 à 4 s. Banc réel : `LIVE=1 npx vitest run tests/unit/art.live.test.ts`. Barre des lieux en icônes seules, Milieu sur une ligne, règles sans graduations moyennes blanches.
- **22/11/2026** : santé sur l'iPhone sans l'app par le raccourci « Boucle Sante » (clé personnelle hachée, fonctions `health_key_new`, `health_push`, `health_unlink`, testées) et bloc Santé du profil (anneau, semaine, distance, énergie, exercice). Photos de fond en haute définition (7 remplacées), règles graduées pour la distance et le D+, rubrique « Sol » retirée, bloc des lieux sur la carte (pistes, parcs, eau, forêts, fontaines), lentille des onglets refaite sur un ressort continu, colonne Créer pleine hauteur sur Mac, animations d'apparition partout.
- **22/11/2026** : mot de passe à la création du compte (reconnexion sans code), « Mot de passe oublié » par code, changement dans Modifier, Compte. Vue `admin.membres` dans Supabase. Premier lancement sur Mac : seul l'accueil est affiché. 20 photos de fond au lieu de 7.
- **22/11/2026** : santé du téléphone sur Android (Health Connect) en plus de l'iPhone, testée sur émulateur : lecture, envoi, accès retiré (rien n'est effacé), règles d'accès de `health_days` vérifiées. Correction d'un blocage « Accord… » sur les deux téléphones.

- **22/11/2026** : Apple Santé dans le profil (app iPhone). Strava passe par Santé (gratuit) ; la connexion directe est prête mais masquée, faute d'abonnement Strava.
- **22/11/2026** : MapLibre (la carte) passe de 5.24 à 6.19 pour corriger une faille critique (XSS). Adaptations : fichier de calcul des tuiles servi avec l'app, cadrage des parcours recalculé. Mises à jour mineures de Svelte, Vite, Supabase, Capacitor, Playwright. Ajout des règles de sécurité de la page, du contrôle du lundi, de Dependabot et de ce document.
