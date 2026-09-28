import { describe, expect, it } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS, getWorkout } from '../content/workouts'
import {
  MIN_ACTIVITY_DATE,
  PATHS,
  REWARD_POLICY_V3,
  amendGuidedActivity,
  amendManualActivity,
  createActivity,
  createManualActivity,
  getActivityDate,
  getActivityDuration,
  getActivityNotes,
  getActivityRevision,
  getActivityTitle,
  getProgress,
  getReportablePhases,
  isActivity,
  type GuidedActivity,
  type GuidedActivityChanges,
  type ManualActivityChanges,
  type ManualActivityInput,
} from './activity'
import { createSessionDraft, getSessionDuration } from './session'

const NOW = Date.UTC(2026, 8, 28, 12)
const OCCURRED_AT = NOW - 60 * 60 * 1_000

function manualInput(
  overrides: Partial<ManualActivityInput> = {},
): ManualActivityInput {
  return {
    id: 'outside-session',
    title: 'Boxe au club',
    occurredAt: OCCURRED_AT,
    durationSeconds: 60 * 30,
    pathIds: ['endurance', 'technique'],
    notes: '',
    ...overrides,
  }
}

function manualChanges(
  overrides: Partial<ManualActivityChanges> = {},
): ManualActivityChanges {
  const { id: _id, ...changes } = manualInput()
  return { ...changes, ...overrides }
}

function guided(weighted = false): GuidedActivity {
  const workout = weighted
    ? getWorkout('les-signaux-du-guetteur')!
    : FIRST_WORKOUT
  const variant = workout.variants[0]
  const session = createSessionDraft(
    workout,
    variant,
    {
      environment: 'home',
      equipment: [],
      availableMinutes: 15,
      experience: 'discovery',
      smallSpace: true,
      quiet: true,
    },
    MOVEMENTS,
    'real',
    'guided-session',
    OCCURRED_AT,
  )
  session.elapsedMs = getSessionDuration(session)
  session.status = 'completed'
  session.updatedAt = NOW - 1_000
  return createActivity(
    session,
    getReportablePhases(session).map(({ phase, availableSeconds }) => ({
      phaseId: phase.id,
      performedSeconds: availableSeconds,
    })),
    NOW,
  )
}

function guidedChanges(activity: GuidedActivity): GuidedActivityChanges {
  return {
    phases: structuredClone(activity.result.phases),
    occurredAt: OCCURRED_AT,
    notes: '',
  }
}

function corruptManual(path: string, value: unknown): unknown {
  const activity = createManualActivity(manualInput(), NOW)
  const segments = path.split('.')
  let target = activity as unknown as Record<string, unknown>
  for (const segment of segments.slice(0, -1))
    target = target[segment] as Record<string, unknown>
  target[segments.at(-1)!] = value
  return activity
}

describe('manual activity creation', () => {
  it('records a trimmed, independent activity with an explicit selection of paths', () => {
    const input = manualInput({
      title: '  Boxe au club  ',
      notes: '  Travail des appuis.\n  ',
      pathIds: ['technique', 'power', 'strategy'],
    })
    const original = structuredClone(input)
    const activity = createManualActivity(input, NOW)

    expect(input).toEqual(original)
    expect(activity).toEqual({
      schemaVersion: 1,
      id: input.id,
      kind: 'manual',
      recordedAt: NOW,
      revision: 1,
      updatedAt: NOW,
      occurredAt: OCCURRED_AT,
      title: 'Boxe au club',
      notes: 'Travail des appuis.',
      durationSeconds: 1_800,
      pathIds: ['power', 'technique', 'strategy'],
      reward: {
        ...REWARD_POLICY_V3,
        totalXp: 300,
        pathXp: { power: 100, endurance: 0, technique: 100, strategy: 100 },
      },
    })
    input.pathIds.length = 0
    expect(activity.pathIds).toEqual(['power', 'technique', 'strategy'])
    expect(isActivity(JSON.parse(JSON.stringify(activity)))).toBe(true)
  })

  it.each([60, 180 * 60])(
    'accepts the inclusive duration boundary of %i seconds',
    (durationSeconds) => {
      const activity = createManualActivity(
        manualInput({ durationSeconds, pathIds: ['strategy'] }),
        NOW,
      )
      expect(activity.reward.totalXp).toBe(durationSeconds / 6)
      expect(activity.reward.pathXp.strategy).toBe(durationSeconds / 6)
      expect(isActivity(activity)).toBe(true)
    },
  )

  it('accepts the earliest date, now, and the inclusive text bounds', () => {
    for (const occurredAt of [MIN_ACTIVITY_DATE, NOW]) {
      const activity = createManualActivity(
        manualInput({
          occurredAt,
          title: 'x'.repeat(100),
          notes: 'n'.repeat(2_000),
        }),
        NOW,
      )
      expect(isActivity(activity)).toBe(true)
    }
    expect(
      isActivity(
        createManualActivity(
          manualInput({ occurredAt: MIN_ACTIVITY_DATE, notes: '' }),
          MIN_ACTIVITY_DATE,
        ),
      ),
    ).toBe(true)
  })

  it('shares XP equally across all 15 possible selections with stable largest remainders', () => {
    for (let mask = 1; mask < 16; mask += 1) {
      const pathIds = PATHS.filter((_, index) => mask & (1 << index)).map(
        ({ id }) => id,
      )
      const activity = createManualActivity(
        manualInput({ durationSeconds: 60, pathIds: [...pathIds].reverse() }),
        NOW,
      )
      const base = Math.floor(10 / pathIds.length)
      const remainder = 10 % pathIds.length
      expect(activity.reward.totalXp).toBe(10)
      expect(
        Object.values(activity.reward.pathXp).reduce((sum, xp) => sum + xp, 0),
      ).toBe(10)
      for (const { id } of PATHS) {
        const index = pathIds.indexOf(id)
        expect(activity.reward.pathXp[id]).toBe(
          index < 0 ? 0 : base + Number(index < remainder),
        )
      }
    }
    expect(
      createManualActivity(
        manualInput({
          durationSeconds: 60,
          pathIds: ['strategy', 'technique', 'power'],
        }),
        NOW,
      ).reward.pathXp,
    ).toEqual({ power: 4, endurance: 0, technique: 3, strategy: 3 })
  })

  it.each<[string, unknown]>([
    ['id', ''],
    ['id', 'x'.repeat(121)],
    ['id', null],
    ['title', '  '],
    ['title', 'x'.repeat(101)],
    ['title', 1],
    ['notes', 'x'.repeat(2_001)],
    ['notes', null],
    ['durationSeconds', 0],
    ['durationSeconds', 59],
    ['durationSeconds', 61],
    ['durationSeconds', 60.5],
    ['durationSeconds', 10_860],
    ['durationSeconds', NaN],
    ['durationSeconds', Infinity],
    ['durationSeconds', '60'],
    ['occurredAt', MIN_ACTIVITY_DATE - 1],
    ['occurredAt', NOW + 1],
    ['occurredAt', NaN],
    ['occurredAt', Number.MAX_SAFE_INTEGER],
    ['occurredAt', OCCURRED_AT + 0.5],
    ['occurredAt', '2026-09-28'],
    ['pathIds', []],
    ['pathIds', ['power', 'power']],
    ['pathIds', ['unknown']],
    ['pathIds', ['power', undefined]],
    ['pathIds', new Array(1)],
    ['pathIds', null],
    ['unexpected', true],
  ])('rejects invalid manual input %s=%j', (key, value) => {
    expect(() =>
      createManualActivity({ ...manualInput(), [key]: value }, NOW),
    ).toThrow()
  })

  it.each([
    MIN_ACTIVITY_DATE - 1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    NOW + 0.5,
  ])('rejects an invalid creation timestamp %s', (now) => {
    expect(() => createManualActivity(manualInput(), now)).toThrow()
  })

  it('requires all manual input fields instead of supplying default paths', () => {
    for (const field of Object.keys(manualInput())) {
      const input = manualInput() as unknown as Record<string, unknown>
      delete input[field]
      expect(() =>
        createManualActivity(input as unknown as ManualActivityInput, NOW),
      ).toThrow()
    }
  })
})

describe('activity getters and correction', () => {
  it('reads historical guided records without adding or changing their fields', () => {
    const activity = guided()
    const original = structuredClone(activity)
    expect(getActivityDate(activity)).toBe(activity.session.createdAt)
    expect(getActivityTitle(activity)).toBe(FIRST_WORKOUT.title)
    expect(getActivityDuration(activity)).toBe(420)
    expect(getActivityRevision(activity)).toBe(1)
    expect(getActivityNotes(activity)).toBe('')
    expect(Object.hasOwn(activity, 'revision')).toBe(false)
    expect(activity).toEqual(original)
  })

  it('corrects a manual activity by replacement with a stable identity and one updated reward', () => {
    const original = createManualActivity(manualInput(), NOW)
    const saved = structuredClone(original)
    const changes = manualChanges({
      title: 'Marche courte',
      durationSeconds: 120,
      pathIds: ['endurance'],
      occurredAt: NOW + 1_000,
      notes: ' Sortie corrigée. ',
    })
    const corrected = amendManualActivity(original, changes, NOW + 2_000)

    expect(corrected).toMatchObject({
      id: original.id,
      kind: 'manual',
      recordedAt: NOW,
      updatedAt: NOW + 2_000,
      revision: 2,
    })
    expect(getActivityDate(corrected)).toBe(NOW + 1_000)
    expect(getActivityTitle(corrected)).toBe('Marche courte')
    expect(getActivityDuration(corrected)).toBe(120)
    expect(getActivityNotes(corrected)).toBe('Sortie corrigée.')
    expect(getActivityRevision(corrected)).toBe(2)
    expect(corrected.reward).toEqual({
      ...REWARD_POLICY_V3,
      totalXp: 20,
      pathXp: { power: 0, endurance: 20, technique: 0, strategy: 0 },
    })
    expect(getProgress([corrected, structuredClone(corrected)])).toMatchObject({
      totalXp: 20,
      manualCount: 1,
      completedCount: 0,
      partialCount: 0,
    })
    expect(isActivity(corrected)).toBe(true)
    expect(original).toEqual(saved)
    changes.pathIds.length = 0
    expect(corrected.pathIds).toEqual(['endurance'])
  })

  it.each([false, true])(
    'corrects guided phases using the immutable snapshot and the original policy (weighted=%s)',
    (weighted) => {
      const original = guided(weighted)
      const saved = structuredClone(original)
      const changes = guidedChanges(original)
      changes.phases[0].performedSeconds = 0
      changes.notes = '  Première étape non réalisée.  '
      changes.occurredAt = OCCURRED_AT - 86_400_000
      const corrected = amendGuidedActivity(original, changes, NOW + 1_000)

      expect(corrected).toMatchObject({
        id: original.id,
        recordedAt: original.recordedAt,
        revision: 2,
        updatedAt: NOW + 1_000,
        occurredAt: changes.occurredAt,
        notes: 'Première étape non réalisée.',
      })
      expect(corrected.result.status).toBe('partial')
      expect(corrected.reward.policyVersion).toBe(original.reward.policyVersion)
      expect(corrected.reward.totalXp).toBeLessThan(original.reward.totalXp)
      expect(corrected.session).toEqual(original.session)
      expect(isActivity(JSON.parse(JSON.stringify(corrected)))).toBe(true)
      expect(
        getProgress([corrected, structuredClone(corrected)]),
      ).toMatchObject({
        totalXp: corrected.reward.totalXp,
        partialCount: 1,
        completedCount: 0,
        manualCount: 0,
      })
      expect(original).toEqual(saved)
      changes.phases[1].performedSeconds = 0
      expect(corrected.result.phases[1]).toEqual(original.result.phases[1])

      const restored = amendGuidedActivity(
        corrected,
        guidedChanges(original),
        NOW + 2_000,
      )
      expect(restored.revision).toBe(3)
      expect(restored.reward).toEqual(original.reward)
      expect(restored.result.status).toBe('completed')
      expect(restored.recordedAt).toBe(original.recordedAt)
      expect(isActivity(restored)).toBe(true)
    },
  )

  it('keeps a stopped session partial and never permits a correction beyond observed time', () => {
    const session = guided().session
    session.status = 'stopped'
    session.elapsedMs = 10_000
    const phases = getReportablePhases(session).map(
      ({ phase, availableSeconds }) => ({
        phaseId: phase.id,
        performedSeconds: availableSeconds,
      }),
    )
    const original = createActivity(session, phases, NOW)
    const corrected = amendGuidedActivity(
      original,
      guidedChanges(original),
      NOW + 1,
    )
    expect(corrected.result.status).toBe('partial')
    const tooLong = guidedChanges(original)
    tooLong.phases[0].performedSeconds = 11
    expect(() => amendGuidedActivity(original, tooLong, NOW + 1)).toThrow()
    const empty = guidedChanges(original)
    empty.phases.forEach((phase) => {
      phase.performedSeconds = 0
    })
    expect(() => amendGuidedActivity(original, empty, NOW + 1)).toThrow()
  })

  it('rejects forged immutable fields, wrong activity kinds and outdated correction times', () => {
    const manual = createManualActivity(manualInput(), NOW)
    const activity = guided()
    expect(() =>
      amendManualActivity(
        manual,
        { ...manualChanges(), id: 'replacement' } as ManualActivityChanges,
        NOW + 1,
      ),
    ).toThrow()
    expect(() =>
      amendGuidedActivity(
        activity,
        {
          ...guidedChanges(activity),
          session: activity.session,
        } as GuidedActivityChanges,
        NOW + 1,
      ),
    ).toThrow()
    expect(() =>
      amendManualActivity(manual, manualChanges(), NOW - 1),
    ).toThrow()
    expect(() =>
      amendGuidedActivity(activity, guidedChanges(activity), NOW - 1),
    ).toThrow()
    const edited = amendManualActivity(manual, manualChanges(), NOW + 2)
    expect(() =>
      amendManualActivity(edited, manualChanges(), NOW + 1),
    ).toThrow()
    expect(() =>
      amendGuidedActivity(
        manual as unknown as GuidedActivity,
        guidedChanges(activity),
        NOW + 1,
      ),
    ).toThrow()
    expect(() =>
      amendManualActivity(
        { ...manual, reward: { ...manual.reward, totalXp: 999 } },
        manualChanges(),
        NOW + 1,
      ),
    ).toThrow()
    expect(() =>
      amendGuidedActivity(
        { ...activity, reward: { ...activity.reward, totalXp: 999 } },
        guidedChanges(activity),
        NOW + 1,
      ),
    ).toThrow()
  })

  it('validates correction dates and notes without permitting unsafe revision increments', () => {
    const activity = guided()
    for (const occurredAt of [NOW + 2, MIN_ACTIVITY_DATE - 1, NaN]) {
      expect(() =>
        amendGuidedActivity(
          activity,
          { ...guidedChanges(activity), occurredAt },
          NOW + 1,
        ),
      ).toThrow()
    }
    expect(() =>
      amendGuidedActivity(
        activity,
        { ...guidedChanges(activity), notes: 'x'.repeat(2_001) },
        NOW + 1,
      ),
    ).toThrow()
    const edited = amendGuidedActivity(
      activity,
      guidedChanges(activity),
      NOW + 1,
    )
    edited.revision = Number.MAX_SAFE_INTEGER
    expect(isActivity(edited)).toBe(true)
    expect(() =>
      amendGuidedActivity(edited, guidedChanges(edited), NOW + 2),
    ).toThrow()
    const manual = createManualActivity(manualInput(), NOW)
    manual.revision = Number.MAX_SAFE_INTEGER
    expect(() =>
      amendManualActivity(manual, manualChanges(), NOW + 1),
    ).toThrow()
  })

  it('combines guided completion, guided partial and manual activity counts separately', () => {
    const complete = guided()
    const changes = guidedChanges(complete)
    changes.phases[0].performedSeconds = 0
    const partial = amendGuidedActivity(complete, changes, NOW + 1)
    partial.id = partial.session.id = 'other-guided-session'
    const manual = createManualActivity(manualInput(), NOW)
    expect(getProgress([complete, partial, manual, manual])).toMatchObject({
      totalXp:
        complete.reward.totalXp +
        partial.reward.totalXp +
        manual.reward.totalXp,
      completedCount: 1,
      partialCount: 1,
      manualCount: 1,
    })
  })
})

describe('activity metadata and integrity guards', () => {
  it('requires all guided metadata fields together while keeping the legacy shape valid', () => {
    const original = guided()
    const edited = amendGuidedActivity(
      original,
      guidedChanges(original),
      NOW + 1,
    )
    const fields = ['revision', 'updatedAt', 'occurredAt', 'notes'] as const
    expect(isActivity(original)).toBe(true)
    expect(isActivity(edited)).toBe(true)
    for (const field of fields) {
      const missing = { ...edited } as Record<string, unknown>
      delete missing[field]
      expect(isActivity(missing)).toBe(false)
      expect(isActivity({ ...original, [field]: edited[field] })).toBe(false)
    }
  })

  it.each<[string, unknown]>([
    ['revision', 0],
    ['revision', 1.5],
    ['revision', Number.MAX_SAFE_INTEGER + 1],
    ['revision', undefined],
    ['updatedAt', NOW - 1],
    ['updatedAt', Number.MAX_SAFE_INTEGER],
    ['occurredAt', MIN_ACTIVITY_DATE - 1],
    ['occurredAt', NOW + 2],
    ['occurredAt', undefined],
    ['notes', 'x'.repeat(2_001)],
    ['notes', 1],
    ['notes', ' trailing '],
  ])('rejects invalid guided metadata %s=%j', (key, value) => {
    const original = guided()
    const edited = amendGuidedActivity(
      original,
      guidedChanges(original),
      NOW + 1,
    )
    expect(isActivity({ ...edited, [key]: value })).toBe(false)
  })

  it.each<[string, unknown]>([
    ['schemaVersion', 2],
    ['kind', 'guided'],
    ['id', ''],
    ['revision', 0],
    ['revision', 0.5],
    ['revision', Number.MAX_SAFE_INTEGER + 1],
    ['recordedAt', MIN_ACTIVITY_DATE - 1],
    ['recordedAt', NOW + 1],
    ['updatedAt', NOW - 1],
    ['updatedAt', NOW + 1],
    ['updatedAt', Number.MAX_SAFE_INTEGER],
    ['occurredAt', NOW + 1],
    ['occurredAt', MIN_ACTIVITY_DATE - 1],
    ['title', ' Boxe au club '],
    ['notes', 'x'.repeat(2_001)],
    ['durationSeconds', 1_801],
    ['pathIds', ['endurance', 'endurance']],
    ['pathIds', ['technique', 'endurance']],
    ['pathIds', []],
    ['reward.policyVersion', 1],
    ['reward.policyVersion', 4],
    ['reward.xpPerMinute', 20],
    ['reward.xpPerLevel', 200],
    ['reward.totalXp', 301],
    ['reward.pathXp.power', 1],
    ['reward.pathXp.endurance', 149],
    ['reward.pathXp.technique', undefined],
    ['reward.pathXp.unknown', 0],
    ['reward.extra', 0],
    ['unexpected', true],
  ])('rejects manual corruption %s=%j', (path, value) => {
    expect(isActivity(corruptManual(path, value))).toBe(false)
  })

  it('requires every manual record field and rejects a plausible total with forged paths', () => {
    const activity = createManualActivity(manualInput(), NOW)
    for (const field of Object.keys(activity)) {
      const missing = { ...activity } as Record<string, unknown>
      delete missing[field]
      expect(isActivity(missing)).toBe(false)
    }
    activity.reward.pathXp.endurance -= 1
    activity.reward.pathXp.technique += 1
    expect(isActivity(activity)).toBe(false)
  })
})
