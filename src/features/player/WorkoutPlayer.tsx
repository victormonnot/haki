import { useEffect, useRef, useState } from 'react'
import { FIRST_WORKOUT } from '../../content/workouts'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Headphones,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  getSessionDuration,
  getSessionPosition,
  type SessionMode,
} from '../../domain/session'
import type {
  TrainingSetup,
  Workout,
  WorkoutVariant,
} from '../../domain/workouts'
import { durationLabel } from '../preparation/durationLabel'
import { useWakeLock } from '../sound-check/useWakeLock'
import type { WorkoutSessionController } from './useWorkoutSession'
import './player.css'

function clockLabel(ms: number) {
  const seconds = Math.ceil(ms / 1_000)
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function Confirmation({
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  children: React.ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className="session-dialog"
      aria-labelledby="confirmation-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id="confirmation-title">{title}</h2>
      <p>{children}</p>
      <div className="session-dialog-actions">
        <button autoFocus onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button onClick={onConfirm} disabled={busy}>
          {busy ? 'Un instant…' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

export function SessionNotice({
  session,
}: {
  session: WorkoutSessionController
}) {
  const [confirm, setConfirm] = useState(false)
  if (!session.error) return null
  return (
    <div className="session-notice session-error">
      <p role="alert">{session.error}</p>
      {session.problem === 'corrupt' ? (
        <button onClick={() => setConfirm(true)}>
          Supprimer le brouillon illisible
        </button>
      ) : (
        <button
          disabled={session.loading || session.saving}
          onClick={() =>
            session.problem === 'conflict'
              ? void session.reload()
              : session.retry()
          }
        >
          {session.problem === 'conflict'
            ? 'Charger le dernier point'
            : 'Réessayer la sauvegarde'}
        </button>
      )}
      {confirm && (
        <Confirmation
          title="Supprimer ce brouillon ?"
          confirmLabel="Supprimer le brouillon"
          busy={session.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            void session.discard().then((done) => {
              if (done) setConfirm(false)
            })
          }}
        >
          Le point de reprise illisible sera supprimé de cet appareil. Les
          profils sont conservés.
        </Confirmation>
      )}
    </div>
  )
}

export function SessionPreparationActions({
  session,
  workout,
  accessible,
  variant,
  setup,
}: {
  session: WorkoutSessionController
  workout: Workout
  accessible: boolean
  variant: WorkoutVariant
  setup: TrainingSetup
}) {
  async function open(mode: SessionMode) {
    if (await session.open(workout.id, variant.id, setup, mode))
      window.location.hash = 'session'
  }
  return (
    <div className="session-launch">
      <div className="guide-callout">
        <Headphones size={22} aria-hidden="true" />
        <h3>Ton guide prend le relais.</h3>
        <p>
          Installe-toi, garde l’écran visible, puis démarre à ton rythme. Tu
          peux faire une pause à tout moment.
        </p>
        <button
          className="prepare-button"
          disabled={
            !accessible ||
            session.loading ||
            session.busy ||
            !!session.realDraft ||
            !!session.error
          }
          onClick={() => void open('real')}
        >
          Ouvrir le lecteur <ArrowRight size={17} aria-hidden="true" />
        </button>
        {session.realDraft && (
          <p>
            Un brouillon est déjà conservé. Retrouve-le pour le reprendre ou le
            supprimer avant une nouvelle séance.
          </p>
        )}
        <button
          className="session-text-button"
          disabled={!accessible || session.loading || session.busy}
          onClick={() => void open('demo')}
        >
          Essayer en accéléré
        </button>
        <p className="session-small">
          Aperçu : 5 secondes par étape, sans exercice à faire. Il disparaît au
          rechargement.
        </p>
        {session.launchError && <p role="alert">{session.launchError}</p>}
        <a className="session-text-button" href="#guide">
          Tester le guide audio
        </a>
      </div>
    </div>
  )
}

export function SessionRecovery({
  session,
}: {
  session: WorkoutSessionController
}) {
  if (!session.realDraft) return null
  const terminal = ['completed', 'stopped'].includes(session.realDraft.status)
  return (
    <aside className="session-recovery" aria-label="Séance conservée">
      <div>
        <strong>
          {terminal ? 'Ton réalisé reste à confirmer.' : 'Une séance t’attend.'}
        </strong>
        <p>
          {session.realDraft.snapshot.workoutTitle} ·{' '}
          {session.realDraft.snapshot.variant.title}
        </p>
      </div>
      <a href="#session" onClick={session.showReal}>
        Retrouver ma séance <ArrowRight size={17} aria-hidden="true" />
      </a>
    </aside>
  )
}

export default function WorkoutPlayer({
  session,
}: {
  session: WorkoutSessionController
}) {
  const { draft } = session
  const [confirmation, setConfirmation] = useState<'stop' | 'discard' | null>(
    null,
  )
  const wake = useWakeLock(draft?.status === 'running')
  if (!draft)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="workout-screen session-empty"
      >
        <h1>Ton prochain départ.</h1>
        <p>
          {session.loading
            ? 'Chargement de la séance…'
            : 'Prépare une séance pour ouvrir le lecteur.'}
        </p>
        <SessionNotice session={session} />
        <a href="#preparation">
          Préparer une séance <ArrowRight size={17} aria-hidden="true" />
        </a>
      </main>
    )
  const position = getSessionPosition(draft)
  const preparationHref =
    draft.snapshot.workoutId === FIRST_WORKOUT.id
      ? '#preparation'
      : `#preparation/${encodeURIComponent(draft.snapshot.workoutId)}`
  const phase = position.phase
  const next = draft.snapshot.variant.phases[position.phaseIndex + 1]
  const movement = phase?.movementId
    ? draft.snapshot.movements[phase.movementId]
    : undefined
  const terminal = draft.status === 'completed' || draft.status === 'stopped'
  const demo = draft.mode === 'demo'
  const kind = {
    warmup: 'Échauffement',
    work: 'Mouvement',
    rest: 'Récupération',
    cooldown: 'Retour au calme',
  }
  return (
    <main id="main-content" tabIndex={-1} className="workout-screen">
      <a href={preparationHref} className="back-button">
        <ArrowLeft size={17} aria-hidden="true" /> Ma préparation
      </a>
      <div className="workout-heading">
        <div>
          <p className="eyebrow">
            {draft.snapshot.universe} / {draft.snapshot.variant.title}
          </p>
          <h1>
            {draft.snapshot.workoutTitle}
            <span>.</span>
          </h1>
        </div>
        <span className="workout-duration">
          {demo
            ? 'APERÇU ACCÉLÉRÉ'
            : durationLabel(getSessionDuration(draft) / 1000)}
        </span>
      </div>
      {demo && (
        <p className="demo-banner">
          Mode aperçu · 5 secondes par étape · Aucun exercice à faire. Cet essai
          n’est pas enregistré et ne remplace pas ta séance.
        </p>
      )}
      <SessionNotice session={session} />
      <div className="workout-layout">
        <section className="workout-card" aria-label="Lecteur de séance">
          <div className="workout-card-top">
            <span>
              {terminal
                ? 'POINT D’ARRÊT'
                : `ÉTAPE ${position.phaseIndex + 1} / ${draft.snapshot.variant.phases.length}`}
            </span>
            <span>
              {draft.status === 'running'
                ? 'EN COURS'
                : terminal
                  ? 'TERMINÉ'
                  : 'EN PAUSE'}
            </span>
          </div>
          <div
            aria-live="polite"
            aria-atomic="true"
            className="workout-phase-heading"
          >
            <p>
              {terminal
                ? 'Prends le temps de souffler.'
                : phase && kind[phase.kind]}
            </p>
            <h2>
              {draft.status === 'completed'
                ? 'Minuteur terminé.'
                : draft.status === 'stopped'
                  ? 'Séance arrêtée.'
                  : phase?.title}
            </h2>
          </div>
          <div
            className="workout-clock"
            role="timer"
            aria-label={
              terminal ? 'Temps chronométré' : 'Temps restant dans l’étape'
            }
          >
            {clockLabel(terminal ? draft.elapsedMs : position.remainingMs)}
          </div>
          <p className="workout-clock-caption">
            {terminal ? 'temps chronométré' : 'restant dans cette étape'}
          </p>
          <p className="workout-cue">
            {terminal
              ? demo
                ? 'L’aperçu est terminé. Reviens à la préparation quand tu souhaites ouvrir une vraie séance.'
                : 'Le minuteur est arrêté. Confirme maintenant les mouvements réellement effectués pour enregistrer ton bilan dans le carnet.'
              : phase?.cue}
          </p>
          {!terminal && (
            <>
              {session.interrupted && (
                <p className="workout-interruption" role="status">
                  Séance en pause. Le temps d’interruption n’a pas été compté.
                  Reprends quand tu es prêt.
                </p>
              )}
              <button
                className="primary-button workout-primary"
                disabled={session.busy || (!demo && !!session.error)}
                onClick={() =>
                  draft.status === 'running' ? session.pause() : session.start()
                }
              >
                {draft.status === 'running' ? (
                  <Pause size={20} aria-hidden="true" />
                ) : (
                  <Play size={20} aria-hidden="true" />
                )}
                {draft.status === 'running'
                  ? 'Mettre en pause'
                  : draft.elapsedMs > 0
                    ? 'Reprendre la séance'
                    : demo
                      ? 'Démarrer l’aperçu'
                      : 'Démarrer la séance'}
              </button>
              <div className="workout-secondary">
                <button
                  onClick={session.toggleVoice}
                  aria-pressed={
                    session.voiceEnabled && session.speech.supported
                  }
                  disabled={!session.speech.supported}
                >
                  {session.voiceEnabled ? (
                    <Volume2 size={20} aria-hidden="true" />
                  ) : (
                    <VolumeX size={20} aria-hidden="true" />
                  )}
                  {!session.speech.supported
                    ? 'Voix indisponible'
                    : session.voiceEnabled
                      ? 'Voix activée'
                      : 'Voix désactivée'}
                </button>
                <button
                  onClick={() => {
                    session.pause()
                    setConfirmation('stop')
                  }}
                >
                  <Square size={16} aria-hidden="true" /> Arrêter
                </button>
              </div>
            </>
          )}
          {terminal &&
            (demo ? (
              <a className="primary-button" href={preparationHref}>
                Retour à ma préparation
              </a>
            ) : (
              <a
                className="primary-button"
                href={`#bilan/${encodeURIComponent(draft.id)}`}
              >
                Confirmer mon réalisé
              </a>
            ))}
          {!demo && draft.status !== 'running' && (
            <button
              className="workout-discard"
              disabled={session.busy || session.saving || !!session.error}
              onClick={() => setConfirmation('discard')}
            >
              Supprimer ce brouillon
            </button>
          )}
          {!terminal && (
            <div className="workout-audio-state">
              {!session.speech.supported ? (
                'Voix indisponible : suis les indications à l’écran.'
              ) : session.speech.error ? (
                <span role="alert">{session.speech.error}</span>
              ) : session.voiceEnabled ? (
                session.speech.voiceLabel
              ) : (
                'Guidage visuel uniquement.'
              )}
            </div>
          )}
        </section>
        <aside className="workout-detail" aria-label="Déroulement de la séance">
          <div className="workout-progress-heading">
            <h2>
              {terminal
                ? demo
                  ? 'Fin de l’aperçu'
                  : 'Le point conservé'
                : 'Ton avancée'}
            </h2>
            <span>{Math.floor(position.progress * 100)} %</span>
          </div>
          <progress
            max={1}
            value={position.progress}
            aria-label="Progression du minuteur"
          />
          <p className="workout-total">
            {clockLabel(draft.elapsedMs)} écoulées{' '}
            <span>/ {clockLabel(getSessionDuration(draft))}</span>
          </p>
          {!terminal && next && (
            <div className="workout-next">
              <p className="eyebrow">ENSUITE</p>
              <h3>{next.title}</h3>
              <p>
                {demo ? '5 s' : durationLabel(next.durationSeconds)} ·{' '}
                {kind[next.kind]}
              </p>
            </div>
          )}
          {!terminal && movement && (
            <div className="workout-movement">
              <p className="eyebrow">LES REPÈRES DU MOUVEMENT</p>
              <h3>{movement.title}</h3>
              <ul>
                {movement.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
              <p>{movement.tip}</p>
            </div>
          )}
          <div className="session-storage">
            <Check size={17} aria-hidden="true" />
            <p>
              {demo
                ? session.realDraft
                  ? 'Aperçu temporaire. Ton brouillon réel reste conservé.'
                  : 'Aperçu temporaire, sans enregistrement.'
                : session.error
                  ? 'Dernier point non enregistré.'
                  : session.saving
                    ? 'Sauvegarde en cours…'
                    : 'Point de reprise enregistré sur cet appareil.'}
            </p>
          </div>
          {!terminal && (
            <p className="session-small">
              {wake === 'active'
                ? 'L’écran reste allumé pendant la séance.'
                : 'Garde HAKI visible et l’écran déverrouillé.'}{' '}
              Quitter l’écran met la séance en pause.
            </p>
          )}
          <p className="session-small">
            Programme de démonstration, non validé par un entraîneur. Garde une
            intensité confortable et arrête en cas de douleur.
          </p>
        </aside>
      </div>
      {confirmation && (
        <Confirmation
          title={
            confirmation === 'stop'
              ? 'Arrêter cette séance ?'
              : 'Supprimer ce brouillon ?'
          }
          confirmLabel={
            confirmation === 'stop'
              ? demo
                ? 'Arrêter l’aperçu'
                : 'Arrêter et conserver'
              : 'Supprimer et préparer'
          }
          busy={session.busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmation === 'stop') {
              session.stop()
              setConfirmation(null)
            } else
              void session.discard().then((done) => {
                if (done) {
                  setConfirmation(null)
                  window.location.hash = preparationHref
                }
              })
          }}
        >
          {confirmation === 'stop'
            ? demo
              ? 'Cet aperçu sera arrêté, sans enregistrement. Tu pourras en ouvrir un nouveau depuis ta préparation.'
              : 'Le minuteur est en pause. Ton point d’arrêt sera conservé sur cet appareil ; cette séance ne pourra plus être reprise.'
            : 'Ce brouillon sera supprimé sans activité ni XP. Les activités déjà enregistrées dans ton carnet seront conservées.'}
        </Confirmation>
      )}
    </main>
  )
}
