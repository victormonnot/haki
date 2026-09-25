import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createTimer,
  getPhaseIndex,
  pauseTimer,
  readElapsed,
  startTimer,
  tickTimer,
} from '../../domain/timer'
import { useSpeechGuide } from './useSpeechGuide'

export const SOUND_CHECK_PHASES = [
  {
    title: 'Prends tes marques',
    durationMs: 10_000,
    heading: 'Installe-toi et écoute.',
    description:
      'Aucun exercice à faire. Vérifie simplement que tu entends ton guide.',
    summary: 'Découvrir la voix du guide',
    announcement:
      'Bienvenue dans HAKI. Ce test dure une minute. Aucun exercice à faire. Installe-toi et écoute ton guide.',
  },
  {
    title: 'Suis le rythme',
    durationMs: 35_000,
    heading: 'Le guide te laisse de l’espace.',
    description:
      'La voix annonce les étapes. Tu peux mettre le test en pause à tout moment.',
    summary: 'Écouter une transition et essayer la pause',
    announcement:
      'Le guide est là pour annoncer les étapes, puis te laisser de l’espace. Tu peux mettre le test en pause à tout moment.',
  },
  {
    title: 'Termine en douceur',
    durationMs: 15_000,
    heading: 'Dernière étape.',
    description:
      'Encore quinze secondes pour vérifier le son et les commandes.',
    summary: 'Entendre la fin du test',
    announcement: 'Dernière étape. Le test se termine dans quinze secondes.',
  },
] as const

const DURATION_MS = 60_000
const PHASE_DURATIONS = SOUND_CHECK_PHASES.map((phase) => phase.durationMs)
const FINISH_ANNOUNCEMENT =
  'Le test est terminé. À bientôt pour ta première séance HAKI.'

export function useSoundCheck() {
  const timerRef = useRef(createTimer())
  const phaseRef = useRef(0)
  const voiceEnabledRef = useRef(true)
  const [snapshot, setSnapshot] = useState(createTimer)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [interrupted, setInterrupted] = useState(false)
  const { supported, error, voiceLabel, speak, cancel } = useSpeechGuide()

  const pause = useCallback(
    (wasInterrupted = false) => {
      cancel()
      if (timerRef.current.status !== 'running') return

      const paused = pauseTimer(
        timerRef.current,
        performance.now(),
        DURATION_MS,
      )
      timerRef.current = paused
      setSnapshot(paused)
      setInterrupted(wasInterrupted && paused.status === 'paused')
    },
    [cancel],
  )

  const start = useCallback(() => {
    if (timerRef.current.status === 'running') return

    const previous = timerRef.current
    const resuming = previous.status === 'paused'
    const next = startTimer(
      previous.status === 'completed' ? createTimer() : previous,
      performance.now(),
    )
    timerRef.current = next
    phaseRef.current = getPhaseIndex(next.elapsedMs, PHASE_DURATIONS)
    setSnapshot(next)
    setInterrupted(false)

    // Keep speech in the user gesture so mobile browsers can authorize audio.
    if (voiceEnabledRef.current) {
      speak(
        resuming
          ? `On reprend. ${SOUND_CHECK_PHASES[phaseRef.current].title}.`
          : SOUND_CHECK_PHASES[0].announcement,
      )
    }
  }, [speak])

  const reset = useCallback(() => {
    const initial = createTimer()
    timerRef.current = initial
    phaseRef.current = 0
    setSnapshot(initial)
    setInterrupted(false)
    cancel()
  }, [cancel])

  const toggleVoice = useCallback(() => {
    const enabled = !voiceEnabledRef.current
    voiceEnabledRef.current = enabled
    setVoiceEnabled(enabled)

    if (!enabled) {
      cancel()
    } else if (timerRef.current.status === 'running') {
      speak('Le guidage vocal est activé.')
    }
  }, [cancel, speak])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = timerRef.current
      if (current.status !== 'running') return

      const now = performance.now()
      const next = tickTimer(current, now, DURATION_MS)
      const elapsedMs = readElapsed(next, now, DURATION_MS)
      const phaseIndex = getPhaseIndex(elapsedMs, PHASE_DURATIONS)

      // Commit before speaking: another callback cannot announce a second finish.
      timerRef.current = next
      setSnapshot({ ...next, elapsedMs })

      if (next.status === 'completed') {
        phaseRef.current = phaseIndex
        if (voiceEnabledRef.current) speak(FINISH_ANNOUNCEMENT)
      } else if (phaseIndex !== phaseRef.current) {
        phaseRef.current = phaseIndex
        if (voiceEnabledRef.current)
          speak(SOUND_CHECK_PHASES[phaseIndex].announcement)
      }
    }, 100)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pause(true)
    }
    const onPageHide = () => pause(true)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [pause, speak])

  return {
    status: snapshot.status,
    elapsedMs: snapshot.elapsedMs,
    phaseIndex: getPhaseIndex(snapshot.elapsedMs, PHASE_DURATIONS),
    durationMs: DURATION_MS,
    voiceEnabled,
    interrupted,
    speechSupported: supported,
    speechError: error,
    voiceLabel,
    start,
    pause,
    reset,
    toggleVoice,
  }
}
