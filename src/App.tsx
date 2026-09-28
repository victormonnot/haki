import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass, Headphones, Play, NotebookPen, GitBranch } from 'lucide-react'
import { FIRST_WORKOUT, getWorkout } from './content/workouts'
import { VIKING_PATH } from './content/vikingPath'
import { derivePathProgress } from './domain/trainingPath'
import PathScreen from './features/path/PathScreen'
import SoundCheckScreen from './features/sound-check/SoundCheckScreen'
import PreparationScreen from './features/preparation/PreparationScreen'
import WorkoutPlayer, {
  SessionNotice,
  SessionRecovery,
} from './features/player/WorkoutPlayer'
import { useWorkoutSession } from './features/player/useWorkoutSession'
import HistoryScreen, {
  ProgressTeaser,
} from './features/progress/HistoryScreen'
import SessionReport from './features/progress/SessionReport'
import { useActivityHistory } from './features/progress/useActivityHistory'
import ActivityEditor from './features/progress/ActivityEditor'
import type { ActivityHistoryController } from './features/progress/useActivityHistory'
import type { Activity } from './domain/activity'
import './App.css'

function currentScreen(hash: string) {
  if (hash.startsWith('#activite/')) return 'editor'
  if (hash === '#parcours') return 'path'
  if (hash.startsWith('#historique')) return 'history'
  if (hash.startsWith('#bilan/')) return 'report'
  if (hash === '#session') return 'session'
  return ['#guide', '#sound-check'].includes(hash) ? 'guide' : 'preparation'
}

function EditActivityRoute({
  id,
  history,
}: {
  id: string
  history: ActivityHistoryController
}) {
  const found = history.activities.find((item) => item.id === id)
  const [initial, setInitial] = useState<Activity | undefined>(found)
  // Keep the editing baseline when another tab refreshes or removes this activity.
  if (!initial && found) setInitial(found)
  if (initial) return <ActivityEditor activity={initial} history={history} />
  return (
    <main id="main-content" tabIndex={-1} className="progress-screen">
      {history.loading ? (
        <p role="status">Chargement de l’activité…</p>
      ) : history.error ? (
        <>
          <p role="alert">{history.error}</p>
          <button onClick={() => void history.refresh()}>Réessayer</button>
        </>
      ) : (
        <>
          <h1>Activité introuvable.</h1>
          <p>Cette activité n’est plus disponible dans le carnet.</p>
        </>
      )}
      <a className="progress-link" href="#historique">
        Revenir au carnet
      </a>
    </main>
  )
}

function workoutIdFromHash(hash: string) {
  if (!hash.startsWith('#preparation/')) return FIRST_WORKOUT.id
  try {
    return decodeURIComponent(hash.slice('#preparation/'.length))
  } catch {
    return ''
  }
}

function App() {
  const [hash, setHash] = useState(window.location.hash)
  const [workoutId, setWorkoutId] = useState(() =>
    workoutIdFromHash(window.location.hash),
  )
  const workout = getWorkout(workoutId)
  const screen = currentScreen(hash)
  const previousScreen = useRef(hash)
  const history = useActivityHistory()
  const pathProgress = useMemo(
    () => derivePathProgress(VIKING_PATH, history.activities),
    [history.activities],
  )
  let activityId = ''
  try {
    activityId = decodeURIComponent(
      hash.startsWith('#activite/modifier/')
        ? hash.slice('#activite/modifier/'.length)
        : hash.split('/').slice(1).join('/'),
    )
  } catch {
    /* Invalid links show the empty state. */
  }
  const session = useWorkoutSession(screen === 'session')
  const finalizedDraftId =
    !history.loading &&
    !history.error &&
    session.realDraft &&
    (history.activities.some(
      (activity) => activity.id === session.realDraft?.id,
    ) ||
      history.deletedActivities.some(
        (activity) => activity.id === session.realDraft?.id,
      ))
      ? session.realDraft.id
      : null
  const { reconcileFinalized, busy, saving } = session
  useEffect(() => {
    if (finalizedDraftId && !busy && !saving) {
      // eslint-disable-next-line react/set-state-in-effect -- Reconcile a draft finalized in another tab with persistent storage.
      void reconcileFinalized(finalizedDraftId)
    }
  }, [finalizedDraftId, reconcileFinalized, busy, saving])

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash
      setHash(next)
      if (next.startsWith('#preparation')) setWorkoutId(workoutIdFromHash(next))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (previousScreen.current === hash) return
    previousScreen.current = hash
    const main = document.getElementById('main-content')
    main?.setAttribute('tabindex', '-1')
    main?.focus({ preventScroll: true })
    if (window.location.hash === '#sound-check') {
      document.getElementById('sound-check')?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [hash])

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault()
          const main = document.getElementById('main-content')
          main?.setAttribute('tabindex', '-1')
          main?.focus()
        }}
      >
        Aller au contenu
      </a>
      <header className="site-header">
        <a className="brand" href="#preparation" aria-label="HAKI, accueil">
          <svg
            className="brand-mark"
            viewBox="0 0 32 36"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 4v28M29 4v28M3 23 29 9M3 32 29 18"
              stroke="currentColor"
              strokeWidth="5"
            />
          </svg>
          <span>
            HAKI<span className="brand-period">.</span>
          </span>
        </a>
        <nav className="main-navigation" aria-label="Navigation principale">
          <a
            href="#parcours"
            aria-current={screen === 'path' ? 'page' : undefined}
          >
            <GitBranch size={16} aria-hidden="true" />
            <span>Parcours Viking</span>
          </a>
          <a
            href={
              workoutId === FIRST_WORKOUT.id
                ? '#preparation'
                : `#preparation/${workoutId}`
            }
            aria-current={screen === 'preparation' ? 'page' : undefined}
          >
            <Compass size={16} aria-hidden="true" />
            <span>Préparer une séance</span>
          </a>
          <a
            href="#guide"
            aria-current={screen === 'guide' ? 'page' : undefined}
          >
            <Headphones size={16} aria-hidden="true" />
            <span>Tester le guide</span>
          </a>
          <a
            href="#historique"
            aria-current={
              screen === 'history' || screen === 'editor' ? 'page' : undefined
            }
          >
            <NotebookPen size={16} aria-hidden="true" />
            <span>Mon carnet</span>
          </a>
          {session.draft && (
            <a
              href="#session"
              aria-current={screen === 'session' ? 'page' : undefined}
            >
              <Play size={16} aria-hidden="true" />
              <span>Ma séance</span>
            </a>
          )}
        </nav>
        <span className="edition">ÉDITION ORIGINE</span>
      </header>
      <div hidden={screen !== 'preparation'}>
        <ProgressTeaser history={history} />
        <SessionRecovery session={session} />
        <SessionNotice session={session} />
        {workout ? (
          <PreparationScreen
            active={screen === 'preparation'}
            session={session}
            workout={workout}
            progress={pathProgress}
            history={history}
          />
        ) : (
          <main
            id={screen === 'preparation' ? 'main-content' : undefined}
            className="progress-screen"
            tabIndex={-1}
          >
            <h1>Séance introuvable.</h1>
            <p>Ce lien ne correspond à aucune séance du catalogue.</p>
            <a href="#parcours">Retrouver le parcours Viking</a>
          </main>
        )}
      </div>
      {screen === 'path' && (
        <PathScreen progress={pathProgress} history={history} />
      )}
      {screen === 'session' && <WorkoutPlayer session={session} />}
      {screen === 'history' && (
        <HistoryScreen history={history} activityId={activityId} />
      )}
      {screen === 'editor' &&
        (hash === '#activite/nouvelle' ? (
          <ActivityEditor key="new" history={history} />
        ) : (
          <EditActivityRoute
            key={activityId}
            id={activityId}
            history={history}
          />
        ))}
      {screen === 'report' && (
        <SessionReport
          history={history}
          session={session}
          sessionId={activityId}
        />
      )}
      {screen === 'guide' && (
        <SoundCheckScreen
          preparationHref={
            workoutId === FIRST_WORKOUT.id
              ? '#preparation'
              : `#preparation/${encodeURIComponent(workoutId)}`
          }
        />
      )}
      <footer>
        <span>
          HAKI<span className="brand-period">.</span>
        </span>
        <p>CHOISIS TA VOIE. TROUVE TON RYTHME.</p>
        <span className="footer-edition">ÉDITION ORIGINE</span>
      </footer>
    </div>
  )
}

export default App
