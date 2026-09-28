import { useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import {
  createActivity,
  getReportablePhases,
  REWARD_POLICY_V1,
  type Activity,
} from '../../domain/activity'
import type { SessionDraft } from '../../domain/session'
import { durationLabel } from '../preparation/durationLabel'
import { SessionNotice } from '../player/WorkoutPlayer'
import type { WorkoutSessionController } from '../player/useWorkoutSession'
import type { ActivityHistoryController } from './useActivityHistory'
import { ActivityDetails, RewardSplit } from './ProgressDetails'
import './progress.css'

function ReportForm({
  draft,
  session,
  onSaved,
}: {
  draft: SessionDraft
  session: WorkoutSessionController
  onSaved: (activity: Activity) => Promise<void>
}) {
  const blocks = getReportablePhases(draft)
  const [declared, setDeclared] = useState<Record<string, string>>({})
  const results = blocks.map(({ phase }) => ({
    phaseId: phase.id,
    performedSeconds: Number(declared[phase.id] ?? 0),
  }))
  const invalid = blocks.some(
    ({ phase, availableSeconds }) =>
      Object.hasOwn(declared, phase.id) &&
      (!Number.isInteger(Number(declared[phase.id])) ||
        Number(declared[phase.id]) < 1 ||
        Number(declared[phase.id]) > availableSeconds),
  )
  const hasWork = results.some((result) => result.performedSeconds > 0)
  const preview =
    !invalid && hasWork ? createActivity(draft, results, draft.updatedAt) : null
  const reached = blocks.filter((block) => block.availableSeconds > 0)
  const unreached = blocks.filter((block) => block.availableSeconds === 0)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!preview || session.busy || session.saving || session.error) return
    const activity = await session.finalize(results)
    if (activity) await onSaved(activity)
  }

  return (
    <>
      <div className="progress-heading">
        <p className="eyebrow">
          {draft.snapshot.universe} / {draft.snapshot.variant.title}
        </p>
        <h1>
          Chaque effort compte<span>.</span>
        </h1>
        <p>
          Confirme ce que tu as réellement fait. Le minuteur propose des durées,
          il ne valide aucun mouvement à ta place.
        </p>
      </div>
      <SessionNotice session={session} />
      <form onSubmit={(event) => void save(event)} className="report-layout">
        <div className="report-blocks">
          <div className="report-section-title">
            <h2>Ton réalisé</h2>
            <span>
              {durationLabel(Math.floor(draft.elapsedMs / 1_000))} chronométrées
            </span>
          </div>
          <p className="progress-help">
            Coche les blocs effectués, puis réduis leur durée si nécessaire. Les
            récupérations sont exclues du bilan de mouvement et de l’XP.
          </p>
          {reached.length > 0 && (
            <button
              className="report-select-all"
              type="button"
              disabled={session.busy}
              onClick={() =>
                setDeclared(
                  Object.fromEntries(
                    reached.map(({ phase, availableSeconds }) => [
                      phase.id,
                      String(availableSeconds),
                    ]),
                  ),
                )
              }
            >
              <Check size={16} aria-hidden="true" /> Confirmer tous les blocs
              chronométrés
            </button>
          )}
          {reached.length === 0 && (
            <p className="report-empty">
              Aucune seconde de mouvement n’a été chronométrée. Tu peux revenir
              au lecteur pour supprimer ce brouillon.
            </p>
          )}
          <fieldset disabled={session.busy} className="report-fields">
            <legend className="sr-only">Blocs réalisés</legend>
            {reached.map(({ phase, availableSeconds }, index) => {
              const checked = Object.hasOwn(declared, phase.id)
              const id = `declared-${phase.id}`
              return (
                <div
                  className={`report-block ${checked ? 'report-block-checked' : ''}`}
                  key={phase.id}
                >
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setDeclared((current) => {
                          const next = { ...current }
                          if (event.target.checked)
                            next[phase.id] = String(availableSeconds)
                          else delete next[phase.id]
                          return next
                        })
                      }
                    />
                    <span>
                      <span className="block-index">
                        BLOC {String(index + 1).padStart(2, '0')}
                      </span>
                      <strong>{phase.title}</strong>
                      <small>
                        {phase.movementId
                          ? draft.snapshot.movements[phase.movementId]?.title
                          : phase.cue}
                      </small>
                    </span>
                  </label>
                  <div className="report-duration">
                    <label htmlFor={id}>Durée réalisée (secondes)</label>
                    <div>
                      <input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={availableSeconds}
                        step={1}
                        required={checked}
                        disabled={!checked || session.busy}
                        value={declared[phase.id] ?? ''}
                        placeholder="0"
                        onChange={(event) =>
                          setDeclared((current) => ({
                            ...current,
                            [phase.id]: event.target.value,
                          }))
                        }
                      />
                      <span>
                        sur {durationLabel(availableSeconds)} chronométrées
                      </span>
                    </div>
                    <p>{durationLabel(phase.durationSeconds)} prévues</p>
                  </div>
                </div>
              )
            })}
          </fieldset>
          {unreached.length > 0 && (
            <details className="unreached-blocks">
              <summary>
                {unreached.length} bloc{unreached.length > 1 ? 's' : ''} non
                atteint{unreached.length > 1 ? 's' : ''}
              </summary>
              <ul>
                {unreached.map(({ phase }) => (
                  <li key={phase.id}>
                    {phase.title} · {durationLabel(phase.durationSeconds)}{' '}
                    prévues
                  </li>
                ))}
              </ul>
              <p>
                Ces blocs ne peuvent pas produire d’XP. Aucun temps de pause ou
                d’interruption ne s’ajoute au réalisé.
              </p>
            </details>
          )}
          {invalid && (
            <p className="report-validation" role="alert">
              Pour chaque bloc coché, indique une durée entière d’au moins une
              seconde, sans dépasser le temps chronométré.
            </p>
          )}
        </div>
        <aside className="report-confirmation">
          {preview ? (
            <RewardSplit activity={preview} preview />
          ) : (
            <div className="reward-placeholder">
              <p className="eyebrow">LE BILAN T’APPARTIENT</p>
              <h2>À toi de confirmer.</h2>
              <p>
                Choisis au moins un bloc et sa durée pour voir l’XP proposée.
                Rien n’est enregistré avant ta confirmation.
              </p>
            </div>
          )}
          <div className="reward-policy">
            <h3>Une règle simple</h3>
            <p>
              {REWARD_POLICY_V1.xpPerMinute} XP par minute de mouvement
              confirmé, échauffement et retour au calme inclus. Le total est
              arrondi à l’entier inférieur, puis partagé entre les voies.
            </p>
            <p>
              Une séance est complète si le minuteur est terminé et si tous les
              blocs de mouvement sont confirmés en entier. Sinon, elle reste
              partielle.
            </p>
          </div>
          {session.finalizeError && (
            <p role="alert" className="report-validation">
              {session.finalizeError}
            </p>
          )}
          <button
            className="progress-primary"
            type="submit"
            disabled={
              !preview || session.busy || session.saving || !!session.error
            }
          >
            {session.busy
              ? 'Enregistrement…'
              : session.saving
                ? 'Sauvegarde du minuteur…'
                : 'Confirmer et enregistrer'}
          </button>
          <p className="progress-help">
            Ce bilan devient une activité dans ton carnet. Les modifications
            d’activités seront disponibles dans une prochaine version.
          </p>
        </aside>
      </form>
    </>
  )
}

export default function SessionReport({
  sessionId,
  session,
  history,
}: {
  sessionId: string
  session: WorkoutSessionController
  history: ActivityHistoryController
}) {
  const saved = history.activities.find((activity) => activity.id === sessionId)
  const draft = session.realDraft?.id === sessionId ? session.realDraft : null
  async function onSaved(activity: Activity) {
    await history.refresh()
    window.location.hash = `historique/${encodeURIComponent(activity.id)}`
  }
  return (
    <main id="main-content" tabIndex={-1} className="progress-screen">
      <a className="back-button" href={saved ? '#historique' : '#session'}>
        <ArrowLeft size={17} aria-hidden="true" />
        {saved ? 'Mon carnet' : 'Revenir au lecteur'}
      </a>
      {session.loading || (history.loading && !draft && !saved) ? (
        <p role="status">Chargement du bilan…</p>
      ) : history.error ? (
        <div className="session-notice">
          <p role="alert">{history.error}</p>
          <button onClick={() => void history.refresh()}>Réessayer</button>
        </div>
      ) : saved ? (
        <ActivityDetails activity={saved} />
      ) : draft &&
        draft.mode === 'real' &&
        ['completed', 'stopped'].includes(draft.status) ? (
        <ReportForm
          key={draft.id}
          draft={draft}
          session={session}
          onSaved={onSaved}
        />
      ) : (
        <div className="progress-empty">
          <h1>Ton bilan t’attend à la fin.</h1>
          <p>
            Termine ou arrête une séance réelle pour confirmer ton réalisé. Les
            aperçus accélérés n’ajoutent aucune activité.
          </p>
          <a href="#historique">Consulter mon carnet</a>
        </div>
      )}
    </main>
  )
}
