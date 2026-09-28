import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrainingSetup } from '../domain/workouts'
import {
  createDefaultProfiles,
  DEFAULT_PROFILES,
  loadTrainingProfiles,
  saveTrainingProfile,
} from './trainingProfiles'

const STORE_NAME = 'training-profiles'

function openRawDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('haki')
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function storeRawRecord(record: unknown) {
  const database = await openRawDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore(STORE_NAME).put(record)
    })
  } finally {
    database.close()
  }
}

async function readRawRecords(): Promise<unknown[]> {
  const database = await openRawDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).getAll()
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

describe('training profile persistence', () => {
  it('loads safe defaults without implicitly saving either profile', async () => {
    const result = await loadTrainingProfiles()

    expect(result).toEqual({
      profiles: DEFAULT_PROFILES,
      invalidProfileIds: [],
    })
    expect(result.profiles.home.setup).toMatchObject({
      equipment: [],
      availableMinutes: 15,
      smallSpace: true,
      quiet: true,
    })
    expect(result.profiles.gym.setup.equipment).toEqual([])
    expect(await readRawRecords()).toEqual([])

    result.profiles.home.setup.equipment.push('rope')
    expect(
      (await loadTrainingProfiles()).profiles.home.setup.equipment,
    ).toEqual([])
  })

  it('restores all saved settings through a fresh database connection', async () => {
    const setup: TrainingSetup = {
      environment: 'outdoors',
      equipment: ['rope', 'resistance-band'],
      availableMinutes: 30,
      experience: 'regular',
      smallSpace: false,
      quiet: false,
    }

    const saved = await saveTrainingProfile('home', setup)
    const loaded = await loadTrainingProfiles()

    expect(loaded.profiles.home).toEqual({ id: 'home', name: 'Maison', setup })
    expect(saved).toEqual(loaded.profiles.home)
    expect(await readRawRecords()).toEqual([{ ...saved, schemaVersion: 1 }])
    expect(loaded.invalidProfileIds).toEqual([])
  })

  it('updates one profile without overwriting the other or creating duplicates', async () => {
    const defaults = createDefaultProfiles()
    await saveTrainingProfile('home', {
      ...defaults.home.setup,
      availableMinutes: 20,
    })
    await saveTrainingProfile('gym', {
      ...defaults.gym.setup,
      equipment: ['punching-bag', 'gloves'],
      experience: 'regular',
    })
    await saveTrainingProfile('home', {
      ...defaults.home.setup,
      availableMinutes: 40,
    })

    const { profiles } = await loadTrainingProfiles()
    expect(profiles.home.setup.availableMinutes).toBe(40)
    expect(profiles.gym.setup.equipment).toEqual(['punching-bag', 'gloves'])
    expect(profiles.gym.setup.experience).toBe('regular')
    expect(await readRawRecords()).toHaveLength(2)
  })

  it('takes a snapshot of settings before asynchronous storage begins', async () => {
    const setup = createDefaultProfiles().home.setup
    const pendingSave = saveTrainingProfile('home', setup)
    setup.equipment.push('dumbbells')
    setup.availableMinutes = 90

    await pendingSave
    const { profiles } = await loadTrainingProfiles()
    expect(profiles.home.setup.equipment).toEqual([])
    expect(profiles.home.setup.availableMinutes).toBe(15)
  })

  it.each([
    ['an unsupported schema', { schemaVersion: 2 }],
    ['a missing schema', { schemaVersion: undefined }],
    ['an empty profile name', { name: '' }],
    ['an invalid setup', { setup: { availableMinutes: -1 } }],
    [
      'unknown equipment',
      { setup: { ...DEFAULT_PROFILES.home.setup, equipment: ['unknown'] } },
    ],
  ])(
    'ignores %s while restoring the other valid profile',
    async (_name, invalidFields) => {
      await saveTrainingProfile('gym', {
        ...DEFAULT_PROFILES.gym.setup,
        availableMinutes: 25,
      })
      const invalidRecord = {
        ...DEFAULT_PROFILES.home,
        schemaVersion: 1,
        ...invalidFields,
      }
      await storeRawRecord(invalidRecord)

      const { profiles, invalidProfileIds } = await loadTrainingProfiles()
      expect(profiles.home).toEqual(DEFAULT_PROFILES.home)
      expect(profiles.gym.setup.availableMinutes).toBe(25)
      expect(invalidProfileIds).toEqual(['home'])
      expect(await readRawRecords()).toContainEqual(invalidRecord)
    },
  )

  it('rejects invalid settings without replacing the saved profile', async () => {
    await saveTrainingProfile('home', DEFAULT_PROFILES.home.setup)

    await expect(
      saveTrainingProfile('home', {
        ...DEFAULT_PROFILES.home.setup,
        availableMinutes: Number.NaN,
      }),
    ).rejects.toThrow('invalide')

    expect((await loadTrainingProfiles()).profiles.home).toEqual(
      DEFAULT_PROFILES.home,
    )
  })

  it('does not report success when a write transaction aborts', async () => {
    await saveTrainingProfile('home', DEFAULT_PROFILES.home.setup)
    const originalPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key)
        this.transaction.abort()
        return request
      })

    await expect(
      saveTrainingProfile('home', {
        ...DEFAULT_PROFILES.home.setup,
        availableMinutes: 60,
      }),
    ).rejects.toThrow('Impossible d’enregistrer')

    put.mockRestore()
    expect(
      (await loadTrainingProfiles()).profiles.home.setup.availableMinutes,
    ).toBe(15)
  })

  it('reports unavailable storage instead of pretending a profile was saved', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(loadTrainingProfiles()).rejects.toThrow(
      'stockage local est indisponible',
    )
    await expect(
      saveTrainingProfile('home', DEFAULT_PROFILES.home.setup),
    ).rejects.toThrow('stockage local est indisponible')
  })

  it('reports browser restrictions when opening the database fails', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })

    await expect(loadTrainingProfiles()).rejects.toThrow('Impossible d’ouvrir')
    await expect(
      saveTrainingProfile('gym', DEFAULT_PROFILES.gym.setup),
    ).rejects.toThrow('Impossible d’ouvrir')
  })
})
