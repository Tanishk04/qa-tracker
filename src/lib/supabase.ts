import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url || 'http://localhost', anon || 'anon', {
  auth: {
    persistSession: true,           // session survives page reloads
    autoRefreshToken: true,         // background refresh of access tokens
    detectSessionInUrl: true,       // capture #access_token from email links
    flowType: 'pkce',               // safer auth code flow with PKCE
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'qa-tracker.auth',
  },
})
