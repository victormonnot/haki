import { useCallback, useEffect, useRef, useState } from 'react'
import { listActivities } from '../../data/activities'
import type { Activity } from '../../domain/activity'

export function useActivityHistory() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++request.current
    setLoading(true)
    try {
      const saved = await listActivities()
      if (current !== request.current) return
      setActivities(saved)
      setError(null)
    } catch {
      if (current !== request.current) return
      setError(
        'Le carnet n’a pas pu être chargé. Les données enregistrées n’ont pas été modifiées. Réessaie avant de consulter ta progression.',
      )
    } finally {
      if (current === request.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Load persistent activities and refresh when returning from another tab.
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onNavigate = () => {
      if (/^#(?:historique|bilan)/.test(window.location.hash)) void refresh()
    }
    window.addEventListener('focus', onVisible)
    window.addEventListener('hashchange', onNavigate)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      request.current += 1
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('hashchange', onNavigate)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { activities, loading, error, refresh }
}
export type ActivityHistoryController = ReturnType<typeof useActivityHistory>
