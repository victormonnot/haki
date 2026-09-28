import {
  getSessionDurations,
  isSessionDraft,
  type SessionDraft,
} from './session'
import type { WorkoutPhase } from './workouts'

export type PathId = 'power' | 'endurance' | 'technique' | 'strategy'

/** Historical policy: add a new version instead of changing recorded reward rules. */
export const REWARD_POLICY_V1 = {
  policyVersion: 1,
  xpPerMinute: 10,
  xpPerLevel: 100,
} as const

export const REWARD_POLICY_V2 = {
  ...REWARD_POLICY_V1,
  policyVersion: 2,
} as const

export const REWARD_POLICY_V3 = {
  ...REWARD_POLICY_V1,
  policyVersion: 3,
} as const

export const MIN_ACTIVITY_DATE = Date.UTC(2000, 0, 1)

export const PATHS = [
  { id: 'power', label: 'Le Puissant' },
  { id: 'endurance', label: 'L’Infatigable' },
  { id: 'technique', label: 'Le Technicien' },
  { id: 'strategy', label: 'Le Stratège' },
] as const satisfies readonly { id: PathId; label: string }[]

export interface PhaseResult {
  phaseId: string
  performedSeconds: number
}

export interface GuidedActivity {
  schemaVersion: 1
  id: string
  kind: 'guided'
  recordedAt: number
  revision?: number
  updatedAt?: number
  occurredAt?: number
  notes?: string
  session: SessionDraft
  result: {
    phases: PhaseResult[]
    performedSeconds: number
    status: 'completed' | 'partial'
  }
  reward: {
    policyVersion: 1 | 2
    xpPerMinute: 10
    xpPerLevel: 100
    totalXp: number
    pathXp: Record<PathId, number>
  }
}

export interface ManualActivity {
  schemaVersion: 1
  id: string
  kind: 'manual'
  recordedAt: number
  revision: number
  updatedAt: number
  occurredAt: number
  notes: string
  title: string
  durationSeconds: number
  pathIds: PathId[]
  reward: {
    policyVersion: 3
    xpPerMinute: 10
    xpPerLevel: 100
    totalXp: number
    pathXp: Record<PathId, number>
  }
}

export type Activity = GuidedActivity | ManualActivity

export interface ManualActivityInput {
  id: string
  title: string
  occurredAt: number
  durationSeconds: number
  pathIds: PathId[]
  notes: string
}

export type ManualActivityChanges = Omit<ManualActivityInput, 'id'>

export interface GuidedActivityChanges {
  phases: PhaseResult[]
  occurredAt: number
  notes: string
}

function emptyPathXp(): Record<PathId, number> {
  return { power: 0, endurance: 0, technique: 0, strategy: 0 }
}

export function getReportablePhases(
  draft: SessionDraft,
): { phase: WorkoutPhase; availableSeconds: number }[] {
  const durations = getSessionDurations(draft)
  let phaseStartMs = 0

  return draft.snapshot.variant.phases.flatMap((phase, index) => {
    const durationMs = durations[index]
    const availableSeconds = Math.floor(
      Math.max(0, Math.min(durationMs, draft.elapsedMs - phaseStartMs)) / 1_000,
    )
    phaseStartMs += durationMs
    return phase.kind === 'rest' ? [] : [{ phase, availableSeconds }]
  })
}

function distributeXp(
  totalXp: number,
  weights: Record<PathId, number>,
  totalWeight = 100,
): Record<PathId, number> {
  const pathXp = emptyPathXp()
  const remainders = PATHS.map(({ id }, index) => {
    const weightedXp = totalXp * weights[id]
    pathXp[id] = Math.floor(weightedXp / totalWeight)
    return { id, index, remainder: weightedXp % totalWeight }
  }).sort(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  )
  const remainder =
    totalXp - Object.values(pathXp).reduce((total, xp) => total + xp, 0)

  for (let index = 0; index < remainder; index += 1) {
    pathXp[remainders[index].id] += 1
  }
  return pathXp
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKeys(value: object, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

export function createActivity(
  session: SessionDraft,
  results: PhaseResult[],
  now: number,
): GuidedActivity {
  if (
    !isSessionDraft(session) ||
    session.mode !== 'real' ||
    (session.status !== 'completed' && session.status !== 'stopped')
  ) {
    throw new Error(
      'Seule une séance réelle terminée ou arrêtée peut être enregistrée.',
    )
  }
  if (
    !Number.isSafeInteger(now) ||
    !Number.isFinite(new Date(now).getTime()) ||
    now < session.updatedAt
  ) {
    throw new Error(
      'La date du bilan doit suivre le dernier point de la séance.',
    )
  }

  const reportable = getReportablePhases(session)
  if (!Array.isArray(results) || results.length !== reportable.length) {
    throw new Error('Confirme chaque étape de mouvement une seule fois.')
  }

  const available = new Map(
    reportable.map(({ phase, availableSeconds }) => [
      phase.id,
      availableSeconds,
    ]),
  )
  const performed = new Map<string, number>()
  for (const result of results) {
    if (
      !isRecord(result) ||
      !hasKeys(result, ['phaseId', 'performedSeconds']) ||
      typeof result.phaseId !== 'string' ||
      !available.has(result.phaseId) ||
      performed.has(result.phaseId)
    ) {
      throw new Error(
        'Les étapes confirmées ne correspondent pas à cette séance.',
      )
    }
    const maximum = available.get(result.phaseId)!
    if (
      typeof result.performedSeconds !== 'number' ||
      !Number.isInteger(result.performedSeconds) ||
      result.performedSeconds < 0 ||
      result.performedSeconds > maximum
    ) {
      throw new Error(
        'Le temps confirmé doit être entier et limité au temps chronométré de l’étape.',
      )
    }
    performed.set(result.phaseId, result.performedSeconds)
  }

  const phases = reportable.map(({ phase }) => ({
    phaseId: phase.id,
    performedSeconds: performed.get(phase.id)!,
  }))
  const performedSeconds = phases.reduce(
    (total, phase) => total + phase.performedSeconds,
    0,
  )
  if (performedSeconds < 1) {
    throw new Error(
      'Confirme au moins une seconde de mouvement avant d’enregistrer.',
    )
  }

  const completed =
    session.status === 'completed' &&
    reportable.every(
      ({ phase, availableSeconds }) =>
        performed.get(phase.id) === availableSeconds,
    )
  const usesPhaseWeights = reportable.every(
    ({ phase }) => phase.pathWeights !== undefined,
  )
  const policy = usesPhaseWeights ? REWARD_POLICY_V2 : REWARD_POLICY_V1
  const totalXp = Math.floor((performedSeconds * policy.xpPerMinute) / 60)
  const weights = usesPhaseWeights
    ? emptyPathXp()
    : session.snapshot.variant.pathWeights
  if (usesPhaseWeights) {
    for (const { phase } of reportable) {
      for (const { id } of PATHS) {
        weights[id] += performed.get(phase.id)! * phase.pathWeights![id]
      }
    }
  }

  return {
    schemaVersion: 1,
    id: session.id,
    kind: 'guided',
    recordedAt: now,
    session: structuredClone(session),
    result: {
      phases,
      performedSeconds,
      status: completed ? 'completed' : 'partial',
    },
    reward: {
      ...policy,
      totalXp,
      pathXp: distributeXp(
        totalXp,
        weights,
        usesPhaseWeights ? performedSeconds * 100 : 100,
      ),
    },
  }
}

function isTimestamp(
  value: unknown,
  minimum = MIN_ACTIVITY_DATE,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    Number.isFinite(new Date(value).getTime())
  )
}

function normalizeDetails(occurredAt: unknown, notes: unknown, now: number) {
  if (!isTimestamp(occurredAt) || occurredAt > now) {
    throw new Error(
      'Choisis une date passée, entre le 1er janvier 2000 et maintenant.',
    )
  }
  if (typeof notes !== 'string' || notes.trim().length > 2_000) {
    throw new Error('La note peut contenir au maximum 2 000 caractères.')
  }
  return { occurredAt, notes: notes.trim() }
}

export function createManualActivity(
  input: ManualActivityInput,
  now: number,
): ManualActivity {
  if (!isTimestamp(now))
    throw new Error('La date d’enregistrement est invalide.')
  if (
    !isRecord(input) ||
    !hasKeys(input, [
      'id',
      'title',
      'occurredAt',
      'durationSeconds',
      'pathIds',
      'notes',
    ])
  ) {
    throw new Error(
      'Les informations de l’activité sont incomplètes ou invalides.',
    )
  }
  if (
    typeof input.id !== 'string' ||
    !input.id.trim() ||
    input.id.length > 120
  ) {
    throw new Error('L’identifiant de l’activité est invalide.')
  }
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.trim().length > 100
  ) {
    throw new Error('Donne un titre de 1 à 100 caractères à cette activité.')
  }
  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < 60 ||
    input.durationSeconds > 180 * 60 ||
    input.durationSeconds % 60 !== 0
  ) {
    throw new Error(
      'La durée doit être un nombre entier de minutes, entre 1 et 180.',
    )
  }
  if (
    !Array.isArray(input.pathIds) ||
    input.pathIds.length < 1 ||
    input.pathIds.length > PATHS.length ||
    !Array.from(input.pathIds).every((id) =>
      PATHS.some((path) => path.id === id),
    ) ||
    new Set(input.pathIds).size !== input.pathIds.length
  ) {
    throw new Error('Sélectionne de 1 à 4 voies travaillées, sans doublon.')
  }
  const details = normalizeDetails(input.occurredAt, input.notes, now)
  const pathIds = PATHS.filter(({ id }) => input.pathIds.includes(id)).map(
    ({ id }) => id,
  )
  const weights = emptyPathXp()
  for (const id of pathIds) weights[id] = 1
  const totalXp = Math.floor(
    (input.durationSeconds * REWARD_POLICY_V3.xpPerMinute) / 60,
  )
  return {
    schemaVersion: 1,
    id: input.id,
    kind: 'manual',
    recordedAt: now,
    revision: 1,
    updatedAt: now,
    ...details,
    title: input.title.trim(),
    durationSeconds: input.durationSeconds,
    pathIds,
    reward: {
      ...REWARD_POLICY_V3,
      totalXp,
      pathXp: distributeXp(totalXp, weights, pathIds.length),
    },
  }
}

export function getActivityDate(activity: Activity): number {
  return activity.kind === 'manual'
    ? activity.occurredAt
    : (activity.occurredAt ?? activity.session.createdAt)
}

export function getActivityTitle(activity: Activity): string {
  return activity.kind === 'manual'
    ? activity.title
    : activity.session.snapshot.workoutTitle
}

export function getActivityDuration(activity: Activity): number {
  return activity.kind === 'manual'
    ? activity.durationSeconds
    : activity.result.performedSeconds
}

export function getActivityRevision(activity: Activity): number {
  return activity.revision ?? 1
}

export function getActivityNotes(activity: Activity): string {
  return activity.notes ?? ''
}

function assertAmendmentTime(activity: Activity, now: number) {
  if (
    !isTimestamp(now) ||
    now < (activity.updatedAt ?? activity.recordedAt) ||
    getActivityRevision(activity) >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      'La correction doit suivre la dernière version de l’activité.',
    )
  }
}

export function amendGuidedActivity(
  activity: GuidedActivity,
  changes: GuidedActivityChanges,
  now: number,
): GuidedActivity {
  if (!isActivity(activity) || activity.kind !== 'guided')
    throw new Error('Le bilan à corriger est invalide.')
  assertAmendmentTime(activity, now)
  if (
    !isRecord(changes) ||
    !hasKeys(changes, ['phases', 'occurredAt', 'notes'])
  ) {
    throw new Error('Les informations de correction sont invalides.')
  }
  const details = normalizeDetails(changes.occurredAt, changes.notes, now)
  return {
    ...createActivity(activity.session, changes.phases, activity.recordedAt),
    ...details,
    revision: getActivityRevision(activity) + 1,
    updatedAt: now,
  }
}

export function amendManualActivity(
  activity: ManualActivity,
  changes: ManualActivityChanges,
  now: number,
): ManualActivity {
  if (!isActivity(activity) || activity.kind !== 'manual')
    throw new Error('L’activité à corriger est invalide.')
  assertAmendmentTime(activity, now)
  if (
    !isRecord(changes) ||
    !hasKeys(changes, [
      'title',
      'occurredAt',
      'durationSeconds',
      'pathIds',
      'notes',
    ])
  ) {
    throw new Error('Les informations de correction sont invalides.')
  }
  return {
    ...createManualActivity({ ...changes, id: activity.id }, now),
    recordedAt: activity.recordedAt,
    revision: activity.revision + 1,
  }
}

/** Duplicate identities count once; the first recorded occurrence is authoritative. */
export function getProgress(activities: readonly Activity[]) {
  const pathXp = emptyPathXp()
  const seen = new Set<string>()
  let totalXp = 0
  let completedCount = 0
  let partialCount = 0
  let manualCount = 0

  for (const activity of activities) {
    if (seen.has(activity.id)) continue
    seen.add(activity.id)
    totalXp += activity.reward.totalXp
    for (const { id } of PATHS) pathXp[id] += activity.reward.pathXp[id]
    if (activity.kind === 'manual') manualCount += 1
    else if (activity.result.status === 'completed') completedCount += 1
    else partialCount += 1
  }

  const xpInLevel = totalXp % REWARD_POLICY_V1.xpPerLevel
  return {
    totalXp,
    pathXp,
    level: Math.floor(totalXp / REWARD_POLICY_V1.xpPerLevel) + 1,
    xpInLevel,
    xpToNextLevel: REWARD_POLICY_V1.xpPerLevel - xpInLevel,
    completedCount,
    partialCount,
    manualCount,
  }
}

function isGuidedActivity(value: unknown): value is GuidedActivity {
  const metadataKeys = ['revision', 'updatedAt', 'occurredAt', 'notes']
  const hasMetadata =
    isRecord(value) && metadataKeys.some((key) => Object.hasOwn(value, key))
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'schemaVersion',
      'id',
      'kind',
      'recordedAt',
      'session',
      'result',
      'reward',
      ...(hasMetadata ? metadataKeys : []),
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'guided' ||
    !isRecord(value.result) ||
    !hasKeys(value.result, ['phases', 'performedSeconds', 'status']) ||
    !isRecord(value.reward) ||
    !hasKeys(value.reward, [
      'policyVersion',
      'xpPerMinute',
      'xpPerLevel',
      'totalXp',
      'pathXp',
    ]) ||
    (value.reward.policyVersion !== 1 && value.reward.policyVersion !== 2) ||
    value.reward.xpPerMinute !== 10 ||
    value.reward.xpPerLevel !== 100 ||
    !isRecord(value.reward.pathXp) ||
    !hasKeys(
      value.reward.pathXp,
      PATHS.map(({ id }) => id),
    )
  ) {
    return false
  }

  if (
    hasMetadata &&
    (typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !isTimestamp(value.updatedAt) ||
      typeof value.recordedAt !== 'number' ||
      value.updatedAt < value.recordedAt ||
      !isTimestamp(value.occurredAt) ||
      value.occurredAt > value.updatedAt ||
      typeof value.notes !== 'string' ||
      value.notes.length > 2_000 ||
      value.notes !== value.notes.trim())
  )
    return false

  const storedPathXp = value.reward.pathXp
  try {
    const expected = createActivity(
      value.session as SessionDraft,
      value.result.phases as PhaseResult[],
      value.recordedAt as number,
    )
    return (
      value.id === expected.id &&
      value.result.performedSeconds === expected.result.performedSeconds &&
      value.result.status === expected.result.status &&
      value.reward.policyVersion === expected.reward.policyVersion &&
      value.reward.totalXp === expected.reward.totalXp &&
      PATHS.every(({ id }) => storedPathXp[id] === expected.reward.pathXp[id])
    )
  } catch {
    return false
  }
}

function isManualActivity(value: unknown): value is ManualActivity {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'schemaVersion',
      'id',
      'kind',
      'recordedAt',
      'revision',
      'updatedAt',
      'occurredAt',
      'notes',
      'title',
      'durationSeconds',
      'pathIds',
      'reward',
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'manual' ||
    !isTimestamp(value.recordedAt) ||
    !isTimestamp(value.updatedAt) ||
    value.updatedAt < value.recordedAt ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    (value.revision === 1 && value.updatedAt !== value.recordedAt) ||
    !isRecord(value.reward) ||
    !hasKeys(value.reward, [
      'policyVersion',
      'xpPerMinute',
      'xpPerLevel',
      'totalXp',
      'pathXp',
    ]) ||
    value.reward.policyVersion !== 3 ||
    value.reward.xpPerMinute !== 10 ||
    value.reward.xpPerLevel !== 100 ||
    !isRecord(value.reward.pathXp) ||
    !hasKeys(
      value.reward.pathXp,
      PATHS.map(({ id }) => id),
    )
  )
    return false
  const reward = value.reward
  const pathXp = value.reward.pathXp
  try {
    const expected = createManualActivity(
      {
        id: value.id as string,
        title: value.title as string,
        occurredAt: value.occurredAt as number,
        notes: value.notes as string,
        durationSeconds: value.durationSeconds as number,
        pathIds: value.pathIds as PathId[],
      },
      value.updatedAt,
    )
    return (
      value.title === expected.title &&
      value.notes === expected.notes &&
      (value.pathIds as PathId[]).every(
        (id, index) => id === expected.pathIds[index],
      ) &&
      reward.totalXp === expected.reward.totalXp &&
      PATHS.every(({ id }) => pathXp[id] === expected.reward.pathXp[id])
    )
  } catch {
    return false
  }
}

export function isActivity(value: unknown): value is Activity {
  return (
    isRecord(value) &&
    (value.kind === 'manual'
      ? isManualActivity(value)
      : isGuidedActivity(value))
  )
}
