import {
  createActivity,
  isActivity,
  type Activity,
  type PhaseResult,
} from '../domain/activity'
import {
  ACTIVITIES_STORE,
  openDatabase,
  SESSION_DRAFTS_STORE,
  TRAINING_PROFILES_STORE,
} from './database'
import {
  CURRENT_SESSION_KEY,
  parseSessionStorage,
  parseStoredSession,
  SessionConflictError,
  type StoredSession,
} from './sessionDrafts'
import {
  parseStoredTrainingProfile,
  type TrainingProfile,
} from './trainingProfiles'

export class ActivityDataError extends Error {
  constructor() {
    super(
      'Une activité enregistrée est illisible. Les données ont été conservées.',
    )
    this.name = 'ActivityDataError'
  }
}

export interface TrainingDataExport {
  format: 'haki-backup'
  version: 1
  exportedAt: string
  activities: Activity[]
  profiles: TrainingProfile[]
  session: StoredSession | null
}

function parseActivity(value: unknown): Activity {
  if (!isActivity(value)) throw new ActivityDataError()
  return value
}

function parseActivities(values: unknown[]): Activity[] {
  return values
    .map(parseActivity)
    .sort(
      (left, right) =>
        right.recordedAt - left.recordedAt || left.id.localeCompare(right.id),
    )
}

export async function finalizeSession({
  sessionId,
  expectedRevision,
  phases,
  recordedAt,
}: {
  sessionId: string
  expectedRevision: number
  phases: PhaseResult[]
  recordedAt: number
}): Promise<{ activity: Activity; created: boolean }> {
  if (
    typeof sessionId !== 'string' ||
    sessionId.trim().length === 0 ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision <= 0
  ) {
    throw new TypeError('La séance à enregistrer est invalide.')
  }
  const results = structuredClone(phases)
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        [ACTIVITIES_STORE, SESSION_DRAFTS_STORE],
        'readwrite',
      )
      const activities = transaction.objectStore(ACTIVITIES_STORE)
      const sessions = transaction.objectStore(SESSION_DRAFTS_STORE)
      const existing = activities.get(sessionId)
      let result: { activity: Activity; created: boolean }
      let failure: unknown
      const abort = (error: unknown) => {
        failure = error
        try {
          transaction.abort()
        } catch {
          // A failed storage request may already have aborted this transaction.
        }
      }

      transaction.onabort = () => {
        reject(
          failure ??
            new Error('Impossible d’enregistrer le bilan de la séance.', {
              cause: transaction.error,
            }),
        )
      }
      transaction.oncomplete = () => resolve(result)
      existing.onsuccess = () => {
        try {
          if (existing.result !== undefined) {
            result = {
              activity: parseActivity(existing.result),
              created: false,
            }
            return
          }

          const current = sessions.get(CURRENT_SESSION_KEY)
          current.onsuccess = () => {
            try {
              const stored = parseStoredSession(current.result)
              if (
                !stored ||
                stored.draft.id !== sessionId ||
                stored.revision !== expectedRevision ||
                !['completed', 'stopped'].includes(stored.draft.status)
              ) {
                throw new SessionConflictError()
              }

              const activity = createActivity(stored.draft, results, recordedAt)
              result = { activity, created: true }
              activities.add(activity)
              sessions.delete(CURRENT_SESSION_KEY)
            } catch (error) {
              abort(error)
            }
          }
        } catch (error) {
          abort(error)
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function listActivities(): Promise<Activity[]> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ACTIVITIES_STORE, 'readonly')
      const request = transaction.objectStore(ACTIVITIES_STORE).getAll()
      transaction.onabort = () =>
        reject(
          new Error('Impossible de charger l’historique.', {
            cause: transaction.error,
          }),
        )
      transaction.oncomplete = () => {
        try {
          resolve(parseActivities(request.result))
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function loadActivity(id: string): Promise<Activity | null> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ACTIVITIES_STORE, 'readonly')
      const request = transaction.objectStore(ACTIVITIES_STORE).get(id)
      transaction.onabort = () =>
        reject(
          new Error('Impossible de charger cette activité.', {
            cause: transaction.error,
          }),
        )
      transaction.oncomplete = () => {
        try {
          resolve(
            request.result === undefined ? null : parseActivity(request.result),
          )
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function exportTrainingData(): Promise<TrainingDataExport> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        [ACTIVITIES_STORE, TRAINING_PROFILES_STORE, SESSION_DRAFTS_STORE],
        'readonly',
      )
      const activityRequest = transaction.objectStore(ACTIVITIES_STORE).getAll()
      const profileRequest = transaction
        .objectStore(TRAINING_PROFILES_STORE)
        .getAll()
      const sessionRequest = transaction
        .objectStore(SESSION_DRAFTS_STORE)
        .getAll()
      transaction.onabort = () =>
        reject(
          new Error('Impossible d’exporter les données.', {
            cause: transaction.error,
          }),
        )
      transaction.oncomplete = () => {
        try {
          const activities = parseActivities(activityRequest.result)
          const profiles = (profileRequest.result as unknown[]).map(
            parseStoredTrainingProfile,
          )
          const session = parseSessionStorage(sessionRequest.result)
          if (
            session &&
            activities.some((activity) => activity.id === session.draft.id)
          ) {
            throw new Error(
              'Une séance figure à la fois dans les brouillons et l’historique. L’export a été interrompu.',
            )
          }
          resolve({
            format: 'haki-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            activities,
            profiles,
            session,
          })
        } catch (error) {
          reject(error)
        }
      }
    })
  } finally {
    database.close()
  }
}
