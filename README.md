# HAKI

Une application d’entraînement qui associe mouvement, guidage vocal et progression personnelle.

HAKI propose **L’appel du Nord**, un parcours Viking de six séances et treize variantes. **L’Éveil du Nord** ouvre deux branches, stabilité/technique et souffle/attention, qui se rejoignent dans une séance de synthèse. La première séance dure de 8 à 14 minutes selon la variante ; les cinq suivantes durent 12 minutes chacune. La sélection tient compte du lieu, du matériel, du temps disponible, de l’expérience, de l’espace et du bruit. Le déroulement et les consignes de chaque mouvement sont consultables avant l’entraînement.

Les profils **Maison** et **Salle de boxe** sont modifiables et enregistrables sur l’appareil. Un test audio séparé de **60 secondes** permet d’essayer la voix française, le chronomètre et les interruptions, écran déverrouillé. Le maintien de l’écran allumé est demandé lorsque le navigateur le permet.

Le lecteur guide chaque étape, affiche les temps restants et permet de mettre en pause, reprendre ou arrêter. Le brouillon réel est conservé sur cet appareil, y compris son contenu et son point d’arrêt. Le bilan permet de confirmer les blocs réellement effectués, puis de conserver la séance complète ou partielle dans un carnet avec XP générale et répartition entre les quatre voies. Un export JSON permet de sauvegarder les données locales. L’installation en PWA et le fonctionnement hors connexion ne sont pas pris en charge.

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

## Explorer le parcours Viking

Ouvrir « Parcours Viking » ([aperçu local](http://localhost:5173/#parcours)). Chaque étape affiche son objectif, ses prérequis et les variantes acceptées. Le contenu des séances verrouillées reste consultable ; leur lecteur réel et leur aperçu accéléré deviennent disponibles après validation des prérequis.

```text
L’Éveil du Nord
├── Le Socle de pierre → La Garde du rempart ─────┐
└── Le Souffle du fjord → Les Signaux du guetteur ┤
                                                └── La Traversée du Nord
```

Une seule variante acceptée suffit pour valider une étape : le minuteur doit être terminé et tous les blocs de mouvement confirmés en entier. Une activité partielle conserve son XP, mais ne débloque rien. L’aperçu accéléré ne crée aucune activité. Les séances accessibles peuvent être répétées ; il n’y a ni obligation quotidienne ni seuil d’XP imposé.

Les variantes sans matériel permettent de parcourir tout le chapitre dans un espace réduit et sans sauts. Les variantes avec haltères, corde ou déplacement ample annoncent leurs contraintes sans substitution automatique. Les Signaux du guetteur proposent une réponse gauche/droite ou une association de mots à un geste, affichée et annoncée ; l’application ne mesure ni la réussite ni le temps de réaction.

Les déblocages sont calculés depuis les activités confirmées, avec des règles explicites d’identifiant, de version et de variante. Les activités existantes de L’Éveil du Nord, version 1, restent reconnues. Les prérequis sont revérifiés à l’ouverture du lecteur. Si un prérequis disparaît des données, l’accès est recalculé pour toute sa branche ; les activités ultérieures et leur validation propre restent conservées.

Pour vérifier la boucle : terminer L’Éveil du Nord, confirmer tous ses blocs, puis revenir au parcours. Les deux branches deviennent accessibles. Un bilan partiel n’a pas cet effet. La séance finale nécessite les deux branches complètes.

## Suivre une séance

1. Préparer une variante compatible, ouvrir « Voir ma séance », puis « Ouvrir le lecteur ». Le lecteur enregistre le brouillon avant de proposer le départ.
2. Appuyer sur « Démarrer la séance ». Chaque étape possède son chronomètre et sa consigne vocale. Essayer pause/reprise et la désactivation de la voix.
3. Changer d’application ou revenir à la préparation : le lecteur se met en pause. Au retour, reprendre explicitement. Recharger la page restaure le dernier point enregistré, sans compter le temps écoulé depuis sa sauvegarde.
4. « Arrêter » demande confirmation et conserve le point d’arrêt. À la fin du minuteur, aucun effort n’est déclaré automatiquement. Le brouillon reste consultable jusqu’à la confirmation du bilan, ou sa suppression explicite sans activité ni XP.
5. Pour parcourir rapidement les transitions, choisir « Essayer en accéléré ». Chaque étape dure cinq secondes, sans exercice à faire. Cet aperçu reste en mémoire uniquement, disparaît au rechargement et ne modifie pas le brouillon réel.

Le lecteur enregistre un point de reprise environ chaque seconde ainsi qu’aux changements d’étape et d’état. Une fermeture brutale peut perdre le temps depuis le dernier enregistrement réussi. Une suspension des callbacks supérieure à cinq secondes provoque également une pause au dernier temps observé. Le temps repose sur une horloge monotone ; les retards de rendu courts ne s’accumulent pas.

Un échec de sauvegarde met la séance en pause et propose une nouvelle tentative. Les écritures vérifient la révision enregistrée : deux onglets ne peuvent pas remplacer silencieusement leurs points de reprise. En cas de conflit, charger le dernier point enregistré. Utiliser un seul onglet pour s’entraîner.

La migration du stockage conserve les profils existants. Les données restent propres au navigateur et à l’adresse utilisée ; effacer les données du site supprime aussi le brouillon. Le carnet et l’export sont accessibles depuis « Mon carnet ». Les annonces audio sont simulées dans les tests automatisés : la voix réelle et le maintien de l’écran doivent être vérifiés sur iPhone.

## Confirmer le réalisé et suivre sa progression

1. Après la fin du minuteur ou un arrêt confirmé, choisir « Confirmer mon réalisé ».
2. Cocher les blocs effectivement réalisés. Rien n’est coché automatiquement. Pour une séance suivie entièrement, « Confirmer tous les blocs chronométrés » permet de sélectionner les durées proposées en une action explicite.
3. Ajuster les durées en secondes si nécessaire, dans la limite du temps chronométré de chaque bloc. Les blocs non atteints et les récupérations ne peuvent pas être déclarés comme du mouvement.
4. Vérifier le statut complet ou partiel et l’XP proposée, puis « Confirmer et enregistrer ». Les choix du formulaire ne sont pas enregistrés avant cette confirmation ; un rechargement avant validation demande de les saisir à nouveau.
5. Retrouver le bilan et la progression dans « Mon carnet ». Recharger la page ou revisiter un bilan enregistré n’ajoute pas une seconde activité.

Les barèmes sont versionnés : **10 XP par minute de mouvement confirmé**, échauffement et retour au calme compris, arrondies à l’entier inférieur sur le total. Les récupérations, pauses et interruptions ne produisent pas d’XP. La version 1, conservée pour L’Éveil du Nord et ses activités existantes, répartit le total selon les poids de la variante. La version 2 des cinq nouvelles séances pondère chaque voie par les secondes réellement confirmées de chaque bloc et par son orientation. Ainsi, un échauffement seul ne donne pas d’XP Stratège ; les blocs de réponse aux signaux doivent avoir été pratiqués et confirmés. Les deux versions utilisent la méthode des plus forts restes ; les égalités suivent l’ordre Puissant, Infatigable, Technicien, Stratège. La somme des voies est exactement égale à l’XP générale.

Une séance est complète seulement si le minuteur est terminé et si tous les blocs de mouvement sont confirmés en entier. Toute autre déclaration valide reste partielle. Une déclaration d’une à cinq secondes peut être conservée avec 0 XP. Les niveaux commencent à 1 et progressent tous les 100 XP, sans perte liée à l’inactivité.

Exemple : **Fondations**, confirmée en entier, représente 12 minutes chronométrées dont 10 minutes de mouvement. Elle rapporte **100 XP**, réparties en 35 au Puissant, 30 à l’Infatigable et 35 au Technicien. Le Stratège reste à 0, car cette variante ne contient pas de travail de réaction ou de décision.

L’activité contient l’instantané de la séance, le réalisé et sa récompense. Son identifiant correspond à celui de l’exécution : la transaction ajoute l’activité et retire le brouillon ensemble. Une double soumission retrouve l’activité existante. Les totaux sont dérivés de l’historique ; aucun compteur d’XP indépendant n’est modifié. En cas d’échec, aucune réussite n’est annoncée et le brouillon reste disponible pour réessayer. Une activité finalisée dans un autre onglet est reconnue au retour au premier plan.

## Exporter les données

« Mon carnet → Exporter mes données » prépare un fichier `haki-YYYY-MM-DD.json`. Le format `haki-backup`, version 1, inclut les activités, les profils effectivement enregistrés et le brouillon réel éventuel, lus dans une même transaction. Une donnée illisible bloque l’export au lieu de produire une sauvegarde silencieusement incomplète.

L’aperçu accéléré n’ajoute ni activité ni XP et n’apparaît jamais dans l’export. L’import, la modification et la suppression des activités, le calendrier et les cours ajoutés manuellement ne sont pas encore disponibles. Conserver les fichiers exportés avant de vider les données du navigateur.

## Organisation

- `src/content` : catalogue des séances, variantes, phases, mouvements et parcours Viking.
- `src/domain` : compatibilité, chronomètre, instantanés de séance, validation du réalisé et règles d’XP, indépendants de l’interface.
- `src/data` : profils, brouillon et activités, migrations, transactions IndexedDB et export cohérent.
- `src/features/path` : arbre Viking, prérequis, états d’accès et de validation.
- `src/features/preparation` : configuration, choix de variante et aperçu détaillé.
- `src/features/sound-check` : essai de guidage audio et adaptateurs voix/écran.
- `src/features/player` : lecteur, interruptions et points de reprise.
- `src/features/progress` : bilan déclaré, carnet, progression et téléchargement de l’export.

Les durées affichées sont calculées à partir des phases, échauffement et récupérations compris. Les pourcentages des voies décrivent l’orientation du contenu ; ils représentent la séance complète. Pour les contenus au barème 2, un bilan partiel utilise uniquement l’orientation des blocs confirmés. Ces valeurs ne mesurent pas les capacités de la personne.

## Contenu d’entraînement

Les séances proposées sont des compositions de démonstration non validées par un entraîneur. Les mouvements simples s’appuient sur les descriptions d’[échauffement du NHS](https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/), les [exercices de renforcement du NHS](https://www.nhs.uk/live-well/exercise/strength-exercises/) et les repères de corde du [manuel England Boxing, niveau 2](https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf). Les variantes suivantes utilisent aussi les repères de [pas latéraux du NHS](https://www.nhs.uk/live-well/exercise/balance-exercises/), de [marche du NHS](https://www.nhs.uk/live-well/exercise/walking-for-health/) et de garde et déplacement du [manuel débutant de Boxing Canada](https://boxingcanada.org/wp-content/uploads/2025/01/Instruction-Beginners-Reference-Manual-EN.pdf), sections 5.1 et 5.2. Les séquences et les associations de signaux sont originales ; ces organismes ne valident ni le programme ni les durées choisies ici.

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
