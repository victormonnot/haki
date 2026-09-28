import { describe, expect, it } from 'vitest'
import { FIRST_WORKOUT, MOVEMENTS } from '../content/workouts'
import { createActivity, createManualActivity } from './activity'
import {
  dayLabel,
  localDateKey,
  monthDays,
  monthLabel,
  parseLocalDateTimeInput,
  shiftDay,
  shiftMonth,
  summarizePeriod,
  toLocalDateTimeInput,
  weekStart,
} from './calendar'
import { createSessionDraft, getSessionDuration } from './session'

describe('local calendar dates', () => {
  it('keeps local dates around midnight rather than grouping by UTC dates', () => {
    expect(localDateKey(new Date(2026, 8, 27, 23, 59).getTime())).toBe(
      '2026-09-27',
    )
    expect(localDateKey(new Date(2026, 8, 28, 0, 1).getTime())).toBe(
      '2026-09-28',
    )
  })

  it('round-trips local minute precision without an implicit UTC conversion', () => {
    const timestamp = new Date(2026, 8, 28, 0, 5, 49).getTime()
    expect(toLocalDateTimeInput(timestamp)).toBe('2026-09-28T00:05')
    expect(parseLocalDateTimeInput('2026-09-28T00:05')).toBe(
      new Date(2026, 8, 28, 0, 5).getTime(),
    )
  })

  it.each([
    '',
    '2026-02-30T12:00',
    '2026-13-01T12:00',
    '2026-09-00T12:00',
    '2026-09-28T24:00',
    '2026-09-28T12:60',
    '2026-9-28T12:00',
    '2026-09-28T12:00Z',
    '2026-09-28T12:00:00',
    '1999-12-31T12:00',
  ])('rejects an invalid local value %s', (value) => {
    expect(parseLocalDateTimeInput(value)).toBeNull()
  })

  it('does not silently normalize a nonexistent daylight-saving time', () => {
    // The same assertion also holds in zones without a clock change on this day.
    const requested = '2026-03-29T02:30'
    const normalized = new Date(2026, 2, 29, 2, 30).getTime()
    const expected =
      toLocalDateTimeInput(normalized) === requested ? normalized : null
    expect(parseLocalDateTimeInput(requested)).toBe(expected)
  })

  it('allows a valid leap day and rejects the same day in a normal year', () => {
    expect(parseLocalDateTimeInput('2024-02-29T15:30')).toBe(
      new Date(2024, 1, 29, 15, 30).getTime(),
    )
    expect(parseLocalDateTimeInput('2025-02-29T15:30')).toBeNull()
  })
})

describe('calendar pages and week boundaries', () => {
  it.each([
    ['2026-09-28', '2026-09-28'],
    ['2026-09-27', '2026-09-21'],
    ['2026-01-01', '2025-12-29'],
    ['2026-03-29', '2026-03-23'],
  ])('starts the week of %s on %s', (day, expected) =>
    expect(weekStart(day)).toBe(expected),
  )

  it('moves by calendar days across short and long clock-change days', () => {
    expect(shiftDay('2026-03-28', 2)).toBe('2026-03-30')
    expect(shiftDay('2026-10-24', 2)).toBe('2026-10-26')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('moves between months without overflowing a long month into the next one', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('lays out a month starting on Sunday with full Monday-first weeks', () => {
    const days = monthDays('2026-03')
    expect(days).toHaveLength(42)
    expect(days[0]).toEqual({ key: '2026-02-23', day: 23, inMonth: false })
    expect(days.at(-1)).toEqual({ key: '2026-04-05', day: 5, inMonth: false })
    expect(days.filter((day) => day.inMonth)).toHaveLength(31)
    expect(new Set(days.map((day) => day.key)).size).toBe(days.length)
  })

  it('supports four-week February and leap-year February', () => {
    expect(monthDays('2027-02')).toHaveLength(28)
    expect(monthDays('2024-02').filter((day) => day.inMonth)).toHaveLength(29)
  })

  it('formats calendar labels without shifting the represented date', () => {
    expect(monthLabel('2026-09')).toBe('septembre 2026')
    expect(dayLabel('2026-09-28')).toBe('lundi 28 septembre 2026')
  })

  it.each(['2026-02-30', 'bad', '2026-1-01'])(
    'rejects invalid calendar day %s',
    (day) => {
      expect(() => weekStart(day)).toThrow()
    },
  )
})

describe('declared practice by period', () => {
  const now = new Date(2026, 9, 1, 12).getTime()
  function manual(id: string, date: Date, minutes: number) {
    return createManualActivity(
      {
        id,
        title: 'Cours en club',
        occurredAt: date.getTime(),
        durationSeconds: minutes * 60,
        pathIds: ['technique'],
        notes: '',
      },
      now,
    )
  }

  it('separates Sunday from Monday and counts each activity only once', () => {
    const sunday = manual('sunday', new Date(2026, 8, 27, 23, 59), 30)
    const monday = manual('monday', new Date(2026, 8, 28, 0, 1), 45)
    expect(
      summarizePeriod([sunday, monday, monday], '2026-09-28', '2026-10-05'),
    ).toEqual({ count: 1, durationSeconds: 2700 })
    expect(
      summarizePeriod([sunday, monday], '2026-09-01', '2026-10-01'),
    ).toEqual({ count: 2, durationSeconds: 4500 })
  })

  it('excludes the next month even when practice happens just after midnight', () => {
    const before = manual('before', new Date(2026, 8, 30, 23, 59), 10)
    const after = manual('after', new Date(2026, 9, 1, 0, 1), 20)
    expect(
      summarizePeriod([before, after], '2026-09-01', '2026-10-01'),
    ).toEqual({ count: 1, durationSeconds: 600 })
  })

  it('uses original guided dates and confirmed movement, excluding planned rests', () => {
    const date = new Date(2026, 8, 28, 12).getTime()
    const variant = FIRST_WORKOUT.variants[0]
    const draft = createSessionDraft(
      FIRST_WORKOUT,
      variant,
      {
        environment: 'home',
        equipment: [],
        availableMinutes: 15,
        experience: 'discovery',
        smallSpace: true,
        quiet: true,
      },
      MOVEMENTS,
      'real',
      'guided',
      date,
    )
    draft.status = 'completed'
    draft.elapsedMs = getSessionDuration(draft)
    const activity = createActivity(
      draft,
      variant.phases
        .filter((phase) => phase.kind !== 'rest')
        .map((phase) => ({
          phaseId: phase.id,
          performedSeconds: phase.durationSeconds,
        })),
      now,
    )
    expect(summarizePeriod([activity], '2026-09-28', '2026-09-29')).toEqual({
      count: 1,
      durationSeconds: 420,
    })
    expect(summarizePeriod([activity], '2026-10-01', '2026-10-02')).toEqual({
      count: 0,
      durationSeconds: 0,
    })
  })
})
