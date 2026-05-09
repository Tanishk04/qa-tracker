// QA Tracker — admin-actions Edge Function
// ----------------------------------------------------------------------------
// Skeleton handler for future admin operations that need elevated DB access.
// As of v0.5 there are no live cases — the only admin action ("send myself a
// password reset") happens client-side via supabase.auth.resetPasswordForEmail.
//
// When you need a service-role-backed action (e.g. cross-table backup with
// signed URLs, hard-delete an account, generate one-time admin tokens):
//   1. Add a new case to the switch below.
//   2. Use the SERVICE_ROLE_KEY env var (already populated by Supabase).
//   3. Validate the caller's JWT before doing anything privileged.
//
// Deploy:  `supabase functions deploy admin-actions`
// Invoke:  `supabase.functions.invoke('admin-actions', { body: { action: 'noop' } })`
// ----------------------------------------------------------------------------

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Caller must present a valid Supabase JWT
  const authz = req.headers.get('authorization') ?? ''
  if (!authz.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }

  let body: any = {}
  try { body = await req.json() } catch {/* empty body is fine */}
  const action = String(body?.action ?? 'noop')

  switch (action) {
    case 'noop':
      return json({ ok: true, action, message: 'admin-actions is reachable' })

    // case 'wipe_account_hard':       /* example future case */
    // case 'export_backup_signed':    /* example future case */

    default:
      return json({ error: `unknown action: ${action}` }, 400)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  })
}
