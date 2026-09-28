import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, NotebookPen } from 'lucide-react'
import { exportTrainingData } from '../../data/activities'
import { getProgress } from '../../domain/activity'
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
      {history.loading ? (
        <p role="status">Chargement du carnet…</p>
      ) : history.error ? (
        <div className="session-notice">
          <p role="alert">{history.error}</p>
          <button onClick={() => void history.refresh()}>Réessayer</button>
        </div>
      ) : activityId ? (
        activity ? (
          <ActivityDetails activity={activity} />
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
            <button
              className="export-button"
              disabled={exporting}
              onClick={() => void download()}
            >
              <Download size={18} aria-hidden="true" />
              {exporting ? 'Préparation…' : 'Exporter mes données'}
            </button>
          </div>
          {exportError && (
            <p role="alert" className="report-validation">
              {exportError}
            </p>
          )}
          <ProgressOverview activities={history.activities} />
          <section className="activity-list" aria-labelledby="history-title">
            <div className="report-section-title">
              <h2 id="history-title">Tes séances</h2>
              <span>
                {history.activities.length} activité
                {history.activities.length > 1 ? 's' : ''}
              </span>
            </div>
            {!history.activities.length ? (
              <div className="progress-empty">
                <p>Ton premier entraînement ouvre le carnet.</p>
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
                {history.activities.map((item) => (
                  <li key={item.id}>
                    <a href={`#historique/${encodeURIComponent(item.id)}`}>
                      <div className="activity-list-date">
                        {displayDate(item.session.createdAt)}
                      </div>
                      <div className="activity-list-main">
                        <div>
                          <h3>{item.session.snapshot.workoutTitle}</h3>
                          <p>
                            {item.session.snapshot.variant.title} ·{' '}
                            {durationLabel(item.result.performedSeconds)} de
                            mouvement
                          </p>
                          <span
                            className={`activity-status status-${item.result.status}`}
                          >
                            {item.result.status === 'completed'
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
