import {
  amendGuidedActivity,
  amendManualActivity,
  createActivity,
  createManualActivity,
  getActivityDate,
  getActivityRevision,
  isActivity,
  type Activity,
  type GuidedActivity,
  type GuidedActivityChanges,
  type ManualActivity,
  type ManualActivityChanges,
  type ManualActivityInput,
  type PhaseResult,
} from '../domain/activity'
import {
  ACTIVITIES_STORE,
  ACTIVITY_DELETIONS_STORE,
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
      'Une activité ou sa suppression enregistrée est illisible. Les données ont été conservées.',
    )
    this.name = 'ActivityDataError'
  }
}

export class ActivityConflictError extends Error {
  constructor() {
    super(
      'Cette activité a été modifiée ou supprimée dans un autre onglet. Recharge le carnet avant de continuer.',
    )
    this.name = 'ActivityConflictError'
  }
}

export interface ActivityDeletion {
  schemaVersion: 1
  id: string
  revision: number
  deletedAt: number
}

export type ActivityChanges =
  | ({ kind: 'guided' } & GuidedActivityChanges)
  | ({ kind: 'manual' } & ManualActivityChanges)

export interface ActivityHistory {
  activities: Activity[]
  deletedActivities: ActivityDeletion[]
}

export interface TrainingDataExport extends ActivityHistory {
  format: 'haki-backup'
  version: 2
  exportedAt: string
  profiles: TrainingProfile[]
  session: StoredSession | null
}

function parseActivity(value: unknown): Activity {
  if (!isActivity(value)) throw new ActivityDataError()
  return value
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isFinite(new Date(value).getTime())
  )
}

function parseDeletion(value: unknown): ActivityDeletion {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ActivityDataError()
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 4 ||
    record.schemaVersion !== 1 ||
    typeof record.id !== 'string' ||
    record.id.trim().length === 0 ||
    record.id.length > 120 ||
    typeof record.revision !== 'number' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 2 ||
    !isTimestamp(record.deletedAt)
  )
    throw new ActivityDataError()
  return record as unknown as ActivityDeletion
}

function parseHistory(
  activities: unknown[],
  deletions: unknown[],
): ActivityHistory {
  const deletedActivities = deletions
    .map(parseDeletion)
    .sort(
      (left, right) =>
        right.deletedAt - left.deletedAt || left.id.localeCompare(right.id),
    )
  const deletedIds = new Set(deletedActivities.map((item) => item.id))
  const parsed = activities
    .map(parseActivity)
    .sort(
      (left, right) =>
        getActivityDate(right) - getActivityDate(left) ||
        left.id.localeCompare(right.id),
    )
  if (parsed.some((activity) => deletedIds.has(activity.id)))
    throw new ActivityDataError()
  return { activities: parsed, deletedActivities }
}

function assertRevision(id: string, revision: number) {
  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new TypeError('L’activité ou sa révision attendue est invalide.')
  }
}

async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  message: string,
  operation: (
    transaction: IDBTransaction,
    done: (value: T) => void,
    abort: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(stores, mode)
      let result: T
      let failure: unknown
      const abort = (error: unknown) => {
        failure = error
        try {
          transaction.abort()
        } catch {
          /* A failed request may have already aborted. */
        }
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () =>
        reject(failure ?? new Error(message, { cause: transaction.error }))
      try {
        operation(
          transaction,
          (value) => {
            result = value
          },
          abort,
        )
      } catch (error) {
        abort(error)
      }
    })
  } finally {
    database.close()
  }
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
}): Promise<{ activity: GuidedActivity; created: boolean }> {
  assertRevision(sessionId, expectedRevision)
  const results = structuredClone(phases)
  return transact(
    [ACTIVITIES_STORE, SESSION_DRAFTS_STORE, ACTIVITY_DELETIONS_STORE],
    'readwrite',
    'Impossible d’enregistrer le bilan de la séance.',
    (transaction, done, abort) => {
      const activities = transaction.objectStore(ACTIVITIES_STORE)
      const sessions = transaction.objectStore(SESSION_DRAFTS_STORE)
      const existing = activities.get(sessionId)
      const deletion = transaction
        .objectStore(ACTIVITY_DELETIONS_STORE)
        .get(sessionId)
      deletion.onsuccess = () => {
        try {
          if (deletion.result !== undefined) {
            parseDeletion(deletion.result)
            throw new SessionConflictError()
          }
          if (existing.result !== undefined) {
            const activity = parseActivity(existing.result)
            if (activity.kind !== 'guided') throw new SessionConflictError()
            done({ activity, created: false })
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
              )
                throw new SessionConflictError()
              const activity = createActivity(stored.draft, results, recordedAt)
              activities.add(activity)
              sessions.delete(CURRENT_SESSION_KEY)
              done({ activity, created: true })
            } catch (error) {
              abort(error)
            }
          }
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function saveManualActivity(
  input: ManualActivityInput,
  now: number,
): Promise<{ activity: ManualActivity; created: boolean }> {
  const activity = createManualActivity(structuredClone(input), now)
  return transact(
    [ACTIVITIES_STORE, ACTIVITY_DELETIONS_STORE, SESSION_DRAFTS_STORE],
    'readwrite',
    'Impossible d’enregistrer cette activité.',
    (transaction, done, abort) => {
      const store = transaction.objectStore(ACTIVITIES_STORE)
      const existing = store.get(activity.id)
      const deletion = transaction
        .objectStore(ACTIVITY_DELETIONS_STORE)
        .get(activity.id)
      const current = transaction
        .objectStore(SESSION_DRAFTS_STORE)
        .get(CURRENT_SESSION_KEY)
      current.onsuccess = () => {
        try {
          if (deletion.result !== undefined) {
            parseDeletion(deletion.result)
            throw new ActivityConflictError()
          }
          if (parseStoredSession(current.result)?.draft.id === activity.id)
            throw new ActivityConflictError()
          if (existing.result !== undefined) {
            const stored = parseActivity(existing.result)
            if (
              stored.kind !== 'manual' ||
              stored.title !== activity.title ||
              stored.occurredAt !== activity.occurredAt ||
              stored.durationSeconds !== activity.durationSeconds ||
              stored.notes !== activity.notes ||
              JSON.stringify(stored.pathIds) !==
                JSON.stringify(activity.pathIds)
            )
              throw new ActivityConflictError()
            done({ activity: stored, created: false })
            return
          }
          store.add(activity)
          done({ activity, created: true })
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function updateActivity(
  id: string,
  expectedRevision: number,
  changes: ActivityChanges,
  now: number,
): Promise<Activity> {
  assertRevision(id, expectedRevision)
  const snapshot = structuredClone(changes)
  return transact(
    [ACTIVITIES_STORE, ACTIVITY_DELETIONS_STORE],
    'readwrite',
    'Impossible de modifier cette activité.',
    (transaction, done, abort) => {
      const store = transaction.objectStore(ACTIVITIES_STORE)
      const existing = store.get(id)
      const deletion = transaction.objectStore(ACTIVITY_DELETIONS_STORE).get(id)
      deletion.onsuccess = () => {
        try {
          if (deletion.result !== undefined) {
            parseDeletion(deletion.result)
            throw new ActivityConflictError()
          }
          if (existing.result === undefined) throw new ActivityConflictError()
          const activity = parseActivity(existing.result)
          if (
            getActivityRevision(activity) !== expectedRevision ||
            activity.kind !== snapshot.kind
          )
            throw new ActivityConflictError()
          let updated: Activity
          if (snapshot.kind === 'manual' && activity.kind === 'manual') {
            const { kind: _kind, ...fields } = snapshot
            updated = amendManualActivity(activity, fields, now)
          } else if (snapshot.kind === 'guided' && activity.kind === 'guided') {
            const { kind: _kind, ...fields } = snapshot
            updated = amendGuidedActivity(activity, fields, now)
          } else throw new ActivityConflictError()
          store.put(updated)
          done(updated)
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function deleteActivity(
  id: string,
  expectedRevision: number,
  now: number,
): Promise<ActivityDeletion> {
  assertRevision(id, expectedRevision)
  if (!isTimestamp(now))
    throw new TypeError('La date de suppression est invalide.')
  return transact(
    [ACTIVITIES_STORE, ACTIVITY_DELETIONS_STORE],
    'readwrite',
    'Impossible de supprimer cette activité.',
    (transaction, done, abort) => {
      const store = transaction.objectStore(ACTIVITIES_STORE)
      const deletions = transaction.objectStore(ACTIVITY_DELETIONS_STORE)
      const existing = store.get(id)
      const previousDeletion = deletions.get(id)
      previousDeletion.onsuccess = () => {
        try {
          if (previousDeletion.result !== undefined) {
            parseDeletion(previousDeletion.result)
            throw new ActivityConflictError()
          }
          if (existing.result === undefined) throw new ActivityConflictError()
          const activity = parseActivity(existing.result)
          if (getActivityRevision(activity) !== expectedRevision)
            throw new ActivityConflictError()
          if (
            now < (activity.updatedAt ?? activity.recordedAt) ||
            !Number.isSafeInteger(expectedRevision + 1)
          )
            throw new TypeError(
              'La date ou la révision de suppression est invalide.',
            )
          const deletion: ActivityDeletion = {
            schemaVersion: 1,
            id,
            revision: expectedRevision + 1,
            deletedAt: now,
          }
          deletions.add(deletion)
          store.delete(id)
          done(deletion)
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function loadActivityHistory(): Promise<ActivityHistory> {
  return transact(
    [ACTIVITIES_STORE, ACTIVITY_DELETIONS_STORE],
    'readonly',
    'Impossible de charger l’historique.',
    (transaction, done, abort) => {
      const activities = transaction.objectStore(ACTIVITIES_STORE).getAll()
      const deletions = transaction
        .objectStore(ACTIVITY_DELETIONS_STORE)
        .getAll()
      deletions.onsuccess = () => {
        try {
          done(parseHistory(activities.result, deletions.result))
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function listActivities(): Promise<Activity[]> {
  return (await loadActivityHistory()).activities
}

export async function loadActivity(id: string): Promise<Activity | null> {
  return transact(
    [ACTIVITIES_STORE, ACTIVITY_DELETIONS_STORE],
    'readonly',
    'Impossible de charger cette activité.',
    (transaction, done, abort) => {
      const activity = transaction.objectStore(ACTIVITIES_STORE).get(id)
      const deletion = transaction.objectStore(ACTIVITY_DELETIONS_STORE).get(id)
      deletion.onsuccess = () => {
        try {
          const history = parseHistory(
            activity.result === undefined ? [] : [activity.result],
            deletion.result === undefined ? [] : [deletion.result],
          )
          done(history.activities[0] ?? null)
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}

export async function exportTrainingData(): Promise<TrainingDataExport> {
  return transact(
    [
      ACTIVITIES_STORE,
      ACTIVITY_DELETIONS_STORE,
      TRAINING_PROFILES_STORE,
      SESSION_DRAFTS_STORE,
    ],
    'readonly',
    'Impossible d’exporter les données.',
    (transaction, done, abort) => {
      const activities = transaction.objectStore(ACTIVITIES_STORE).getAll()
      const deletions = transaction
        .objectStore(ACTIVITY_DELETIONS_STORE)
        .getAll()
      const profiles = transaction.objectStore(TRAINING_PROFILES_STORE).getAll()
      const sessions = transaction.objectStore(SESSION_DRAFTS_STORE).getAll()
      sessions.onsuccess = () => {
        try {
          const history = parseHistory(activities.result, deletions.result)
          const session = parseSessionStorage(sessions.result)
          if (
            session &&
            [...history.activities, ...history.deletedActivities].some(
              (item) => item.id === session.draft.id,
            )
          )
            throw new Error(
              'Une séance figure à la fois dans les brouillons et l’historique. L’export a été interrompu.',
            )
          done({
            format: 'haki-backup',
            version: 2,
            exportedAt: new Date().toISOString(),
            ...history,
            profiles: (profiles.result as unknown[]).map(
              parseStoredTrainingProfile,
            ),
            session,
          })
        } catch (error) {
          abort(error)
        }
      }
    },
  )
}
