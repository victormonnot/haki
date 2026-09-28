import { describe, expect, it } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS, WORKOUTS } from '../content/workouts'
import {
  createSessionDraft,
  getSessionDuration,
  getSessionDurations,
  getSessionPosition,
  isSessionDraft,
  restoreSessionDraft,
  type SessionDraft,
  type SessionMode,
  type SessionStatus,
} from './session'
import type { TrainingSetup } from './workouts'

function setup(): TrainingSetup {
  return {
    environment: 'home',
    equipment: [],
    availableMinutes: 15,
    experience: 'discovery',
    smallSpace: true,
    quiet: true,
  }
}

function draft(mode: SessionMode = 'real'): SessionDraft {
  return createSessionDraft(
    FIRST_WORKOUT,
    FIRST_WORKOUT.variants[0],
    setup(),
    MOVEMENTS,
    mode,
    'session-1',
    1_000,
  )
}

function withCorruptedField(path: string, value: unknown): unknown {
  const corrupted: unknown = draft()
  const segments = path.split('.')
  let record = corrupted as Record<string, unknown>
  for (const segment of segments.slice(0, -1)) {
    record = record[segment] as Record<string, unknown>
  }
  record[segments.at(-1)!] = value
  return corrupted
}

describe('createSessionDraft', () => {
  it('starts paused and preserves caller-provided identity, mode and timestamps', () => {
    const created = draft('demo')

    expect(created).toMatchObject({
      schemaVersion: 1,
      id: 'session-1',
      mode: 'demo',
      createdAt: 1_000,
      updatedAt: 1_000,
      status: 'paused',
      elapsedMs: 0,
      snapshot: {
        workoutId: FIRST_WORKOUT.id,
        workoutVersion: FIRST_WORKOUT.version,
        workoutTitle: FIRST_WORKOUT.title,
        universe: FIRST_WORKOUT.universe,
      },
    })
    expect(isSessionDraft(created)).toBe(true)
  })

  it('freezes the chosen content and setup by copying every nested value', () => {
    const workout = structuredClone(FIRST_WORKOUT)
    const selected = workout.variants[0]
    const settings = setup()
    const movements = structuredClone(MOVEMENTS)
    const created = createSessionDraft(
      workout,
      selected,
      settings,
      movements,
      'real',
      'copy',
      1_000,
    )
    const expected = structuredClone(created.snapshot)

    workout.title = 'Changed title'
    workout.version = 99
    selected.phases[0].durationSeconds = 1
    selected.pathWeights.endurance = 0
    selected.environments.length = 0
    settings.equipment.push('rope')
    settings.availableMinutes = 5
    movements['easy-march'].instructions[0] = 'Changed instruction'

    expect(created.snapshot).toEqual(expected)
    created.snapshot.variant.phases[0].title = 'Draft-only title'
    expect(selected.phases[0].title).not.toBe('Draft-only title')
  })
})

describe('session durations and position', () => {
  it('keeps real durations, including warmup, recovery and cooldown', () => {
    const real = draft()

    expect(getSessionDurations(real)).toEqual([
      180_000, 60_000, 30_000, 30_000, 30_000, 30_000, 120_000,
    ])
    expect(getSessionDuration(real)).toBe(480_000)
  })

  it('gives every demo phase five seconds without altering the snapshot', () => {
    const demo = draft('demo')
    const original = structuredClone(demo)

    expect(getSessionDurations(demo)).toEqual(Array(7).fill(5_000))
    expect(getSessionDuration(demo)).toBe(35_000)
    expect(demo).toEqual(original)
  })

  it.each([
    [0, 0, 180_000, 480_000],
    [179_999, 0, 1, 300_001],
    [180_000, 1, 60_000, 300_000],
    [180_500, 1, 59_500, 299_500],
    [240_000, 2, 30_000, 240_000],
    [360_000, 6, 120_000, 120_000],
    [480_000, 6, 0, 0],
  ])(
    'locates %i ms at exact real phase boundaries',
    (elapsed, phaseIndex, remainingMs, totalRemainingMs) => {
      const session = draft()
      const position = getSessionPosition(session, elapsed)

      expect(position).toEqual({
        phaseIndex,
        phase: session.snapshot.variant.phases[phaseIndex],
        remainingMs,
        totalRemainingMs,
        progress: elapsed / 480_000,
      })
    },
  )

  it('uses the saved elapsed time when no override is provided', () => {
    const session = draft()
    session.elapsedMs = 185_000.25

    expect(getSessionPosition(session)).toMatchObject({
      phaseIndex: 1,
      remainingMs: 54_999.75,
      totalRemainingMs: 294_999.75,
    })
  })

  it('uses demo boundaries and ends on the final phase', () => {
    const session = draft('demo')

    expect(getSessionPosition(session, 5_000)).toMatchObject({
      phaseIndex: 1,
      remainingMs: 5_000,
      totalRemainingMs: 30_000,
    })
    expect(getSessionPosition(session, 35_000)).toMatchObject({
      phaseIndex: 6,
      remainingMs: 0,
      totalRemainingMs: 0,
      progress: 1,
    })
  })

  it('bounds display values before the start and after completion', () => {
    expect(getSessionPosition(draft(), -1)).toMatchObject({
      phaseIndex: 0,
      progress: 0,
      totalRemainingMs: 480_000,
    })
    expect(getSessionPosition(draft(), 900_000)).toMatchObject({
      phaseIndex: 6,
      progress: 1,
      remainingMs: 0,
      totalRemainingMs: 0,
    })
    expect(getSessionPosition(draft(), NaN)).toMatchObject({ progress: 0 })
  })

  it('has no phase for an invalid empty timeline and rejects it at the guard', () => {
    const invalid = draft()
    invalid.snapshot.variant.phases = []

    expect(getSessionPosition(invalid)).toEqual({
      phaseIndex: -1,
      phase: undefined,
      remainingMs: 0,
      totalRemainingMs: 0,
      progress: 0,
    })
    expect(isSessionDraft(invalid)).toBe(false)
  })
})

describe('restoreSessionDraft', () => {
  it.each<SessionStatus>(['running', 'paused', 'completed', 'stopped'])(
    'restores a %s draft without adding time',
    (status) => {
      const saved = draft()
      saved.status = status
      saved.elapsedMs =
        status === 'completed' ? getSessionDuration(saved) : 123_456.5
      saved.updatedAt = 9_000
      const original = structuredClone(saved)
      const restored = restoreSessionDraft(saved)

      expect(restored).toEqual({
        ...original,
        status: status === 'running' ? 'paused' : status,
      })
      expect(restored).not.toBe(saved)
      expect(restored.snapshot).not.toBe(saved.snapshot)
      restored.snapshot.variant.phases[0].cue = 'Edited locally'
      expect(saved).toEqual(original)
    },
  )
})

describe('isSessionDraft', () => {
  it('accepts every catalogue variant in both modes after a serialization round trip', () => {
    for (const workout of WORKOUTS) {
      for (const variant of workout.variants) {
        for (const mode of ['real', 'demo'] as const) {
          const session = createSessionDraft(
            workout,
            variant,
            setup(),
            MOVEMENTS,
            mode,
            'valid',
            1_000,
          )
          expect(isSessionDraft(session)).toBe(true)
          expect(isSessionDraft(JSON.parse(JSON.stringify(session)))).toBe(true)
        }
      }
    }
  })

  it('accepts phase weights only when every non-rest phase is defined', () => {
    const session = draft()
    const phases = session.snapshot.variant.phases
    const weights = { power: 0, endurance: 50, technique: 50, strategy: 0 }

    phases[0].pathWeights = weights
    expect(isSessionDraft(session)).toBe(false)
    for (const phase of phases) {
      if (phase.kind !== 'rest') phase.pathWeights = { ...weights }
    }
    expect(isSessionDraft(session)).toBe(true)
    expect(isSessionDraft(JSON.parse(JSON.stringify(session)))).toBe(true)
    delete phases.at(-1)!.pathWeights
    expect(isSessionDraft(session)).toBe(false)
  })

  it.each([
    null,
    {},
    { power: 0, endurance: 50, technique: 49, strategy: 0 },
    { power: -1, endurance: 51, technique: 50, strategy: 0 },
    { power: 0.5, endurance: 49.5, technique: 50, strategy: 0 },
    { power: 0, endurance: 50, technique: 50, strategy: Infinity },
    { power: 0, endurance: 50, technique: 50, strategy: 0, extra: 0 },
  ])('rejects invalid weights on any phase, including rest: %j', (weights) => {
    const session = draft()
    for (const phase of session.snapshot.variant.phases) {
      phase.pathWeights = {
        power: 0,
        endurance: 50,
        technique: 50,
        strategy: 0,
      }
    }
    for (const phase of session.snapshot.variant.phases) {
      const invalid = structuredClone(session)
      const invalidPhase = invalid.snapshot.variant.phases.find(
        ({ id }) => id === phase.id,
      )!
      Object.assign(invalidPhase, { pathWeights: weights })
      expect(isSessionDraft(invalid)).toBe(false)
    }
  })

  it('copies phase weights independently with the session snapshot', () => {
    const variant = structuredClone(FIRST_WORKOUT.variants[0])
    for (const phase of variant.phases) {
      if (phase.kind !== 'rest')
        phase.pathWeights = {
          power: 0,
          endurance: 50,
          technique: 50,
          strategy: 0,
        }
    }
    const session = createSessionDraft(
      FIRST_WORKOUT,
      variant,
      setup(),
      MOVEMENTS,
      'real',
      'weighted',
      1_000,
    )
    variant.phases[0].pathWeights!.endurance = 25

    expect(session.snapshot.variant.phases[0].pathWeights!.endurance).toBe(50)
    expect(isSessionDraft(session)).toBe(true)
  })

  it('accepts fractional elapsed time and exact completion in both modes', () => {
    for (const mode of ['real', 'demo'] as const) {
      const session = draft(mode)
      session.elapsedMs = 1_234.567
      session.updatedAt += 1
      expect(isSessionDraft(session)).toBe(true)
      session.status = 'completed'
      expect(isSessionDraft(session)).toBe(false)
      session.elapsedMs = getSessionDuration(session)
      expect(isSessionDraft(session)).toBe(true)
      session.elapsedMs += 0.001
      expect(isSessionDraft(session)).toBe(false)
    }
  })

  it.each([null, undefined, [], 1, true, 'session'])(
    'rejects a non-draft value: %j',
    (value) => {
      expect(isSessionDraft(value)).toBe(false)
    },
  )

  it.each(Object.keys(draft()))('requires the top-level %s field', (key) => {
    const invalid = { ...draft() } as Record<string, unknown>
    delete invalid[key]
    expect(isSessionDraft(invalid)).toBe(false)
  })

  it.each<[string, unknown]>([
    ['schemaVersion', 2],
    ['id', ''],
    ['id', 'x'.repeat(121)],
    ['mode', 'preview'],
    ['status', 'idle'],
    ['elapsedMs', -1],
    ['elapsedMs', 480_001],
    ['elapsedMs', NaN],
    ['elapsedMs', Infinity],
    ['elapsedMs', '0'],
    ['createdAt', -1],
    ['createdAt', 1.5],
    ['updatedAt', 999],
    ['updatedAt', Number.MAX_SAFE_INTEGER + 1],
    ['snapshot', null],
    ['snapshot.workoutVersion', 0],
    ['snapshot.workoutVersion', 1.5],
    ['snapshot.workoutTitle', ' '],
    ['snapshot.universe', 'x'.repeat(4_001)],
    ['snapshot.variant.title', null],
    ['snapshot.variant.description', 1],
    ['snapshot.variant.minExperience', 'expert'],
    ['snapshot.variant.environments', []],
    ['snapshot.variant.environments', ['moon']],
    ['snapshot.variant.environments', ['home', 'home']],
    ['snapshot.variant.requiredEquipment', ['sword']],
    ['snapshot.variant.requiredEquipment', ['rope', 'rope']],
    ['snapshot.variant.requiredEquipment', new Array(1)],
    ['snapshot.variant.needsSpace', 'false'],
    ['snapshot.variant.noisy', 0],
    ['snapshot.variant.phases', []],
    ['snapshot.variant.phases', new Array(1)],
    ['snapshot.variant.phases.0.kind', 'combat'],
    ['snapshot.variant.phases.0.durationSeconds', 0],
    ['snapshot.variant.phases.0.durationSeconds', -1],
    ['snapshot.variant.phases.0.durationSeconds', NaN],
    ['snapshot.variant.phases.0.durationSeconds', Infinity],
    ['snapshot.variant.phases.0.durationSeconds', 3_601],
    ['snapshot.variant.phases.0.cue', undefined],
    ['snapshot.variant.phases.0.movementId', 'unknown-movement'],
    ['snapshot.variant.phases.0.movementId', 'toString'],
    ['snapshot.variant.pathWeights.power', -1],
    ['snapshot.variant.pathWeights.power', 101],
    ['snapshot.variant.pathWeights.power', 0.5],
    ['snapshot.variant.pathWeights.endurance', 49],
    ['snapshot.variant.pathWeights.strategy', undefined],
    ['snapshot.movements', []],
    ['snapshot.movements.easy-march.id', 'mismatch'],
    ['snapshot.movements.easy-march.title', undefined],
    ['snapshot.movements.easy-march.instructions', []],
    ['snapshot.movements.easy-march.instructions', new Array(1)],
    ['snapshot.movements.easy-march.instructions', ['Valid', 2]],
    [
      'snapshot.movements.easy-march.instructions',
      Array(21).fill('Instruction'),
    ],
    ['snapshot.movements.easy-march.tip', false],
    ['snapshot.setup.environment', 'unknown'],
    ['snapshot.setup.availableMinutes', 181],
    ['snapshot.setup.equipment', ['rope', 'rope']],
    ['snapshot.setup.equipment', Array(6).fill('rope')],
    ['snapshot.setup.quiet', 'true'],
    ['unexpected', true],
    ['snapshot.unexpected', true],
    ['snapshot.variant.unexpected', true],
    ['snapshot.variant.phases.0.unexpected', true],
    ['snapshot.variant.pathWeights.unexpected', 0],
    ['snapshot.movements.easy-march.unexpected', true],
    ['snapshot.setup.unexpected', true],
  ])('rejects corrupt %s = %j', (path, value) => {
    expect(isSessionDraft(withCorruptedField(path, value))).toBe(false)
  })

  it('rejects duplicate phase IDs', () => {
    const invalid = draft()
    invalid.snapshot.variant.phases[1].id =
      invalid.snapshot.variant.phases[0].id
    expect(isSessionDraft(invalid)).toBe(false)
  })

  it('bounds phase count and total real duration, including in demo mode', () => {
    const session = draft('demo')
    const phase = session.snapshot.variant.phases[0]
    session.snapshot.variant.phases = Array.from(
      { length: 200 },
      (_, index) => ({ ...phase, id: `phase-${index}`, durationSeconds: 1 }),
    )
    expect(isSessionDraft(session)).toBe(true)
    session.snapshot.variant.phases.push({
      ...phase,
      id: 'phase-200',
      durationSeconds: 1,
    })
    expect(isSessionDraft(session)).toBe(false)

    session.snapshot.variant.phases = Array.from({ length: 4 }, (_, index) => ({
      ...phase,
      id: `phase-${index}`,
      durationSeconds: 3_000,
    }))
    expect(isSessionDraft(session)).toBe(false)
  })

  it('rejects oversized movement dictionaries', () => {
    const session = draft()
    const movement = session.snapshot.movements['easy-march']
    for (let index = 0; index < 201; index += 1) {
      const id = `movement-${index}`
      session.snapshot.movements[id] = { ...movement, id }
    }
    expect(isSessionDraft(session)).toBe(false)
  })

  it('requires referenced movements to be owned by the dictionary', () => {
    const session = draft()
    const inheritedMovements = Object.create(
      session.snapshot.movements,
    ) as typeof session.snapshot.movements
    session.snapshot.movements = inheritedMovements
    expect(isSessionDraft(session)).toBe(false)
  })
})
