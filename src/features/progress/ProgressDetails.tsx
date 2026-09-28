import { ArrowRight, CheckCircle2 } from 'lucide-react'
import {
  getProgress,
  PATHS,
  REWARD_POLICY_V1,
  type Activity,
} from '../../domain/activity'
import { ENVIRONMENTS } from '../../domain/workouts'
import { durationLabel } from '../preparation/durationLabel'
import { displayDate } from './displayDate'

export function RewardSplit({
  activity,
  preview = false,
}: {
  activity: Activity
  preview?: boolean
}) {
  return (
    <section
      className="reward-card"
      aria-label={preview ? 'XP à confirmer' : 'XP enregistrée'}
    >
      <p className="eyebrow">
        {preview ? 'SI TU CONFIRMES CE BILAN' : 'CONTRIBUTION ENREGISTRÉE'}
      </p>
      <p className="reward-total">
        +{activity.reward.totalXp} <span>XP</span>
      </p>
      <p className="reward-caption">
        {activity.result.status === 'completed'
          ? 'Séance complète'
          : 'Séance partielle'}{' '}
        · {durationLabel(activity.result.performedSeconds)} de mouvement
        confirmé
      </p>
      <dl className="reward-paths">
        {PATHS.map((path) => (
          <div key={path.id}>
            <dt>{path.label}</dt>
            <dd>+{activity.reward.pathXp[path.id]} XP</dd>
          </div>
        ))}
      </dl>
      <p className="reward-note">
        Les voies se partagent ces {activity.reward.totalXp} XP. Elles ne
        s’ajoutent pas une seconde fois au total général.
      </p>
    </section>
  )
}

export function ActivityDetails({ activity }: { activity: Activity }) {
  const session = activity.session
  return (
    <article className="activity-detail">
      <div className="recorded-note">
        <CheckCircle2 size={19} aria-hidden="true" />
        <p>
          Activité enregistrée sur cet appareil. Ce bilan ne peut pas attribuer
          une seconde fois de l’XP.
        </p>
      </div>
      <div className="progress-heading">
        <p className="eyebrow">
          {session.snapshot.universe} / {session.snapshot.variant.title}
        </p>
        <h1>
          {session.snapshot.workoutTitle}
          <span>.</span>
        </h1>
        <p>Séance du {displayDate(session.createdAt)}</p>
      </div>
      <div className="report-layout">
        <div>
          <h2>Ce que tu as confirmé</h2>
          <dl className="activity-facts">
            <div>
              <dt>Temps chronométré</dt>
              <dd>{durationLabel(Math.floor(session.elapsedMs / 1_000))}</dd>
            </div>
            <div>
              <dt>Mouvement déclaré</dt>
              <dd>{durationLabel(activity.result.performedSeconds)}</dd>
            </div>
            <div>
              <dt>Lieu</dt>
              <dd>
                {
                  ENVIRONMENTS.find(
                    (item) => item.id === session.snapshot.setup.environment,
                  )?.label
                }
              </dd>
            </div>
            <div>
              <dt>Bilan enregistré</dt>
              <dd>{displayDate(activity.recordedAt)}</dd>
            </div>
          </dl>
          <ol className="confirmed-phases">
            {activity.result.phases.map((result) => {
              const phase = session.snapshot.variant.phases.find(
                (item) => item.id === result.phaseId,
              )!
              return (
                <li key={result.phaseId}>
                  <span>{phase.title}</span>
                  <strong>
                    {durationLabel(result.performedSeconds)}{' '}
                    <small>/ {durationLabel(phase.durationSeconds)}</small>
                  </strong>
                </li>
              )
            })}
          </ol>
          <p className="progress-help">
            Le temps chronométré inclut les récupérations prévues. Les durées
            déclarées décrivent ton activité, sans mesurer ta technique ni tes
            répétitions.
          </p>
          <a className="progress-link" href="#preparation">
            Préparer une séance <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        <div>
          <RewardSplit activity={activity} />
          <details className="reward-policy">
            <summary>Le barème de cette séance</summary>
            <p>
              {activity.reward.xpPerMinute} XP par minute de mouvement confirmé,
              échauffement et retour au calme inclus. Les récupérations et les
              pauses ne rapportent pas d’XP. Le total est arrondi à l’entier
              inférieur, puis réparti entre les voies.
            </p>
            <p>
              Barème version {activity.reward.policyVersion}. Le contenu et la
              récompense sont conservés avec cette activité.
            </p>
          </details>
        </div>
      </div>
    </article>
  )
}

export function ProgressOverview({ activities }: { activities: Activity[] }) {
  const progress = getProgress(activities)
  return (
    <section className="progress-overview" aria-label="Progression générale">
      <div className="general-level">
        <p className="eyebrow">TON PARCOURS, À TON RYTHME</p>
        <p className="level-value">
          <span>Niveau</span> {progress.level}
        </p>
        <p>
          <strong>{progress.totalXp} XP</strong> au total
        </p>
        <progress
          max={REWARD_POLICY_V1.xpPerLevel}
          value={progress.xpInLevel}
          aria-label="Avancée vers le prochain niveau"
        />
        <p className="progress-help">
          Encore {progress.xpToNextLevel} XP jusqu’au niveau{' '}
          {progress.level + 1}.
        </p>
      </div>
      <div className="path-levels">
        {PATHS.map((path) => {
          const xp = progress.pathXp[path.id]
          return (
            <div className={`path-level path-${path.id}`} key={path.id}>
              <div>
                <h2>{path.label}</h2>
                <span>
                  Niveau {1 + Math.floor(xp / REWARD_POLICY_V1.xpPerLevel)}
                </span>
              </div>
              <strong>{xp} XP</strong>
              <progress
                max={REWARD_POLICY_V1.xpPerLevel}
                value={xp % REWARD_POLICY_V1.xpPerLevel}
                aria-label={`Avancée ${path.label}`}
              />
            </div>
          )
        })}
      </div>
      <p className="progress-disclaimer">
        Chaque niveau demande {REWARD_POLICY_V1.xpPerLevel} XP. Les voies
        reflètent le travail déclaré ; elles ne mesurent pas tes capacités
        physiques. Aucune perte d’XP en cas d’absence.
      </p>
    </section>
  )
}
