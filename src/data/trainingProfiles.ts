import { isTrainingSetup, type TrainingSetup } from '../domain/workouts'
import { openDatabase, TRAINING_PROFILES_STORE } from './database'

export type ProfileId = 'home' | 'gym'

export interface TrainingProfile {
  id: ProfileId
  name: string
  setup: TrainingSetup
}

export const DEFAULT_PROFILES: Record<ProfileId, TrainingProfile> = {
  home: {
    id: 'home',
    name: 'Maison',
    setup: {
      environment: 'home',
      equipment: [],
      availableMinutes: 15,
      experience: 'discovery',
      smallSpace: true,
      quiet: true,
    },
  },
  gym: {
    id: 'gym',
    name: 'Salle de boxe',
    setup: {
      environment: 'gym',
      equipment: [],
      availableMinutes: 15,
      experience: 'discovery',
      smallSpace: false,
      quiet: false,
    },
  },
}

const PROFILE_IDS: ProfileId[] = ['home', 'gym']
const STORE_NAME = TRAINING_PROFILES_STORE
const SCHEMA_VERSION = 1

interface StoredTrainingProfile extends TrainingProfile {
  schemaVersion: typeof SCHEMA_VERSION
}

function copyProfile(profile: TrainingProfile): TrainingProfile {
  return {
    id: profile.id,
    name: profile.name,
    setup: { ...profile.setup, equipment: [...profile.setup.equipment] },
  }
}

export function createDefaultProfiles(): Record<ProfileId, TrainingProfile> {
  return {
    home: copyProfile(DEFAULT_PROFILES.home),
    gym: copyProfile(DEFAULT_PROFILES.gym),
  }
}

function isStoredProfile(
  value: unknown,
  id: ProfileId,
): value is StoredTrainingProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false

  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === SCHEMA_VERSION &&
    record.id === id &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    record.name.length <= 80 &&
    isTrainingSetup(record.setup)
  )
}

export async function loadTrainingProfiles(): Promise<{
  profiles: Record<ProfileId, TrainingProfile>
  invalidProfileIds: ProfileId[]
}> {
  const database = await openDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const values: Partial<Record<ProfileId, unknown>> = {}

      transaction.onabort = () => {
        reject(
          new Error('Impossible de lire les profils enregistrés.', {
            cause: transaction.error,
          }),
        )
      }
      transaction.oncomplete = () => {
        const profiles = createDefaultProfiles()
        const invalidProfileIds: ProfileId[] = []

        for (const id of PROFILE_IDS) {
          const value = values[id]
          if (value === undefined) continue

          if (isStoredProfile(value, id)) {
            profiles[id] = copyProfile(value)
          } else {
            invalidProfileIds.push(id)
          }
        }

        resolve({ profiles, invalidProfileIds })
      }

      for (const id of PROFILE_IDS) {
        const request = store.get(id)
        request.onsuccess = () => {
          values[id] = request.result
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function saveTrainingProfile(
  id: ProfileId,
  setup: TrainingSetup,
): Promise<TrainingProfile> {
  if (!PROFILE_IDS.includes(id) || !isTrainingSetup(setup)) {
    throw new Error('Le profil d’entraînement est invalide.')
  }

  const profile = copyProfile({ id, name: DEFAULT_PROFILES[id].name, setup })
  const stored: StoredTrainingProfile = {
    ...profile,
    schemaVersion: SCHEMA_VERSION,
  }
  const database = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => {
        reject(
          new Error('Impossible d’enregistrer ce profil.', {
            cause: transaction.error,
          }),
        )
      }
      transaction.objectStore(STORE_NAME).put(stored)
    })

    return profile
  } finally {
    database.close()
  }
}
