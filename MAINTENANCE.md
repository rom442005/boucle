# Maintenance de Boucle

Ce document dit ce qui fait tourner Boucle, ce qui est surveillé automatiquement, et quoi faire quand une alerte arrive. Il est écrit pour quelqu'un qui n'a pas construit l'app.

## Ce qui est installé

Boucle n'a **pas de serveur à nous** : pas de PHP, pas de WordPress, pas de base de données à mettre à jour. C'est un site statique (des fichiers HTML, CSS et JavaScript) que l'on ne peut pas « pirater » côté serveur, avec trois appuis extérieurs.

| Brique | Rôle | Où | Ce qui peut casser |
|---|---|---|---|
| Le site | L'app elle-même, construite avec Vite, Svelte et TypeScript | GitHub Pages (dépôt `rom442005/boucle`) | Une mise à jour d'une bibliothèque |
| Supabase | Comptes, profils, parcours publiés, photos | Projet `vnbriibagpmxkuwfjawv`, région Paris | Un changement d'offre ou de réglage |
| Brevo | Envoi des e-mails de connexion (code à 6 chiffres) | Compte Brevo de Romain | Clé SMTP expirée (20/11/2027, ou 90 jours sans envoi) |
| Services publics gratuits | Carte (OpenFreeMap), itinéraires (Valhalla), adresses (Photon), météo (Open-Meteo), relief, points d'eau (Overpass), photos aériennes (IGN), globe (NASA) | Chez leurs éditeurs | Un service qui change d'adresse ou de règles |

Les bibliothèques utilisées sont listées dans `package.json` ; leurs versions exactes sont figées dans `package-lock.json`, pour que la même construction donne toujours le même résultat.

## Ce qui est surveillé automatiquement

1. **Avant chaque mise en ligne** (`.github/workflows/deploy.yml`) : recherche de failles connues dans ce qui part chez les utilisateurs, vérification des types, tests, construction. Si une étape échoue, rien n'est publié : l'ancienne version reste en ligne.
2. **Chaque lundi à 7 h** (`.github/workflows/sante.yml`) : l'app entière est remise à l'épreuve, failles connues, tests, génération réelle de parcours contre les services publics, et parcours complets dans un vrai navigateur, version Mac et version iPhone. Si un service a changé ou si une faille est apparue, le contrôle échoue et **GitHub envoie un e-mail** au propriétaire du dépôt.
3. **Alertes de failles et correctifs de sécurité** (Dependabot, activés sur le dépôt) : quand une faille est publiée dans une bibliothèque utilisée, GitHub prévient et propose la correction.
4. **Mises à jour proposées chaque lundi** (`.github/dependabot.yml`) : les petites mises à jour arrivent groupées, les grandes (celles qui peuvent casser) une par une. Chaque proposition passe les mêmes contrôles que la mise en ligne.
5. **Garde-fou de la carte** : un test vérifie que la carte se dessine sans erreur et qu'un parcours trouvé tient bien à l'écran. C'est ce test qui a montré, lors du passage à MapLibre 6, que la carte restait vide.

## Quoi faire quand…

**Une proposition de mise à jour arrive (Dependabot).** Regarder si les contrôles sont verts. Si oui, l'accepter (« Merge »). Si une grande mise à jour échoue, la confier à quelqu'un (ou à Claude) avec ce document : il faut adapter le code, pas forcer la mise à jour.

**Le contrôle du lundi échoue.** Ouvrir l'onglet « Actions » du dépôt, cliquer sur le contrôle en rouge : l'étape en échec dit si c'est une faille, un test ou un service extérieur. Un service public momentanément indisponible peut faire échouer un lundi sans que l'app soit cassée : relancer le contrôle (« Re-run ») avant de s'inquiéter.

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

- **22/11/2026** : MapLibre (la carte) passe de 5.24 à 6.19 pour corriger une faille critique (XSS). Adaptations : fichier de calcul des tuiles servi avec l'app, cadrage des parcours recalculé. Mises à jour mineures de Svelte, Vite, Supabase, Capacitor, Playwright. Ajout des règles de sécurité de la page, du contrôle du lundi, de Dependabot et de ce document.
