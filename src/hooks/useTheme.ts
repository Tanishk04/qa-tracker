import { useSyncExternalStore } from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'qa-tracker-theme'
const TRANSITION_MS = 420

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
  return saved === 'light' ? 'light' : 'dark'
}

// ---- Shared external store (single source of truth across all components) ----

let currentTheme: Theme = readTheme()
const listeners = new Set<() => void>()
let removeClassTimer: number | undefined

function emit() { listeners.forEach(cb => cb()) }

function applyTheme(next: Theme) {
  if (next === currentTheme) return
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    // Apply the "in-transition" class so the global color transition rule kicks in.
    root.classList.add('theme-transitioning')
    root.setAttribute('data-theme', next)
    // Clear the class shortly after the transition finishes so hover/etc. stay snappy.
    if (removeClassTimer) window.clearTimeout(removeClassTimer)
    removeClassTimer = window.setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, TRANSITION_MS)
  }
  currentTheme = next
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }
  emit()
}

// Apply the saved theme on first import so the very first paint is correct.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', currentTheme)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function getSnapshot(): Theme { return currentTheme }
function getServerSnapshot(): Theme { return 'dark' }

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    theme,
    setTheme: applyTheme,
    toggle: () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'),
  }
}
