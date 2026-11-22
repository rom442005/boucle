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

- **22/11/2026** : mot de passe à la création du compte (reconnexion sans code), « Mot de passe oublié » par code, changement dans Modifier, Compte. Vue `admin.membres` dans Supabase. Premier lancement sur Mac : seul l'accueil est affiché. 20 photos de fond au lieu de 7.
- **22/11/2026** : santé du téléphone sur Android (Health Connect) en plus de l'iPhone, testée sur émulateur : lecture, envoi, accès retiré (rien n'est effacé), règles d'accès de `health_days` vérifiées. Correction d'un blocage « Accord… » sur les deux téléphones.

- **22/11/2026** : Apple Santé dans le profil (app iPhone). Strava passe par Santé (gratuit) ; la connexion directe est prête mais masquée, faute d'abonnement Strava.
- **22/11/2026** : MapLibre (la carte) passe de 5.24 à 6.19 pour corriger une faille critique (XSS). Adaptations : fichier de calcul des tuiles servi avec l'app, cadrage des parcours recalculé. Mises à jour mineures de Svelte, Vite, Supabase, Capacitor, Playwright. Ajout des règles de sécurité de la page, du contrôle du lundi, de Dependabot et de ce document.
