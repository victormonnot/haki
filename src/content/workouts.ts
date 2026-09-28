import type {
  Movement,
  Workout,
  WorkoutPhase,
  WorkoutVariant,
} from '../domain/workouts'

// Movement references; the sequences and timings below are original demo content.
// https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/
// https://www.nhs.uk/live-well/exercise/strength-exercises/
// https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf
// https://www.nhs.uk/live-well/exercise/balance-exercises/
// https://www.nhs.uk/live-well/exercise/walking-for-health/
// https://boxingcanada.org/wp-content/uploads/2025/01/Instruction-Beginners-Reference-Manual-EN.pdf

export const MOVEMENTS: Record<string, Movement> = {
  'easy-march': {
    id: 'easy-march',
    title: 'Marche sur place',
    description: 'Des pas tranquilles pour entrer dans la séance ou ralentir.',
    instructions: [
      'Tiens-toi droit et regarde devant toi.',
      'Alterne de petits pas, les bras relâchés.',
      'Pose les pieds doucement et conserve une respiration confortable.',
    ],
    tip: 'Ralentis autant que nécessaire. Tu dois pouvoir parler sans forcer.',
  },
  'shoulder-rolls': {
    id: 'shoulder-rolls',
    title: 'Cercles d’épaules',
    description: 'Une mobilisation douce, debout, les bras près du corps.',
    instructions: [
      'Relâche les bras et garde les genoux souples.',
      'Dessine quelques petits cercles avec les épaules vers l’arrière.',
      'Change de sens sans chercher une grande amplitude.',
    ],
    tip: 'Le cou reste détendu ; le mouvement doit rester confortable.',
  },
  'heel-taps': {
    id: 'heel-taps',
    title: 'Talons alternés',
    description: 'Un talon devant l’autre, sans saut et sans déplacement.',
    instructions: [
      'Pose un talon légèrement devant toi, la pointe du pied relevée.',
      'Ramène le pied puis change de côté.',
      'Garde le genou d’appui souple et une allure facile.',
    ],
    tip: 'De petits gestes suffisent ; inutile de tendre la jambe loin devant.',
  },
  'mini-squat': {
    id: 'mini-squat',
    title: 'Petites flexions',
    description: 'Une flexion peu profonde, lente et contrôlée.',
    instructions: [
      'Place les pieds à la largeur des hanches, les talons au sol.',
      'Fléchis légèrement les genoux dans la direction des pieds, sans forcer.',
      'Redresse-toi doucement et respire pendant le mouvement.',
    ],
    tip: 'Réduis l’amplitude si nécessaire. Si ton équilibre est incertain, prends un appui stable ou demande un accompagnement.',
  },
  'basic-rope': {
    id: 'basic-rope',
    title: 'Corde, sauts simples',
    description:
      'De courts passages pour les personnes déjà à l’aise avec la corde.',
    instructions: [
      'Vérifie le sol, les chaussures et le dégagement autour de toi et au-dessus.',
      'Garde les coudes près du corps et fais tourner la corde avec les poignets.',
      'Saute juste assez pour laisser passer la corde, les genoux souples.',
      'Repose la corde dès que le rythme devient difficile à contrôler.',
    ],
    tip: 'Aucune figure ni recherche de vitesse. Termine le passage plus tôt si tu ne peux plus parler confortablement.',
  },
  'low-knee-lifts': {
    id: 'low-knee-lifts',
    title: 'Genoux alternés, amplitude basse',
    description: 'Une alternance lente pour coordonner les bras et les jambes.',
    instructions: [
      'Reste droit, avec les pieds à la largeur des hanches.',
      'Soulève légèrement un genou en avançant la main opposée, sans chercher à les faire se toucher.',
      'Repose le pied avant de changer de côté. Garde le genou d’appui souple.',
    ],
    tip: 'Lève peu le pied et ralentis. Arrête le passage si tu ne te sens pas stable.',
  },
  'light-curls': {
    id: 'light-curls',
    title: 'Flexions des bras avec haltères',
    description:
      'Quelques mouvements contrôlés avec une charge légère et familière.',
    instructions: [
      'Tiens un haltère léger dans chaque main, les pieds écartés à la largeur des hanches.',
      'Garde les coudes près du corps et ramène doucement les mains vers les épaules.',
      'Redescends lentement, sans balancer le buste ni bloquer la respiration.',
    ],
    tip: 'Aucun poids cible : choisis une charge facile à contrôler et repose les haltères avant chaque récupération.',
  },
  'side-steps': {
    id: 'side-steps',
    title: 'Pas latéraux',
    description:
      'Un pas de côté, puis un retour, sans saut ni croisement des pieds.',
    instructions: [
      'Vérifie que tu peux faire un petit pas de chaque côté sans obstacle.',
      'Déplace un pied sur le côté puis rapproche l’autre tranquillement.',
      'Reviens dans l’autre sens, les genoux souples et le regard devant toi.',
    ],
    tip: 'Garde des pas courts et lents. Un appui stable à proximité peut aider si ton équilibre est incertain.',
  },
  'easy-walk': {
    id: 'easy-walk',
    title: 'Marche sur un trajet dégagé',
    description:
      'Une petite boucle connue, sur un sol plat, à une allure confortable.',
    instructions: [
      'Choisis un trajet libre d’obstacles, sans marche ni circulation.',
      'Avance naturellement en regardant où tu vas, les bras détendus.',
      'Ralentis pour changer de direction et continue à respirer librement.',
    ],
    tip: 'Place le téléphone à un endroit sûr. Arrête-toi pour consulter l’écran ; aucune distance ni vitesse n’est demandée.',
  },
  'relaxed-guard': {
    id: 'relaxed-guard',
    title: 'Installer et relâcher la garde',
    description:
      'Des repères de posture inspirés de la boxe, sans frappe ni partenaire.',
    instructions: [
      'Décale légèrement un pied devant l’autre, en gardant un écart latéral et les genoux souples.',
      'Place les mains près du visage, les poignets droits et les coudes près du corps, sans crispation.',
      'Respire, puis relâche les bras quelques instants avant de reprendre la position.',
    ],
    tip: 'Ne serre pas les poings et ne cherche pas à tenir malgré la fatigue. Ces repères ne remplacent pas la correction d’un entraîneur.',
  },
  'guard-side-step': {
    id: 'guard-side-step',
    title: 'Un pas latéral en garde',
    description:
      'Déplacer une garde souple de quelques centimètres, puis revenir.',
    instructions: [
      'Prends une garde confortable et vérifie le dégagement de chaque côté.',
      'Pour aller à gauche, pars du pied gauche ; pour aller à droite, pars du pied droit.',
      'L’autre pied suit en conservant l’écart initial. Ne croise pas les pieds et ne les colle pas.',
      'Marque un arrêt stable avant de revenir. Relâche les bras dès que nécessaire.',
    ],
    tip: 'Tout se fait lentement, sans saut et sans coup. Le but est de retrouver ses appuis après chaque petit déplacement.',
  },
  'direction-signal': {
    id: 'direction-signal',
    title: 'Répondre au côté annoncé',
    description: 'Une petite touche du pied du côté entendu ou affiché.',
    instructions: [
      'Marche doucement sur place en attendant la consigne.',
      'Au mot « gauche » ou « droite », pose la pointe du pied correspondant juste à côté de toi.',
      'Ramène le pied puis reprends les petits pas jusqu’à la prochaine consigne.',
    ],
    tip: 'Prends le temps de répondre. Si tu rates une consigne, attends la suivante : aucun score de justesse ou de rapidité n’est calculé.',
  },
  'coded-signal': {
    id: 'coded-signal',
    title: 'Associer un mot à un côté',
    description: 'Deux mots à retenir : mer pour gauche, terre pour droite.',
    instructions: [
      'Pendant les petits pas sur place, écoute ou lis le mot annoncé.',
      '« Mer » : touche doucement le sol à gauche avec la pointe du pied gauche. « Terre » : fais la même chose à droite.',
      'Reviens au centre puis reprends ta marche. La règle reste identique tout au long de la séance.',
    ],
    tip: 'Il s’agit d’un exercice de réponse à une consigne fixe, sans mesure de performance ni évaluation tactique.',
  },
}

function recovery(id: string, durationSeconds: number): WorkoutPhase {
  return {
    id,
    title: 'Récupération',
    kind: 'rest',
    durationSeconds,
    cue: 'Prends le temps de récupérer. Tu peux prolonger cette pause.',
  }
}

function fullWarmup(prefix: string): WorkoutPhase[] {
  return [
    {
      id: `${prefix}-warmup-march`,
      title: 'Entrer dans le rythme',
      kind: 'warmup',
      durationSeconds: 180,
      movementId: 'easy-march',
      cue: 'Commence tranquillement et augmente seulement si tu es à l’aise.',
    },
    {
      id: `${prefix}-warmup-shoulders`,
      title: 'Délier les épaules',
      kind: 'warmup',
      durationSeconds: 60,
      movementId: 'shoulder-rolls',
      cue: 'Quelques cercles lents, puis relâche les bras.',
    },
    {
      id: `${prefix}-warmup-heels`,
      title: 'Réveiller les appuis',
      kind: 'warmup',
      durationSeconds: 60,
      movementId: 'heel-taps',
      cue: 'Trouve une alternance simple et confortable.',
    },
    {
      id: `${prefix}-warmup-flexions`,
      title: 'Explorer la flexion',
      kind: 'warmup',
      durationSeconds: 60,
      movementId: 'mini-squat',
      cue: 'Fais quelques petites flexions et repose-toi entre les répétitions.',
    },
  ]
}

function cooldown(id: string): WorkoutPhase {
  return {
    id,
    title: 'Retour au calme',
    kind: 'cooldown',
    durationSeconds: 120,
    movementId: 'easy-march',
    cue: 'Réduis progressivement la cadence et termine à ton rythme.',
  }
}

export const FIRST_WORKOUT: Workout = {
  id: 'leveil-du-nord',
  version: 1,
  universe: 'Viking',
  title: 'L’Éveil du Nord',
  subtitle: 'Poser les premiers appuis.',
  description:
    'Des appuis stables, des gestes simples et une allure confortable. Un premier rendez-vous pour construire la suite.',
  variants: [
    {
      id: 'pas-legers',
      title: 'Pas légers',
      description:
        'Une mise en mouvement douce, sans sauts ni matériel, adaptée à un espace réduit. Marche et talons alternés pour commencer simplement.',
      minExperience: 'discovery',
      environments: ['home', 'gym', 'outdoors'],
      requiredEquipment: [],
      needsSpace: false,
      noisy: false,
      phases: [
        {
          id: 'pas-legers-warmup-march',
          title: 'Entrer dans le rythme',
          kind: 'warmup',
          durationSeconds: 180,
          movementId: 'easy-march',
          cue: 'Commence par de petits pas tranquilles.',
        },
        {
          id: 'pas-legers-warmup-shoulders',
          title: 'Délier les épaules',
          kind: 'warmup',
          durationSeconds: 60,
          movementId: 'shoulder-rolls',
          cue: 'Quelques cercles faciles, puis relâche les bras.',
        },
        {
          id: 'pas-legers-heels-1',
          title: 'Trouver ses appuis',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'heel-taps',
          cue: 'Alterne les talons, sans accélérer.',
        },
        recovery('pas-legers-rest-1', 30),
        {
          id: 'pas-legers-heels-2',
          title: 'Retrouver le rythme',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'heel-taps',
          cue: 'Reprends la même alternance, avec des gestes faciles.',
        },
        recovery('pas-legers-rest-2', 30),
        cooldown('pas-legers-cooldown'),
      ],
      pathWeights: { power: 0, endurance: 50, technique: 50, strategy: 0 },
    },
    {
      id: 'fondations',
      title: 'Fondations',
      description:
        'Un peu plus de temps pour explorer les appuis et les petites flexions. Sans saut ni matériel, avec des récupérations entre chaque passage.',
      minExperience: 'discovery',
      environments: ['home', 'gym', 'outdoors'],
      requiredEquipment: [],
      needsSpace: false,
      noisy: false,
      phases: [
        ...fullWarmup('fondations'),
        {
          id: 'fondations-flexions-1',
          title: 'Construire les fondations',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'mini-squat',
          cue: 'Privilégie quelques répétitions lentes, avec une petite amplitude.',
        },
        recovery('fondations-rest-1', 30),
        {
          id: 'fondations-heels-1',
          title: 'Garder le rythme',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'heel-taps',
          cue: 'Reste à une cadence où tu peux parler facilement.',
        },
        recovery('fondations-rest-2', 30),
        {
          id: 'fondations-flexions-2',
          title: 'Retrouver le contrôle',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'mini-squat',
          cue: 'Retrouve une amplitude confortable ; la vitesse ne compte pas.',
        },
        recovery('fondations-rest-3', 30),
        {
          id: 'fondations-heels-2',
          title: 'Poser les derniers appuis',
          kind: 'work',
          durationSeconds: 30,
          movementId: 'heel-taps',
          cue: 'Quelques alternances faciles avant le retour au calme.',
        },
        recovery('fondations-rest-4', 30),
        cooldown('fondations-cooldown'),
      ],
      pathWeights: { power: 35, endurance: 30, technique: 35, strategy: 0 },
    },
    {
      id: 'appuis-en-mouvement',
      title: 'Appuis en mouvement',
      description:
        'Pour une pratique régulière et une corde déjà maîtrisée : quatre passages courts, espacés de récupérations. Prévois un sol adapté et un large dégagement.',
      minExperience: 'regular',
      environments: ['home', 'gym', 'outdoors'],
      requiredEquipment: ['rope'],
      needsSpace: true,
      noisy: true,
      phases: [
        ...fullWarmup('appuis'),
        {
          id: 'appuis-heels',
          title: 'Trouver une cadence facile',
          kind: 'work',
          durationSeconds: 60,
          movementId: 'heel-taps',
          cue: 'Reste à l’aise avant de prendre la corde.',
        },
        {
          ...recovery('appuis-prepare-rope', 60),
          title: 'Préparer la corde',
          cue: 'Récupère et vérifie que la corde passe sans obstacle.',
        },
        ...[1, 2, 3, 4].flatMap<WorkoutPhase>((round) => [
          {
            id: `appuis-rope-${round}`,
            title: `Corde · passage ${round}`,
            kind: 'work',
            durationSeconds: 20,
            movementId: 'basic-rope',
            cue: 'De petits sauts contrôlés. Arrête le passage plus tôt si nécessaire.',
          },
          recovery(`appuis-rest-${round}`, 40),
        ]),
        cooldown('appuis-cooldown'),
      ],
      pathWeights: { power: 10, endurance: 50, technique: 40, strategy: 0 },
    },
  ],
}

type WorkBlock = Pick<WorkoutPhase, 'title' | 'movementId' | 'cue'>
type VariantRequirements = Pick<
  WorkoutVariant,
  | 'minExperience'
  | 'environments'
  | 'requiredEquipment'
  | 'needsSpace'
  | 'noisy'
>
type VariantDetails = Omit<
  WorkoutVariant,
  keyof VariantRequirements | 'phases'
> &
  Partial<VariantRequirements>

function withPhaseWeights(variant: WorkoutVariant): WorkoutVariant {
  const phases = variant.phases.map((phase) =>
    phase.kind === 'rest'
      ? phase
      : {
          ...phase,
          pathWeights:
            phase.kind === 'work'
              ? { ...variant.pathWeights }
              : { power: 0, endurance: 50, technique: 50, strategy: 0 },
        },
  )
  const movementSeconds = phases.reduce(
    (sum, phase) => sum + (phase.kind === 'rest' ? 0 : phase.durationSeconds),
    0,
  )
  const paths = ['power', 'endurance', 'technique', 'strategy'] as const
  const shares = paths.map((path, index) => {
    const numerator = phases.reduce(
      (sum, phase) =>
        sum + phase.durationSeconds * (phase.pathWeights?.[path] ?? 0),
      0,
    )
    return {
      path,
      index,
      percent: Math.floor(numerator / movementSeconds),
      remainder: numerator % movementSeconds,
    }
  })
  const missing = 100 - shares.reduce((sum, share) => sum + share.percent, 0)
  const ordered = [...shares].sort(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  )
  for (let index = 0; index < missing; index += 1) ordered[index].percent += 1
  const pathWeights = { power: 0, endurance: 0, technique: 0, strategy: 0 }
  for (const share of shares) pathWeights[share.path] = share.percent
  return { ...variant, phases, pathWeights }
}

function practiceVariant(
  details: VariantDetails,
  blocks: WorkBlock[],
): WorkoutVariant {
  return withPhaseWeights({
    minExperience: 'discovery',
    environments: ['home', 'gym', 'outdoors'],
    requiredEquipment: [],
    needsSpace: false,
    noisy: false,
    ...details,
    phases: [
      ...fullWarmup(details.id),
      ...blocks.flatMap<WorkoutPhase>((block, index) => [
        {
          ...block,
          id: `${details.id}-work-${index + 1}`,
          kind: 'work',
          durationSeconds: 30,
        },
        recovery(`${details.id}-rest-${index + 1}`, 30),
      ]),
      cooldown(`${details.id}-cooldown`),
    ],
  })
}

function signalVariant(
  details: VariantDetails,
  coded: boolean,
): WorkoutVariant {
  const warmup = fullWarmup(details.id)
  warmup[warmup.length - 1] = {
    ...warmup[warmup.length - 1],
    cue: coded
      ? 'Fais quelques petites flexions. Pour les signaux à venir, retiens : mer veut dire gauche, terre veut dire droite. Après chaque réponse, marche doucement sur place.'
      : 'Fais quelques petites flexions. Ensuite, écoute ou lis le côté annoncé, touche doucement le sol de ce côté, puis reprends ta marche sur place.',
  }
  const signals = coded
    ? ['Mer', 'Terre', 'Terre', 'Mer', 'Terre', 'Mer', 'Mer', 'Terre']
    : [
        'Gauche',
        'Droite',
        'Droite',
        'Gauche',
        'Droite',
        'Gauche',
        'Gauche',
        'Droite',
      ]
  return withPhaseWeights({
    minExperience: 'discovery',
    environments: ['home', 'gym', 'outdoors'],
    requiredEquipment: [],
    needsSpace: false,
    noisy: false,
    ...details,
    phases: [
      ...warmup,
      ...signals.flatMap<WorkoutPhase>((signal, index) => {
        const phase: WorkoutPhase = {
          id: `${details.id}-signal-${index + 1}`,
          title: `Signal ${index + 1}`,
          kind: 'work',
          durationSeconds: 15,
          movementId: coded ? 'coded-signal' : 'direction-signal',
          cue: coded
            ? `${signal}. Applique la règle, puis reprends les petits pas.`
            : `${signal}. Touche de ce côté, reviens, puis marche doucement.`,
        }
        return index % 2 === 1
          ? [phase, recovery(`${details.id}-rest-${(index + 1) / 2}`, 30)]
          : [phase]
      }),
      cooldown(`${details.id}-cooldown`),
    ],
  })
}

const STONE_FOUNDATION: Workout = {
  id: 'le-socle-de-pierre',
  version: 1,
  universe: 'Viking',
  title: 'Le Socle de pierre',
  subtitle: 'Contrôler le geste avant de chercher la force.',
  description:
    'Quelques flexions lentes, des appuis retrouvés et des pauses régulières. Choisis le travail sans matériel ou une variante avec des haltères légers, sans objectif de charge ni de répétitions.',
  variants: [
    practiceVariant(
      {
        id: 'appuis-stables',
        title: 'Appuis stables',
        description:
          'Petites flexions et genoux alternés à faible amplitude. Quatre passages courts, sans saut, sans matériel et sans déplacement.',
        pathWeights: { power: 40, endurance: 20, technique: 40, strategy: 0 },
      },
      [
        {
          title: 'Descendre avec contrôle',
          movementId: 'mini-squat',
          cue: 'Quelques flexions peu profondes. Prends le temps de redescendre et de te redresser.',
        },
        {
          title: 'Coordonner les appuis',
          movementId: 'low-knee-lifts',
          cue: 'Soulève peu le genou, avance la main opposée, puis repose le pied avant de changer de côté.',
        },
        {
          title: 'Retrouver une flexion facile',
          movementId: 'mini-squat',
          cue: 'Reprends la même petite amplitude. Aucune répétition à rattraper.',
        },
        {
          title: 'Reposer chaque pied',
          movementId: 'low-knee-lifts',
          cue: 'Alterne lentement et retrouve ton équilibre entre deux gestes.',
        },
      ],
    ),
    practiceVariant(
      {
        id: 'bras-et-appuis',
        title: 'Bras et appuis',
        description:
          'Les mêmes flexions courtes, associées à des flexions de bras avec haltères. Pour une charge légère déjà familière ; repose les poids pendant les récupérations.',
        minExperience: 'regular',
        requiredEquipment: ['dumbbells'],
        pathWeights: { power: 45, endurance: 20, technique: 35, strategy: 0 },
      },
      [
        {
          title: 'Installer les appuis',
          movementId: 'mini-squat',
          cue: 'Sans les haltères, fais quelques petites flexions lentes.',
        },
        {
          title: 'Accompagner la charge',
          movementId: 'light-curls',
          cue: 'Prends tes haltères légers. Coudes près du corps, monte et redescends sans balancer le buste.',
        },
        {
          title: 'Revenir aux jambes',
          movementId: 'mini-squat',
          cue: 'Les haltères restent posés. Retrouve une flexion confortable, sans chercher à aller plus bas.',
        },
        {
          title: 'Finir avec précision',
          movementId: 'light-curls',
          cue: 'Reprends les haltères pour quelques mouvements faciles, puis repose-les doucement.',
        },
      ],
    ),
  ],
}

const FJORD_BREATH: Workout = {
  id: 'le-souffle-du-fjord',
  version: 1,
  universe: 'Viking',
  title: 'Le Souffle du fjord',
  subtitle: 'Garder une allure que tu peux choisir.',
  description:
    'Alterner des pas simples et des récupérations, avec une respiration confortable. Aucune distance à couvrir, aucune cadence imposée : la régularité vient avant la vitesse.',
  variants: [
    practiceVariant(
      {
        id: 'cadence-douce',
        title: 'Cadence douce',
        description:
          'Marche sur place, talons puis genoux alternés. Une mise en rythme sans matériel, sans saut et dans un petit espace.',
        pathWeights: { power: 0, endurance: 65, technique: 35, strategy: 0 },
      },
      [
        {
          title: 'Trouver son allure',
          movementId: 'easy-march',
          cue: 'Marche à une allure où tu peux parler facilement, les épaules détendues.',
        },
        {
          title: 'Changer de rythme sans accélérer',
          movementId: 'heel-taps',
          cue: 'Remplace les petits pas par des talons alternés, sans accélérer.',
        },
        {
          title: 'Lier les bras et les jambes',
          movementId: 'low-knee-lifts',
          cue: 'Genou peu levé, main opposée en avant. Fais de petits gestes à une allure facile.',
        },
        {
          title: 'Retrouver ses petits pas',
          movementId: 'easy-march',
          cue: 'Reviens à la marche sur place. Choisis une cadence aussi confortable qu’au début.',
        },
      ],
    ),
    practiceVariant(
      {
        id: 'petite-boucle',
        title: 'Petite boucle',
        description:
          'Marche sur une petite boucle dégagée et pas latéraux. Demande de la place, mais aucun matériel ni objectif de distance.',
        needsSpace: true,
        pathWeights: { power: 0, endurance: 65, technique: 35, strategy: 0 },
      },
      [
        {
          title: 'Parcourir la boucle',
          movementId: 'easy-walk',
          cue: 'Marche sur ton trajet dégagé. Ralentis à chaque changement de direction.',
        },
        {
          title: 'Explorer les côtés',
          movementId: 'side-steps',
          cue: 'Un petit pas latéral, puis un retour. Pose chaque pied tranquillement.',
        },
        {
          title: 'Reprendre le trajet',
          movementId: 'easy-walk',
          cue: 'Reprends la même boucle, sans chercher à parcourir plus de distance.',
        },
        {
          title: 'Terminer de côté',
          movementId: 'side-steps',
          cue: 'Retrouve tes petits pas latéraux, les genoux souples et le regard devant toi.',
        },
      ],
    ),
  ],
}

const RAMPART_GUARD: Workout = {
  id: 'la-garde-du-rempart',
  version: 1,
  universe: 'Viking',
  title: 'La Garde du rempart',
  subtitle: 'Trouver une posture, puis la retrouver.',
  description:
    'Découvrir une garde souple et des appuis décalés, avec des relâchements fréquents. Aucun coup ni partenaire : ces repères de démonstration demandent une validation avec un entraîneur pour apprendre la boxe.',
  variants: [
    practiceVariant(
      {
        id: 'garde-tranquille',
        title: 'Garde tranquille',
        description:
          'Installer la garde, relâcher les bras et retrouver des appuis simples. Sans déplacement, sans matériel et sans maintien prolongé.',
        pathWeights: { power: 0, endurance: 25, technique: 75, strategy: 0 },
      },
      [
        {
          title: 'Installer une garde souple',
          movementId: 'relaxed-guard',
          cue: 'Un pied légèrement devant l’autre, les mains souples près du visage. Relâche puis retrouve la position.',
        },
        {
          title: 'Détendre les appuis',
          movementId: 'heel-taps',
          cue: 'Laisse les bras retomber et alterne quelques talons devant toi.',
        },
        {
          title: 'Revenir à la position',
          movementId: 'relaxed-guard',
          cue: 'Retrouve tes pieds décalés et tes poignets droits. Respire, puis relâche les bras régulièrement.',
        },
        {
          title: 'Repartir sans tension',
          movementId: 'easy-march',
          cue: 'Quelques pas faciles, les mains et les épaules détendues.',
        },
      ],
    ),
    practiceVariant(
      {
        id: 'garde-mobile',
        title: 'Garde mobile',
        description:
          'Retrouver sa garde après un petit déplacement latéral. Prévois un espace dégagé ; le pied du côté choisi part en premier et les pieds ne se croisent pas.',
        needsSpace: true,
        pathWeights: { power: 0, endurance: 25, technique: 75, strategy: 0 },
      },
      [
        {
          title: 'Trouver sa base',
          movementId: 'relaxed-guard',
          cue: 'Prends une garde confortable et retrouve un appui stable avant de relâcher.',
        },
        {
          title: 'Déplacer puis stabiliser',
          movementId: 'guard-side-step',
          cue: 'Un petit pas latéral, le pied du côté choisi en premier. Garde l’écart des pieds, puis reviens.',
        },
        {
          title: 'Retrouver sa garde',
          movementId: 'relaxed-guard',
          cue: 'Reviens à une garde détendue. Relâche les bras plusieurs fois pendant ce passage.',
        },
        {
          title: 'Revenir au même appui',
          movementId: 'guard-side-step',
          cue: 'Déplace-toi de quelques centimètres seulement. Arrête-toi stable avant chaque retour.',
        },
      ],
    ),
  ],
}

const LOOKOUT_SIGNALS: Workout = {
  id: 'les-signaux-du-guetteur',
  version: 1,
  universe: 'Viking',
  title: 'Les Signaux du guetteur',
  subtitle: 'Écouter une consigne et choisir son geste.',
  description:
    'Huit signaux audio ou visuels pour choisir une petite touche du pied à gauche ou à droite. La suite est fixe et la réponse n’est pas évaluée : ni test de réflexes, ni mesure de compétence tactique.',
  variants: [
    signalVariant(
      {
        id: 'ecouter-les-cotes',
        title: 'Écouter les côtés',
        description:
          'Réponds au côté annoncé, puis marche doucement en attendant le signal suivant. Sans saut, sans matériel et sans recherche de vitesse.',
        pathWeights: { power: 0, endurance: 0, technique: 20, strategy: 80 },
      },
      false,
    ),
    signalVariant(
      {
        id: 'associer-les-signaux',
        title: 'Associer les signaux',
        description:
          'La règle reste la même : mer veut dire gauche, terre veut dire droite. Associe le mot à ton geste, puis reprends les petits pas ; aucun score de réussite.',
        pathWeights: { power: 0, endurance: 0, technique: 20, strategy: 80 },
      },
      true,
    ),
  ],
}

const NORTHERN_CROSSING: Workout = {
  id: 'la-traversee-du-nord',
  version: 1,
  universe: 'Viking',
  title: 'La Traversée du Nord',
  subtitle: 'Relier les repères déjà rencontrés.',
  description:
    'Retrouver les flexions, la coordination et la garde dans une même séance, avec un repos entre les gestes. Une synthèse au même volume que les étapes précédentes, sans défi de vitesse ou de charge.',
  variants: [
    practiceVariant(
      {
        id: 'relier-les-gestes',
        title: 'Relier les gestes',
        description:
          'Quatre repères sans déplacement : petites flexions, genoux alternés, garde souple et talons alternés. Tout tient dans un espace réduit.',
        pathWeights: { power: 20, endurance: 40, technique: 40, strategy: 0 },
      },
      [
        {
          title: 'Retrouver le socle',
          movementId: 'mini-squat',
          cue: 'Quelques petites flexions lentes, dans l’amplitude que tu connais.',
        },
        {
          title: 'Garder le fil du mouvement',
          movementId: 'low-knee-lifts',
          cue: 'Alterne un genou peu levé et la main opposée, en reposant bien chaque pied.',
        },
        {
          title: 'Retrouver le rempart',
          movementId: 'relaxed-guard',
          cue: 'Installe ta garde souple puis relâche. Aucun maintien à prolonger.',
        },
        {
          title: 'Poser les derniers talons',
          movementId: 'heel-taps',
          cue: 'Reviens aux talons alternés, sans accélérer avant le retour au calme.',
        },
      ],
    ),
    practiceVariant(
      {
        id: 'chemin-ouvert',
        title: 'Chemin ouvert',
        description:
          'La même durée, avec une petite boucle de marche et un déplacement latéral en garde. Prévois un espace plat et dégagé, sans matériel.',
        needsSpace: true,
        pathWeights: { power: 20, endurance: 40, technique: 40, strategy: 0 },
      },
      [
        {
          title: 'Reprendre le chemin',
          movementId: 'easy-walk',
          cue: 'Marche sur ton trajet connu, avec des changements de direction tranquilles.',
        },
        {
          title: 'Retrouver le socle',
          movementId: 'mini-squat',
          cue: 'Arrête-toi dans un endroit dégagé pour quelques petites flexions.',
        },
        {
          title: 'Déplacer le rempart',
          movementId: 'guard-side-step',
          cue: 'Un petit pas de côté en garde, sans croiser les pieds, puis un retour stable.',
        },
        {
          title: 'Refermer la boucle',
          movementId: 'easy-walk',
          cue: 'Reprends la marche à une allure confortable, sans chercher à aller plus loin.',
        },
      ],
    ),
  ],
}

export const WORKOUTS: Workout[] = [
  FIRST_WORKOUT,
  STONE_FOUNDATION,
  FJORD_BREATH,
  RAMPART_GUARD,
  LOOKOUT_SIGNALS,
  NORTHERN_CROSSING,
]

export function getWorkout(id: string): Workout | undefined {
  return WORKOUTS.find((workout) => workout.id === id)
}
