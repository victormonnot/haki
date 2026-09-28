import { useEffect, useRef, useState } from 'react'
import { Compass, Headphones, Play, NotebookPen } from 'lucide-react'
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
import './App.css'

function currentScreen(hash: string) {
  if (hash.startsWith('#historique')) return 'history'
  if (hash.startsWith('#bilan/')) return 'report'
  if (hash === '#session') return 'session'
  return ['#guide', '#sound-check'].includes(hash) ? 'guide' : 'preparation'
}

function App() {
  const [hash, setHash] = useState(window.location.hash)
  const screen = currentScreen(hash)
  const previousScreen = useRef(hash)
  const history = useActivityHistory()
  let activityId = ''
  try {
    activityId = decodeURIComponent(hash.split('/').slice(1).join('/'))
  } catch {
    /* Invalid links show the empty state. */
  }
  const session = useWorkoutSession(screen === 'session')
  const finalizedDraftId =
    !history.loading &&
    !history.error &&
    session.realDraft &&
    history.activities.some((activity) => activity.id === session.realDraft?.id)
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
    const onHashChange = () => setHash(window.location.hash)
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
            href="#preparation"
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
            aria-current={screen === 'history' ? 'page' : undefined}
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
        <PreparationScreen
          active={screen === 'preparation'}
          session={session}
        />
      </div>
      {screen === 'session' && <WorkoutPlayer session={session} />}
      {screen === 'history' && (
        <HistoryScreen history={history} activityId={activityId} />
      )}
      {screen === 'report' && (
        <SessionReport
          history={history}
          session={session}
          sessionId={activityId}
        />
      )}
      {screen === 'guide' && <SoundCheckScreen />}
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
