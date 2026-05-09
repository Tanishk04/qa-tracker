import { useEffect, useState } from 'react'

/**
 * Re-renders every `intervalMs` AND returns a monotonically increasing tick number.
 * Use the return value as a useMemo dep when the memo reads `Date.now()`.
 *
 * const tick = useTick(1000)
 * const seconds = useMemo(() => computeTaskSeconds(t, logs), [t, logs, tick])
 */
export function useTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}
