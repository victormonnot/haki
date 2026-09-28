import { isActivity } from './activity'

export interface TrainingPathNode {
  id: string
  prerequisiteIds: readonly string[]
  acceptedCompletions: readonly {
    workoutVersion: number
    variantIds: readonly string[]
  }[]
  branch: string
  goal: string
}

export interface TrainingPath {
  id: string
  title: string
  description: string
  nodes: readonly TrainingPathNode[]
}

export interface PathNodeProgress {
  id: string
  accessible: boolean
  completed: boolean
  missingPrerequisiteIds: string[]
}

export interface TrainingPathProgress {
  nodes: PathNodeProgress[]
  completedCount: number
  accessibleCount: number
  totalCount: number
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

function isText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
  )
}

function isIdList(value: unknown, allowEmpty: boolean): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    (allowEmpty || value.length > 0) &&
    Array.from(value).every((id) => isText(id, 120)) &&
    new Set(value).size === value.length
  )
}

function isNode(value: unknown): value is TrainingPathNode {
  if (
    !isRecord(value) ||
    !hasKeys(value, [
      'id',
      'prerequisiteIds',
      'acceptedCompletions',
      'branch',
      'goal',
    ]) ||
    !isText(value.id, 120) ||
    !isText(value.branch, 120) ||
    !isText(value.goal, 1_000) ||
    !isIdList(value.prerequisiteIds, true) ||
    !Array.isArray(value.acceptedCompletions) ||
    value.acceptedCompletions.length === 0 ||
    value.acceptedCompletions.length > 20
  )
    return false

  const versions = new Set<number>()
  for (const rule of value.acceptedCompletions) {
    if (
      !isRecord(rule) ||
      !hasKeys(rule, ['workoutVersion', 'variantIds']) ||
      typeof rule.workoutVersion !== 'number' ||
      !Number.isSafeInteger(rule.workoutVersion) ||
      rule.workoutVersion < 1 ||
      versions.has(rule.workoutVersion) ||
      !isIdList(rule.variantIds, false)
    )
      return false
    versions.add(rule.workoutVersion)
  }
  return true
}

export function isTrainingPath(value: unknown): value is TrainingPath {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['id', 'title', 'description', 'nodes']) ||
    !isText(value.id, 120) ||
    !isText(value.title, 200) ||
    !isText(value.description, 4_000) ||
    !Array.isArray(value.nodes) ||
    value.nodes.length === 0 ||
    value.nodes.length > 100 ||
    !Array.from(value.nodes).every(isNode)
  )
    return false

  const nodes = value.nodes as TrainingPathNode[]
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (
    byId.size !== nodes.length ||
    nodes.some((node) => node.prerequisiteIds.some((id) => !byId.has(id)))
  )
    return false

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    if (!byId.get(id)!.prerequisiteIds.every(visit)) return false
    visiting.delete(id)
    visited.add(id)
    return true
  }
  return nodes.every(({ id }) => visit(id))
}

export function derivePathProgress(
  path: TrainingPath,
  activities: readonly unknown[],
): TrainingPathProgress {
  if (!isTrainingPath(path)) {
    throw new Error(
      'Le parcours est invalide : vérifie les étapes, leurs règles et leurs prérequis.',
    )
  }

  const byId = new Map(path.nodes.map((node) => [node.id, node]))
  const completed = new Set<string>()
  const seen = new Set<string>()
  for (const activity of activities) {
    if (!isActivity(activity) || seen.has(activity.id)) continue
    seen.add(activity.id)
    if (activity.result.status !== 'completed') continue

    const snapshot = activity.session.snapshot
    const node = byId.get(snapshot.workoutId)
    if (
      node?.acceptedCompletions.some(
        (rule) =>
          rule.workoutVersion === snapshot.workoutVersion &&
          rule.variantIds.includes(snapshot.variant.id),
      )
    )
      completed.add(node.id)
  }

  const ancestors = new Map<string, Set<string>>()
  const getAncestors = (id: string): Set<string> => {
    const cached = ancestors.get(id)
    if (cached) return cached
    const ids = new Set<string>()
    for (const prerequisiteId of byId.get(id)!.prerequisiteIds) {
      ids.add(prerequisiteId)
      for (const ancestorId of getAncestors(prerequisiteId)) ids.add(ancestorId)
    }
    ancestors.set(id, ids)
    return ids
  }

  const nodes = path.nodes.map(({ id }): PathNodeProgress => {
    const required = getAncestors(id)
    const missingPrerequisiteIds = path.nodes
      .filter((node) => required.has(node.id) && !completed.has(node.id))
      .map((node) => node.id)
    return {
      id,
      accessible: missingPrerequisiteIds.length === 0,
      completed: completed.has(id),
      missingPrerequisiteIds,
    }
  })

  return {
    nodes,
    completedCount: completed.size,
    accessibleCount: nodes.filter((node) => node.accessible).length,
    totalCount: nodes.length,
  }
}

export function getPathNodeProgress(
  progress: TrainingPathProgress,
  workoutId: string,
): PathNodeProgress | undefined {
  return progress.nodes.find(({ id }) => id === workoutId)
}

export function canStartWorkout(
  progress: TrainingPathProgress,
  workoutId: string,
): boolean {
  return getPathNodeProgress(progress, workoutId)?.accessible ?? false
}
