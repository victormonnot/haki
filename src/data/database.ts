const DATABASE_NAME = 'haki'
const DATABASE_VERSION = 3

export const TRAINING_PROFILES_STORE = 'training-profiles'
export const SESSION_DRAFTS_STORE = 'session-drafts'
export const ACTIVITIES_STORE = 'activities'

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error('Le stockage local est indisponible dans ce navigateur.'),
      )
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    } catch (cause) {
      reject(new Error('Impossible d’ouvrir le stockage local.', { cause }))
      return
    }

    let settled = false
    request.onupgradeneeded = () => {
      const database = request.result
      for (const storeName of [
        TRAINING_PROFILES_STORE,
        SESSION_DRAFTS_STORE,
        ACTIVITIES_STORE,
      ]) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' })
        }
      }
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      reject(
        new Error('Impossible d’ouvrir le stockage local.', {
          cause: request.error,
        }),
      )
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(
        new Error('Le stockage local est occupé par un autre onglet HAKI.'),
      )
    }
    request.onsuccess = () => {
      const database = request.result
      if (settled) {
        database.close()
        return
      }

      settled = true
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}
