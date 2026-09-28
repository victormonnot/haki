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

export interface Activity {
  schemaVersion: 1
  id: string
  kind: 'guided'
  recordedAt: number
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
): Activity {
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

/** Duplicate identities count once; the first recorded occurrence is authoritative. */
export function getProgress(activities: readonly Activity[]) {
  const pathXp = emptyPathXp()
  const seen = new Set<string>()
  let totalXp = 0
  let completedCount = 0
  let partialCount = 0

  for (const activity of activities) {
    if (seen.has(activity.id)) continue
    seen.add(activity.id)
    totalXp += activity.reward.totalXp
    for (const { id } of PATHS) pathXp[id] += activity.reward.pathXp[id]
    if (activity.result.status === 'completed') completedCount += 1
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
  }
}

export function isActivity(value: unknown): value is Activity {
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
