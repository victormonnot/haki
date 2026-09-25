import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  Headphones,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  useSoundCheck,
  SOUND_CHECK_PHASES,
} from './features/sound-check/useSoundCheck'
import { useWakeLock } from './features/sound-check/useWakeLock'
import './App.css'

function formatTime(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000)
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function App() {
  const check = useSoundCheck()
  const wakeLock = useWakeLock(check.status === 'running')
  const phase = SOUND_CHECK_PHASES[check.phaseIndex]
  const isRunning = check.status === 'running'
  const isFinished = check.status === 'completed'
  const isPaused = check.status === 'paused'
  const hasVoice = check.speechSupported && check.voiceEnabled
  const phaseLabel = isFinished
    ? 'Test terminé'
    : isPaused
      ? 'À ton rythme'
      : phase.title
  const progress = check.elapsedMs / check.durationMs
  const screenLabel =
    wakeLock === 'active'
      ? 'Écran maintenu allumé'
      : wakeLock === 'requesting'
        ? 'Activation en cours…'
        : wakeLock === 'unavailable'
          ? 'Garde ton écran allumé'
          : 'Garde HAKI au premier plan'

  return (
    <div className="app-shell">
      <a href="#sound-check" className="skip-link">
        Aller au test audio
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="HAKI, accueil">
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
        <div className="header-note">
          <span className="status-dot" /> L’entraînement prend vie
        </div>
        <span className="edition">
          ÉDITION ORIGINE <span>/ 001</span>
        </span>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="eyebrow">
              <span className="short-line" /> TON PARCOURS COMMENCE ICI
            </p>
            <h1 id="page-title">
              CHAQUE VOIE
              <br />
              COMMENCE PAR
              <br />
              <span>UN PREMIER PAS.</span>
            </h1>
            <p className="intro-description">
              Le mouvement t’appartient. On s’occupe du rythme.
              <br className="desktop-break" /> Prends une minute pour faire
              connaissance avec ton guide.
            </p>
            <a className="intro-link" href="#sound-check">
              Trouve ton rythme <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          <div className="intro-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-cross cross-top">+</div>
            <div className="art-cross cross-bottom">+</div>
            <svg className="rune" viewBox="0 0 160 210" fill="none">
              <path
                d="M36 20v170M124 20v170M36 108l88-52M36 160l88-52"
                stroke="currentColor"
                strokeWidth="17"
              />
            </svg>
            <span className="art-label">LA FORCE DU PREMIER PAS</span>
            <span className="art-coordinate">H / 001</span>
          </div>
        </section>

        <section
          className="check-section"
          id="sound-check"
          aria-labelledby="check-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">AVANT D’ENTRER DANS L’ARÈNE</p>
              <h2 id="check-title">Fais connaissance avec ton guide.</h2>
            </div>
            <span className="section-index">
              01 <span>—</span> PRISE EN MAIN
            </span>
          </div>

          <div className="check-layout">
            <div className={`player-card ${isRunning ? 'is-running' : ''}`}>
              <div className="player-topline">
                <span className="player-kicker">
                  <span className="status-dot" />{' '}
                  {isFinished ? 'BIEN JOUÉ' : 'LE TEST DU GUIDE'}
                </span>
                <span className="duration-tag">60 SEC</span>
              </div>
              <div className="timer-dial">
                <svg
                  className="timer-ring"
                  viewBox="0 0 240 240"
                  aria-hidden="true"
                >
                  <circle className="ring-track" cx="120" cy="120" r="110" />
                  <circle
                    className="ring-progress"
                    cx="120"
                    cy="120"
                    r="110"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - progress * 100}
                  />
                </svg>
                <div className="timer-content">
                  <span className="timer-caption">
                    {isFinished
                      ? 'C’EST TOUT BON'
                      : isPaused
                        ? 'EN PAUSE'
                        : isRunning
                          ? 'TEMPS RESTANT'
                          : 'UNE MINUTE POUR TOI'}
                  </span>
                  <span
                    className="timer-value"
                    role="timer"
                    aria-label={`${formatTime(check.durationMs - check.elapsedMs)} restantes`}
                  >
                    {formatTime(check.durationMs - check.elapsedMs)}
                  </span>
                  <span className="timer-phase">
                    {isFinished ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Headphones size={14} aria-hidden="true" />
                    )}{' '}
                    {phaseLabel}
                  </span>
                </div>
              </div>

              <div
                className="player-message"
                aria-live="polite"
                aria-atomic="true"
              >
                <h3>
                  {isFinished
                    ? 'Tu connais maintenant le rythme.'
                    : isPaused
                      ? 'On reprend quand tu veux.'
                      : phase.heading}
                </h3>
                <p>
                  {isFinished
                    ? 'La voix était claire ? Ton guide est prêt pour la suite.'
                    : check.interrupted
                      ? 'Le test s’est mis en pause quand tu as quitté HAKI.'
                      : isPaused
                        ? 'Ton temps est en pause. Prends le temps qu’il te faut.'
                        : phase.description}
                </p>
              </div>

              <button
                className="primary-button"
                onClick={isRunning ? () => check.pause() : check.start}
              >
                {isRunning ? (
                  <Pause size={19} fill="currentColor" aria-hidden="true" />
                ) : isFinished ? (
                  <RotateCcw size={18} aria-hidden="true" />
                ) : (
                  <Play size={18} fill="currentColor" aria-hidden="true" />
                )}
                {isRunning
                  ? 'Mettre en pause'
                  : isFinished
                    ? 'Refaire le test'
                    : isPaused
                      ? 'Reprendre le test'
                      : 'Lancer le test audio'}
                {!isRunning && !isFinished && (
                  <ArrowRight
                    size={19}
                    className="button-arrow"
                    aria-hidden="true"
                  />
                )}
              </button>
              <div className="secondary-controls">
                <button
                  className="quiet-button"
                  onClick={check.toggleVoice}
                  disabled={!check.speechSupported}
                  aria-pressed={hasVoice}
                  aria-label={
                    !check.speechSupported
                      ? 'Voix indisponible'
                      : hasVoice
                        ? 'Couper la voix'
                        : 'Activer la voix'
                  }
                >
                  {hasVoice ? (
                    <Volume2 size={17} aria-hidden="true" />
                  ) : (
                    <VolumeX size={17} aria-hidden="true" />
                  )}
                  {!check.speechSupported
                    ? 'Voix indisponible'
                    : hasVoice
                      ? 'Voix activée'
                      : 'Voix coupée'}
                </button>
                <span className="control-divider" />
                <button
                  className="quiet-button"
                  onClick={check.reset}
                  disabled={check.status === 'idle'}
                >
                  <RotateCcw size={15} aria-hidden="true" /> Réinitialiser
                </button>
              </div>
              {check.speechError && check.speechSupported && (
                <p className="audio-error" role="alert">
                  {check.speechError}
                </p>
              )}
              {!check.speechSupported && (
                <p className="audio-error" role="status">
                  La voix n’est pas disponible dans ce navigateur. Le test
                  visuel reste accessible.
                </p>
              )}
              <p className="player-footnote">
                Un essai audio. Aucun exercice, aucune XP enregistrée.
              </p>
            </div>

            <aside className="guide-panel" aria-label="Déroulement du test">
              <div className="guide-heading">
                <span className="guide-icon">
                  <Headphones size={22} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <div>
                  <p className="eyebrow">UNE VOIX, TROIS TEMPS</p>
                  <h3>Écoute. Respire. C’est parti.</h3>
                </div>
              </div>
              <ol className="phase-list">
                {SOUND_CHECK_PHASES.map((item, index) => {
                  const done = isFinished || index < check.phaseIndex
                  const current = !isFinished && index === check.phaseIndex
                  return (
                    <li
                      className={`${current ? 'phase-current' : ''} ${done ? 'phase-done' : ''}`}
                      key={item.title}
                      aria-current={current ? 'step' : undefined}
                    >
                      <span className="phase-number">
                        {done ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          String(index + 1).padStart(2, '0')
                        )}
                      </span>
                      <div>
                        <h4>{item.title}</h4>
                        <p>{item.summary}</p>
                      </div>
                      <span className="phase-duration">
                        {item.durationMs / 1000}s
                      </span>
                    </li>
                  )
                })}
              </ol>
              <div className="device-note">
                <Monitor size={19} aria-hidden="true" />
                <div>
                  <strong>{screenLabel}</strong>
                  <p>
                    Sur iPhone, reste sur cet écran. Si tu changes
                    d’application, le test se met en pause.
                  </p>
                </div>
              </div>
              <div className="voice-detail">
                <span className="status-dot" />
                <span>
                  {check.speechSupported
                    ? check.voiceLabel
                    : 'Guidage visuel disponible'}
                </span>
              </div>
            </aside>
          </div>
        </section>

        <section className="closing-note" aria-label="La suite du parcours">
          <CheckCheck size={21} strokeWidth={1.6} aria-hidden="true" />
          <p>
            Prendre le temps de bien commencer.
            <span>Les premières séances Viking arrivent ensuite.</span>
          </p>
          <span className="closing-signature" aria-hidden="true">
            HAKI / LE DÉBUT
          </span>
        </section>
      </main>
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
