import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import { type PhaseResult } from '../domain/activity'
import {
  createSessionDraft,
  getSessionDuration,
  type SessionDraft,
} from '../domain/session'
import {
  ActivityDataError,
  exportTrainingData,
  finalizeSession,
  listActivities,
  loadActivity,
} from './activities'
import {
  ACTIVITIES_STORE,
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
  it.each([1, 2])(
    'migrates database version %i without losing existing data',
    async (version) => {
      const draft = makeDraft()
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
          if (version === 2) {
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
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
      })

      expect(await listActivities()).toEqual([])
      expect(
        (await loadTrainingProfiles()).profiles.home.setup.availableMinutes,
      ).toBe(30)
      expect(await loadSessionDraft()).toEqual(
        version === 2 ? { draft, revision: 7 } : null,
      )
      const database = await openDatabase()
      expect(database.version).toBe(3)
      expect([...database.objectStoreNames]).toEqual([
        'activities',
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

  it('lists most recent activities first and returns null for an unknown id', async () => {
    const first = await prepareFinalization('first', 700_000)
    const firstResult = await finalizeSession(first.input)
    const second = await prepareFinalization('second', 900_000)
    const secondResult = await finalizeSession(second.input)

    expect(await listActivities()).toEqual([
      secondResult.activity,
      firstResult.activity,
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
      version: 1,
      exportedAt: expect.any(String),
      activities: [result.activity],
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
