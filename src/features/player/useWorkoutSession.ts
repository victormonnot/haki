import { useCallback, useEffect, useRef, useState } from 'react'
import { FIRST_WORKOUT, MOVEMENTS } from '../../content/workouts'
import { finalizeSession } from '../../data/activities'
import type { Activity, PhaseResult } from '../../domain/activity'
import {
  createSessionDraft,
  getSessionDuration,
  getSessionPosition,
  restoreSessionDraft,
  type SessionDraft,
  type SessionMode,
} from '../../domain/session'
import {
  pauseTimer,
  readElapsed,
  startTimer,
  type TimerState,
} from '../../domain/timer'
import {
  assessVariant,
  type TrainingSetup,
  type WorkoutVariant,
} from '../../domain/workouts'
import {
  deleteSessionDraft,
  loadSessionDraft,
  resetCorruptSessionDraft,
  saveSessionDraft,
  SessionConflictError,
  SessionDataError,
} from '../../data/sessionDrafts'
import { useSpeechGuide } from '../sound-check/useSpeechGuide'

const pausedTimer = (draft: SessionDraft): TimerState => ({
  status: 'paused',
  elapsedMs: draft.elapsedMs,
  startedAt: null,
})

function phaseAnnouncement(draft: SessionDraft) {
  const phase = getSessionPosition(draft).phase
  if (!phase) return ''
  if (draft.mode === 'demo') return phase.title
  const movement = phase.movementId
    ? draft.snapshot.movements[phase.movementId]
    : undefined
  return `${phase.title}. ${movement ? `${movement.title}. ` : ''}${phase.cue}`
}

function newSessionId() {
  // getRandomValues also works over a local-network HTTP connection.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function useWorkoutSession(active: boolean) {
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [realDraft, setRealDraft] = useState<SessionDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [problem, setProblem] = useState<
    'storage' | 'conflict' | 'corrupt' | null
  >(null)
  const [interrupted, setInterrupted] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const current = useRef<SessionDraft | null>(null)
  const real = useRef<SessionDraft | null>(null)
  const revision = useRef<number | null>(null)
  const timer = useRef<TimerState>({
    status: 'idle',
    elapsedMs: 0,
    startedAt: null,
  })
  const lastFrame = useRef({ monotonic: 0, wall: 0 })
  const lastCheckpoint = useRef(0)
  const voice = useRef(true)
  const failed = useRef(false)
  const pending = useRef(0)
  const working = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const speech = useSpeechGuide()
  const { speak, cancel } = speech

  const publish = useCallback((next: SessionDraft) => {
    current.current = next
    setDraft(next)
    if (next.mode === 'real') {
      real.current = next
      setRealDraft(next)
    }
  }, [])

  const reportFailure = useCallback(
    (cause: unknown) => {
      failed.current = true
      cancel()
      const latest = current.current
      if (latest?.mode === 'real' && latest.status === 'running') {
        const next = { ...latest, status: 'paused' as const }
        timer.current = pausedTimer(next)
        publish(next)
      }
      const conflict = cause instanceof SessionConflictError
      const corrupt = cause instanceof SessionDataError
      setProblem(conflict ? 'conflict' : corrupt ? 'corrupt' : 'storage')
      setError(
        conflict
          ? 'Cette séance a changé dans un autre onglet. Charge le dernier point enregistré pour continuer.'
          : corrupt
            ? 'Le brouillon enregistré est illisible. Tu peux le supprimer pour préparer une nouvelle séance.'
            : 'Le point de reprise n’a pas pu être enregistré. La séance est en pause : réessaie avant de continuer.',
      )
    },
    [cancel, publish],
  )

  const persist = useCallback(
    (next: SessionDraft) => {
      if (next.mode === 'demo' || failed.current) return
      pending.current += 1
      setSaving(true)
      queue.current = queue.current
        .then(async () => {
          if (failed.current) return
          try {
            const stored = await saveSessionDraft(next, revision.current)
            revision.current = stored.revision
          } catch (cause) {
            reportFailure(cause)
          }
        })
        .finally(() => {
          pending.current -= 1
          setSaving(pending.current > 0)
        })
    },
    [reportFailure],
  )

  const load = useCallback(
    async (preserveDemo = false) => {
      if (working.current) return
      working.current = true
      const keepDemo = preserveDemo && current.current?.mode === 'demo'
      if (!keepDemo) cancel()
      await queue.current
      setLoading(true)
      try {
        const stored = await loadSessionDraft()
        revision.current = stored?.revision ?? null
        const restored = stored ? restoreSessionDraft(stored.draft) : null
        real.current = restored
        setRealDraft(restored)
        if (!keepDemo) {
          current.current = restored
          if (restored) timer.current = pausedTimer(restored)
          setDraft(restored)
          setInterrupted(
            !!restored && !['completed', 'stopped'].includes(restored.status),
          )
        }
        setFinalizeError(null)
        failed.current = false
        setError(null)
        setProblem(null)
      } catch (cause) {
        reportFailure(cause)
      } finally {
        working.current = false
        setLoading(false)
      }
    },
    [cancel, reportFailure],
  )

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Hydration updates state after the asynchronous IndexedDB read.
    void load()
  }, [load])

  const pause = useCallback(
    (wasInterrupted = false) => {
      const previous = current.current
      if (!previous || previous.status !== 'running') return
      cancel()
      const now = performance.now()
      // A long suspension without visibility events must not count unseen time.
      const suspended =
        now - lastFrame.current.monotonic > 5_000 ||
        Date.now() - lastFrame.current.wall > 5_000
      const paused = suspended
        ? pausedTimer(previous)
        : pauseTimer(timer.current, now, getSessionDuration(previous))
      timer.current = paused
      const next: SessionDraft = {
        ...previous,
        status: paused.status === 'completed' ? 'completed' : 'paused',
        elapsedMs: paused.elapsedMs,
        updatedAt: Math.max(previous.updatedAt, Date.now()),
      }
      publish(next)
      setInterrupted(wasInterrupted || suspended)
      persist(next)
    },
    [cancel, persist, publish],
  )

  useEffect(() => {
    const onHide = () => {
      pause(true)
      if (current.current?.status === 'completed') cancel()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    const onHash = () => {
      if (window.location.hash !== '#session') onHide()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('hashchange', onHash)
    const interval = window.setInterval(() => {
      const previous = current.current
      if (!previous || previous.status !== 'running') return
      const now = performance.now()
      if (
        now - lastFrame.current.monotonic > 5_000 ||
        Date.now() - lastFrame.current.wall > 5_000
      ) {
        pause(true)
        return
      }
      lastFrame.current = { monotonic: now, wall: Date.now() }
      const elapsedMs = readElapsed(
        timer.current,
        now,
        getSessionDuration(previous),
      )
      const completed = elapsedMs >= getSessionDuration(previous)
      const next: SessionDraft = {
        ...previous,
        elapsedMs,
        status: completed ? 'completed' : 'running',
        updatedAt: Math.max(previous.updatedAt, Date.now()),
      }
      const changedPhase =
        getSessionPosition(previous).phaseIndex !==
        getSessionPosition(next).phaseIndex
      publish(next)
      if (completed) {
        timer.current = { status: 'completed', elapsedMs, startedAt: null }
        if (voice.current)
          speak('Le minuteur est terminé. Prends le temps de souffler.')
      } else if (changedPhase && voice.current) {
        const phase = getSessionPosition(next).phase
        if (phase) speak(phaseAnnouncement(next))
      }
      if (completed || changedPhase || now - lastCheckpoint.current >= 1_000) {
        lastCheckpoint.current = now
        persist(next)
      }
    }, 100)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('hashchange', onHash)
    }
  }, [cancel, pause, persist, publish, speak])

  const open = useCallback(
    async (
      variant: WorkoutVariant,
      setup: TrainingSetup,
      mode: SessionMode,
    ) => {
      if (
        working.current ||
        loading ||
        !assessVariant(variant, setup).compatible
      )
        return false
      if (mode === 'real' && (real.current || failed.current)) return false
      pause(true)
      working.current = true
      setBusy(true)
      try {
        const next = createSessionDraft(
          FIRST_WORKOUT,
          variant,
          setup,
          MOVEMENTS,
          mode,
          newSessionId(),
          Date.now(),
        )
        if (mode === 'real') {
          await queue.current
          const stored = await saveSessionDraft(next, null)
          revision.current = stored.revision
        }
        timer.current = pausedTimer(next)
        publish(next)
        setInterrupted(false)
        setFinalizeError(null)
        return true
      } catch (cause) {
        reportFailure(cause)
        return false
      } finally {
        working.current = false
        setBusy(false)
      }
    },
    [loading, pause, publish, reportFailure],
  )

  const start = useCallback(() => {
    const previous = current.current
    if (
      !active ||
      document.visibilityState === 'hidden' ||
      !previous ||
      previous.status !== 'paused' ||
      working.current ||
      (previous.mode === 'real' && failed.current)
    )
      return
    const now = performance.now()
    timer.current = startTimer(pausedTimer(previous), now)
    lastFrame.current = { monotonic: now, wall: Date.now() }
    lastCheckpoint.current = now
    const next = {
      ...previous,
      status: 'running' as const,
      updatedAt: Math.max(previous.updatedAt, Date.now()),
    }
    publish(next)
    setInterrupted(false)
    const phase = getSessionPosition(next).phase
    // Keep speech in the button's user gesture for mobile audio authorization.
    if (voice.current && phase)
      speak(
        next.mode === 'demo'
          ? `Aperçu accéléré. ${phase.title}.`
          : `${previous.elapsedMs ? 'On reprend. ' : ''}${phaseAnnouncement(next)}`,
      )
    persist(next)
  }, [active, persist, publish, speak])

  const stop = useCallback(() => {
    pause()
    const previous = current.current
    if (!previous || ['completed', 'stopped'].includes(previous.status)) return
    cancel()
    const next = {
      ...previous,
      status: 'stopped' as const,
      updatedAt: Math.max(previous.updatedAt, Date.now()),
    }
    publish(next)
    persist(next)
  }, [cancel, pause, persist, publish])

  const discard = useCallback(async () => {
    if (working.current) return false
    pause()
    working.current = true
    setBusy(true)
    await queue.current
    try {
      if (problem === 'corrupt') await resetCorruptSessionDraft()
      else if (real.current && revision.current !== null)
        await deleteSessionDraft(revision.current)
      current.current = null
      real.current = null
      revision.current = null
      setDraft(null)
      setRealDraft(null)
      setFinalizeError(null)
      failed.current = false
      setError(null)
      setProblem(null)
      cancel()
      return true
    } catch (cause) {
      reportFailure(cause)
      return false
    } finally {
      working.current = false
      setBusy(false)
    }
  }, [cancel, pause, problem, reportFailure])

  const finalize = useCallback(
    async (phases: PhaseResult[]): Promise<Activity | null> => {
      const source = real.current
      if (
        working.current ||
        !source ||
        !['completed', 'stopped'].includes(source.status)
      )
        return null
      working.current = true
      setBusy(true)
      setFinalizeError(null)
      cancel()
      await queue.current
      try {
        if (failed.current || revision.current === null)
          throw new Error('The checkpoint must be saved first.')
        const { activity } = await finalizeSession({
          sessionId: source.id,
          expectedRevision: revision.current,
          phases,
          recordedAt: Math.max(source.updatedAt, Date.now()),
        })
        // The activity and draft removal have committed together before updating the UI.
        if (current.current?.id === source.id) {
          current.current = null
          setDraft(null)
        }
        if (real.current?.id === source.id) {
          real.current = null
          setRealDraft(null)
          revision.current = null
        }
        setError(null)
        setProblem(null)
        failed.current = false
        return activity
      } catch (cause) {
        if (cause instanceof SessionConflictError) reportFailure(cause)
        setFinalizeError(
          'L’activité n’a pas pu être enregistrée. Aucune nouvelle XP n’a été confirmée. Ton bilan reste disponible pour réessayer.',
        )
        return null
      } finally {
        working.current = false
        setBusy(false)
      }
    },
    [cancel, reportFailure],
  )

  const retry = useCallback(() => {
    if (!real.current) {
      void load()
      return
    }
    failed.current = false
    setProblem(null)
    setError(null)
    persist(real.current)
  }, [load, persist])

  const showReal = useCallback(() => {
    pause()
    if (!real.current) return
    timer.current = pausedTimer(real.current)
    publish(real.current)
    setInterrupted(
      real.current.status === 'paused' && real.current.elapsedMs > 0,
    )
  }, [pause, publish])

  const reconcileFinalized = useCallback(
    async (id: string) => {
      if (working.current || real.current?.id !== id) return
      const previous = current.current
      if (previous?.mode === 'real' && previous.status === 'running') {
        cancel()
        const paused = { ...previous, status: 'paused' as const }
        timer.current = pausedTimer(paused)
        publish(paused)
      }
      await load(true)
    },
    [cancel, load, publish],
  )

  const toggleVoice = useCallback(() => {
    voice.current = !voice.current
    setVoiceEnabled(voice.current)
    if (!voice.current) cancel()
    else if (current.current?.status === 'running') {
      const phase = getSessionPosition(current.current).phase
      if (phase) speak(phaseAnnouncement(current.current))
    }
  }, [cancel, speak])

  return {
    draft,
    realDraft,
    loading,
    busy,
    saving,
    error,
    problem,
    interrupted,
    voiceEnabled,
    speech,
    open,
    start,
    pause,
    stop,
    discard,
    retry,
    reload: load,
    showReal,
    toggleVoice,
    finalize,
    finalizeError,
    reconcileFinalized,
  }
}

export type WorkoutSessionController = ReturnType<typeof useWorkoutSession>
