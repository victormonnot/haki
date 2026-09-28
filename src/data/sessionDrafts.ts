import { isSessionDraft, type SessionDraft } from '../domain/session'
import {
  ACTIVITIES_STORE,
  openDatabase,
  SESSION_DRAFTS_STORE,
} from './database'

export interface StoredSession {
  draft: SessionDraft
  revision: number
}

export class SessionConflictError extends Error {
  constructor() {
    super(
      'Cette séance a été modifiée dans un autre onglet. Recharge-la avant de continuer.',
    )
    this.name = 'SessionConflictError'
  }
}

export class SessionDataError extends Error {
  constructor(
    message = 'Le brouillon de séance enregistré est invalide. Il n’a pas été modifié.',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SessionDataError'
  }
}

export const CURRENT_SESSION_KEY = 'current'
const CURRENT_KEY = CURRENT_SESSION_KEY
const COUNTER_KEY = 'revision-counter'
const SCHEMA_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseStoredSession(value: unknown): StoredSession | null {
  if (value === undefined) return null
  if (
    !isRecord(value) ||
    value.id !== CURRENT_KEY ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isRevision(value.revision) ||
    !isSessionDraft(value.draft) ||
    value.draft.mode !== 'real'
  ) {
    throw new SessionDataError()
  }
  return { draft: value.draft, revision: value.revision }
}

function parseCounter(value: unknown, current: StoredSession | null): number {
  if (value === undefined) return current?.revision ?? 0
  if (
    !isRecord(value) ||
    value.id !== COUNTER_KEY ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isRevision(value.revision) ||
    (current !== null && value.revision < current.revision)
  ) {
    throw new Error(
      'La révision de stockage est invalide. La séance enregistrée a été conservée.',
    )
  }
  return value.revision
}

export function parseSessionStorage(records: unknown[]): StoredSession | null {
  let current: unknown
  let counter: unknown
  for (const record of records) {
    if (!isRecord(record))
      throw new Error('Le stockage de la séance est invalide.')
    if (record.id === CURRENT_KEY && current === undefined) current = record
    else if (record.id === COUNTER_KEY && counter === undefined)
      counter = record
    else
      throw new Error(
        'Le stockage de la séance contient un enregistrement inconnu.',
      )
  }
  const stored = parseStoredSession(current)
  parseCounter(counter, stored)
  return stored
}

function assertExpectedRevision(
  current: StoredSession | null,
  expected: number | null,
) {
  if (expected === null ? current !== null : current?.revision !== expected) {
    throw new SessionConflictError()
  }
}

export async function loadSessionDraft(): Promise<StoredSession | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(SESSION_DRAFTS_STORE, 'readonly')
      const request = transaction
        .objectStore(SESSION_DRAFTS_STORE)
        .get(CURRENT_KEY)
      transaction.onabort = () => {
        reject(
          new Error('Impossible de lire la séance enregistrée.', {
            cause: transaction.error,
          }),
        )
      }
      transaction.oncomplete = () => {
        try {
          resolve(parseStoredSession(request.result))
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function saveSessionDraft(
  draft: SessionDraft,
  expectedRevision: number | null,
): Promise<StoredSession> {
  if (!isSessionDraft(draft) || draft.mode !== 'real') {
    throw new TypeError(
      'Seul un brouillon de séance réelle valide peut être enregistré.',
    )
  }
  if (expectedRevision !== null && !isRevision(expectedRevision)) {
    throw new TypeError('La révision attendue du brouillon est invalide.')
  }

  let snapshot: SessionDraft
  try {
    snapshot = structuredClone(draft)
  } catch (cause) {
    throw new TypeError('Le brouillon ne peut pas être enregistré.', {
      cause,
    })
  }

  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        [SESSION_DRAFTS_STORE, ACTIVITIES_STORE],
        'readwrite',
      )
      const store = transaction.objectStore(SESSION_DRAFTS_STORE)
      const currentRequest = store.get(CURRENT_KEY)
      const counterRequest = store.get(COUNTER_KEY)
      const activityRequest = transaction
        .objectStore(ACTIVITIES_STORE)
        .get(snapshot.id)
      let result: StoredSession
      let failure: unknown

      transaction.onabort = () => {
        reject(
          failure ??
            new Error('Impossible d’enregistrer la séance.', {
              cause: transaction.error,
            }),
        )
      }
      transaction.oncomplete = () => resolve(result)
      // Requests in one transaction run in order; this callback can still write atomically.
      activityRequest.onsuccess = () => {
        try {
          if (activityRequest.result !== undefined)
            throw new SessionConflictError()
          const current = parseStoredSession(currentRequest.result)
          assertExpectedRevision(current, expectedRevision)
          if (current && current.draft.id !== snapshot.id)
            throw new SessionConflictError()
          const revision = parseCounter(counterRequest.result, current) + 1
          if (!isRevision(revision))
            throw new Error(
              'La révision de stockage ne peut plus être incrémentée.',
            )

          result = { draft: snapshot, revision }
          store.put({
            id: CURRENT_KEY,
            schemaVersion: SCHEMA_VERSION,
            ...result,
          })
          // Keep revisions unique after deletion so stale tabs cannot delete a newer session.
          store.put({
            id: COUNTER_KEY,
            schemaVersion: SCHEMA_VERSION,
            revision,
          })
        } catch (error) {
          failure = error
          try {
            transaction.abort()
          } catch {
            // An earlier failed request may already have aborted the transaction.
          }
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function deleteSessionDraft(
  expectedRevision: number,
): Promise<void> {
  if (!isRevision(expectedRevision)) {
    throw new TypeError('La révision attendue du brouillon est invalide.')
  }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        SESSION_DRAFTS_STORE,
        'readwrite',
      )
      const store = transaction.objectStore(SESSION_DRAFTS_STORE)
      const request = store.get(CURRENT_KEY)
      let failure: unknown

      transaction.oncomplete = () => resolve()
      transaction.onabort = () => {
        reject(
          failure ??
            new Error('Impossible de supprimer la séance.', {
              cause: transaction.error,
            }),
        )
      }
      request.onsuccess = () => {
        try {
          const current = parseStoredSession(request.result)
          assertExpectedRevision(current, expectedRevision)
          store.delete(CURRENT_KEY)
        } catch (error) {
          failure = error
          try {
            transaction.abort()
          } catch {
            // The transaction may already have been aborted by the browser.
          }
        }
      }
    })
  } finally {
    database.close()
  }
}

/** Explicit recovery only: never discard a valid session another tab has restored. */
export async function resetCorruptSessionDraft(): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        SESSION_DRAFTS_STORE,
        'readwrite',
      )
      const store = transaction.objectStore(SESSION_DRAFTS_STORE)
      const request = store.get(CURRENT_KEY)
      let failure: unknown

      transaction.oncomplete = () => resolve()
      transaction.onabort = () => {
        reject(
          failure ??
            new Error('Impossible de supprimer le brouillon invalide.', {
              cause: transaction.error,
            }),
        )
      }
      request.onsuccess = () => {
        if (request.result === undefined) return
        try {
          let corrupt = false
          try {
            parseStoredSession(request.result)
          } catch (error) {
            if (!(error instanceof SessionDataError)) throw error
            corrupt = true
          }
          if (!corrupt) throw new SessionConflictError()
          store.delete(CURRENT_KEY)
        } catch (error) {
          failure = error
          try {
            transaction.abort()
          } catch {
            // The transaction may already have been aborted by the browser.
          }
        }
      }
    })
  } finally {
    database.close()
  }
}
