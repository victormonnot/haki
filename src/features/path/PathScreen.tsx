import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  GitBranch,
  LockKeyhole,
  Mountain,
} from 'lucide-react'
import { getWorkout } from '../../content/workouts'
import { VIKING_PATH } from '../../content/vikingPath'
import {
  getPathNodeProgress,
  type TrainingPathProgress,
} from '../../domain/trainingPath'
import { getDurationSeconds, type Workout } from '../../domain/workouts'
import { durationLabel } from '../preparation/durationLabel'
import type { ActivityHistoryController } from '../progress/useActivityHistory'
import './path.css'

export function WorkoutAccessNote({
  workout,
  progress,
  history,
}: {
  workout: Workout
  progress: TrainingPathProgress
  history: ActivityHistoryController
}) {
  const node = getPathNodeProgress(progress, workout.id)
  return (
    <aside className="path-access" aria-label="Accès à la séance">
      {history.loading ? (
        <p role="status">Vérification du parcours…</p>
      ) : history.error ? (
        <>
          <p role="alert">{history.error}</p>
          <button
            className="session-text-button"
            onClick={() => void history.refresh()}
          >
            Réessayer
          </button>
        </>
      ) : node?.accessible ? (
        <p>
          <CheckCircle2 size={17} aria-hidden="true" />
          {node.completed
            ? 'Étape validée. Tu peux refaire cette séance à ton rythme.'
            : 'Étape accessible. Choisis la variante qui te convient aujourd’hui.'}
        </p>
      ) : (
        <div>
          <p>
            <LockKeyhole size={17} aria-hidden="true" />
            Séance verrouillée
          </p>
          <p>
            Confirme d’abord en entier :{' '}
            {node?.missingPrerequisiteIds
              .map((id) => getWorkout(id)?.title)
              .join(', ')}
            .
          </p>
          <p>Tu peux consulter son contenu dès maintenant.</p>
        </div>
      )}
      <a href="#parcours">
        Voir le parcours Viking <ArrowRight size={15} aria-hidden="true" />
      </a>
    </aside>
  )
}

export default function PathScreen({
  progress,
  history,
}: {
  progress: TrainingPathProgress
  history: ActivityHistoryController
}) {
  const ready = !history.loading && !history.error
  function card(id: string, step: string) {
    const node = VIKING_PATH.nodes.find((item) => item.id === id)!
    const state = getPathNodeProgress(progress, id)!
    const workout = getWorkout(id)!
    const available = ready && state.accessible
    const completed = ready && state.completed
    const durations = workout.variants.map(getDurationSeconds)
    const min = Math.min(...durations)
    const max = Math.max(...durations)
    const prerequisites = node.prerequisiteIds.map(
      (prerequisite) => getWorkout(prerequisite)!.title,
    )
    return (
      <article
        className={`path-node ${completed ? 'path-node-completed' : available ? 'path-node-available' : 'path-node-locked'}`}
        aria-labelledby={`node-${id}`}
        key={id}
      >
        <div className="path-node-top">
          <span className="eyebrow">{step}</span>
          <span className="path-badge">
            {completed ? (
              <Check size={14} aria-hidden="true" />
            ) : available ? (
              <ArrowRight size={14} aria-hidden="true" />
            ) : (
              <LockKeyhole size={14} aria-hidden="true" />
            )}
            {!ready
              ? 'À vérifier'
              : completed
                ? 'Validée'
                : available
                  ? 'Accessible'
                  : 'Verrouillée'}
          </span>
        </div>
        <h3 id={`node-${id}`}>{workout.title}</h3>
        <p className="path-goal">{node.goal}</p>
        <p className="path-duration">
          <Clock3 size={14} aria-hidden="true" />
          {min === max
            ? durationLabel(min)
            : `${durationLabel(min)} à ${durationLabel(max)}`}
          <span>·</span>
          {workout.variants.length} variantes
        </p>
        <div className="path-prerequisites">
          <strong>{prerequisites.length ? 'Après' : 'Point de départ'}</strong>
          <p>
            {prerequisites.length
              ? prerequisites.join(' + ')
              : 'Aucun prérequis. Commence ici.'}
          </p>
          {ready && !state.accessible && (
            <p className="path-missing">
              À valider :{' '}
              {state.missingPrerequisiteIds
                .map((missing) => getWorkout(missing)!.title)
                .join(', ')}
              .
            </p>
          )}
        </div>
        <a
          className="path-node-link"
          href={`#preparation/${id}`}
          aria-label={`${available ? 'Préparer' : 'Découvrir'} ${workout.title}`}
        >
          {available
            ? completed
              ? 'Refaire cette séance'
              : 'Préparer cette séance'
            : 'Découvrir la séance'}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
        <details className="path-variants">
          <summary>Variantes qui valident cette étape</summary>
          <ul>
            {workout.variants.map((variant) => (
              <li key={variant.id}>{variant.title}</li>
            ))}
          </ul>
          <p>Une seule suffit, après une séance complète confirmée.</p>
        </details>
      </article>
    )
  }
  return (
    <main id="main-content" className="path-screen" tabIndex={-1}>
      <section className="path-hero" aria-labelledby="path-title">
        <div>
          <p className="eyebrow">
            <Mountain size={17} aria-hidden="true" /> VIKING · CHAPITRE 01
          </p>
          <h1 id="path-title">
            L’appel <span>du Nord.</span>
          </h1>
          <p>
            Construis tes appuis, trouve ton souffle et apprends à répondre à un
            signal. Deux branches à explorer dans l’ordre qui te convient, puis
            un rendez-vous commun.
          </p>
        </div>
        <aside className="path-progress">
          <GitBranch size={28} aria-hidden="true" />
          <p>TON PARCOURS</p>
          <strong>
            {ready ? progress.completedCount : '—'}
            <span> / {progress.totalCount}</span>
          </strong>
          <p>étapes validées</p>
          <div
            className="path-progress-track"
            role="progressbar"
            aria-label="Étapes validées"
            aria-valuenow={ready ? progress.completedCount : undefined}
            aria-valuemin={0}
            aria-valuemax={progress.totalCount}
          >
            <span
              style={{
                width: `${ready ? (progress.completedCount / progress.totalCount) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {ready && progress.completedCount === progress.totalCount
              ? 'Chapitre terminé. Les séances restent à ta disposition.'
              : 'Avance à ton rythme. Aucun délai imposé.'}
          </small>
        </aside>
      </section>
      {history.loading && (
        <p role="status" className="form-message">
          Chargement de ta progression…
        </p>
      )}
      {history.error && (
        <div className="path-error">
          <p role="alert">{history.error}</p>
          <button
            className="session-text-button"
            onClick={() => void history.refresh()}
          >
            Réessayer
          </button>
        </div>
      )}
      <section
        className="path-tree"
        aria-label="Les six étapes du parcours Viking"
      >
        <div className="path-common">
          {card('leveil-du-nord', 'LE COMMENCEMENT')}
        </div>
        <div className="path-fork-label">
          <GitBranch size={18} aria-hidden="true" />
          <p>
            Deux branches, un même chemin.
            <span>Explore l’une, l’autre, ou alterne entre les deux.</span>
          </p>
        </div>
        <div className="path-branches">
          <section className="path-branch" aria-labelledby="branch-ground">
            <div className="path-branch-heading">
              <span>01</span>
              <div>
                <p className="eyebrow">STABILITÉ & TECHNIQUE</p>
                <h2 id="branch-ground">Tenir son terrain.</h2>
              </div>
            </div>
            {card('le-socle-de-pierre', 'LES FONDATIONS')}
            {card('la-garde-du-rempart', 'LES REPÈRES')}
          </section>
          <section className="path-branch" aria-labelledby="branch-breath">
            <div className="path-branch-heading">
              <span>02</span>
              <div>
                <p className="eyebrow">SOUFFLE & ATTENTION</p>
                <h2 id="branch-breath">Trouver son rythme.</h2>
              </div>
            </div>
            {card('le-souffle-du-fjord', 'LA RÉGULARITÉ')}
            {card('les-signaux-du-guetteur', 'LA RÉACTION')}
          </section>
        </div>
        <div className="path-join-label">LES DEUX BRANCHES SE REJOIGNENT</div>
        <div className="path-common">
          {card('la-traversee-du-nord', 'LA SYNTHÈSE')}
        </div>
      </section>
      <section className="path-rules" aria-labelledby="path-rules-title">
        <CheckCircle2 size={23} aria-hidden="true" />
        <div>
          <h2 id="path-rules-title">Ta pratique ouvre la suite.</h2>
          <p>
            Une variante acceptée, un minuteur terminé et tous les blocs de
            mouvement confirmés en entier : l’étape est validée. Un bilan
            partiel garde son XP, mais ne débloque pas la suite. L’aperçu
            accéléré ne compte pas.
          </p>
          <p>
            Les niveaux reflètent le travail déclaré, pas une maîtrise
            technique. Tu peux refaire les séances accessibles sans obligation
            quotidienne.
          </p>
          <p className="path-content-note">
            Programme de démonstration, non validé par un entraîneur. Garde une
            intensité confortable et arrête en cas de douleur.
          </p>
        </div>
      </section>
    </main>
  )
}
