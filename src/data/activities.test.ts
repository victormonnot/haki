import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import {
  createActivity,
  getProgress,
  type ManualActivityInput,
  type PhaseResult,
} from '../domain/activity'
import {
  createSessionDraft,
  getSessionDuration,
  type SessionDraft,
} from '../domain/session'
import {
  ActivityDataError,
  ActivityConflictError,
  deleteActivity,
  exportTrainingData,
  finalizeSession,
  listActivities,
  loadActivity,
  loadActivityHistory,
  saveManualActivity,
  updateActivity,
  type ActivityChanges,
} from './activities'
import {
  ACTIVITIES_STORE,
  ACTIVITY_DELETIONS_STORE,
  openDatabase,
  SESSION_DRAFTS_STORE,
  TRAINING_PROFILES_STORE,
} from './database'
import {
  loadSessionDraft,
  saveSessionDraft,
  SessionConflictError,
  SessionDataError,
} from './sessionDrafts'
import {
  DEFAULT_PROFILES,
  loadTrainingProfiles,
  saveTrainingProfile,
} from './trainingProfiles'

function makeDraft(id = 'session-one'): SessionDraft {
  const draft = createSessionDraft(
    FIRST_WORKOUT,
    FIRST_WORKOUT.variants[0],
    DEFAULT_PROFILES.home.setup,
    MOVEMENTS,
    'real',
    id,
    1_000,
  )
  return {
    ...draft,
    status: 'completed',
    elapsedMs: getSessionDuration(draft),
    updatedAt: 600_000,
  }
}

function phaseResults(draft: SessionDraft): PhaseResult[] {
  return draft.snapshot.variant.phases
    .filter((phase) => phase.kind !== 'rest')
    .map((phase) => ({
      phaseId: phase.id,
      performedSeconds: phase.durationSeconds,
    }))
}

async function prepareFinalization(id = 'session-one', recordedAt = 700_000) {
  const stored = await saveSessionDraft(makeDraft(id), null)
  return {
    stored,
    input: {
      sessionId: id,
      expectedRevision: stored.revision,
      phases: phaseResults(stored.draft),
      recordedAt,
    },
  }
}

async function writeRaw(storeName: string, value: unknown) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore(storeName).put(value)
    })
  } finally {
    database.close()
  }
}

async function readRaw(storeName: string, key: IDBValidKey): Promise<unknown> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(key)
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('activity storage', () => {
  it.each([1, 2, 3])(
    'migrates database version %i without losing existing data',
    async (version) => {
      const draft = makeDraft()
      const legacy = createActivity(
        makeDraft('legacy'),
        phaseResults(draft),
        700_000,
      )
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('haki', version)
        request.onupgradeneeded = () => {
          const profiles = request.result.createObjectStore(
            TRAINING_PROFILES_STORE,
            { keyPath: 'id' },
          )
          profiles.put({
            ...DEFAULT_PROFILES.home,
            schemaVersion: 1,
            setup: { ...DEFAULT_PROFILES.home.setup, availableMinutes: 30 },
          })
          if (version >= 2) {
            const sessions = request.result.createObjectStore(
              SESSION_DRAFTS_STORE,
              { keyPath: 'id' },
            )
            sessions.put({
              id: 'current',
              schemaVersion: 1,
              revision: 7,
              draft,
            })
            sessions.put({
              id: 'revision-counter',
              schemaVersion: 1,
              revision: 7,
            })
          }
          if (version >= 3) {
            request.result
              .createObjectStore(ACTIVITIES_STORE, { keyPath: 'id' })
              .put(legacy)
          }
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
      })

      expect(await listActivities()).toEqual(version >= 3 ? [legacy] : [])
      expect(
        (await loadTrainingProfiles()).profiles.home.setup.availableMinutes,
      ).toBe(30)
      expect(await loadSessionDraft()).toEqual(
        version >= 2 ? { draft, revision: 7 } : null,
      )
      const database = await openDatabase()
      expect(database.version).toBe(4)
      expect([...database.objectStoreNames]).toEqual([
        'activities',
        'activity-deletions',
        'session-drafts',
        'training-profiles',
      ])
      database.close()
    },
  )

  it('finalizes from the persisted snapshot and removes only the current draft', async () => {
    const { stored, input } = await prepareFinalization()
    const counter = await readRaw(SESSION_DRAFTS_STORE, 'revision-counter')
    const result = await finalizeSession(input)

    expect(result.created).toBe(true)
    expect(result.activity.session).toEqual(stored.draft)
    expect(await loadActivity(input.sessionId)).toEqual(result.activity)
    expect(await loadSessionDraft()).toBeNull()
    expect(await readRaw(SESSION_DRAFTS_STORE, 'revision-counter')).toEqual(
      counter,
    )
    expect((await listActivities()).map((activity) => activity.id)).toEqual([
      input.sessionId,
    ])
  })

  it('takes an independent copy of the confirmed results before asynchronous work', async () => {
    const { input } = await prepareFinalization()
    const original = structuredClone(input.phases)
    const pending = finalizeSession(input)
    input.phases[0].performedSeconds = 0

    expect((await pending).activity.result.phases).toEqual(original)
  })

  it('records one activity for a double submit from two tabs and returns the same reward', async () => {
    const { input } = await prepareFinalization()
    const results = await Promise.all([
      finalizeSession(input),
      finalizeSession(input),
    ])

    expect(results.map((result) => result.created).sort()).toEqual([
      false,
      true,
    ])
    expect(results[0].activity).toEqual(results[1].activity)
    expect(await listActivities()).toHaveLength(1)
    expect(await loadSessionDraft()).toBeNull()
    expect(await finalizeSession(input)).toEqual({
      activity: results[0].activity,
      created: false,
    })
  })

  it('keeps a newer draft when an older finalized execution is retried', async () => {
    const { input } = await prepareFinalization('old-session')
    const finalized = await finalizeSession(input)
    const newer = await saveSessionDraft(makeDraft('new-session'), null)

    expect(await finalizeSession(input)).toEqual({
      activity: finalized.activity,
      created: false,
    })
    expect(await loadSessionDraft()).toEqual(newer)
    expect(await listActivities()).toHaveLength(1)
  })

  it('prevents a finalized execution from being recreated by a stale tab', async () => {
    const { stored, input } = await prepareFinalization()
    await finalizeSession(input)

    await expect(saveSessionDraft(stored.draft, null)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    await expect(
      saveSessionDraft(stored.draft, stored.revision),
    ).rejects.toBeInstanceOf(SessionConflictError)
    expect(await loadSessionDraft()).toBeNull()
    expect(await listActivities()).toHaveLength(1)
  })

  it('checks draft identity, revision, and terminal status before finalization', async () => {
    const { stored, input } = await prepareFinalization()
    await expect(
      finalizeSession({ ...input, sessionId: 'another-session' }),
    ).rejects.toBeInstanceOf(SessionConflictError)
    await expect(
      finalizeSession({ ...input, expectedRevision: stored.revision + 1 }),
    ).rejects.toBeInstanceOf(SessionConflictError)
    const paused = await saveSessionDraft(
      { ...stored.draft, status: 'paused' },
      stored.revision,
    )
    await expect(
      finalizeSession({ ...input, expectedRevision: paused.revision }),
    ).rejects.toBeInstanceOf(SessionConflictError)
    expect(await loadSessionDraft()).toEqual(paused)
    expect(await listActivities()).toEqual([])
  })

  it('does not discard a draft when confirmed results fail domain validation', async () => {
    const { stored, input } = await prepareFinalization()
    await expect(finalizeSession({ ...input, phases: [] })).rejects.toThrow()
    expect(await loadSessionDraft()).toEqual(stored)
    expect(await listActivities()).toEqual([])
  })

  it('rolls back activity creation when draft deletion aborts before transaction completion', async () => {
    const { stored, input } = await prepareFinalization()
    const originalDelete = IDBObjectStore.prototype.delete
    const remove = vi
      .spyOn(IDBObjectStore.prototype, 'delete')
      .mockImplementation(function (
        this: IDBObjectStore,
        key: IDBValidKey | IDBKeyRange,
      ) {
        const request = originalDelete.call(this, key)
        if (this.name === SESSION_DRAFTS_STORE) {
          request.addEventListener('success', () => this.transaction.abort())
        }
        return request
      })

    await expect(finalizeSession(input)).rejects.toThrow(
      'Impossible d’enregistrer le bilan',
    )
    remove.mockRestore()
    expect(await loadSessionDraft()).toEqual(stored)
    expect(await listActivities()).toEqual([])
    expect((await finalizeSession(input)).created).toBe(true)
  })

  it('uses the activity date with deterministic id ordering instead of the recording date', async () => {
    const first = await prepareFinalization('first', 700_000)
    const firstResult = await finalizeSession(first.input)
    const second = await prepareFinalization('second', 900_000)
    const secondResult = await finalizeSession(second.input)

    expect(await listActivities()).toEqual([
      firstResult.activity,
      secondResult.activity,
    ])
    expect(await loadActivity('unknown')).toBeNull()
  })

  it('fails closed on corrupt activities instead of skipping them or finalizing over them', async () => {
    const { stored, input } = await prepareFinalization()
    const malformed = { id: input.sessionId, schemaVersion: 99 }
    await writeRaw(ACTIVITIES_STORE, malformed)

    await expect(listActivities()).rejects.toBeInstanceOf(ActivityDataError)
    await expect(loadActivity(input.sessionId)).rejects.toBeInstanceOf(
      ActivityDataError,
    )
    await expect(finalizeSession(input)).rejects.toBeInstanceOf(
      ActivityDataError,
    )
    await expect(exportTrainingData()).rejects.toBeInstanceOf(ActivityDataError)
    expect(await loadSessionDraft()).toEqual(stored)
    expect(await readRaw(ACTIVITIES_STORE, input.sessionId)).toEqual(malformed)
  })

  it('refuses to finalize a corrupt or demo draft', async () => {
    const draft = makeDraft()
    const input = {
      sessionId: draft.id,
      expectedRevision: 1,
      phases: phaseResults(draft),
      recordedAt: 700_000,
    }
    await writeRaw(SESSION_DRAFTS_STORE, {
      id: 'current',
      schemaVersion: 1,
      revision: 1,
      draft: { ...draft, mode: 'demo' },
    })
    await expect(finalizeSession(input)).rejects.toBeInstanceOf(
      SessionDataError,
    )
    expect(await listActivities()).toEqual([])
  })

  it('exports persisted profiles, activities, and the current session together', async () => {
    const finished = await prepareFinalization('finished')
    const result = await finalizeSession(finished.input)
    const profile = await saveTrainingProfile('home', {
      ...DEFAULT_PROFILES.home.setup,
      availableMinutes: 20,
    })
    const current = await saveSessionDraft(makeDraft('current'), null)
    const exported = await exportTrainingData()

    expect(exported).toEqual({
      format: 'haki-backup',
      version: 2,
      exportedAt: expect.any(String),
      activities: [result.activity],
      deletedActivities: [],
      profiles: [profile],
      session: current,
    })
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false)
    expect(exported.profiles.some((item) => item.id === 'gym')).toBe(false)
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported)
  })

  it('uses one consistent readonly transaction when export races with finalization', async () => {
    const { input } = await prepareFinalization()
    const [exported, finalized] = await Promise.all([
      exportTrainingData(),
      finalizeSession(input),
    ])
    const draftCaptured = exported.session?.draft.id === input.sessionId
    const activityCaptured = exported.activities.some(
      (activity) => activity.id === input.sessionId,
    )

    expect(Number(draftCaptured) + Number(activityCaptured)).toBe(1)
    expect((await exportTrainingData()).activities).toEqual([
      finalized.activity,
    ])
    expect((await exportTrainingData()).session).toBeNull()
  })

  it.each([
    [TRAINING_PROFILES_STORE, { id: 'home', schemaVersion: 1, setup: {} }],
    [TRAINING_PROFILES_STORE, { id: 'unknown', schemaVersion: 1 }],
    [SESSION_DRAFTS_STORE, { id: 'current', schemaVersion: 99 }],
    [
      SESSION_DRAFTS_STORE,
      { id: 'revision-counter', schemaVersion: 1, revision: -1 },
    ],
    [SESSION_DRAFTS_STORE, { id: 'unknown', schemaVersion: 1 }],
  ])(
    'does not silently omit corrupt records from %s in the export',
    async (storeName, malformed) => {
      await writeRaw(storeName, malformed)
      await expect(exportTrainingData()).rejects.toThrow()
      expect(await readRaw(storeName, malformed.id)).toEqual(malformed)
    },
  )
})

const NOW = Date.UTC(2026, 8, 28, 12)

function manualInput(id = 'manual-one'): ManualActivityInput {
  return {
    id,
    title: 'Boxe au club',
    occurredAt: NOW - 3_600_000,
    durationSeconds: 30 * 60,
    pathIds: ['power', 'technique'],
    notes: 'Travail des appuis',
  }
}

function manualChanges(durationSeconds = 20 * 60): ActivityChanges {
  const { id: _id, ...changes } = manualInput()
  return { kind: 'manual', ...changes, durationSeconds }
}

describe('activity corrections and deletions', () => {
  it('creates a manual activity once for two concurrent submissions and stable-id retries', async () => {
    const input = manualInput()
    const results = await Promise.all([
      saveManualActivity(input, NOW),
      saveManualActivity(input, NOW + 1),
    ])
    expect(results.map((item) => item.created).sort()).toEqual([false, true])
    expect(results[0].activity).toEqual(results[1].activity)
    expect(await saveManualActivity(input, NOW + 2)).toEqual({
      activity: results[0].activity,
      created: false,
    })
    expect(getProgress(await listActivities()).totalXp).toBe(300)
    expect(await loadActivity(input.id)).toEqual(results[0].activity)
  })

  it('rejects a reused manual id when its content differs or belongs to a guided session', async () => {
    const input = manualInput()
    const original = await saveManualActivity(input, NOW)
    await expect(
      saveManualActivity({ ...input, durationSeconds: 60 }, NOW),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    const pending = await prepareFinalization('guided')
    await expect(
      saveManualActivity(manualInput('guided'), NOW),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    const finalized = await finalizeSession(pending.input)
    await expect(
      saveManualActivity(manualInput('guided'), NOW),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    expect(await loadActivity(input.id)).toEqual(original.activity)
    expect(await loadActivity('guided')).toEqual(finalized.activity)
  })

  it('copies manual creation and correction inputs before opening storage', async () => {
    const input = manualInput()
    const creating = saveManualActivity(input, NOW)
    input.pathIds.push('endurance')
    input.title = 'Titre modifié trop tard'
    const created = await creating
    expect(created.activity.pathIds).toEqual(['power', 'technique'])
    expect(created.activity.title).toBe('Boxe au club')
    const changes = manualChanges()
    const updating = updateActivity(input.id, 1, changes, NOW + 1)
    if (changes.kind === 'manual') {
      changes.durationSeconds = 60
      changes.pathIds.push('strategy')
    }
    const updated = await updating
    expect(updated).toMatchObject({
      durationSeconds: 1_200,
      pathIds: ['power', 'technique'],
      revision: 2,
    })
  })

  it('lets only one concurrent correction replace the current reward', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    const results = await Promise.allSettled([
      updateActivity(activity.id, 1, manualChanges(600), NOW + 1),
      updateActivity(activity.id, 1, manualChanges(1_200), NOW + 2),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(ActivityConflictError)
    const saved = results.find((result) => result.status === 'fulfilled')!.value
    expect(await loadActivity(activity.id)).toEqual(saved)
    expect(saved.revision).toBe(2)
    expect(getProgress(await listActivities()).totalXp).toBe(
      saved.reward.totalXp,
    )
    expect(await listActivities()).toHaveLength(1)
  })

  it('corrects a legacy guided result without mutating its snapshot or duplicating the reward on retry', async () => {
    const { input } = await prepareFinalization()
    const original = (await finalizeSession(input)).activity
    const phases = original.result.phases.map((phase) => ({
      ...phase,
      performedSeconds: Math.floor(phase.performedSeconds / 2),
    }))
    const corrected = await updateActivity(
      original.id,
      1,
      {
        kind: 'guided',
        phases,
        occurredAt: NOW - 1_000,
        notes: 'Correction du temps réalisé',
      },
      NOW,
    )
    expect(corrected).toMatchObject({
      revision: 2,
      recordedAt: original.recordedAt,
      session: original.session,
      result: { status: 'partial' },
    })
    expect(corrected.reward.totalXp).toBeLessThan(original.reward.totalXp)
    expect(await finalizeSession(input)).toEqual({
      activity: corrected,
      created: false,
    })
    expect(await listActivities()).toEqual([corrected])
    await expect(
      updateActivity(
        original.id,
        1,
        { kind: 'guided', phases, occurredAt: NOW - 1_000, notes: '' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ActivityConflictError)
  })

  it('rejects invalid or wrong-kind corrections without changing the saved activity', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    await expect(
      updateActivity(activity.id, 1, manualChanges(0), NOW + 1),
    ).rejects.toThrow()
    await expect(
      updateActivity(
        activity.id,
        1,
        { kind: 'guided', phases: [], occurredAt: NOW, notes: '' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    expect(await loadActivity(activity.id)).toEqual(activity)
  })

  it('rolls back a correction when its write aborts before transaction completion', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    const originalPut = IDBObjectStore.prototype.put
    const spy = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        if (this.name === ACTIVITIES_STORE)
          request.addEventListener('success', () => this.transaction.abort())
        return request
      })
    await expect(
      updateActivity(activity.id, 1, manualChanges(), NOW + 1),
    ).rejects.toThrow('Impossible de modifier')
    spy.mockRestore()
    expect(await loadActivity(activity.id)).toEqual(activity)
    expect(getProgress(await listActivities()).totalXp).toBe(300)
  })

  it('deletes only the selected activity and retains a minimal tombstone and a newer draft', async () => {
    const { input } = await prepareFinalization('finished')
    const activity = (await finalizeSession(input)).activity
    const current = await saveSessionDraft(makeDraft('new-session'), null)
    const deletion = await deleteActivity(activity.id, 1, NOW)
    expect(deletion).toEqual({
      schemaVersion: 1,
      id: activity.id,
      revision: 2,
      deletedAt: NOW,
    })
    expect(await loadActivity(activity.id)).toBeNull()
    expect(await loadActivityHistory()).toEqual({
      activities: [],
      deletedActivities: [deletion],
    })
    expect(await loadSessionDraft()).toEqual(current)
    expect(await readRaw(ACTIVITY_DELETIONS_STORE, activity.id)).toEqual(
      deletion,
    )
    expect(getProgress(await listActivities()).totalXp).toBe(0)
  })

  it('prevents deleted identities from resurrecting through stale drafts, finalization, or manual creation', async () => {
    const { stored, input } = await prepareFinalization('deleted')
    await finalizeSession(input)
    await deleteActivity(input.sessionId, 1, NOW)
    const newer = await saveSessionDraft(makeDraft('newer'), null)
    await expect(saveSessionDraft(stored.draft, null)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    await expect(finalizeSession(input)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    await expect(
      saveManualActivity(manualInput('deleted'), NOW),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    await expect(
      updateActivity('deleted', 1, manualChanges(), NOW),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    await expect(deleteActivity('deleted', 1, NOW)).rejects.toBeInstanceOf(
      ActivityConflictError,
    )
    expect(await loadSessionDraft()).toEqual(newer)
    expect(await listActivities()).toEqual([])
  })

  it('serializes a correction and deletion so a stale revision cannot remove the correction', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    const results = await Promise.allSettled([
      updateActivity(activity.id, 1, manualChanges(), NOW + 1),
      deleteActivity(activity.id, 1, NOW + 1),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(ActivityConflictError)
    const history = await loadActivityHistory()
    expect(history.activities.length + history.deletedActivities.length).toBe(1)
    expect(
      (history.activities[0] ?? history.deletedActivities[0]).revision,
    ).toBe(2)
  })

  it('checks the latest revision before deleting a corrected activity', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    await updateActivity(activity.id, 1, manualChanges(), NOW + 1)
    await expect(
      deleteActivity(activity.id, 1, NOW + 2),
    ).rejects.toBeInstanceOf(ActivityConflictError)
    const deletion = await deleteActivity(activity.id, 2, NOW + 2)
    expect(deletion.revision).toBe(3)
    await expect(
      saveManualActivity(manualInput(), NOW + 3),
    ).rejects.toBeInstanceOf(ActivityConflictError)
  })

  it('rolls back both removal and its tombstone when deletion aborts', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    const originalDelete = IDBObjectStore.prototype.delete
    const spy = vi
      .spyOn(IDBObjectStore.prototype, 'delete')
      .mockImplementation(function (
        this: IDBObjectStore,
        key: IDBValidKey | IDBKeyRange,
      ) {
        const request = originalDelete.call(this, key)
        if (this.name === ACTIVITIES_STORE)
          request.addEventListener('success', () => this.transaction.abort())
        return request
      })
    await expect(deleteActivity(activity.id, 1, NOW + 1)).rejects.toThrow(
      'Impossible de supprimer',
    )
    spy.mockRestore()
    expect(await loadActivityHistory()).toEqual({
      activities: [activity],
      deletedActivities: [],
    })
    expect((await deleteActivity(activity.id, 1, NOW + 1)).revision).toBe(2)
  })

  it('rolls back a manual creation when the add request aborts', async () => {
    const originalAdd = IDBObjectStore.prototype.add
    const spy = vi
      .spyOn(IDBObjectStore.prototype, 'add')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalAdd.call(this, value, key)
        if (this.name === ACTIVITIES_STORE)
          request.addEventListener('success', () => this.transaction.abort())
        return request
      })
    await expect(saveManualActivity(manualInput(), NOW)).rejects.toThrow(
      'Impossible d’enregistrer',
    )
    spy.mockRestore()
    expect(await listActivities()).toEqual([])
  })

  it('sorts entries by when training occurred and then by id', async () => {
    await saveManualActivity(
      { ...manualInput('z'), occurredAt: NOW - 100 },
      NOW,
    )
    await saveManualActivity(
      { ...manualInput('a'), occurredAt: NOW - 100 },
      NOW + 1,
    )
    await saveManualActivity(
      { ...manualInput('older'), occurredAt: NOW - 1_000 },
      NOW + 2,
    )
    expect((await listActivities()).map((activity) => activity.id)).toEqual([
      'a',
      'z',
      'older',
    ])
  })

  it('exports corrected manual, legacy guided, deleted, profile, and draft data as version two', async () => {
    const { input } = await prepareFinalization('legacy')
    const guided = (await finalizeSession(input)).activity
    await saveManualActivity(manualInput(), NOW)
    const manual = await updateActivity(
      'manual-one',
      1,
      manualChanges(),
      NOW + 1,
    )
    await saveManualActivity(manualInput('removed'), NOW)
    const deletion = await deleteActivity('removed', 1, NOW + 1)
    const profile = await saveTrainingProfile(
      'home',
      DEFAULT_PROFILES.home.setup,
    )
    const session = await saveSessionDraft(makeDraft('current'), null)
    const exported = await exportTrainingData()
    expect(exported).toEqual({
      format: 'haki-backup',
      version: 2,
      exportedAt: expect.any(String),
      activities: [manual, guided],
      deletedActivities: [deletion],
      profiles: [profile],
      session,
    })
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported)
  })

  it('captures a coherent history when export races with a deletion', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    const [exported, deletion] = await Promise.all([
      exportTrainingData(),
      deleteActivity(activity.id, 1, NOW + 1),
    ])
    const live = exported.activities.some((item) => item.id === activity.id)
    const removed = exported.deletedActivities.some(
      (item) => item.id === activity.id,
    )
    expect(Number(live) + Number(removed)).toBe(1)
    expect(await loadActivityHistory()).toEqual({
      activities: [],
      deletedActivities: [deletion],
    })
  })

  it.each([
    { schemaVersion: 2, id: 'corrupt', revision: 2, deletedAt: NOW },
    { schemaVersion: 1, id: 'corrupt', revision: 1, deletedAt: NOW },
    { schemaVersion: 1, id: 'corrupt', revision: 2, deletedAt: -1 },
    {
      schemaVersion: 1,
      id: 'corrupt',
      revision: 2,
      deletedAt: NOW,
      body: 'Unexpected retained content',
    },
  ])('fails closed on malformed deletion records', async (record) => {
    await writeRaw(ACTIVITY_DELETIONS_STORE, record)
    await expect(loadActivityHistory()).rejects.toBeInstanceOf(
      ActivityDataError,
    )
    await expect(listActivities()).rejects.toBeInstanceOf(ActivityDataError)
    await expect(loadActivity(record.id)).rejects.toBeInstanceOf(
      ActivityDataError,
    )
    await expect(exportTrainingData()).rejects.toBeInstanceOf(ActivityDataError)
    await expect(
      saveManualActivity(manualInput(record.id), NOW),
    ).rejects.toBeInstanceOf(ActivityDataError)
    expect(await readRaw(ACTIVITY_DELETIONS_STORE, record.id)).toEqual(record)
  })

  it('rejects contradictory live and deleted identities in export', async () => {
    const { activity } = await saveManualActivity(manualInput(), NOW)
    await writeRaw(ACTIVITY_DELETIONS_STORE, {
      schemaVersion: 1,
      id: activity.id,
      revision: 2,
      deletedAt: NOW,
    })
    await expect(loadActivityHistory()).rejects.toBeInstanceOf(
      ActivityDataError,
    )
    await expect(exportTrainingData()).rejects.toBeInstanceOf(ActivityDataError)
  })

  it('rejects a deleted identity that also appears in the pending draft', async () => {
    await writeRaw(SESSION_DRAFTS_STORE, {
      id: 'current',
      schemaVersion: 1,
      revision: 1,
      draft: makeDraft('removed-draft'),
    })
    await writeRaw(ACTIVITY_DELETIONS_STORE, {
      schemaVersion: 1,
      id: 'removed-draft',
      revision: 2,
      deletedAt: NOW,
    })
    await expect(exportTrainingData()).rejects.toThrow(
      'brouillons et l’historique',
    )
  })
})
