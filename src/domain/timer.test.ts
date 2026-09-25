import { describe, expect, it } from 'vitest'
import {
  createTimer,
  getPhaseIndex,
  pauseTimer,
  readElapsed,
  startTimer,
  tickTimer,
} from './timer'

describe('timer', () => {
  it('starts idle and leaves the previous state untouched', () => {
    const initial = createTimer()
    const running = startTimer(initial, 100)

    expect(initial).toEqual({ status: 'idle', elapsedMs: 0, startedAt: null })
    expect(running).toEqual({ status: 'running', elapsedMs: 0, startedAt: 100 })
    expect(readElapsed(initial, 5_000, 10_000)).toBe(0)
  })

  it('does not restart an already running timer', () => {
    const running = startTimer(createTimer(), 100)

    expect(startTimer(running, 900)).toBe(running)
    expect(readElapsed(running, 1_100, 10_000)).toBe(1_000)
  })

  it('reads the clock rather than accumulating rendering intervals', () => {
    let state = startTimer(createTimer(), 100)

    for (const now of [116, 1_127, 1_128, 4_532]) {
      const previous = state
      state = tickTimer(state, now, 10_000)
      expect(state).toBe(previous)
      expect(readElapsed(state, now, 10_000)).toBe(now - 100)
    }

    expect(readElapsed(state, 9_850, 10_000)).toBe(9_750)
  })

  it('does not count paused time across multiple pause and resume cycles', () => {
    let state = startTimer(createTimer(), 100)
    state = pauseTimer(state, 1_100, 10_000)

    expect(state).toEqual({
      status: 'paused',
      elapsedMs: 1_000,
      startedAt: null,
    })
    expect(readElapsed(state, 50_000, 10_000)).toBe(1_000)

    state = startTimer(state, 50_000)
    expect(readElapsed(state, 51_500, 10_000)).toBe(2_500)

    state = pauseTimer(state, 52_000, 10_000)
    state = startTimer(state, 90_000)
    expect(readElapsed(state, 91_000, 10_000)).toBe(4_000)
  })

  it('makes repeated pauses idempotent', () => {
    const idle = createTimer()
    const paused = pauseTimer(startTimer(idle, 100), 600, 10_000)

    expect(pauseTimer(idle, 600, 10_000)).toBe(idle)
    expect(pauseTimer(paused, 9_000, 10_000)).toBe(paused)
    expect(tickTimer(paused, 50_000, 10_000)).toBe(paused)
    expect(tickTimer(idle, 50_000, 10_000)).toBe(idle)
  })

  it.each([1_100, 5_000])(
    'completes at or after the deadline (%i ms)',
    (now) => {
      const running = startTimer(createTimer(), 100)
      const completed = tickTimer(running, now, 1_000)

      expect(readElapsed(running, now, 1_000)).toBe(1_000)
      expect(completed).toEqual({
        status: 'completed',
        elapsedMs: 1_000,
        startedAt: null,
      })
      expect(tickTimer(completed, now + 10_000, 1_000)).toBe(completed)
      expect(pauseTimer(completed, now + 10_000, 1_000)).toBe(completed)
      expect(startTimer(completed, now + 10_000)).toBe(completed)
      expect(readElapsed(completed, now + 10_000, 1_000)).toBe(1_000)
    },
  )

  it('completes when paused after the deadline before a render tick', () => {
    const running = startTimer(createTimer(), 100)

    expect(pauseTimer(running, 1_500, 1_000)).toEqual({
      status: 'completed',
      elapsedMs: 1_000,
      startedAt: null,
    })
  })

  it('finishes after the remaining active time following a pause', () => {
    const paused = pauseTimer(startTimer(createTimer(), 0), 750, 1_000)
    const resumed = startTimer(paused, 5_000)

    expect(tickTimer(resumed, 5_249, 1_000)).toBe(resumed)
    expect(tickTimer(resumed, 5_250, 1_000)).toEqual({
      status: 'completed',
      elapsedMs: 1_000,
      startedAt: null,
    })
  })

  it('does not produce negative active time', () => {
    const running = startTimer(createTimer(), 100)

    expect(readElapsed(running, 99, 1_000)).toBe(0)
  })

  it('completes a zero-duration timer on its first tick', () => {
    const running = startTimer(createTimer(), 100)

    expect(tickTimer(running, 100, 0)).toEqual({
      status: 'completed',
      elapsedMs: 0,
      startedAt: null,
    })
  })
})

describe('getPhaseIndex', () => {
  it.each([
    [0, 0],
    [999, 0],
    [1_000, 1],
    [2_999, 1],
    [3_000, 2],
    [3_500, 2],
    [9_000, 2],
  ])('selects phase %i ms into the timeline', (elapsedMs, expectedIndex) => {
    expect(getPhaseIndex(elapsedMs, [1_000, 2_000, 500])).toBe(expectedIndex)
  })

  it('skips zero-duration phases at a boundary', () => {
    expect(getPhaseIndex(0, [0, 1_000, 0, 500])).toBe(1)
    expect(getPhaseIndex(1_000, [0, 1_000, 0, 500])).toBe(3)
  })

  it('keeps the sole phase selected when it ends', () => {
    expect(getPhaseIndex(1_000, [1_000])).toBe(0)
  })

  it('has no selected phase for an empty timeline', () => {
    expect(getPhaseIndex(0, [])).toBe(-1)
  })
})
