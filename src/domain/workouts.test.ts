import { describe, expect, it } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import {
  assessVariant,
  ENVIRONMENTS,
  EQUIPMENT,
  EXPERIENCES,
  getDurationSeconds,
  isTrainingSetup,
  type TrainingSetup,
  type WorkoutVariant,
} from './workouts'

function setup(overrides: Partial<TrainingSetup> = {}): TrainingSetup {
  return {
    environment: 'home',
    equipment: [],
    availableMinutes: 15,
    experience: 'discovery',
    smallSpace: true,
    quiet: true,
    ...overrides,
  }
}

const [lightSteps, foundations, movingFootwork] = FIRST_WORKOUT.variants

describe('isTrainingSetup', () => {
  it.each([1, 180])('accepts the inclusive %i-minute boundary', (minutes) => {
    expect(isTrainingSetup(setup({ availableMinutes: minutes }))).toBe(true)
  })

  it('accepts every advertised choice and a full equipment list', () => {
    for (const environment of ENVIRONMENTS) {
      for (const experience of EXPERIENCES) {
        expect(
          isTrainingSetup(
            setup({
              environment: environment.id,
              experience: experience.id,
              equipment: EQUIPMENT.map(({ id }) => id),
              smallSpace: false,
              quiet: false,
            }),
          ),
        ).toBe(true)
      }
    }
  })

  it.each([0, -1, 181, 2.5, NaN, Infinity, '15', null])(
    'rejects an invalid available duration: %s',
    (availableMinutes) => {
      expect(isTrainingSetup({ ...setup(), availableMinutes })).toBe(false)
    },
  )

  it.each([null, undefined, false, 15, 'home', []])(
    'rejects a value that is not a setup object: %s',
    (value) => {
      expect(isTrainingSetup(value)).toBe(false)
    },
  )

  it.each(Object.keys(setup()))('requires the %s field', (field) => {
    const incomplete: Record<string, unknown> = { ...setup() }
    delete incomplete[field]
    expect(isTrainingSetup(incomplete)).toBe(false)
  })

  it.each([
    { environment: 'beach' },
    { experience: 'expert' },
    { equipment: ['unknown'] },
    { equipment: ['rope', 'rope'] },
    { equipment: ['rope', undefined] },
    { equipment: new Array(1) },
    { equipment: 'rope' },
    { equipment: null },
    { smallSpace: 'true' },
    { quiet: 0 },
  ])('rejects invalid field values: %j', (invalidFields) => {
    expect(isTrainingSetup({ ...setup(), ...invalidFields })).toBe(false)
  })
})

describe('getDurationSeconds', () => {
  it('includes warmup, work, recovery and cooldown in the available time', () => {
    const variant: WorkoutVariant = {
      ...lightSteps,
      phases: [
        {
          id: 'warm',
          title: 'Warmup',
          kind: 'warmup',
          durationSeconds: 60,
          cue: '',
        },
        {
          id: 'work',
          title: 'Work',
          kind: 'work',
          durationSeconds: 120,
          cue: '',
        },
        {
          id: 'rest',
          title: 'Rest',
          kind: 'rest',
          durationSeconds: 30,
          cue: '',
        },
        {
          id: 'cool',
          title: 'Cooldown',
          kind: 'cooldown',
          durationSeconds: 90,
          cue: '',
        },
      ],
    }

    expect(getDurationSeconds(variant)).toBe(300)
    expect(
      assessVariant(variant, setup({ availableMinutes: 4 })).compatible,
    ).toBe(false)
    expect(
      assessVariant(variant, setup({ availableMinutes: 5 })).compatible,
    ).toBe(true)
  })
})

describe('assessVariant', () => {
  it('accepts an equipment-free, quiet variant in a small space', () => {
    expect(assessVariant(lightSteps, setup({ availableMinutes: 8 }))).toEqual({
      compatible: true,
      reasons: [],
    })
  })

  it('accepts exactly enough time and rejects a shorter allocation', () => {
    expect(
      assessVariant(foundations, setup({ availableMinutes: 12 })).compatible,
    ).toBe(true)
    expect(assessVariant(foundations, setup({ availableMinutes: 11 }))).toEqual(
      {
        compatible: false,
        reasons: [
          'Prévois au moins 12 min, échauffement et récupérations inclus.',
        ],
      },
    )
  })

  it('lets regular users choose discovery variants', () => {
    expect(
      assessVariant(lightSteps, setup({ experience: 'regular' })).compatible,
    ).toBe(true)
  })

  it('does not treat available equipment as sufficient experience', () => {
    const assessment = assessVariant(
      movingFootwork,
      setup({
        equipment: ['rope'],
        smallSpace: false,
        quiet: false,
      }),
    )

    expect(assessment).toEqual({
      compatible: false,
      reasons: ['Cette variante demande une pratique régulière.'],
    })
  })

  it('accepts the rope variant only when all its requirements are met', () => {
    const ready = setup({
      equipment: ['rope'],
      experience: 'regular',
      availableMinutes: 14,
      smallSpace: false,
      quiet: false,
    })

    expect(assessVariant(movingFootwork, ready)).toEqual({
      compatible: true,
      reasons: [],
    })
    expect(
      assessVariant(movingFootwork, { ...ready, equipment: ['gloves'] })
        .reasons,
    ).toEqual(['Matériel manquant : Corde à sauter.'])
    expect(
      assessVariant(movingFootwork, { ...ready, smallSpace: true }).reasons,
    ).toEqual(['Cette variante demande un espace ample et dégagé.'])
    expect(
      assessVariant(movingFootwork, { ...ready, quiet: true }).reasons,
    ).toEqual(['Cette variante comprend des sauts ou des impacts sonores.'])
  })

  it('rejects an environment not supported by a variant', () => {
    const gymOnly: WorkoutVariant = { ...lightSteps, environments: ['gym'] }

    expect(assessVariant(gymOnly, setup()).reasons).toEqual([
      'Cette variante n’est pas prévue pour cet environnement.',
    ])
    expect(
      assessVariant(gymOnly, setup({ environment: 'gym' })).compatible,
    ).toBe(true)
  })

  it('reports every constraint and does not substitute a variant or equipment', () => {
    const restricted: WorkoutVariant = {
      ...movingFootwork,
      environments: ['gym'],
      requiredEquipment: ['rope', 'gloves'],
    }
    const limited = setup({ availableMinutes: 5, equipment: ['dumbbells'] })
    const originalVariant = structuredClone(restricted)
    const originalSetup = structuredClone(limited)
    const assessment = assessVariant(restricted, limited)

    expect(assessment.compatible).toBe(false)
    expect(assessment.reasons).toEqual([
      'Prévois au moins 14 min, échauffement et récupérations inclus.',
      'Cette variante demande une pratique régulière.',
      'Cette variante n’est pas prévue pour cet environnement.',
      'Matériel manquant : Corde à sauter, Gants.',
      'Cette variante demande un espace ample et dégagé.',
      'Cette variante comprend des sauts ou des impacts sonores.',
    ])
    expect(restricted).toEqual(originalVariant)
    expect(limited).toEqual(originalSetup)
  })
})

describe('workout catalogue', () => {
  it('has stable unique identifiers and the three advertised durations', () => {
    expect(FIRST_WORKOUT.id).toBe('leveil-du-nord')
    expect(FIRST_WORKOUT.version).toBe(1)
    expect(FIRST_WORKOUT.variants.map(({ id }) => id)).toEqual([
      'pas-legers',
      'fondations',
      'appuis-en-mouvement',
    ])
    expect(FIRST_WORKOUT.variants.map(getDurationSeconds)).toEqual([
      480, 720, 840,
    ])

    const identifiers = [
      FIRST_WORKOUT.id,
      ...FIRST_WORKOUT.variants.flatMap((variant) => [
        variant.id,
        ...variant.phases.map(({ id }) => id),
      ]),
      ...Object.values(MOVEMENTS).map(({ id }) => id),
    ]
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })

  it.each(FIRST_WORKOUT.variants)(
    'keeps $title complete and internally consistent',
    (variant) => {
      expect(variant.phases[0].kind).toBe('warmup')
      expect(variant.phases.at(-1)?.kind).toBe('cooldown')
      expect(variant.phases.some(({ kind }) => kind === 'work')).toBe(true)
      expect(variant.phases.some(({ kind }) => kind === 'rest')).toBe(true)

      for (const phase of variant.phases) {
        expect(Number.isInteger(phase.durationSeconds)).toBe(true)
        expect(phase.durationSeconds).toBeGreaterThan(0)
        expect(phase.title.trim().length).toBeGreaterThan(0)
        expect(phase.cue.trim().length).toBeGreaterThan(0)
        if (phase.kind === 'work') expect(phase.movementId).toBeDefined()
        if (phase.movementId) expect(MOVEMENTS[phase.movementId]).toBeDefined()
      }

      for (const value of Object.values(variant.pathWeights)) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
      expect(
        Object.values(variant.pathWeights).reduce(
          (sum, weight) => sum + weight,
          0,
        ),
      ).toBe(100)
      expect(variant.environments.length).toBeGreaterThan(0)
      expect(
        variant.environments.every((value) =>
          ENVIRONMENTS.some(({ id }) => id === value),
        ),
      ).toBe(true)
      expect(
        variant.requiredEquipment.every((value) =>
          EQUIPMENT.some(({ id }) => id === value),
        ),
      ).toBe(true)
      expect(new Set(variant.requiredEquipment).size).toBe(
        variant.requiredEquipment.length,
      )
    },
  )

  it('gives each referenced movement usable instructions', () => {
    for (const [key, movement] of Object.entries(MOVEMENTS)) {
      expect(movement.id).toBe(key)
      expect(movement.title.trim().length).toBeGreaterThan(0)
      expect(movement.description.trim().length).toBeGreaterThan(0)
      expect(movement.tip.trim().length).toBeGreaterThan(0)
      expect(movement.instructions.length).toBeGreaterThanOrEqual(2)
      expect(
        movement.instructions.every((step) => step.trim().length > 0),
      ).toBe(true)
    }
  })

  it('makes the rope and impact requirements explicit only for the rope variant', () => {
    for (const variant of [lightSteps, foundations]) {
      expect(variant.requiredEquipment).toEqual([])
      expect(variant.needsSpace).toBe(false)
      expect(variant.noisy).toBe(false)
      expect(
        variant.phases.some(({ movementId }) => movementId === 'basic-rope'),
      ).toBe(false)
    }
    expect(movingFootwork.requiredEquipment).toEqual(['rope'])
    expect(movingFootwork.minExperience).toBe('regular')
    expect(movingFootwork.needsSpace).toBe(true)
    expect(movingFootwork.noisy).toBe(true)
  })
})
