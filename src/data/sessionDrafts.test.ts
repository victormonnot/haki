import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import { createSessionDraft, type SessionDraft } from '../domain/session'
import {
  openDatabase,
  SESSION_DRAFTS_STORE,
  TRAINING_PROFILES_STORE,
} from './database'
import {
  DEFAULT_PROFILES,
  loadTrainingProfiles,
  saveTrainingProfile,
} from './trainingProfiles'
import {
  deleteSessionDraft,
  loadSessionDraft,
  resetCorruptSessionDraft,
  saveSessionDraft,
  SessionConflictError,
  SessionDataError,
} from './sessionDrafts'

function makeDraft(id = 'session-one', mode: 'real' | 'demo' = 'real') {
  return createSessionDraft(
    FIRST_WORKOUT,
    FIRST_WORKOUT.variants[0],
    DEFAULT_PROFILES.home.setup,
    MOVEMENTS,
    mode,
    id,
    1_000,
  )
}

async function writeRaw(record: unknown) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        SESSION_DRAFTS_STORE,
        'readwrite',
      )
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore(SESSION_DRAFTS_STORE).put(record)
    })
  } finally {
    database.close()
  }
}

async function readRaw(key = 'current'): Promise<unknown> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(SESSION_DRAFTS_STORE, 'readonly')
      const request = transaction.objectStore(SESSION_DRAFTS_STORE).get(key)
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('session draft persistence', () => {
  it('migrates the version-one database without losing saved training profiles', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('haki', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(
          TRAINING_PROFILES_STORE,
          { keyPath: 'id' },
        )
        store.put({
          ...DEFAULT_PROFILES.home,
          schemaVersion: 1,
          setup: { ...DEFAULT_PROFILES.home.setup, availableMinutes: 30 },
        })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })

    expect(await loadSessionDraft()).toBeNull()
    expect(
      (await loadTrainingProfiles()).profiles.home.setup.availableMinutes,
    ).toBe(30)
    const saved = await saveSessionDraft(makeDraft(), null)
    await saveTrainingProfile('gym', {
      ...DEFAULT_PROFILES.gym.setup,
      availableMinutes: 20,
    })
    expect(await loadSessionDraft()).toEqual(saved)
    expect(
      (await loadTrainingProfiles()).profiles.gym.setup.availableMinutes,
    ).toBe(20)
    const database = await openDatabase()
    expect(database.version).toBe(4)
    expect([...database.objectStoreNames]).toEqual([
      'activities',
      'activity-deletions',
      'session-drafts',
      'training-profiles',
    ])
    database.close()
  })

  it('restores the latest checkpoint and original workout snapshot after reopening', async () => {
    const draft = makeDraft()
    const first = await saveSessionDraft(draft, null)
    const checkpoint = {
      ...draft,
      elapsedMs: 31_250.5,
      updatedAt: 40_000,
      status: 'running' as const,
    }
    const saved = await saveSessionDraft(checkpoint, first.revision)

    expect(await loadSessionDraft()).toEqual(saved)
    expect(saved.draft).toEqual(checkpoint)
    expect(saved.revision).toBeGreaterThan(first.revision)
    expect(await readRaw()).toEqual({
      id: 'current',
      schemaVersion: 1,
      ...saved,
    })
  })

  it('copies input before opening storage so later UI changes cannot alter the checkpoint', async () => {
    const draft = makeDraft()
    const original = structuredClone(draft)
    const pendingSave = saveSessionDraft(draft, null)
    draft.elapsedMs = 1_234
    draft.snapshot.setup.availableMinutes = 60
    draft.snapshot.variant.phases[0].cue = 'Changed after save started'
    draft.snapshot.movements['easy-march'].instructions[0] =
      'Changed instruction'

    await pendingSave
    expect((await loadSessionDraft())?.draft).toEqual(original)
  })

  it('lets only one of two tabs create the current draft', async () => {
    const results = await Promise.allSettled([
      saveSessionDraft(makeDraft('first-tab'), null),
      saveSessionDraft(makeDraft('second-tab'), null),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.reason).toBeInstanceOf(SessionConflictError)
    const successful = results.find((result) => result.status === 'fulfilled')
    expect(await loadSessionDraft()).toEqual(successful?.value)
  })

  it('prevents simultaneous tabs from overwriting each other’s checkpoints', async () => {
    const first = await saveSessionDraft(makeDraft(), null)
    const results = await Promise.allSettled([
      saveSessionDraft(
        { ...first.draft, elapsedMs: 100, updatedAt: 2_000 },
        first.revision,
      ),
      saveSessionDraft(
        { ...first.draft, elapsedMs: 200, updatedAt: 3_000 },
        first.revision,
      ),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(SessionConflictError)
    expect(await loadSessionDraft()).toEqual(
      results.find((result) => result.status === 'fulfilled')?.value,
    )
  })

  it('checks the expected revision before deletion and does not recreate a deleted session', async () => {
    const first = await saveSessionDraft(makeDraft(), null)
    const latest = await saveSessionDraft(
      { ...first.draft, elapsedMs: 50 },
      first.revision,
    )
    await expect(deleteSessionDraft(first.revision)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    expect(await loadSessionDraft()).toEqual(latest)

    await deleteSessionDraft(latest.revision)
    expect(await loadSessionDraft()).toBeNull()
    await expect(
      saveSessionDraft(first.draft, latest.revision),
    ).rejects.toBeInstanceOf(SessionConflictError)
    await expect(deleteSessionDraft(latest.revision)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
  })

  it('keeps revisions unique across deletion and creation to reject stale tab actions', async () => {
    const old = await saveSessionDraft(makeDraft('old-session'), null)
    await deleteSessionDraft(old.revision)
    const fresh = await saveSessionDraft(makeDraft('new-session'), null)

    expect(fresh.revision).toBeGreaterThan(old.revision)
    await expect(deleteSessionDraft(old.revision)).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    await expect(
      saveSessionDraft(old.draft, old.revision),
    ).rejects.toBeInstanceOf(SessionConflictError)
    expect(await loadSessionDraft()).toEqual(fresh)
  })

  it('does not replace another session even when the caller knows its revision', async () => {
    const current = await saveSessionDraft(makeDraft('current-session'), null)
    await expect(
      saveSessionDraft(makeDraft('different-session'), current.revision),
    ).rejects.toBeInstanceOf(SessionConflictError)
    expect(await loadSessionDraft()).toEqual(current)
  })

  it('rejects demo or invalid drafts before opening the database', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    await expect(
      saveSessionDraft(makeDraft('demo-session', 'demo'), null),
    ).rejects.toBeInstanceOf(TypeError)
    await expect(
      saveSessionDraft({ ...makeDraft(), elapsedMs: Number.NaN }, null),
    ).rejects.toBeInstanceOf(TypeError)
    const invalidSnapshot = makeDraft()
    invalidSnapshot.snapshot.variant.phases[0].movementId = 'missing-movement'
    await expect(
      saveSessionDraft(invalidSnapshot, null),
    ).rejects.toBeInstanceOf(TypeError)
    expect(open).not.toHaveBeenCalled()
  })

  it.each([
    ['unsupported schema', { schemaVersion: 2 }],
    ['missing revision', { revision: undefined }],
    ['invalid revision', { revision: -1 }],
    ['unsafe revision', { revision: Number.MAX_SAFE_INTEGER + 1 }],
    ['invalid draft', { draft: { schemaVersion: 1 } }],
    ['demo draft', { draft: makeDraft('stored-demo', 'demo') }],
  ])(
    'preserves a record with %s instead of silently replacing it',
    async (_label, patch) => {
      const malformed = {
        id: 'current',
        schemaVersion: 1,
        revision: 1,
        draft: makeDraft(),
        ...patch,
      }
      await writeRaw(malformed)

      await expect(loadSessionDraft()).rejects.toBeInstanceOf(SessionDataError)
      await expect(saveSessionDraft(makeDraft(), null)).rejects.toBeInstanceOf(
        SessionDataError,
      )
      await expect(saveSessionDraft(makeDraft(), 1)).rejects.toBeInstanceOf(
        SessionDataError,
      )
      await expect(deleteSessionDraft(1)).rejects.toBeInstanceOf(
        SessionDataError,
      )
      expect(await readRaw()).toEqual(malformed)
    },
  )

  it('discards an invalid draft only through the explicit recovery action', async () => {
    await writeRaw({ id: 'current', schemaVersion: 99 })
    await resetCorruptSessionDraft()
    expect(await loadSessionDraft()).toBeNull()
    const valid = await saveSessionDraft(makeDraft(), null)
    await expect(resetCorruptSessionDraft()).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    expect(await loadSessionDraft()).toEqual(valid)
  })

  it('does not commit a checkpoint or revision if its write transaction aborts', async () => {
    const previous = await saveSessionDraft(makeDraft(), null)
    const counterBefore = await readRaw('revision-counter')
    const originalPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        if ((value as { id?: string }).id === 'revision-counter')
          request.addEventListener('success', () => this.transaction.abort())
        return request
      })

    await expect(
      saveSessionDraft({ ...previous.draft, elapsedMs: 80 }, previous.revision),
    ).rejects.toThrow('Impossible d’enregistrer')
    put.mockRestore()
    expect(await loadSessionDraft()).toEqual(previous)
    expect(await readRaw('revision-counter')).toEqual(counterBefore)
  })

  it('does not report deletion success if its transaction aborts', async () => {
    const previous = await saveSessionDraft(makeDraft(), null)
    const originalDelete = IDBObjectStore.prototype.delete
    const remove = vi
      .spyOn(IDBObjectStore.prototype, 'delete')
      .mockImplementation(function (
        this: IDBObjectStore,
        key: IDBValidKey | IDBKeyRange,
      ) {
        const request = originalDelete.call(this, key)
        request.addEventListener('success', () => this.transaction.abort())
        return request
      })

    await expect(deleteSessionDraft(previous.revision)).rejects.toThrow(
      'Impossible de supprimer',
    )
    remove.mockRestore()
    expect(await loadSessionDraft()).toEqual(previous)
  })

  it('rejects an invalid expected revision without changing storage', async () => {
    const draft: SessionDraft = makeDraft()
    await expect(saveSessionDraft(draft, Number.NaN)).rejects.toBeInstanceOf(
      TypeError,
    )
    await expect(deleteSessionDraft(0)).rejects.toBeInstanceOf(TypeError)
    expect(await loadSessionDraft()).toBeNull()
  })

  it('does not classify a broken revision counter as a corrupt saved session', async () => {
    const saved = await saveSessionDraft(makeDraft(), null)
    const brokenCounter = {
      id: 'revision-counter',
      schemaVersion: 1,
      revision: -1,
    }
    await writeRaw(brokenCounter)

    expect(await loadSessionDraft()).toEqual(saved)
    let failure: unknown
    try {
      await saveSessionDraft({ ...saved.draft, elapsedMs: 100 }, saved.revision)
    } catch (cause) {
      failure = cause
    }
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(SessionDataError)
    expect(failure).not.toBeInstanceOf(SessionConflictError)
    await expect(resetCorruptSessionDraft()).rejects.toBeInstanceOf(
      SessionConflictError,
    )
    expect(await loadSessionDraft()).toEqual(saved)
    expect(await readRaw('revision-counter')).toEqual(brokenCounter)
  })

  it('rejects explicit corrupt-draft recovery if deletion fails synchronously', async () => {
    const malformed = { id: 'current', schemaVersion: 99 }
    await writeRaw(malformed)
    const remove = vi
      .spyOn(IDBObjectStore.prototype, 'delete')
      .mockImplementation(() => {
        throw new DOMException('Storage is unavailable', 'UnknownError')
      })

    await expect(resetCorruptSessionDraft()).rejects.toThrow(
      'Storage is unavailable',
    )
    remove.mockRestore()
    expect(await readRaw()).toEqual(malformed)
  })
})
