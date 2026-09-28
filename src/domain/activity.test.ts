import { describe, expect, it } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import {
  createActivity,
  getProgress,
  getReportablePhases,
  isActivity,
  type Activity,
  type PhaseResult,
} from './activity'
import {
  createSessionDraft,
  getSessionDuration,
  type SessionDraft,
} from './session'
import type { WorkoutVariant } from './workouts'

function terminalSession(variant = FIRST_WORKOUT.variants[0]): SessionDraft {
  const session = createSessionDraft(
    FIRST_WORKOUT,
    variant,
    {
      environment: 'gym',
      equipment: ['rope'],
      availableMinutes: 15,
      experience: 'regular',
      smallSpace: false,
      quiet: false,
    },
    MOVEMENTS,
    'real',
    `session-${variant.id}`,
    1_000,
  )
  session.status = 'completed'
  session.elapsedMs = getSessionDuration(session)
  session.updatedAt = 2_000
  return session
}

function allPerformed(session: SessionDraft): PhaseResult[] {
  return getReportablePhases(session).map(({ phase, availableSeconds }) => ({
    phaseId: phase.id,
    performedSeconds: availableSeconds,
  }))
}

function sampleSession(): SessionDraft {
  const variant: WorkoutVariant = {
    ...FIRST_WORKOUT.variants[0],
    phases: [
      {
        id: 'warm',
        title: 'Warmup',
        kind: 'warmup',
        durationSeconds: 10,
        cue: 'Begin slowly.',
      },
      {
        id: 'rest-1',
        title: 'Rest',
        kind: 'rest',
        durationSeconds: 5,
        cue: 'Recover.',
      },
      {
        id: 'work',
        title: 'Work',
        kind: 'work',
        durationSeconds: 20,
        cue: 'Keep a comfortable pace.',
      },
      {
        id: 'rest-2',
        title: 'Rest',
        kind: 'rest',
        durationSeconds: 5,
        cue: 'Recover.',
      },
      {
        id: 'cool',
        title: 'Cooldown',
        kind: 'cooldown',
        durationSeconds: 10,
        cue: 'Slow down.',
      },
    ],
  }
  return terminalSession(variant)
}

function completeActivity(variant = FIRST_WORKOUT.variants[0]): Activity {
  const session = terminalSession(variant)
  return createActivity(session, allPerformed(session), 3_000)
}

function corruptedActivity(path: string, value: unknown): unknown {
  const activity = completeActivity()
  const segments = path.split('.')
  let record = activity as unknown as Record<string, unknown>
  for (const segment of segments.slice(0, -1))
    record = record[segment] as Record<string, unknown>
  record[segments.at(-1)!] = value
  return activity
}

describe('getReportablePhases', () => {
  it.each([
    [0, [0, 0, 0]],
    [999, [0, 0, 0]],
    [2_500, [2, 0, 0]],
    [10_000, [10, 0, 0]],
    [14_999, [10, 0, 0]],
    [15_999, [10, 0, 0]],
    [16_000, [10, 1, 0]],
    [35_000, [10, 20, 0]],
    [39_999, [10, 20, 0]],
    [40_000, [10, 20, 0]],
    [40_999, [10, 20, 0]],
    [50_000, [10, 20, 10]],
  ])(
    'caps whole reportable seconds at observed elapsed %i ms',
    (elapsedMs, available) => {
      const session = sampleSession()
      session.status = 'stopped'
      session.elapsedMs = elapsedMs

      const phases = getReportablePhases(session)
      expect(phases.map(({ phase }) => phase.id)).toEqual([
        'warm',
        'work',
        'cool',
      ])
      expect(phases.map(({ availableSeconds }) => availableSeconds)).toEqual(
        available,
      )
    },
  )

  it('never converts paused or invisible wall-clock time into performed time', () => {
    const session = sampleSession()
    session.status = 'stopped'
    session.elapsedMs = 16_000
    session.updatedAt = session.createdAt + 24 * 60 * 60 * 1_000

    const activity = createActivity(
      session,
      allPerformed(session),
      session.updatedAt,
    )
    expect(activity.result.performedSeconds).toBe(11)
    expect(activity.result.phases).toEqual([
      { phaseId: 'warm', performedSeconds: 10 },
      { phaseId: 'work', performedSeconds: 1 },
      { phaseId: 'cool', performedSeconds: 0 },
    ])
    expect(activity.reward.totalXp).toBe(1)
  })
})

describe('createActivity', () => {
  it('captures an independent snapshot with the stable session identity', () => {
    const session = terminalSession()
    const results = allPerformed(session).reverse()
    const activity = createActivity(session, results, 3_000)
    const expected = structuredClone(activity)

    expect(activity.id).toBe(session.id)
    expect(activity.recordedAt).toBe(3_000)
    expect(activity.result.phases.map(({ phaseId }) => phaseId)).toEqual(
      getReportablePhases(session).map(({ phase }) => phase.id),
    )
    session.snapshot.variant.phases[0].cue = 'Changed later'
    session.snapshot.movements['easy-march'].instructions[0] = 'Changed later'
    session.snapshot.setup.equipment.length = 0
    session.snapshot.variant.pathWeights.endurance = 0
    results[0].performedSeconds = 0

    expect(activity).toEqual(expected)
    expect(isActivity(activity)).toBe(true)
  })

  it.each([
    [0, 420, 70, { power: 0, endurance: 35, technique: 35, strategy: 0 }],
    [1, 600, 100, { power: 35, endurance: 30, technique: 35, strategy: 0 }],
    [2, 620, 103, { power: 10, endurance: 52, technique: 41, strategy: 0 }],
  ] as const)(
    'awards catalogue variant %i only for its non-rest phases',
    (index, seconds, xp, pathXp) => {
      const activity = completeActivity(FIRST_WORKOUT.variants[index])

      expect(activity.result.status).toBe('completed')
      expect(activity.result.performedSeconds).toBe(seconds)
      expect(activity.reward).toEqual({
        policyVersion: 1,
        xpPerMinute: 10,
        xpPerLevel: 100,
        totalXp: xp,
        pathXp,
      })
    },
  )

  it('marks a timer-completed session partial when a movement was not fully confirmed', () => {
    const session = terminalSession()
    const results = allPerformed(session)
    results[0].performedSeconds -= 1

    const activity = createActivity(session, results, 3_000)
    expect(activity.result.status).toBe('partial')
    expect(activity.result.performedSeconds).toBe(419)
    expect(activity.reward.totalXp).toBe(69)
  })

  it('keeps a stopped session partial even if every available second is confirmed', () => {
    const session = terminalSession()
    session.status = 'stopped'

    expect(
      createActivity(session, allPerformed(session), 3_000).result.status,
    ).toBe('partial')
  })

  it('records one confirmed second with zero XP rather than inventing a minimum reward', () => {
    const session = terminalSession()
    const results = allPerformed(session).map((phase, index) => ({
      ...phase,
      performedSeconds: index === 0 ? 1 : 0,
    }))

    const activity = createActivity(session, results, 3_000)
    expect(activity.result).toMatchObject({
      performedSeconds: 1,
      status: 'partial',
    })
    expect(activity.reward.totalXp).toBe(0)
    expect(activity.reward.pathXp).toEqual({
      power: 0,
      endurance: 0,
      technique: 0,
      strategy: 0,
    })
  })

  it('rejects a completely unconfirmed session', () => {
    const session = terminalSession()
    const results = allPerformed(session).map((phase) => ({
      ...phase,
      performedSeconds: 0,
    }))
    expect(() => createActivity(session, results, 3_000)).toThrow(
      /au moins une seconde/,
    )
  })

  it.each(['paused', 'running'] as const)(
    'rejects a %s session even with positive elapsed time',
    (status) => {
      const session = terminalSession()
      session.status = status
      expect(() =>
        createActivity(session, allPerformed(session), 3_000),
      ).toThrow(/séance réelle terminée ou arrêtée/)
    },
  )

  it('rejects demo sessions regardless of their terminal status', () => {
    const session = terminalSession()
    session.mode = 'demo'
    session.elapsedMs = getSessionDuration(session)
    for (const status of ['completed', 'stopped'] as const) {
      session.status = status
      expect(() =>
        createActivity(session, allPerformed(session), 3_000),
      ).toThrow(/séance réelle/)
    }
  })

  it.each([-1, 0.5, NaN, Infinity, '1', 181])(
    'rejects invalid or unobserved seconds: %s',
    (performedSeconds) => {
      const session = terminalSession()
      const results = allPerformed(session)
      const invalid = [
        { ...results[0], performedSeconds },
        ...results.slice(1),
      ] as PhaseResult[]
      expect(() => createActivity(session, invalid, 3_000)).toThrow(
        /temps confirmé/,
      )
    },
  )

  it('rejects credit for an unvisited phase or for time spent resting', () => {
    const session = sampleSession()
    session.status = 'stopped'
    session.elapsedMs = 14_000
    const results = allPerformed(session)

    expect(() =>
      createActivity(
        session,
        [{ ...results[0], performedSeconds: 14 }, ...results.slice(1)],
        3_000,
      ),
    ).toThrow()
    results[1].performedSeconds = 1
    expect(() => createActivity(session, results, 3_000)).toThrow()
  })

  it('requires an exact set of unique non-rest IDs including unvisited phases', () => {
    const session = sampleSession()
    const results = allPerformed(session)

    expect(() => createActivity(session, results.slice(1), 3_000)).toThrow()
    expect(() =>
      createActivity(session, [...results, results[0]], 3_000),
    ).toThrow()
    expect(() =>
      createActivity(session, [results[0], results[0], results[2]], 3_000),
    ).toThrow()
    expect(() =>
      createActivity(
        session,
        [{ phaseId: 'unknown', performedSeconds: 1 }, ...results.slice(1)],
        3_000,
      ),
    ).toThrow()
    expect(() =>
      createActivity(
        session,
        [{ phaseId: 'rest-1', performedSeconds: 1 }, ...results.slice(1)],
        3_000,
      ),
    ).toThrow()
    expect(() =>
      createActivity(session, new Array(results.length), 3_000),
    ).toThrow()
  })

  it.each([-1, 1_999, 2_000.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects an invalid or earlier recording timestamp: %s',
    (now) => {
      const session = terminalSession()
      expect(() => createActivity(session, allPerformed(session), now)).toThrow(
        /date du bilan/,
      )
    },
  )
})

describe('XP distribution', () => {
  function weightedSession() {
    const session = sampleSession()
    session.snapshot.variant.phases = [
      {
        id: 'movement',
        title: 'Movement',
        kind: 'work',
        durationSeconds: 600,
        cue: 'Move comfortably.',
      },
    ]
    session.snapshot.variant.pathWeights = {
      power: 25,
      endurance: 25,
      technique: 25,
      strategy: 25,
    }
    session.elapsedMs = getSessionDuration(session)
    return session
  }

  it.each([
    [6, { power: 1, endurance: 0, technique: 0, strategy: 0 }],
    [12, { power: 1, endurance: 1, technique: 0, strategy: 0 }],
    [18, { power: 1, endurance: 1, technique: 1, strategy: 0 }],
    [24, { power: 1, endurance: 1, technique: 1, strategy: 1 }],
  ] as const)(
    'breaks equal-remainder ties in path order for %i seconds',
    (performedSeconds, pathXp) => {
      const activity = createActivity(
        weightedSession(),
        [{ phaseId: 'movement', performedSeconds }],
        3_000,
      )
      expect(activity.reward.pathXp).toEqual(pathXp)
    },
  )

  it('preserves the exact total, respects quota rounding and never rewards a zero-weight path', () => {
    const session = weightedSession()
    session.snapshot.variant.pathWeights = {
      power: 10,
      endurance: 50,
      technique: 40,
      strategy: 0,
    }
    for (let totalXp = 0; totalXp <= 100; totalXp += 1) {
      const activity = createActivity(
        session,
        [{ phaseId: 'movement', performedSeconds: Math.max(1, totalXp * 6) }],
        3_000,
      )
      expect(activity.reward.totalXp).toBe(totalXp)
      expect(
        Object.values(activity.reward.pathXp).reduce((sum, xp) => sum + xp, 0),
      ).toBe(totalXp)
      expect(activity.reward.pathXp.strategy).toBe(0)
      for (const key of [
        'power',
        'endurance',
        'technique',
        'strategy',
      ] as const) {
        const quota =
          (totalXp * session.snapshot.variant.pathWeights[key]) / 100
        expect(Math.abs(activity.reward.pathXp[key] - quota)).toBeLessThan(1)
      }
    }
  })
})

describe('getProgress', () => {
  it('starts at level one with a full level left to earn', () => {
    expect(getProgress([])).toEqual({
      totalXp: 0,
      pathXp: { power: 0, endurance: 0, technique: 0, strategy: 0 },
      level: 1,
      xpInLevel: 0,
      xpToNextLevel: 100,
      completedCount: 0,
      partialCount: 0,
    })
  })

  it('derives exact level thresholds from recorded rewards', () => {
    expect(
      getProgress([completeActivity(FIRST_WORKOUT.variants[1])]),
    ).toMatchObject({
      totalXp: 100,
      level: 2,
      xpInLevel: 0,
      xpToNextLevel: 100,
    })
    const activities = FIRST_WORKOUT.variants.map(completeActivity)
    expect(getProgress(activities)).toEqual({
      totalXp: 273,
      pathXp: { power: 45, endurance: 117, technique: 111, strategy: 0 },
      level: 3,
      xpInLevel: 73,
      xpToNextLevel: 27,
      completedCount: 3,
      partialCount: 0,
    })
  })

  it('counts partial activities even when their reward is zero', () => {
    const session = sampleSession()
    const partial = createActivity(
      session,
      [
        { phaseId: 'warm', performedSeconds: 1 },
        { phaseId: 'work', performedSeconds: 0 },
        { phaseId: 'cool', performedSeconds: 0 },
      ],
      3_000,
    )
    expect(getProgress([partial])).toMatchObject({
      totalXp: 0,
      completedCount: 0,
      partialCount: 1,
    })
  })

  it('counts each stable identity once, keeping the first occurrence', () => {
    const activity = completeActivity()
    const session = terminalSession()
    const results = allPerformed(session)
    results[0].performedSeconds = 0
    const laterDuplicate = createActivity(session, results, 4_000)

    expect(
      getProgress([activity, structuredClone(activity), laterDuplicate]),
    ).toEqual(getProgress([activity]))
    expect(getProgress([laterDuplicate, activity])).toEqual(
      getProgress([laterDuplicate]),
    )
  })
})

describe('isActivity', () => {
  it('accepts complete and partial activities after serialization', () => {
    const complete = completeActivity()
    const session = sampleSession()
    session.status = 'stopped'
    session.elapsedMs = 16_000
    const partial = createActivity(session, allPerformed(session), 3_000)
    for (const activity of [complete, partial]) {
      expect(isActivity(activity)).toBe(true)
      expect(isActivity(JSON.parse(JSON.stringify(activity)))).toBe(true)
    }
  })

  it.each([null, undefined, 1, true, 'activity', []])(
    'rejects a non-activity: %j',
    (value) => {
      expect(isActivity(value)).toBe(false)
    },
  )

  it.each(Object.keys(completeActivity()))('requires the %s field', (key) => {
    const invalid = { ...completeActivity() } as Record<string, unknown>
    delete invalid[key]
    expect(isActivity(invalid)).toBe(false)
  })

  it.each<[string, unknown]>([
    ['schemaVersion', 2],
    ['kind', 'manual'],
    ['id', 'another-session'],
    ['recordedAt', '3000'],
    ['recordedAt', -1],
    ['recordedAt', 1_999],
    ['recordedAt', Infinity],
    ['recordedAt', Number.MAX_SAFE_INTEGER],
    ['session', null],
    ['session.id', 'another-session'],
    ['session.mode', 'demo'],
    ['session.status', 'running'],
    ['session.schemaVersion', 2],
    ['session.snapshot.workoutVersion', 0],
    ['session.snapshot.variant.phases.0.durationSeconds', 0],
    ['session.snapshot.variant.pathWeights.endurance', 49],
    ['result', null],
    ['result.phases', []],
    ['result.phases', null],
    ['result.phases.0.phaseId', 'unknown'],
    ['result.phases.0.performedSeconds', 181],
    ['result.phases.0.performedSeconds', 179],
    ['result.phases.0.performedSeconds', 0.5],
    ['result.performedSeconds', 421],
    ['result.performedSeconds', '420'],
    ['result.status', 'partial'],
    ['reward', null],
    ['reward.policyVersion', 2],
    ['reward.xpPerMinute', 20],
    ['reward.xpPerLevel', 200],
    ['reward.totalXp', 71],
    ['reward.totalXp', -1],
    ['reward.totalXp', Infinity],
    ['reward.totalXp', '70'],
    ['reward.pathXp', null],
    ['reward.pathXp.power', 1],
    ['reward.pathXp.endurance', 34],
    ['reward.pathXp.strategy', 1],
    ['reward.pathXp.technique', undefined],
    ['unexpected', true],
    ['result.unexpected', true],
    ['result.phases.0.unexpected', true],
    ['reward.unexpected', true],
    ['reward.pathXp.unexpected', 0],
  ])('rejects corrupted %s = %j', (path, value) => {
    expect(isActivity(corruptedActivity(path, value))).toBe(false)
  })

  it('rejects a distribution with the right total but the wrong path attribution', () => {
    const activity = completeActivity()
    activity.reward.pathXp.endurance += 1
    activity.reward.pathXp.technique -= 1
    expect(
      Object.values(activity.reward.pathXp).reduce((sum, xp) => sum + xp, 0),
    ).toBe(activity.reward.totalXp)
    expect(isActivity(activity)).toBe(false)
  })

  it('rejects repeated result IDs even when the stored totals are unchanged', () => {
    const activity = completeActivity()
    activity.result.phases[1].phaseId = activity.result.phases[0].phaseId
    expect(isActivity(activity)).toBe(false)
  })
})
