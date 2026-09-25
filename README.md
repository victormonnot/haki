# HAKI

Une application d’entraînement qui associe mouvement, guidage vocal et progression personnelle.

Cette première version propose un test de guidage de **60 secondes**, sans exercice : « Prends tes marques » (10 s), « Suis le rythme » (35 s), « Termine en douceur » (15 s). Elle permet de tester la voix française du navigateur, le chronomètre, la pause et la reprise sur une interface adaptée au mobile. Le maintien de l’écran allumé est demandé lorsque le navigateur le permet.

Le test s’utilise écran déverrouillé. Aucune séance, progression ou XP n’est enregistrée. L’installation en PWA et le fonctionnement hors connexion ne sont pas disponibles.

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

Appuyer sur « Lancer le test audio ». Vérifier le volume, les annonces des trois étapes et de fin, la pause, la reprise et le comportement après un changement d’application. Le retour dans HAKI attend une reprise manuelle. Un rechargement remet ce test à zéro. Les voix disponibles et l’autorisation de garder l’écran allumé dépendent d’iOS ; ces points nécessitent un essai sur l’appareil.

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
