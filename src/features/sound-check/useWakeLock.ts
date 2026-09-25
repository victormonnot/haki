import { useEffect, useMemo, useState } from 'react'

export type WakeLockStatus = 'idle' | 'requesting' | 'active' | 'unavailable'

export function useWakeLock(active: boolean): WakeLockStatus {
  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'wakeLock' in navigator
  const request = useMemo(() => ({ active, supported }), [active, supported])
  const [result, setResult] = useState<{
    request: typeof request
    status: 'active' | 'unavailable'
  } | null>(null)

  useEffect(() => {
    if (!request.active || !request.supported) return

    let disposed = false
    let sentinel: WakeLockSentinel | null = null
    const onRelease = () => {
      if (!disposed) setResult({ request, status: 'unavailable' })
    }

    void (async () => {
      try {
        const acquired = await navigator.wakeLock.request('screen')

        if (disposed) {
          await acquired.release()
          return
        }

        sentinel = acquired
        acquired.addEventListener('release', onRelease)
        setResult({
          request,
          status: acquired.released ? 'unavailable' : 'active',
        })
      } catch {
        if (!disposed) setResult({ request, status: 'unavailable' })
      }
    })()

    return () => {
      disposed = true
      if (sentinel) {
        sentinel.removeEventListener('release', onRelease)
        void sentinel.release().catch(() => {
          // The browser may have already released it after hiding the page.
        })
      }
    }
  }, [request])

  if (!active) return 'idle'
  if (!supported) return 'unavailable'
  return result?.request === request ? result.status : 'requesting'
}
