export type Environment = 'home' | 'gym' | 'outdoors'
export type Equipment =
  'rope' | 'dumbbells' | 'resistance-band' | 'punching-bag' | 'gloves'
export type Experience = 'discovery' | 'regular'

export const ENVIRONMENTS = [
  { id: 'home', label: 'À la maison' },
  { id: 'gym', label: 'En salle' },
  { id: 'outdoors', label: 'En extérieur' },
] as const satisfies readonly { id: Environment; label: string }[]

export const EQUIPMENT = [
  { id: 'rope', label: 'Corde à sauter' },
  { id: 'dumbbells', label: 'Haltères' },
  { id: 'resistance-band', label: 'Élastique' },
  { id: 'punching-bag', label: 'Sac de frappe' },
  { id: 'gloves', label: 'Gants' },
] as const satisfies readonly { id: Equipment; label: string }[]

export const EXPERIENCES = [
  { id: 'discovery', label: 'Découverte' },
  { id: 'regular', label: 'Pratique régulière' },
] as const satisfies readonly { id: Experience; label: string }[]

export interface TrainingSetup {
  environment: Environment
  equipment: Equipment[]
  availableMinutes: number
  experience: Experience
  smallSpace: boolean
  quiet: boolean
}

export interface WorkoutPhase {
  id: string
  title: string
  kind: 'warmup' | 'work' | 'rest' | 'cooldown'
  durationSeconds: number
  movementId?: string
  cue: string
}

export interface WorkoutVariant {
  id: string
  title: string
  description: string
  minExperience: Experience
  environments: Environment[]
  requiredEquipment: Equipment[]
  needsSpace: boolean
  noisy: boolean
  phases: WorkoutPhase[]
  pathWeights: {
    power: number
    endurance: number
    technique: number
    strategy: number
  }
}

export interface Workout {
  id: string
  version: number
  universe: string
  title: string
  subtitle: string
  description: string
  variants: WorkoutVariant[]
}

export interface Movement {
  id: string
  title: string
  description: string
  instructions: string[]
  tip: string
}

export function getDurationSeconds(variant: WorkoutVariant): number {
  return variant.phases.reduce(
    (total, phase) => total + phase.durationSeconds,
    0,
  )
}

export function assessVariant(
  variant: WorkoutVariant,
  setup: TrainingSetup,
): { compatible: boolean; reasons: string[] } {
  const reasons: string[] = []
  const durationSeconds = getDurationSeconds(variant)

  if (durationSeconds > setup.availableMinutes * 60) {
    reasons.push(
      `Prévois au moins ${Math.ceil(durationSeconds / 60)} min, échauffement et récupérations inclus.`,
    )
  }
  if (variant.minExperience === 'regular' && setup.experience === 'discovery') {
    reasons.push('Cette variante demande une pratique régulière.')
  }
  if (!variant.environments.includes(setup.environment)) {
    reasons.push('Cette variante n’est pas prévue pour cet environnement.')
  }

  const missingEquipment = variant.requiredEquipment.filter(
    (item) => !setup.equipment.includes(item),
  )
  if (missingEquipment.length > 0) {
    const labels = missingEquipment.map(
      (item) => EQUIPMENT.find(({ id }) => id === item)!.label,
    )
    reasons.push(`Matériel manquant : ${labels.join(', ')}.`)
  }
  if (variant.needsSpace && setup.smallSpace) {
    reasons.push('Cette variante demande un espace ample et dégagé.')
  }
  if (variant.noisy && setup.quiet) {
    reasons.push('Cette variante comprend des sauts ou des impacts sonores.')
  }

  return { compatible: reasons.length === 0, reasons }
}

export function isTrainingSetup(value: unknown): value is TrainingSetup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const setup = value as Record<string, unknown>
  return (
    ENVIRONMENTS.some(({ id }) => id === setup.environment) &&
    Array.isArray(setup.equipment) &&
    Array.from(setup.equipment).every((item) =>
      EQUIPMENT.some(({ id }) => id === item),
    ) &&
    new Set(setup.equipment).size === setup.equipment.length &&
    typeof setup.availableMinutes === 'number' &&
    Number.isInteger(setup.availableMinutes) &&
    setup.availableMinutes >= 1 &&
    setup.availableMinutes <= 180 &&
    EXPERIENCES.some(({ id }) => id === setup.experience) &&
    typeof setup.smallSpace === 'boolean' &&
    typeof setup.quiet === 'boolean'
  )
}
