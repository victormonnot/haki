# HAKI

Une application d’entraînement qui associe mouvement, guidage vocal et progression personnelle.

HAKI permet de préparer **L’Éveil du Nord**, une première séance du parcours Viking, avec trois variantes de 8, 12 et 14 minutes. La sélection tient compte du lieu, du matériel, du temps disponible, de l’expérience, de l’espace et du bruit. Le déroulement et les consignes de chaque mouvement sont consultables avant l’entraînement.

Les profils **Maison** et **Salle de boxe** sont modifiables et enregistrables sur l’appareil. Un test audio séparé de **60 secondes** permet d’essayer la voix française, le chronomètre et les interruptions, écran déverrouillé. Le maintien de l’écran allumé est demandé lorsque le navigateur le permet.

Le lecteur guide chaque étape, affiche les temps restants et permet de mettre en pause, reprendre ou arrêter. Le brouillon réel est conservé sur cet appareil, y compris son contenu et son point d’arrêt. L’historique, le bilan du réalisé et l’XP ne sont pas encore disponibles. L’installation en PWA et le fonctionnement hors connexion ne sont pas pris en charge.

## Démarrer

Prérequis : **Node.js 24** et npm. La version de Node est définie dans `.nvmrc`.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse affichée par Vite, habituellement [localhost:5173](http://localhost:5173).

```sh
npm run build   # Vérification TypeScript et compilation dans dist/
npm run preview # Prévisualisation de la version compilée
```

## Tester sur iPhone

Le Mac et l’iPhone doivent partager le même réseau local. `npm run dev:host` expose l’interface en HTTP à l’adresse réseau affichée par Vite. Le maintien de l’écran allumé nécessite un contexte HTTPS de confiance.

Sur macOS, installer [mkcert](https://github.com/FiloSottile/mkcert#mobile-devices) puis son autorité locale :

```sh
brew install mkcert
mkcert -install
mkdir -p .cert
```

Relever l’adresse IP locale du Mac dans les réglages réseau. Remplacer `192.168.1.42` ci-dessous par cette adresse :

```sh
mkcert -cert-file .cert/local.pem -key-file .cert/local-key.pem localhost 127.0.0.1 ::1 192.168.1.42
mkcert -CAROOT
```

Transférer uniquement le fichier **`rootCA.pem`** du dossier indiqué vers l’iPhone, par exemple avec AirDrop. Ouvrir le fichier, installer le profil dans Réglages, puis activer sa confiance dans **Général → Informations → Réglages de confiance des certificats**. Conserver `rootCA-key.pem` sur le Mac : cette clé privée ne doit jamais être partagée.

```sh
npm run dev:https
```

Ouvrir `https://192.168.1.42:5173` dans Safari avec la bonne IP et le port affiché. Le certificat doit être régénéré si l’IP du Mac change. Les certificats et les clés sont exclus de Git.

Ouvrir « Tester le guide », puis appuyer sur « Lancer le test audio ». Vérifier le volume, les annonces des trois étapes et de fin, la pause, la reprise et le comportement après un changement d’application. Le retour dans HAKI attend une reprise manuelle. Un rechargement remet ce test à zéro. Les voix disponibles et l’autorisation de garder l’écran allumé dépendent d’iOS ; ces points nécessitent un essai sur l’appareil.

## Essayer la préparation

1. Choisir le profil Maison, sans matériel, avec 15 minutes disponibles. Fondations est compatible : ouvrir « Voir ma séance » et consulter les mouvements.
2. Revenir à la préparation et choisir 8 minutes. Fondations reste sélectionné, avec une explication et un bouton de confirmation désactivé. Choisir explicitement Pas légers pour voir l’alternative compatible.
3. Sélectionner Appuis en mouvement : il faut au moins 14 minutes, une pratique régulière, une corde, un espace ample et la possibilité de faire du bruit. Les conditions manquantes sont affichées.
4. Modifier un profil, l’enregistrer, puis recharger. Les réglages enregistrés sont restaurés ; les modifications non enregistrées sont perdues au rechargement. Le passage entre préparation et test audio conserve le brouillon tant que la page reste ouverte.

Les profils utilisent IndexedDB dans le navigateur courant. Ils ne sont pas synchronisés entre appareils ou entre adresses : HTTP, HTTPS et une autre IP possèdent des espaces de stockage distincts. En cas de stockage indisponible, la préparation reste utilisable et l’échec d’enregistrement est signalé. L’effacement des données du site supprime les profils.

## Suivre une séance

1. Préparer une variante compatible, ouvrir « Voir ma séance », puis « Ouvrir le lecteur ». Le lecteur enregistre le brouillon avant de proposer le départ.
2. Appuyer sur « Démarrer la séance ». Chaque étape possède son chronomètre et sa consigne vocale. Essayer pause/reprise et la désactivation de la voix.
3. Changer d’application ou revenir à la préparation : le lecteur se met en pause. Au retour, reprendre explicitement. Recharger la page restaure le dernier point enregistré, sans compter le temps écoulé depuis sa sauvegarde.
4. « Arrêter » demande confirmation et conserve le point d’arrêt. À la fin du minuteur, aucun effort n’est déclaré automatiquement. Le brouillon reste consultable ; en préparer un nouveau demande de supprimer explicitement le précédent.
5. Pour parcourir rapidement les transitions, choisir « Essayer en accéléré ». Chaque étape dure cinq secondes, sans exercice à faire. Cet aperçu reste en mémoire uniquement, disparaît au rechargement et ne modifie pas le brouillon réel.

Le lecteur enregistre un point de reprise environ chaque seconde ainsi qu’aux changements d’étape et d’état. Une fermeture brutale peut perdre le temps depuis le dernier enregistrement réussi. Une suspension des callbacks supérieure à cinq secondes provoque également une pause au dernier temps observé. Le temps repose sur une horloge monotone ; les retards de rendu courts ne s’accumulent pas.

Un échec de sauvegarde met la séance en pause et propose une nouvelle tentative. Les écritures vérifient la révision enregistrée : deux onglets ne peuvent pas remplacer silencieusement leurs points de reprise. En cas de conflit, charger le dernier point enregistré. Utiliser un seul onglet pour s’entraîner.

La migration du stockage conserve les profils existants. Les données restent propres au navigateur et à l’adresse utilisée ; effacer les données du site supprime aussi le brouillon. Aucun export ni historique n’est encore disponible. Les annonces audio sont simulées dans les tests automatisés : la voix réelle et le maintien de l’écran doivent être vérifiés sur iPhone.

## Organisation

- `src/content` : séance, variantes, phases et mouvements.
- `src/domain` : compatibilité, chronomètre et instantanés de séance, indépendants de l’interface.
- `src/data` : profils et brouillon local, migrations, validation et transactions IndexedDB.
- `src/features/preparation` : configuration, choix de variante et aperçu détaillé.
- `src/features/sound-check` : essai de guidage audio et adaptateurs voix/écran.
- `src/features/player` : lecteur, interruptions et points de reprise.

Les durées affichées sont calculées à partir des phases, échauffement et récupérations compris. Les pourcentages des voies décrivent l’orientation du contenu ; ils ne mesurent pas les capacités de la personne et ne constituent pas une attribution d’XP.

## Contenu d’entraînement

Les séances proposées sont des compositions de démonstration non validées par un entraîneur. Les mouvements simples s’appuient sur les descriptions d’[échauffement du NHS](https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/), les [exercices de renforcement du NHS](https://www.nhs.uk/live-well/exercise/strength-exercises/) et les repères de corde du [manuel England Boxing, niveau 2](https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf). Ces sources ne valident ni les séquences ni les durées choisies ici.

## Vérifications

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

`check` exécute le contrôle du formatage, le lint, les tests unitaires et la compilation. Les tests navigateur couvrent Chromium, WebKit et WebKit avec un profil mobile iPhone ; cette émulation ne remplace pas un test sur un vrai iPhone. La CI exécute les deux suites.

| Commande               | Usage                                              |
| ---------------------- | -------------------------------------------------- |
| `npm run typecheck`    | Vérifier les types TypeScript                      |
| `npm run lint`         | Analyser le code avec Oxlint                       |
| `npm test`             | Exécuter les tests unitaires Vitest                |
| `npm run test:watch`   | Relancer les tests unitaires à chaque modification |
| `npm run format`       | Formater les fichiers avec Prettier                |
| `npm run format:check` | Vérifier leur formatage                            |

## Stack

React, TypeScript et Vite. Le guidage utilise la synthèse vocale du navigateur. Les polices sont servies avec l’application ; aucun service externe ni compte n’est nécessaire.
