export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface TimerState {
  status: TimerStatus
  elapsedMs: number
  startedAt: number | null
}

export function createTimer(): TimerState {
  return { status: 'idle', elapsedMs: 0, startedAt: null }
}

/** `now` must come from the same monotonic clock on every call. */
export function readElapsed(
  state: TimerState,
  now: number,
  durationMs: number,
): number {
  const activeMs =
    state.status === 'running' && state.startedAt !== null
      ? Math.max(0, now - state.startedAt)
      : 0

  return Math.min(Math.max(0, durationMs), state.elapsedMs + activeMs)
}

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.status === 'running' || state.status === 'completed') return state

  return { ...state, status: 'running', startedAt: now }
}

export function pauseTimer(
  state: TimerState,
  now: number,
  durationMs: number,
): TimerState {
  if (state.status !== 'running') return state

  const elapsedMs = readElapsed(state, now, durationMs)

  return {
    status: elapsedMs >= durationMs ? 'completed' : 'paused',
    elapsedMs,
    startedAt: null,
  }
}

export function tickTimer(
  state: TimerState,
  now: number,
  durationMs: number,
): TimerState {
  if (state.status !== 'running') return state

  const elapsedMs = readElapsed(state, now, durationMs)
  if (elapsedMs < durationMs) return state

  return { status: 'completed', elapsedMs, startedAt: null }
}

/** At a boundary, select the next phase. An empty timeline has index -1. */
export function getPhaseIndex(
  elapsedMs: number,
  phaseDurationsMs: readonly number[],
): number {
  let phaseEndMs = 0

  for (let index = 0; index < phaseDurationsMs.length; index += 1) {
    phaseEndMs += phaseDurationsMs[index]
    if (elapsedMs < phaseEndMs) return index
  }

  return phaseDurationsMs.length - 1
}
