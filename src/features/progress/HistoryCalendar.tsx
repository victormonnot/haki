import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { getActivityDate, type Activity } from '../../domain/activity'
import {
  dayLabel,
  localDateKey,
  monthDays,
  monthLabel,
  shiftDay,
  shiftMonth,
  summarizePeriod,
  weekStart,
} from '../../domain/calendar'
import { durationLabel } from '../preparation/durationLabel'
import './calendar.css'

export default function HistoryCalendar({
  activities,
  today,
  month,
  selectedDay,
  onMonthChange,
  onDaySelect,
}: {
  activities: Activity[]
  today: string
  month: string
  selectedDay: string | null
  onMonthChange: (month: string) => void
  onDaySelect: (day: string) => void
}) {
  const week = weekStart(today)
  const weekly = summarizePeriod(activities, week, shiftDay(week, 7))
  const monthly = summarizePeriod(
    activities,
    `${month}-01`,
    `${shiftMonth(month, 1)}-01`,
  )
  const counts = new Map<string, number>()
  for (const activity of activities) {
    const day = localDateKey(getActivityDate(activity))
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const currentMonth = today.slice(0, 7)
  return (
    <aside
      className="history-calendar"
      aria-label="Calendrier des entraînements"
    >
      <div className="calendar-heading">
        <CalendarDays size={19} aria-hidden="true" />
        <h2>Au fil des jours.</h2>
      </div>
      <div className="calendar-stats">
        {[
          { label: 'Cette semaine', summary: weekly },
          { label: 'Mois affiché', summary: monthly },
        ].map(({ label, summary }) => (
          <div key={label} role="group" aria-label={label}>
            <span>{label}</span>
            <strong>
              {summary.count}
              <small> entraînement{summary.count > 1 ? 's' : ''}</small>
            </strong>
            <p>{durationLabel(summary.durationSeconds)} de pratique déclarée</p>
          </div>
        ))}
      </div>
      <div className="calendar-month-controls">
        <button
          type="button"
          aria-label="Mois précédent"
          disabled={month <= '2000-01'}
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <h3>{monthLabel(month)}</h3>
          <label>
            <span className="sr-only">Afficher le mois</span>
            <input
              type="month"
              value={month}
              min="2000-01"
              max={currentMonth}
              onChange={(event) => {
                const next = event.target.value
                if (
                  /^\d{4}-(0[1-9]|1[0-2])$/.test(next) &&
                  next >= '2000-01' &&
                  next <= currentMonth
                )
                  onMonthChange(next)
              }}
            />
          </label>
        </div>
        <button
          type="button"
          aria-label="Mois suivant"
          disabled={month >= currentMonth}
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
      <div
        className="calendar-days"
        role="group"
        aria-label={`Jours de ${monthLabel(month)}`}
      >
        {monthDays(month).map((day) => {
          const count = counts.get(day.key) ?? 0
          return (
            <button
              type="button"
              key={day.key}
              className={`${day.inMonth ? '' : 'calendar-adjacent'} ${count ? 'calendar-practiced' : ''}`}
              aria-label={`${dayLabel(day.key)}, ${count} entraînement${count > 1 ? 's' : ''}`}
              aria-pressed={selectedDay === day.key}
              aria-current={day.key === today ? 'date' : undefined}
              disabled={day.key > today || day.key < '2000-01-01'}
              onClick={() => onDaySelect(day.key)}
            >
              <span>{day.day}</span>
              {count > 0 && (
                <span className="calendar-dot" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
      <p className="calendar-legend">
        <span className="calendar-dot" /> Une activité déclarée, guidée ou
        ajoutée au carnet.
      </p>
      <p className="calendar-footnote">
        Semaines du lundi au dimanche. Dates et heures de cet appareil ; aucune
        obligation quotidienne.
      </p>
    </aside>
  )
}
