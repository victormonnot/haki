import { ChevronDown, CircleHelp, Footprints } from 'lucide-react'
import { MOVEMENTS } from '../../content/workouts'
import { getDurationSeconds, type WorkoutVariant } from '../../domain/workouts'
import { durationLabel } from './durationLabel'

const KINDS = {
  warmup: 'Échauffement',
  work: 'Pratique',
  rest: 'Récupération',
  cooldown: 'Retour au calme',
}

export function MovementGuide({ variant }: { variant: WorkoutVariant }) {
  const ids = [
    ...new Set(
      variant.phases.flatMap((phase) =>
        phase.movementId ? [phase.movementId] : [],
      ),
    ),
  ]
  return (
    <section className="movement-guide" aria-labelledby="movement-title">
      <div className="subsection-heading">
        <Footprints size={19} aria-hidden="true" />
        <h3 id="movement-title">Les mouvements à connaître</h3>
      </div>
      <p className="section-description">
        Prends le temps de lire les consignes avant de te lancer.
      </p>
      <div className="movement-list">
        {ids.map((id) => {
          const movement = MOVEMENTS[id]
          return (
            <details className="movement-card" key={id}>
              <summary>
                <span>{movement.title}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="movement-body">
                <p>{movement.description}</p>
                <ol>
                  {movement.instructions.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="movement-tip">
                  <CircleHelp size={15} aria-hidden="true" />
                  {movement.tip}
                </p>
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

export function PhaseSummary({ variant }: { variant: WorkoutVariant }) {
  const summaries = (Object.keys(KINDS) as Array<keyof typeof KINDS>)
    .map((kind) => ({
      kind,
      seconds: variant.phases
        .filter((phase) => phase.kind === kind)
        .reduce((total, phase) => total + phase.durationSeconds, 0),
    }))
    .filter(({ seconds }) => seconds > 0)
  return (
    <div className="phase-summary" aria-label="Répartition de la durée">
      <div className="phase-summary-bar" aria-hidden="true">
        {summaries.map(({ kind, seconds }) => (
          <span
            className={`phase-color-${kind}`}
            key={kind}
            style={{ flex: seconds }}
          />
        ))}
      </div>
      <div className="phase-summary-labels">
        {summaries.map(({ kind, seconds }) => (
          <span key={kind}>
            <i className={`phase-color-${kind}`} />
            <span>
              {KINDS[kind]}
              <strong>{durationLabel(seconds)}</strong>
            </span>
          </span>
        ))}
      </div>
      <p>
        Les {durationLabel(getDurationSeconds(variant))} comprennent
        l’échauffement, les récupérations et le retour au calme.
      </p>
    </div>
  )
}

export function WorkoutTimeline({ variant }: { variant: WorkoutVariant }) {
  return (
    <section className="workout-timeline" aria-labelledby="timeline-title">
      <div className="subsection-heading">
        <h2 id="timeline-title">Le fil de ta séance</h2>
        <span>{variant.phases.length} étapes</span>
      </div>
      <ol>
        {variant.phases.map((phase, index) => {
          const start = variant.phases
            .slice(0, index)
            .reduce((total, previous) => total + previous.durationSeconds, 0)
          return (
            <li key={phase.id} className={`timeline-${phase.kind}`}>
              <span className="timeline-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <span className="timeline-kind">
                  {KINDS[phase.kind]} · à {durationLabel(start)}
                </span>
                <h3>{phase.title}</h3>
                <p>{phase.cue}</p>
              </div>
              <span className="timeline-duration">
                {durationLabel(phase.durationSeconds)}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
