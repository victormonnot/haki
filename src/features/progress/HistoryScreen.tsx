import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  NotebookPen,
  Plus,
  Pencil,
} from 'lucide-react'
import { exportTrainingData } from '../../data/activities'
import {
  getProgress,
  getActivityDate,
  getActivityTitle,
  getActivityDuration,
} from '../../domain/activity'
import { localDateKey, monthLabel, dayLabel } from '../../domain/calendar'
import HistoryCalendar from './HistoryCalendar'
import { ActivityDeleteButton } from './ActivityEditor'
import { durationLabel } from '../preparation/durationLabel'
import { ActivityDetails, ProgressOverview } from './ProgressDetails'
import { displayDate } from './displayDate'
import type { ActivityHistoryController } from './useActivityHistory'
import './progress.css'

export function ProgressTeaser({
  history,
}: {
  history: ActivityHistoryController
}) {
  if (history.loading || history.error || !history.activities.length)
    return null
  const progress = getProgress(history.activities)
  return (
    <aside className="progress-teaser">
      <p>
        <strong>Niveau {progress.level}</strong>
        <span>
          {progress.totalXp} XP · {history.activities.length} activité
          {history.activities.length > 1 ? 's' : ''} enregistrée
          {history.activities.length > 1 ? 's' : ''}
        </span>
      </p>
      <a href="#historique">
        Mon carnet <ArrowRight size={17} aria-hidden="true" />
      </a>
    </aside>
  )
}

export default function HistoryScreen({
  history,
  activityId,
}: {
  history: ActivityHistoryController
  activityId: string
}) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportingRef = useRef(false)
  const [today, setToday] = useState(() => localDateKey(Date.now()))
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    const update = () => setToday(localDateKey(Date.now()))
    const interval = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  const filtered = history.activities.filter((item) => {
    const day = localDateKey(getActivityDate(item))
    return (
      filter === 'all' ||
      (filter === 'month' ? day.startsWith(`${month}-`) : day === filter)
    )
  })
  const filterLabel =
    filter === 'all'
      ? 'Tout ton historique, du plus récent au plus ancien.'
      : filter === 'month'
        ? `Entraînements de ${monthLabel(month)}.`
        : dayLabel(filter)

  async function download() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportError(null)
    try {
      const backup = await exportTrainingData()
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `haki-${backup.exportedAt.slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      // Give Safari time to consume the Blob URL after starting the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setExportError(
        'L’export n’a pas pu être préparé. Aucune donnée n’a été modifiée. Réessaie pour obtenir un fichier complet.',
      )
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  const activity = history.activities.find((item) => item.id === activityId)
  return (
    <main id="main-content" tabIndex={-1} className="progress-screen">
      {activityId && (
        <a className="back-button" href="#historique">
          <ArrowLeft size={17} aria-hidden="true" /> Tout mon carnet
        </a>
      )}
      {history.loading &&
      (activityId ? !activity : !history.activities.length) ? (
        <p role="status">Chargement du carnet…</p>
      ) : history.error ? (
        <div className="session-notice">
          <p role="alert">{history.error}</p>
          <button onClick={() => void history.refresh()}>Réessayer</button>
        </div>
      ) : activityId ? (
        activity ? (
          <>
            <ActivityDetails activity={activity} />
            <div className="activity-management">
              <a
                className="progress-link"
                href={`#activite/modifier/${encodeURIComponent(activity.id)}`}
              >
                <Pencil size={17} aria-hidden="true" /> Modifier cette activité
              </a>
              <ActivityDeleteButton activity={activity} history={history} />
            </div>
          </>
        ) : (
          <div className="progress-empty">
            <h1>Activité introuvable.</h1>
            <p>Ce bilan n’est pas présent dans le carnet de ce navigateur.</p>
            <a href="#historique">Revenir au carnet</a>
          </div>
        )
      ) : (
        <>
          <div className="progress-heading history-heading">
            <div>
              <p className="eyebrow">
                <NotebookPen size={15} aria-hidden="true" /> TON CARNET
                D’ENTRAÎNEMENT
              </p>
              <h1>
                Trace ta voie<span>.</span>
              </h1>
              <p>
                Des séances que tu as confirmées. Une progression qui reste avec
                toi.
              </p>
            </div>
            <div className="history-actions">
              <a className="progress-primary" href="#activite/nouvelle">
                <Plus size={18} aria-hidden="true" />
                Ajouter un entraînement
              </a>
              <button
                className="export-button"
                disabled={exporting}
                onClick={() => void download()}
              >
                <Download size={18} aria-hidden="true" />
                {exporting ? 'Préparation…' : 'Exporter mes données'}
              </button>
            </div>
          </div>
          {exportError && (
            <p role="alert" className="report-validation">
              {exportError}
            </p>
          )}
          <ProgressOverview activities={history.activities} />
          <div className="history-journal">
            <HistoryCalendar
              activities={history.activities}
              today={today}
              month={month}
              selectedDay={
                filter === 'all' || filter === 'month' ? null : filter
              }
              onMonthChange={(value) => {
                setMonth(value)
                setFilter('month')
              }}
              onDaySelect={(value) => {
                setMonth(value.slice(0, 7))
                setFilter(value)
              }}
            />
            <section className="activity-list" aria-labelledby="history-title">
              <div className="report-section-title">
                <h2 id="history-title">Tes séances</h2>
                <span>
                  {filtered.length} activité
                  {filtered.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="history-filters" aria-label="Filtrer le carnet">
                <button
                  aria-pressed={filter === 'all'}
                  onClick={() => setFilter('all')}
                >
                  Tout le carnet
                </button>
                <button
                  aria-pressed={filter === 'month'}
                  onClick={() => setFilter('month')}
                >
                  Mois affiché
                </button>
                <button
                  aria-pressed={filter === today}
                  onClick={() => {
                    setMonth(today.slice(0, 7))
                    setFilter(today)
                  }}
                >
                  Aujourd’hui
                </button>
              </div>
              <p className="history-filter-label" aria-live="polite">
                {filterLabel}
              </p>
              {!filtered.length ? (
                <div className="progress-empty">
                  <p>
                    {history.activities.length
                      ? 'Aucun entraînement pour cette période.'
                      : 'Ton premier entraînement ouvre le carnet.'}
                  </p>
                  <p>
                    Prépare une séance, suis le guide, puis confirme ton réalisé
                    pour retrouver ton activité ici.
                  </p>
                  <a className="progress-link" href="#preparation">
                    Préparer une séance{' '}
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <ol>
                  {filtered.map((item) => (
                    <li key={item.id}>
                      <a href={`#historique/${encodeURIComponent(item.id)}`}>
                        <div className="activity-list-date">
                          {displayDate(getActivityDate(item))}
                        </div>
                        <div className="activity-list-main">
                          <div>
                            <h3>{getActivityTitle(item)}</h3>
                            <p>
                              {item.kind === 'guided'
                                ? item.session.snapshot.variant.title
                                : 'Ajout au carnet'}{' '}
                              · {durationLabel(getActivityDuration(item))} de
                              pratique
                            </p>
                            <span
                              className={`activity-status status-${item.kind === 'manual' ? 'manual' : item.result.status}`}
                            >
                              {item.kind === 'manual'
                                ? 'Déclarée'
                                : item.result.status === 'completed'
                                  ? 'Complète'
                                  : 'Partielle'}
                            </span>
                          </div>
                          <strong>
                            +{item.reward.totalXp}
                            <small> XP</small>
                            <ArrowRight size={18} aria-hidden="true" />
                          </strong>
                        </div>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
          <p className="progress-local-note">
            Ton carnet reste dans ce navigateur, sur cet appareil. L’export JSON
            contient les activités, les profils enregistrés et le brouillon en
            cours. Conserve ce fichier avant d’effacer les données du site.
            L’import et la synchronisation ne sont pas encore disponibles.
          </p>
        </>
      )}
    </main>
  )
}
