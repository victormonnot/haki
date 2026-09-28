import { getPhaseIndex } from './timer'
import {
  ENVIRONMENTS,
  EQUIPMENT,
  EXPERIENCES,
  isTrainingSetup,
  type Movement,
  type TrainingSetup,
  type Workout,
  type WorkoutPhase,
  type WorkoutVariant,
} from './workouts'

export type SessionMode = 'real' | 'demo'
export type SessionStatus = 'paused' | 'running' | 'completed' | 'stopped'

export interface SessionSnapshot {
  workoutId: string
  workoutVersion: number
  workoutTitle: string
  universe: string
  variant: WorkoutVariant
  movements: Record<string, Movement>
  setup: TrainingSetup
}

export interface SessionDraft {
  schemaVersion: 1
  id: string
  mode: SessionMode
  createdAt: number
  updatedAt: number
  status: SessionStatus
  elapsedMs: number
  snapshot: SessionSnapshot
}

const DEMO_PHASE_MS = 5_000
const MAX_PHASES = 200
const MAX_PHASE_SECONDS = 3_600
const MAX_SESSION_SECONDS = 180 * 60
const MAX_MOVEMENTS = 200
const MAX_TEXT_LENGTH = 4_000
const MAX_ID_LENGTH = 120

export function createSessionDraft(
  workout: Workout,
  variant: WorkoutVariant,
  setup: TrainingSetup,
  movements: Record<string, Movement>,
  mode: SessionMode,
  id: string,
  now: number,
): SessionDraft {
  return {
    schemaVersion: 1,
    id,
    mode,
    createdAt: now,
    updatedAt: now,
    status: 'paused',
    elapsedMs: 0,
    snapshot: structuredClone({
      workoutId: workout.id,
      workoutVersion: workout.version,
      workoutTitle: workout.title,
      universe: workout.universe,
      variant,
      movements,
      setup,
    }),
  }
}

export function getSessionDurations(draft: SessionDraft): number[] {
  return draft.snapshot.variant.phases.map((phase) =>
    draft.mode === 'demo' ? DEMO_PHASE_MS : phase.durationSeconds * 1_000,
  )
}

export function getSessionDuration(draft: SessionDraft): number {
  return getSessionDurations(draft).reduce(
    (total, duration) => total + duration,
    0,
  )
}

export function getSessionPosition(
  draft: SessionDraft,
  elapsedMs = draft.elapsedMs,
) {
  const durations = getSessionDurations(draft)
  const durationMs = durations.reduce((total, duration) => total + duration, 0)
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.min(durationMs, Math.max(0, elapsedMs))
    : 0
  const phaseIndex = getPhaseIndex(elapsed, durations)
  const phaseEnd = durations
    .slice(0, phaseIndex + 1)
    .reduce((total, duration) => total + duration, 0)

  return {
    phaseIndex,
    phase: draft.snapshot.variant.phases.at(phaseIndex),
    remainingMs: Math.max(0, phaseEnd - elapsed),
    totalRemainingMs: Math.max(0, durationMs - elapsed),
    progress: durationMs > 0 ? elapsed / durationMs : 0,
  }
}

export function restoreSessionDraft(draft: SessionDraft): SessionDraft {
  const restored = structuredClone(draft)
  if (restored.status === 'running') restored.status = 'paused'
  return restored
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  )
}

function isText(value: unknown, maximum = MAX_TEXT_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
  )
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isOptionList(
  value: unknown,
  options: readonly string[],
  allowEmpty: boolean,
) {
  return (
    Array.isArray(value) &&
    value.length <= options.length &&
    (allowEmpty || value.length > 0) &&
    Array.from(value).every(
      (item) => typeof item === 'string' && options.includes(item),
    ) &&
    new Set(value).size === value.length
  )
}

function isPhase(value: unknown): value is WorkoutPhase {
  if (
    !isRecord(value) ||
    !hasKeys(
      value,
      ['id', 'title', 'kind', 'durationSeconds', 'cue'],
      ['movementId', 'pathWeights'],
    )
  ) {
    return false
  }

  return (
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    ['warmup', 'work', 'rest', 'cooldown'].includes(value.kind as string) &&
    typeof value.durationSeconds === 'number' &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    value.durationSeconds <= MAX_PHASE_SECONDS &&
    isText(value.cue) &&
    (value.movementId === undefined ||
      isText(value.movementId, MAX_ID_LENGTH)) &&
    (value.pathWeights === undefined || isPathWeights(value.pathWeights))
  )
}

function isPathWeights(value: unknown): value is WorkoutVariant['pathWeights'] {
  return (
    isRecord(value) &&
    hasKeys(value, ['power', 'endurance', 'technique', 'strategy']) &&
    Object.values(value).every(
      (weight) =>
        typeof weight === 'number' &&
        Number.isInteger(weight) &&
        weight >= 0 &&
        weight <= 100,
    ) &&
    Object.values(value).reduce<number>(
      (total, weight) => total + (weight as number),
      0,
    ) === 100
  )
}

function isVariant(value: unknown): value is WorkoutVariant {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'id',
      'title',
      'description',
      'minExperience',
      'environments',
      'requiredEquipment',
      'needsSpace',
      'noisy',
      'phases',
      'pathWeights',
    ]) ||
    !isText(value.id, MAX_ID_LENGTH) ||
    !isText(value.title) ||
    !isText(value.description) ||
    !EXPERIENCES.some(({ id }) => id === value.minExperience) ||
    !isOptionList(
      value.environments,
      ENVIRONMENTS.map(({ id }) => id),
      false,
    ) ||
    !isOptionList(
      value.requiredEquipment,
      EQUIPMENT.map(({ id }) => id),
      true,
    ) ||
    typeof value.needsSpace !== 'boolean' ||
    typeof value.noisy !== 'boolean' ||
    !Array.isArray(value.phases) ||
    value.phases.length === 0 ||
    value.phases.length > MAX_PHASES ||
    !Array.from(value.phases).every(isPhase)
  ) {
    return false
  }

  const phases = value.phases as WorkoutPhase[]
  if (
    new Set(phases.map(({ id }) => id)).size !== phases.length ||
    phases.reduce((total, phase) => total + phase.durationSeconds, 0) >
      MAX_SESSION_SECONDS
  ) {
    return false
  }

  const activePhases = phases.filter((phase) => phase.kind !== 'rest')
  const hasPhaseWeights = activePhases.some(
    (phase) => phase.pathWeights !== undefined,
  )
  return (
    isPathWeights(value.pathWeights) &&
    (!hasPhaseWeights ||
      activePhases.every((phase) => phase.pathWeights !== undefined))
  )
}

function isMovement(value: unknown): value is Movement {
  return (
    isRecord(value) &&
    hasKeys(value, ['id', 'title', 'description', 'instructions', 'tip']) &&
    isText(value.id, MAX_ID_LENGTH) &&
    isText(value.title) &&
    isText(value.description) &&
    isText(value.tip) &&
    Array.isArray(value.instructions) &&
    value.instructions.length > 0 &&
    value.instructions.length <= 20 &&
    Array.from(value.instructions).every((instruction) => isText(instruction))
  )
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'workoutId',
      'workoutVersion',
      'workoutTitle',
      'universe',
      'variant',
      'movements',
      'setup',
    ]) ||
    !isText(value.workoutId, MAX_ID_LENGTH) ||
    !isPositiveInteger(value.workoutVersion) ||
    !isText(value.workoutTitle) ||
    !isText(value.universe) ||
    !isVariant(value.variant) ||
    !isRecord(value.setup) ||
    !Array.isArray(value.setup.equipment) ||
    value.setup.equipment.length > EQUIPMENT.length ||
    !isTrainingSetup(value.setup) ||
    !hasKeys(value.setup, [
      'environment',
      'equipment',
      'availableMinutes',
      'experience',
      'smallSpace',
      'quiet',
    ]) ||
    !isRecord(value.movements)
  ) {
    return false
  }

  const movements = value.movements
  const entries = Object.entries(movements)
  return (
    entries.length <= MAX_MOVEMENTS &&
    entries.every(
      ([id, movement]) => isMovement(movement) && movement.id === id,
    ) &&
    value.variant.phases.every(
      (phase) =>
        phase.movementId === undefined ||
        Object.hasOwn(movements, phase.movementId),
    )
  )
}

export function isSessionDraft(value: unknown): value is SessionDraft {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'schemaVersion',
      'id',
      'mode',
      'createdAt',
      'updatedAt',
      'status',
      'elapsedMs',
      'snapshot',
    ]) ||
    value.schemaVersion !== 1 ||
    !isText(value.id, MAX_ID_LENGTH) ||
    (value.mode !== 'real' && value.mode !== 'demo') ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    !['paused', 'running', 'completed', 'stopped'].includes(
      value.status as string,
    ) ||
    typeof value.elapsedMs !== 'number' ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    !isSnapshot(value.snapshot)
  ) {
    return false
  }

  const duration = value.snapshot.variant.phases.reduce(
    (total, phase) =>
      total +
      (value.mode === 'demo' ? DEMO_PHASE_MS : phase.durationSeconds * 1_000),
    0,
  )
  return (
    value.elapsedMs <= duration &&
    (value.status !== 'completed' || value.elapsedMs === duration)
  )
}
