import type { Movement, Workout, WorkoutPhase } from '../domain/workouts'

// Movement references; the sequences and timings below are original demo content.
// https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/
// https://www.nhs.uk/live-well/exercise/strength-exercises/
// https://www.englandboxing.org/wp-content/uploads/2022/03/Level-2-Coaching-Handbook-compressed.pdf

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
