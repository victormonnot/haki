import type { TrainingPath } from '../domain/trainingPath'

export const VIKING_PATH = {
  id: 'viking',
  title: 'L’appel du Nord',
  description:
    'Pose tes appuis, explore deux branches, puis réunis les gestes dans une dernière traversée.',
  nodes: [
    {
      id: 'leveil-du-nord',
      prerequisiteIds: [],
      acceptedCompletions: [
        {
          workoutVersion: 1,
          variantIds: ['pas-legers', 'fondations', 'appuis-en-mouvement'],
        },
      ],
      branch: 'Le premier pas',
      goal: 'Découvrir le rythme et confirmer une première séance complète.',
    },
    {
      id: 'le-socle-de-pierre',
      prerequisiteIds: ['leveil-du-nord'],
      acceptedCompletions: [
        { workoutVersion: 1, variantIds: ['appuis-stables', 'bras-et-appuis'] },
      ],
      branch: 'Appuis et maîtrise',
      goal: 'Explorer des appuis stables et des gestes contrôlés.',
    },
    {
      id: 'le-souffle-du-fjord',
      prerequisiteIds: ['leveil-du-nord'],
      acceptedCompletions: [
        { workoutVersion: 1, variantIds: ['cadence-douce', 'petite-boucle'] },
      ],
      branch: 'Rythme et attention',
      goal: 'Trouver une cadence facile à tenir, sans chercher la vitesse.',
    },
    {
      id: 'la-garde-du-rempart',
      prerequisiteIds: ['le-socle-de-pierre'],
      acceptedCompletions: [
        { workoutVersion: 1, variantIds: ['garde-tranquille', 'garde-mobile'] },
      ],
      branch: 'Appuis et maîtrise',
      goal: 'Coordonner la position des bras et les appuis.',
    },
    {
      id: 'les-signaux-du-guetteur',
      prerequisiteIds: ['le-souffle-du-fjord'],
      acceptedCompletions: [
        {
          workoutVersion: 1,
          variantIds: ['ecouter-les-cotes', 'associer-les-signaux'],
        },
      ],
      branch: 'Rythme et attention',
      goal: 'Écouter un signal et choisir le geste qui lui correspond.',
    },
    {
      id: 'la-traversee-du-nord',
      prerequisiteIds: ['la-garde-du-rempart', 'les-signaux-du-guetteur'],
      acceptedCompletions: [
        {
          workoutVersion: 1,
          variantIds: ['relier-les-gestes', 'chemin-ouvert'],
        },
      ],
      branch: 'Les chemins se rejoignent',
      goal: 'Rassembler les gestes explorés sur les deux branches.',
    },
  ],
} as const satisfies TrainingPath
