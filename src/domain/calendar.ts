import { getActivityDate, getActivityDuration, type Activity } from './activity'

const pad = (value: number) => String(value).padStart(2, '0')

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toLocalDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp)
  return `${localDateKey(timestamp)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Reject invalid calendar values, including times skipped by a clock change. */
export function parseLocalDateTimeInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  if (year < 2000 || year > 9999) return null
  const date = new Date(year, month - 1, day, hour, minute)
  return toLocalDateTimeInput(date.getTime()) === value ? date.getTime() : null
}

function calendarDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Date invalide.')
  const date = new Date(`${key}T12:00:00Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== key
  ) {
    throw new Error('Date invalide.')
  }
  return date
}

export function shiftDay(key: string, count: number): string {
  const date = calendarDate(key)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

export function shiftMonth(month: string, count: number): string {
  const date = calendarDate(`${month}-01`)
  date.setUTCMonth(date.getUTCMonth() + count)
  return date.toISOString().slice(0, 7)
}

export function weekStart(key: string): string {
  const date = calendarDate(key)
  return shiftDay(key, -((date.getUTCDay() + 6) % 7))
}

export function monthDays(month: string) {
  const first = `${month}-01`
  const start = weekStart(first)
  const next = `${shiftMonth(month, 1)}-01`
  const days: { key: string; day: number; inMonth: boolean }[] = []
  for (
    let key = start;
    key < next || days.length % 7 !== 0;
    key = shiftDay(key, 1)
  ) {
    days.push({
      key,
      day: Number(key.slice(-2)),
      inMonth: key.startsWith(`${month}-`),
    })
  }
  return days
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(calendarDate(`${month}-01`))
}

export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(calendarDate(day))
}

export function summarizePeriod(
  activities: readonly Activity[],
  start: string,
  end: string,
) {
  const seen = new Set<string>()
  let count = 0
  let durationSeconds = 0
  for (const activity of activities) {
    if (seen.has(activity.id)) continue
    seen.add(activity.id)
    const day = localDateKey(getActivityDate(activity))
    if (day >= start && day < end) {
      count += 1
      durationSeconds += getActivityDuration(activity)
    }
  }
  return { count, durationSeconds }
}
