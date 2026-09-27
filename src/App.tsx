import { useEffect, useRef, useState } from 'react'
import { Compass, Headphones } from 'lucide-react'
import SoundCheckScreen from './features/sound-check/SoundCheckScreen'
import PreparationScreen from './features/preparation/PreparationScreen'
import './App.css'

function currentScreen() {
  return ['#guide', '#sound-check'].includes(window.location.hash)
    ? 'guide'
    : 'preparation'
}

function App() {
  const [screen, setScreen] = useState(currentScreen)
  const previousScreen = useRef(screen)

  useEffect(() => {
    const onHashChange = () => setScreen(currentScreen())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (previousScreen.current === screen) return
    previousScreen.current = screen
    const main = document.getElementById('main-content')
    main?.setAttribute('tabindex', '-1')
    main?.focus({ preventScroll: true })
    if (window.location.hash === '#sound-check') {
      document.getElementById('sound-check')?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [screen])

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
        </nav>
        <span className="edition">ÉDITION ORIGINE</span>
      </header>
      <div hidden={screen !== 'preparation'}>
        <PreparationScreen active={screen === 'preparation'} />
      </div>
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
