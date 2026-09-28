import { describe, expect, it } from 'vitest'
import { VIKING_PATH } from '../content/vikingPath'
import {
  FIRST_WORKOUT,
  MOVEMENTS,
  WORKOUTS,
  getWorkout,
} from '../content/workouts'
import {
  createActivity,
  createManualActivity,
  amendGuidedActivity,
  getReportablePhases,
  isActivity,
  type GuidedActivity,
} from './activity'
import { createSessionDraft, getSessionDuration } from './session'
import {
  canStartWorkout,
  derivePathProgress,
  getPathNodeProgress,
  isTrainingPath,
  type TrainingPath,
} from './trainingPath'

const ROOT = 'leveil-du-nord'
const STRENGTH = 'le-socle-de-pierre'
const RHYTHM = 'le-souffle-du-fjord'
const GUARD = 'la-garde-du-rempart'
const SIGNALS = 'les-signaux-du-guetteur'
const FINISH = 'la-traversee-du-nord'

function completion(
  workoutId: string,
  options: {
    version?: number
    variantId?: string
    partial?: boolean
    stopped?: boolean
    id?: string
  } = {},
): GuidedActivity {
  const rule = VIKING_PATH.nodes.find(({ id }) => id === workoutId)
    ?.acceptedCompletions[0]
  const variant = {
    ...FIRST_WORKOUT.variants[0],
    id: options.variantId ?? rule?.variantIds[0] ?? 'unknown-variant',
  }
  const workout = {
    ...FIRST_WORKOUT,
    id: workoutId,
    version: options.version ?? rule?.workoutVersion ?? 1,
    variants: [variant],
  }
  const session = createSessionDraft(
    workout,
    variant,
    {
      environment: 'home',
      equipment: [],
      availableMinutes: 15,
      experience: 'regular',
      smallSpace: true,
      quiet: true,
    },
    MOVEMENTS,
    'real',
    options.id ?? `execution-${workoutId}`,
    1_000,
  )
  session.status = options.stopped ? 'stopped' : 'completed'
  session.elapsedMs = getSessionDuration(session)
  session.updatedAt = 2_000
  const results = getReportablePhases(session).map(
    ({ phase, availableSeconds }) => ({
      phaseId: phase.id,
      performedSeconds: availableSeconds,
    }),
  )
  if (options.partial) results[0].performedSeconds -= 1
  return createActivity(session, results, 3_000)
}

function completedNodes(ids: readonly string[]): GuidedActivity[] {
  return ids.map((id) => completion(id))
}

describe('derivePathProgress', () => {
  it('never validates a Viking step from a real manual activity, regardless of its title or paths', () => {
    const now = Date.UTC(2026, 8, 28)
    const activity = createManualActivity(
      {
        id: ROOT,
        title: FIRST_WORKOUT.title,
        occurredAt: now,
        durationSeconds: 720,
        pathIds: ['power', 'endurance', 'technique', 'strategy'],
        notes: '',
      },
      now,
    )
    expect(isActivity(activity)).toBe(true)
    expect(derivePathProgress(VIKING_PATH, [activity])).toMatchObject({
      completedCount: 0,
      accessibleCount: 1,
    })
  })

  it('recomputes access after amending a stored guided completion without erasing later achievements', () => {
    const now = Date.UTC(2026, 8, 28)
    const all = completedNodes(VIKING_PATH.nodes.map(({ id }) => id))
    const root = all[0]
    const phases = structuredClone(root.result.phases)
    phases[0].performedSeconds = 0
    const edited = amendGuidedActivity(
      root,
      { phases, occurredAt: now, notes: 'Échauffement non réalisé.' },
      now,
    )
    const progress = derivePathProgress(VIKING_PATH, [edited, ...all.slice(1)])
    expect(progress).toMatchObject({ completedCount: 5, accessibleCount: 1 })
    expect(getPathNodeProgress(progress, FINISH)).toMatchObject({
      completed: true,
      accessible: false,
      missingPrerequisiteIds: [ROOT],
    })
    const restored = amendGuidedActivity(
      edited,
      { phases: root.result.phases, occurredAt: now, notes: '' },
      now + 1,
    )
    expect(
      derivePathProgress(VIKING_PATH, [restored, ...all.slice(1)]),
    ).toMatchObject({ completedCount: 6, accessibleCount: 6 })
  })

  it('starts with one accessible root and no achievements', () => {
    const progress = derivePathProgress(VIKING_PATH, [])

    expect(progress).toMatchObject({
      completedCount: 0,
      accessibleCount: 1,
      totalCount: 6,
    })
    expect(getPathNodeProgress(progress, ROOT)).toEqual({
      id: ROOT,
      accessible: true,
      completed: false,
      missingPrerequisiteIds: [],
    })
    for (const id of [STRENGTH, RHYTHM, GUARD, SIGNALS, FINISH]) {
      expect(canStartWorkout(progress, id)).toBe(false)
    }
  })

  it.each(['pas-legers', 'fondations', 'appuis-en-mouvement'])(
    'accepts the existing version-one root variant %s',
    (variantId) => {
      const progress = derivePathProgress(VIKING_PATH, [
        completion(ROOT, { variantId }),
      ])

      expect(progress).toMatchObject({ completedCount: 1, accessibleCount: 3 })
      expect(canStartWorkout(progress, STRENGTH)).toBe(true)
      expect(canStartWorkout(progress, RHYTHM)).toBe(true)
      expect(canStartWorkout(progress, GUARD)).toBe(false)
      expect(canStartWorkout(progress, SIGNALS)).toBe(false)
    },
  )

  it('unlocks only the continuation of the completed branch', () => {
    const progress = derivePathProgress(
      VIKING_PATH,
      completedNodes([ROOT, STRENGTH]),
    )

    expect(canStartWorkout(progress, GUARD)).toBe(true)
    expect(canStartWorkout(progress, SIGNALS)).toBe(false)
    expect(
      getPathNodeProgress(progress, FINISH)?.missingPrerequisiteIds,
    ).toEqual([RHYTHM, GUARD, SIGNALS])
  })

  it('requires both branches before the final workout', () => {
    const strengthBranch = completedNodes([ROOT, STRENGTH, GUARD])
    const strengthProgress = derivePathProgress(VIKING_PATH, strengthBranch)
    expect(
      getPathNodeProgress(strengthProgress, FINISH)?.missingPrerequisiteIds,
    ).toEqual([RHYTHM, SIGNALS])
    expect(canStartWorkout(strengthProgress, FINISH)).toBe(false)

    const bothBranches = derivePathProgress(VIKING_PATH, [
      ...strengthBranch,
      ...completedNodes([RHYTHM, SIGNALS]),
    ])
    expect(canStartWorkout(bothBranches, FINISH)).toBe(true)
    expect(getPathNodeProgress(bothBranches, FINISH)?.completed).toBe(false)
    expect(bothBranches).toMatchObject({
      completedCount: 5,
      accessibleCount: 6,
      totalCount: 6,
    })
  })

  it('derives a completed path without making activities or the path mutable', () => {
    const path = structuredClone(VIKING_PATH)
    const activities = completedNodes(path.nodes.map(({ id }) => id))
    const original = structuredClone({ path, activities })

    const progress = derivePathProgress(path, activities)
    expect(progress).toMatchObject({
      completedCount: 6,
      accessibleCount: 6,
      totalCount: 6,
    })
    expect(
      progress.nodes.every((node) => node.completed && node.accessible),
    ).toBe(true)
    progress.nodes[0].missingPrerequisiteIds.push('local-only')
    expect({ path, activities }).toEqual(original)
  })

  it('relocks descendants after a corrected root but preserves their own achievements', () => {
    const activities = VIKING_PATH.nodes.map(({ id }) =>
      completion(id, { partial: id === ROOT }),
    )
    const progress = derivePathProgress(VIKING_PATH, activities)

    expect(progress).toMatchObject({ completedCount: 5, accessibleCount: 1 })
    expect(getPathNodeProgress(progress, ROOT)?.completed).toBe(false)
    for (const id of [STRENGTH, RHYTHM, GUARD, SIGNALS, FINISH]) {
      expect(getPathNodeProgress(progress, id)).toEqual({
        id,
        accessible: false,
        completed: true,
        missingPrerequisiteIds: [ROOT],
      })
    }
  })

  it('checks missing transitive prerequisites even when both immediate predecessors are complete', () => {
    const progress = derivePathProgress(
      VIKING_PATH,
      completedNodes([ROOT, GUARD, SIGNALS, FINISH]),
    )

    expect(getPathNodeProgress(progress, FINISH)).toEqual({
      id: FINISH,
      accessible: false,
      completed: true,
      missingPrerequisiteIds: [STRENGTH, RHYTHM],
    })
    expect(progress.completedCount).toBe(4)
  })

  it('preserves the unaffected branch after a middle activity is removed', () => {
    const activities = completedNodes(
      VIKING_PATH.nodes.map(({ id }) => id).filter((id) => id !== STRENGTH),
    )
    const progress = derivePathProgress(VIKING_PATH, activities)

    expect(canStartWorkout(progress, STRENGTH)).toBe(true)
    expect(canStartWorkout(progress, SIGNALS)).toBe(true)
    expect(getPathNodeProgress(progress, GUARD)).toMatchObject({
      completed: true,
      accessible: false,
      missingPrerequisiteIds: [STRENGTH],
    })
    expect(getPathNodeProgress(progress, FINISH)).toMatchObject({
      completed: true,
      accessible: false,
      missingPrerequisiteIds: [STRENGTH],
    })
  })

  it('uses explicit content versions and variant IDs, never just matching workout names', () => {
    const unknownEdition = completion(ROOT, { version: 2 })
    const unknownVariant = completion(ROOT, { variantId: 'future-variant' })
    const anotherWorkout = completion('unrelated-workout', {
      variantId: 'pas-legers',
    })

    for (const activity of [unknownEdition, unknownVariant, anotherWorkout]) {
      expect(isActivity(activity)).toBe(true)
      expect(derivePathProgress(VIKING_PATH, [activity]).completedCount).toBe(0)
    }
  })

  it('can explicitly accept another content version without dropping previous completions', () => {
    const path: TrainingPath = structuredClone(VIKING_PATH)
    path.nodes = path.nodes.map((node) =>
      node.id === ROOT
        ? {
            ...node,
            acceptedCompletions: [
              ...node.acceptedCompletions,
              { workoutVersion: 2, variantIds: ['new-edition'] },
            ],
          }
        : node,
    )

    expect(isTrainingPath(path)).toBe(true)
    for (const activity of [
      completion(ROOT),
      completion(ROOT, { version: 2, variantId: 'new-edition' }),
    ]) {
      expect(derivePathProgress(path, [activity]).completedCount).toBe(1)
    }
    expect(
      derivePathProgress(path, [
        completion(ROOT, { version: 2, variantId: 'pas-legers' }),
      ]).completedCount,
    ).toBe(0)
  })

  it('rejects partial, stopped, demo, manual, future-policy and corrupted records', () => {
    const partial = completion(ROOT, { partial: true })
    const stopped = completion(ROOT, { stopped: true })
    expect(isActivity(partial)).toBe(true)
    expect(isActivity(stopped)).toBe(true)
    const valid = completion(ROOT)
    const ignored = [
      partial,
      stopped,
      { ...valid, session: { ...valid.session, mode: 'demo' } },
      { ...valid, kind: 'manual' },
      { ...valid, reward: { ...valid.reward, policyVersion: 3 } },
      {
        ...valid,
        reward: { ...valid.reward, totalXp: valid.reward.totalXp + 1 },
      },
      {
        ...valid,
        result: { ...valid.result, status: 'completed', performedSeconds: 0 },
      },
      valid.session,
      null,
      undefined,
    ]

    const progress = derivePathProgress(VIKING_PATH, ignored)
    expect(progress.completedCount).toBe(0)
    expect(canStartWorkout(progress, STRENGTH)).toBe(false)
  })

  it('deduplicates identities using the first valid record and counts each workout once', () => {
    const first = completion(ROOT)
    const repeatedWorkout = completion(ROOT, { id: 'second-execution' })
    expect(
      derivePathProgress(VIKING_PATH, [
        first,
        structuredClone(first),
        repeatedWorkout,
      ]).completedCount,
    ).toBe(1)

    const partial = completion(ROOT, { partial: true })
    expect(
      derivePathProgress(VIKING_PATH, [partial, first]).completedCount,
    ).toBe(0)
    expect(
      derivePathProgress(VIKING_PATH, [{ ...first, kind: 'invalid' }, first])
        .completedCount,
    ).toBe(1)
  })

  it('does not rely on nodes being listed in dependency order', () => {
    const path: TrainingPath = {
      ...VIKING_PATH,
      nodes: [...VIKING_PATH.nodes].reverse(),
    }
    const progress = derivePathProgress(path, completedNodes([ROOT, STRENGTH]))

    expect(canStartWorkout(progress, ROOT)).toBe(true)
    expect(canStartWorkout(progress, GUARD)).toBe(true)
    expect(canStartWorkout(progress, SIGNALS)).toBe(false)
  })

  it('does not grant access to an unknown workout', () => {
    const progress = derivePathProgress(VIKING_PATH, [])
    expect(getPathNodeProgress(progress, 'unknown')).toBeUndefined()
    expect(canStartWorkout(progress, 'unknown')).toBe(false)
  })
})

describe('isTrainingPath', () => {
  it('references every published workout and its accepted current variants exactly once', () => {
    expect(new Set(WORKOUTS.map(({ id }) => id)).size).toBe(WORKOUTS.length)
    expect(VIKING_PATH.nodes.map(({ id }) => id).toSorted()).toEqual(
      WORKOUTS.map(({ id }) => id).toSorted(),
    )
    for (const node of VIKING_PATH.nodes) {
      const workout = getWorkout(node.id)!
      const rule = node.acceptedCompletions.find(
        ({ workoutVersion }) => workoutVersion === workout.version,
      )!
      expect(workout).toBeDefined()
      expect(rule).toBeDefined()
      expect([...rule.variantIds].toSorted()).toEqual(
        workout.variants.map(({ id }) => id).toSorted(),
      )
    }
  })

  it('recognizes a valid completed activity from every published variant', () => {
    for (const workout of WORKOUTS) {
      for (const variant of workout.variants) {
        const session = createSessionDraft(
          workout,
          variant,
          {
            environment: 'home',
            equipment: [],
            availableMinutes: 15,
            experience: 'regular',
            smallSpace: false,
            quiet: false,
          },
          MOVEMENTS,
          'real',
          `catalogue-${variant.id}`,
          1_000,
        )
        session.elapsedMs = getSessionDuration(session)
        session.status = 'completed'
        const activity = createActivity(
          session,
          getReportablePhases(session).map(({ phase, availableSeconds }) => ({
            phaseId: phase.id,
            performedSeconds: availableSeconds,
          })),
          2_000,
        )
        const progress = derivePathProgress(VIKING_PATH, [activity])
        expect(getPathNodeProgress(progress, workout.id)?.completed).toBe(true)
        expect(progress.completedCount).toBe(1)
      }
    }
  })

  it('accepts the complete six-node Viking path', () => {
    expect(isTrainingPath(VIKING_PATH)).toBe(true)
    expect(VIKING_PATH.nodes.map(({ id }) => id)).toEqual([
      ROOT,
      STRENGTH,
      RHYTHM,
      GUARD,
      SIGNALS,
      FINISH,
    ])
  })

  it.each([
    null,
    undefined,
    [],
    'viking',
    {},
    { ...VIKING_PATH, nodes: [] },
    { ...VIKING_PATH, nodes: new Array(1) },
  ])('rejects an invalid path value %j', (value) => {
    expect(isTrainingPath(value)).toBe(false)
  })

  it.each([
    { prerequisiteIds: ['unknown'] },
    { prerequisiteIds: [ROOT] },
    { prerequisiteIds: [STRENGTH, STRENGTH] },
    { acceptedCompletions: [] },
    {
      acceptedCompletions: [{ workoutVersion: 0, variantIds: ['pas-legers'] }],
    },
    {
      acceptedCompletions: [
        { workoutVersion: 1.5, variantIds: ['pas-legers'] },
      ],
    },
    { acceptedCompletions: [{ workoutVersion: 1, variantIds: [] }] },
    {
      acceptedCompletions: [
        { workoutVersion: 1, variantIds: ['pas-legers', 'pas-legers'] },
      ],
    },
    { acceptedCompletions: [{ workoutVersion: 1, variantIds: new Array(1) }] },
    {
      acceptedCompletions: [
        { workoutVersion: 1, variantIds: ['pas-legers'] },
        { workoutVersion: 1, variantIds: ['fondations'] },
      ],
    },
    { id: ' ' },
  ])('rejects a malformed first node %j', (replacement) => {
    const path = {
      ...VIKING_PATH,
      nodes: [
        { ...VIKING_PATH.nodes[0], ...replacement },
        ...VIKING_PATH.nodes.slice(1),
      ],
    }
    expect(isTrainingPath(path)).toBe(false)
  })

  it('rejects cycles through multiple branches and duplicate node IDs', () => {
    const cyclic: TrainingPath = {
      ...VIKING_PATH,
      nodes: [
        { ...VIKING_PATH.nodes[0], prerequisiteIds: [FINISH] },
        ...VIKING_PATH.nodes.slice(1),
      ],
    }
    const duplicated: TrainingPath = {
      ...VIKING_PATH,
      nodes: [...VIKING_PATH.nodes, VIKING_PATH.nodes[0]],
    }

    expect(isTrainingPath(cyclic)).toBe(false)
    expect(isTrainingPath(duplicated)).toBe(false)
    expect(() => derivePathProgress(cyclic, [])).toThrow(
      /parcours est invalide/,
    )
    expect(() => derivePathProgress(duplicated, [])).toThrow(
      /parcours est invalide/,
    )
  })
})
