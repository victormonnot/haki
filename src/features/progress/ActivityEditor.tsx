import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, NotebookPen, RefreshCw, Trash2 } from 'lucide-react'
import {
  ActivityConflictError,
  deleteActivity,
  loadActivity,
  saveManualActivity,
  updateActivity,
} from '../../data/activities'
import {
  amendGuidedActivity,
  amendManualActivity,
  createManualActivity,
  getActivityDate,
  getActivityDuration,
  getActivityNotes,
  getActivityRevision,
  getActivityTitle,
  getReportablePhases,
  MIN_ACTIVITY_DATE,
  PATHS,
  type Activity,
  type GuidedActivityChanges,
  type ManualActivityChanges,
  type PathId,
} from '../../domain/activity'
import {
  parseLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../../domain/calendar'
import { durationLabel } from '../preparation/durationLabel'
import { RewardSplit } from './ProgressDetails'
import type { ActivityHistoryController } from './useActivityHistory'
import './progress.css'
import './activity-editor.css'

interface EditorValues {
  title: string
  date: string
  minutes: string
  notes: string
  pathIds: PathId[]
  seconds: Record<string, string>
}

interface EditorState {
  id: string
  base: Activity | null
  values: EditorValues
  now: number
}

type EditorChanges =
  | ({ kind: 'guided' } & GuidedActivityChanges)
  | ({ kind: 'manual' } & ManualActivityChanges)

function newActivityId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function editorState(activity?: Activity, id?: string): EditorState {
  const now = Date.now()
  const base = activity ? structuredClone(activity) : null
  return {
    id: base?.id ?? id ?? newActivityId(),
    base,
    now,
    values: {
      title: base ? getActivityTitle(base) : '',
      date: toLocalDateTimeInput(base ? getActivityDate(base) : now),
      minutes: base?.kind === 'manual' ? String(base.durationSeconds / 60) : '',
      notes: base ? getActivityNotes(base) : '',
      pathIds: base?.kind === 'manual' ? [...base.pathIds] : [],
      seconds:
        base?.kind === 'guided'
          ? Object.fromEntries(
              base.result.phases.map((phase) => [
                phase.phaseId,
                String(phase.performedSeconds),
              ]),
            )
          : {},
    },
  }
}

function changesFor(form: EditorState): EditorChanges {
  const { base, values } = form
  // Preserve the original timestamp when its minute-level field is unchanged.
  const occurredAt =
    base && values.date === toLocalDateTimeInput(getActivityDate(base))
      ? getActivityDate(base)
      : parseLocalDateTimeInput(values.date)
  if (occurredAt === null)
    throw new Error('Indique une date et une heure valides.')
  if (occurredAt < MIN_ACTIVITY_DATE || occurredAt > form.now) {
    throw new Error(
      'Choisis une date passée, entre le 1er janvier 2000 et maintenant.',
    )
  }
  if (base?.kind === 'guided') {
    const phases = getReportablePhases(base.session).map(
      ({ phase, availableSeconds }) => {
        const value = values.seconds[phase.id] ?? ''
        const performedSeconds = Number(value)
        if (
          value.trim() === '' ||
          !Number.isInteger(performedSeconds) ||
          performedSeconds < 0 ||
          performedSeconds > availableSeconds
        ) {
          throw new Error(
            'Chaque durée doit être un nombre entier de secondes, entre zéro et le temps chronométré du bloc.',
          )
        }
        return { phaseId: phase.id, performedSeconds }
      },
    )
    return { kind: 'guided', phases, occurredAt, notes: values.notes }
  }
  return {
    kind: 'manual',
    title: values.title,
    occurredAt,
    durationSeconds: Number(values.minutes) * 60,
    pathIds: values.pathIds,
    notes: values.notes,
  }
}

const pathDescriptions: Record<PathId, string> = {
  power: 'Force et résistance',
  endurance: 'Effort prolongé',
  technique: 'Précision et coordination',
  strategy: 'Décisions et réponses à des signaux',
}

function EditorForm({
  activity,
  history,
}: {
  activity?: Activity
  history: ActivityHistoryController
}) {
  const [form, setForm] = useState(() => editorState(activity))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [missing, setMissing] = useState(false)
  const working = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const manual = form.base?.kind !== 'guided'
  const editing = form.base !== null
  const returnHref = editing
    ? `#historique/${encodeURIComponent(form.id)}`
    : '#historique'
  const preview = useMemo(() => {
    try {
      const changes = changesFor(form)
      if (changes.kind === 'guided' && form.base?.kind === 'guided') {
        const { kind: _kind, ...details } = changes
        return {
          activity: amendGuidedActivity(form.base, details, form.now),
          error: null,
        }
      }
      if (changes.kind === 'manual') {
        const { kind: _kind, ...details } = changes
        return {
          activity:
            form.base?.kind === 'manual'
              ? amendManualActivity(form.base, details, form.now)
              : createManualActivity({ ...details, id: form.id }, form.now),
          error: null,
        }
      }
      return {
        activity: null,
        error: 'Les informations de cette activité sont invalides.',
      }
    } catch (cause) {
      return {
        activity: null,
        error:
          cause instanceof Error
            ? cause.message
            : 'Vérifie les informations de ton entraînement.',
      }
    }
  }, [form])
  const showValidation =
    editing ||
    (form.values.title !== '' &&
      form.values.minutes !== '' &&
      form.values.pathIds.length > 0)

  function change<K extends keyof EditorValues>(
    key: K,
    value: EditorValues[K],
  ) {
    if (working.current) return
    const now = Date.now()
    setForm((current) => ({
      ...current,
      now,
      values: { ...current.values, [key]: value },
    }))
    if (!conflict) setError(null)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (working.current || conflict || missing || !preview.activity) return
    working.current = true
    setBusy(true)
    setError(null)
    try {
      const now = Date.now()
      const changes = changesFor({ ...form, now })
      let saved: Activity
      if (form.base) {
        saved = await updateActivity(
          form.id,
          getActivityRevision(form.base),
          changes,
          now,
        )
      } else {
        if (changes.kind !== 'manual')
          throw new Error('Type d’activité invalide.')
        const { kind: _kind, ...details } = changes
        saved = (await saveManualActivity({ ...details, id: form.id }, now))
          .activity
      }
      await history.refresh()
      if (mounted.current) {
        window.location.hash = `historique/${encodeURIComponent(saved.id)}`
      }
    } catch (cause) {
      if (cause instanceof ActivityConflictError) {
        setConflict(true)
        setError(
          'Cette activité a été modifiée ou supprimée ailleurs. Ta saisie est conservée ici. Recharge la version enregistrée avant de la modifier à nouveau.',
        )
      } else {
        setError(
          'L’enregistrement n’a pas pu être confirmé. Ta saisie est conservée ; tu peux réessayer.',
        )
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function reload() {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      const latest = await loadActivity(form.id)
      if (!latest) {
        setMissing(true)
        setError(
          'Cette activité a été supprimée. Ta saisie reste visible ici ; retrouve tes autres activités dans le carnet.',
        )
      } else {
        setForm(editorState(latest, form.id))
        setConflict(false)
        setMissing(false)
        setError(null)
      }
      await history.refresh()
    } catch {
      setError(
        'La dernière version n’a pas pu être chargée. Ta saisie a été conservée. Réessaie quand le stockage sera disponible.',
      )
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="progress-screen activity-editor"
    >
      <a
        className="back-button"
        href={returnHref}
        aria-disabled={busy || undefined}
        onClick={(event) => {
          if (working.current) event.preventDefault()
        }}
      >
        <ArrowLeft size={17} aria-hidden="true" />
        {editing ? 'Revenir à l’activité' : 'Mon carnet'}
      </a>
      <div className="progress-heading">
        <p className="eyebrow">
          <NotebookPen size={17} aria-hidden="true" />
          {editing ? 'AJUSTER TON CARNET' : 'LA PRATIQUE AU QUOTIDIEN'}
        </p>
        <h1>
          {editing ? 'Modifier cette activité' : 'Ajouter un entraînement'}
        </h1>
        <p>
          {manual
            ? 'Un cours, une sortie, une pratique personnelle : note ce que tu as réellement fait et les voies que tu as travaillées.'
            : 'Corrige ton réalisé à partir du déroulement enregistré. Les durées restent limitées au temps chronométré de chaque bloc.'}
        </p>
      </div>
      <form
        className="activity-editor-layout"
        onSubmit={(event) => void save(event)}
      >
        <fieldset className="activity-editor-fields" disabled={busy}>
          <legend className="sr-only">Informations de l’activité</legend>
          {manual ? (
            <div className="activity-editor-field">
              <label htmlFor="activity-title">Entraînement</label>
              <input
                id="activity-title"
                type="text"
                maxLength={100}
                required
                value={form.values.title}
                placeholder="Ex. Cours de boxe"
                onChange={(event) => change('title', event.target.value)}
              />
            </div>
          ) : (
            <div className="activity-editor-origin">
              <h2>{getActivityTitle(form.base!)}</h2>
              <p>
                {form.base?.kind === 'guided'
                  ? form.base.session.snapshot.variant.title
                  : ''}
              </p>
              <p>
                Le contenu, le chronomètre et le barème d’origine sont
                conservés.
              </p>
            </div>
          )}
          <div className="activity-editor-field-row">
            <div className="activity-editor-field">
              <label htmlFor="activity-date">Date et heure</label>
              <input
                id="activity-date"
                type="datetime-local"
                min={toLocalDateTimeInput(MIN_ACTIVITY_DATE)}
                max={toLocalDateTimeInput(form.now)}
                step={60}
                required
                value={form.values.date}
                onChange={(event) => change('date', event.target.value)}
                aria-describedby="activity-date-help"
              />
              <p id="activity-date-help">
                Heure locale. Choisis un entraînement déjà effectué.
              </p>
            </div>
            {manual && (
              <div className="activity-editor-field">
                <label htmlFor="activity-minutes">Durée (minutes)</label>
                <input
                  id="activity-minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={180}
                  step={1}
                  required
                  value={form.values.minutes}
                  onChange={(event) => change('minutes', event.target.value)}
                  aria-describedby="activity-duration-help"
                />
                <p id="activity-duration-help">
                  De 1 à 180 minutes entières, pauses exclues.
                </p>
              </div>
            )}
          </div>
          {manual ? (
            <fieldset className="activity-path-choices">
              <legend>Voies travaillées</legend>
              <p>
                Choisis au moins une voie d’après ta pratique. L’XP est partagée
                entre les voies sélectionnées.
              </p>
              <div>
                {PATHS.map((path) => (
                  <label
                    className={
                      form.values.pathIds.includes(path.id)
                        ? 'activity-path-selected'
                        : ''
                    }
                    key={path.id}
                  >
                    <input
                      type="checkbox"
                      checked={form.values.pathIds.includes(path.id)}
                      onChange={(event) =>
                        change(
                          'pathIds',
                          event.target.checked
                            ? [...form.values.pathIds, path.id]
                            : form.values.pathIds.filter(
                                (id) => id !== path.id,
                              ),
                        )
                      }
                    />
                    <span>
                      <strong>{path.label}</strong>
                      <small>{pathDescriptions[path.id]}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className="activity-guided-blocks">
              <legend>Blocs réalisés</legend>
              <p>
                Indique zéro pour un bloc non effectué. Les récupérations ne
                rapportent pas d’XP.
              </p>
              {form.base?.kind === 'guided' &&
                getReportablePhases(form.base.session).map(
                  ({ phase, availableSeconds }, index) => (
                    <div className="activity-editor-block" key={phase.id}>
                      <div>
                        <span className="block-index">
                          BLOC {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3>{phase.title}</h3>
                      </div>
                      <div className="activity-editor-field">
                        <label htmlFor={`activity-seconds-${phase.id}`}>
                          Durée réalisée (secondes)
                        </label>
                        <input
                          id={`activity-seconds-${phase.id}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={availableSeconds}
                          step={1}
                          required
                          disabled={availableSeconds === 0 || busy}
                          value={form.values.seconds[phase.id] ?? '0'}
                          onChange={(event) =>
                            change('seconds', {
                              ...form.values.seconds,
                              [phase.id]: event.target.value,
                            })
                          }
                          aria-describedby={`activity-cap-${phase.id}`}
                        />
                        <p id={`activity-cap-${phase.id}`}>
                          {availableSeconds > 0
                            ? `Sur ${durationLabel(availableSeconds)} chronométrées.`
                            : 'Bloc non atteint : aucune durée ne peut être ajoutée.'}
                        </p>
                      </div>
                    </div>
                  ),
                )}
            </fieldset>
          )}
          <div className="activity-editor-field">
            <label htmlFor="activity-notes">
              Notes <span>facultatif</span>
            </label>
            <textarea
              id="activity-notes"
              rows={5}
              maxLength={2000}
              value={form.values.notes}
              onChange={(event) => change('notes', event.target.value)}
              aria-describedby="activity-notes-help"
            />
            <p id="activity-notes-help">
              Un ressenti, un repère à retrouver. {form.values.notes.length} / 2
              000 caractères.
            </p>
          </div>
        </fieldset>
        <aside className="activity-editor-summary">
          {editing && (
            <p className="activity-editor-replacement">
              Après confirmation, ce bilan remplacera la contribution actuelle
              de {form.base!.reward.totalXp} XP. Il ne crée pas une seconde
              activité.
            </p>
          )}
          {preview.activity ? (
            <RewardSplit activity={preview.activity} preview />
          ) : (
            <div className="reward-placeholder">
              <p className="eyebrow">TON RÉALISÉ, TON BILAN</p>
              <h2>Une trace de ta pratique.</h2>
              <p>
                {manual
                  ? 'Renseigne le nom, la date, la durée et les voies travaillées pour voir l’XP proposée.'
                  : 'Confirme au moins une seconde de mouvement, dans les limites du chronomètre.'}
              </p>
            </div>
          )}
          <div className="reward-policy">
            <h3>
              {manual
                ? 'Un partage entre les voies'
                : 'Une correction du réalisé'}
            </h3>
            <p>
              {manual
                ? '10 XP par minute de pratique. Le total est partagé à parts égales entre les voies choisies, avec un arrondi qui conserve le total.'
                : 'Le barème de cette séance est recalculé à partir des durées corrigées. Ton XP et les accès du parcours seront actualisés.'}
            </p>
            <p>
              {manual
                ? 'Un entraînement ajouté ici contribue à ta progression, sans valider une étape du parcours Viking.'
                : 'Rendre une séance partielle peut reverrouiller les étapes suivantes. Les autres activités déjà enregistrées restent conservées.'}
            </p>
          </div>
          {showValidation && preview.error && (
            <p className="report-validation" role="alert">
              {preview.error}
            </p>
          )}
          {error && (
            <p className="report-validation" role="alert">
              {error}
            </p>
          )}
          {conflict && !missing && (
            <div className="activity-editor-conflict">
              <button
                type="button"
                className="activity-editor-secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Recharger l’activité
              </button>
              <p>
                Cette action remplace ta saisie par la dernière version
                enregistrée.
              </p>
            </div>
          )}
          <button
            className="progress-primary"
            type="submit"
            disabled={busy || conflict || missing || !preview.activity}
          >
            {busy
              ? 'Enregistrement…'
              : editing
                ? 'Enregistrer les modifications'
                : 'Enregistrer l’entraînement'}
          </button>
          <p className="progress-help">
            Rien n’est enregistré avant ta confirmation. Quitter cette page
            abandonne la saisie en cours.
          </p>
        </aside>
      </form>
    </main>
  )
}

export default function ActivityEditor(props: {
  activity?: Activity
  history: ActivityHistoryController
}) {
  return <EditorForm key={props.activity?.id ?? 'new-activity'} {...props} />
}

function DeleteConfirmation({
  activity,
  history,
  onCancel,
}: {
  activity: Activity
  history: ActivityHistoryController
  onCancel: () => void
}) {
  const [target, setTarget] = useState(() => structuredClone(activity))
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const working = useRef(false)
  const mounted = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    mounted.current = true
    const element = dialog.current
    element?.showModal()
    return () => {
      mounted.current = false
      element?.close()
    }
  }, [])

  async function remove() {
    if (working.current || conflict || missing) return
    working.current = true
    setBusy(true)
    setError(null)
    try {
      await deleteActivity(target.id, getActivityRevision(target), Date.now())
      await history.refresh()
      if (mounted.current) {
        onCancel()
        window.location.hash = 'historique'
      }
    } catch (cause) {
      if (cause instanceof ActivityConflictError) {
        setConflict(true)
        setError(
          'Cette activité a changé ou a été supprimée ailleurs. Recharge-la pour vérifier son contenu avant de confirmer la suppression.',
        )
      } else {
        setError(
          'La suppression n’a pas pu être confirmée. Réessaie ; aucun autre entraînement ne sera supprimé.',
        )
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function reload() {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      const latest = await loadActivity(target.id)
      if (!latest) {
        setMissing(true)
        setError(
          'Cette activité est déjà supprimée. Ferme cette fenêtre pour retrouver ton carnet.',
        )
      } else {
        setTarget(structuredClone(latest))
        setConflict(false)
        setError(null)
        setNotice(
          'Dernière version chargée. Vérifie l’activité avant de confirmer sa suppression.',
        )
      }
      await history.refresh()
    } catch {
      setError(
        'La dernière version n’a pas pu être chargée. Réessaie avant de confirmer la suppression.',
      )
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="activity-delete-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        if (!working.current) onCancel()
      }}
    >
      <p className="eyebrow">RETIRER DU CARNET</p>
      <h2 id={titleId}>Supprimer cette activité ?</h2>
      <p className="activity-delete-target">
        <strong>{getActivityTitle(target)}</strong>
        <span>
          {new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(getActivityDate(target))}{' '}
          · {durationLabel(getActivityDuration(target))} ·{' '}
          {target.reward.totalXp} XP
        </span>
      </p>
      <p id={descriptionId}>
        Cette suppression est définitive. L’XP et les accès au parcours seront
        recalculés. Les activités suivantes déjà enregistrées seront conservées.
      </p>
      {error && (
        <p className="report-validation" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="activity-delete-notice" role="status">
          {notice}
        </p>
      )}
      {conflict && !missing && (
        <button
          type="button"
          className="activity-editor-secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Recharger l’activité
        </button>
      )}
      <div className="activity-delete-actions">
        <button type="button" autoFocus disabled={busy} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="activity-delete-confirm"
          disabled={busy || conflict || missing}
          onClick={() => void remove()}
        >
          {busy ? 'Un instant…' : 'Supprimer définitivement'}
        </button>
      </div>
    </dialog>
  )
}

export function ActivityDeleteButton({
  activity,
  history,
}: {
  activity: Activity
  history: ActivityHistoryController
}) {
  const [target, setTarget] = useState<Activity | null>(null)
  return (
    <>
      <button
        type="button"
        className="activity-delete-button"
        onClick={() => setTarget(structuredClone(activity))}
      >
        <Trash2 size={17} aria-hidden="true" />
        Supprimer cette activité
      </button>
      {target && (
        <DeleteConfirmation
          activity={target}
          history={history}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  )
}
