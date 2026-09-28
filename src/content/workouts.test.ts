import { describe, expect, it } from 'vitest'
import { createActivity } from '../domain/activity'
import { createSessionDraft, isSessionDraft } from '../domain/session'
import {
  assessVariant,
  ENVIRONMENTS,
  getDurationSeconds,
  type TrainingSetup,
  type Workout,
  type WorkoutVariant,
} from '../domain/workouts'
import { FIRST_WORKOUT, getWorkout, MOVEMENTS, WORKOUTS } from './workouts'

const variants = WORKOUTS.flatMap((workout) =>
  workout.variants.map((variant) => ({ workout, variant })),
)
const additions = variants.filter(({ workout }) => workout !== FIRST_WORKOUT)
const signalMovements = ['direction-signal', 'coded-signal']

function compatibleSetup(variant: WorkoutVariant): TrainingSetup {
  return {
    environment: variant.environments[0],
    equipment: [...variant.requiredEquipment],
    availableMinutes: Math.ceil(getDurationSeconds(variant) / 60),
    experience: variant.minExperience,
    smallSpace: !variant.needsSpace,
    quiet: !variant.noisy,
  }
}

function completedSession(workout: Workout, variant: WorkoutVariant) {
  const draft = createSessionDraft(
    workout,
    variant,
    compatibleSetup(variant),
    MOVEMENTS,
    'real',
    `catalogue-${variant.id}`,
    1_000,
  )
  return {
    ...draft,
    status: 'completed' as const,
    elapsedMs: getDurationSeconds(variant) * 1_000,
    updatedAt: 1_000 + getDurationSeconds(variant) * 1_000,
  }
}

describe('Viking workout catalogue', () => {
  it('keeps the published first workout and its five movement definitions unchanged', async () => {
    const originalMovements = Object.fromEntries(
      [
        'easy-march',
        'shoulder-rolls',
        'heel-taps',
        'mini-squat',
        'basic-rope',
      ].map((id) => [id, MOVEMENTS[id]]),
    )
    const serialized = JSON.stringify({
      workout: FIRST_WORKOUT,
      movements: originalMovements,
    })
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(serialized),
    )
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    expect(hash).toBe(
      'ecc9355ae974e4e866ae36a3aa384c928c75fc19fed0b1037a2d780ec3cc50d8',
    )
    expect(FIRST_WORKOUT.variants.map(getDurationSeconds)).toEqual([
      480, 720, 840,
    ])
  })

  it('publishes six distinct versioned workouts and supports exact lookup', () => {
    expect(WORKOUTS.map((workout) => workout.id)).toEqual([
      'leveil-du-nord',
      'le-socle-de-pierre',
      'le-souffle-du-fjord',
      'la-garde-du-rempart',
      'les-signaux-du-guetteur',
      'la-traversee-du-nord',
    ])
    expect(WORKOUTS[0]).toBe(FIRST_WORKOUT)
    for (const workout of WORKOUTS) {
      expect(getWorkout(workout.id)).toBe(workout)
      expect(workout.version).toBe(1)
      expect(workout.universe).toBe('Viking')
      expect(workout.variants).toHaveLength(workout === FIRST_WORKOUT ? 3 : 2)
    }
    expect(getWorkout('unknown-workout')).toBeUndefined()
    expect(getWorkout('LEVEIL-DU-NORD')).toBeUndefined()
    const variantIds = variants.map(({ variant }) => variant.id)
    const phaseIds = variants.flatMap(({ variant }) =>
      variant.phases.map((phase) => phase.id),
    )
    expect(new Set(variantIds).size).toBe(variantIds.length)
    expect(new Set(phaseIds).size).toBe(phaseIds.length)
  })

  it.each(WORKOUTS)(
    'offers an accessible quiet variant in every environment for $id',
    (workout) => {
      for (const { id: environment } of ENVIRONMENTS) {
        expect(
          workout.variants.some(
            (variant) =>
              assessVariant(variant, {
                environment,
                equipment: [],
                availableMinutes: 12,
                experience: 'discovery',
                smallSpace: true,
                quiet: true,
              }).compatible,
          ),
        ).toBe(true)
      }
    },
  )

  it.each(variants)(
    'creates valid real and demo sessions for $variant.id',
    ({ workout, variant }) => {
      const setup = compatibleSetup(variant)
      expect(assessVariant(variant, setup)).toEqual({
        compatible: true,
        reasons: [],
      })
      expect(
        assessVariant(variant, {
          ...setup,
          availableMinutes: setup.availableMinutes - 1,
        }).compatible,
      ).toBe(false)
      for (const mode of ['real', 'demo'] as const) {
        expect(
          isSessionDraft(
            createSessionDraft(
              workout,
              variant,
              setup,
              MOVEMENTS,
              mode,
              `catalogue-${variant.id}-${mode}`,
              1_000,
            ),
          ),
        ).toBe(true)
      }
    },
  )

  it.each(additions)(
    'keeps the complete duration and work volume constant for $variant.id',
    ({ variant }) => {
      expect(getDurationSeconds(variant)).toBe(720)
      const totals = { warmup: 0, work: 0, rest: 0, cooldown: 0 }
      for (const phase of variant.phases)
        totals[phase.kind] += phase.durationSeconds
      expect(totals).toEqual({
        warmup: 360,
        work: 120,
        rest: 120,
        cooldown: 120,
      })
      expect(variant.phases[0].kind).toBe('warmup')
      expect(variant.phases.at(-1)?.kind).toBe('cooldown')
    },
  )

  it.each(variants)(
    'resolves every movement and excludes recovery from its movement declarations: $variant.id',
    ({ variant }) => {
      for (const phase of variant.phases) {
        expect(Number.isInteger(phase.durationSeconds)).toBe(true)
        expect(phase.durationSeconds).toBeGreaterThan(0)
        expect(phase.cue.trim()).not.toBe('')
        if (phase.kind === 'rest') {
          expect(phase.movementId).toBeUndefined()
        } else {
          expect(phase.movementId).toBeDefined()
          const movement = MOVEMENTS[phase.movementId!]
          expect(movement.id).toBe(phase.movementId)
          expect(movement.instructions.length).toBeGreaterThanOrEqual(3)
          expect(
            movement.instructions.every(
              (instruction) => instruction.trim().length > 0,
            ),
          ).toBe(true)
        }
      }
    },
  )

  it('requires the advertised equipment and space instead of silently changing the variant', () => {
    const weighted = getWorkout('le-socle-de-pierre')!.variants.find(
      (variant) => variant.id === 'bras-et-appuis',
    )!
    expect(
      assessVariant(weighted, { ...compatibleSetup(weighted), equipment: [] }),
    ).toEqual({
      compatible: false,
      reasons: ['Matériel manquant : Haltères.'],
    })
    expect(
      assessVariant(weighted, {
        ...compatibleSetup(weighted),
        experience: 'discovery',
      }).compatible,
    ).toBe(false)
    for (const id of ['petite-boucle', 'garde-mobile', 'chemin-ouvert']) {
      const variant = variants.find((entry) => entry.variant.id === id)!.variant
      expect(
        assessVariant(variant, {
          ...compatibleSetup(variant),
          smallSpace: true,
        }),
      ).toEqual({
        compatible: false,
        reasons: ['Cette variante demande un espace ample et dégagé.'],
      })
    }
  })

  it.each(WORKOUTS.slice(1))(
    'provides two different work sequences for $id',
    (workout) => {
      const work = workout.variants.map((variant) =>
        variant.phases
          .filter((phase) => phase.kind === 'work')
          .map((phase) => ({ movement: phase.movementId, cue: phase.cue })),
      )
      expect(work[0]).not.toEqual(work[1])
    },
  )

  it.each(additions)(
    'uses valid phase weights and an exact complete-session reward summary for $variant.id',
    ({ workout, variant }) => {
      for (const phase of variant.phases) {
        if (phase.kind === 'rest') {
          expect(phase.pathWeights).toBeUndefined()
          continue
        }
        const weights = Object.values(phase.pathWeights!)
        expect(weights).toHaveLength(4)
        expect(
          weights.every((weight) => Number.isInteger(weight) && weight >= 0),
        ).toBe(true)
        expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(100)
        if (phase.kind !== 'work') {
          expect(phase.pathWeights).toEqual({
            power: 0,
            endurance: 50,
            technique: 50,
            strategy: 0,
          })
        }
      }
      const session = completedSession(workout, variant)
      const results = variant.phases
        .filter((phase) => phase.kind !== 'rest')
        .map((phase) => ({
          phaseId: phase.id,
          performedSeconds: phase.durationSeconds,
        }))
      const activity = createActivity(session, results, session.updatedAt)
      expect(activity.reward.policyVersion).toBe(2)
      expect(activity.reward.totalXp).toBe(100)
      expect(activity.reward.pathXp).toEqual(variant.pathWeights)
    },
  )

  it('reserves strategy weights for explicit directional or coded signal work', () => {
    const weighted = additions
      .flatMap(({ variant }) => variant.phases)
      .filter((phase) => (phase.pathWeights?.strategy ?? 0) > 0)
    expect(weighted).toHaveLength(16)
    for (const phase of weighted) {
      expect(phase.kind).toBe('work')
      expect(signalMovements).toContain(phase.movementId)
      expect(phase.cue).toMatch(/^(Gauche|Droite|Mer|Terre)\./)
      expect(phase.durationSeconds).toBe(15)
    }
    const lookout = getWorkout('les-signaux-du-guetteur')!
    for (const variant of lookout.variants) {
      const session = completedSession(lookout, variant)
      const results = variant.phases
        .filter((phase) => phase.kind !== 'rest')
        .map((phase) => ({
          phaseId: phase.id,
          performedSeconds: phase.kind === 'warmup' ? phase.durationSeconds : 0,
        }))
      const activity = createActivity(session, results, session.updatedAt)
      expect(activity.reward.totalXp).toBe(60)
      expect(activity.reward.pathXp.strategy).toBe(0)
    }
  })
})
