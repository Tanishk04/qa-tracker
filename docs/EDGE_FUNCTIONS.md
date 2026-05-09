# Edge Functions

Supabase Edge Functions live under `supabase/functions/`. They run on Deno and have first-class access to your project's `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — never expose the service role to the browser.

## Current functions

### `admin-actions`

Skeleton handler for future admin operations that need service-role access. As of v0.5 there are no live cases — the only admin action (self-service password reset) is fine on the client.

The skeleton is in place so when you do need one of these:

- Cross-table signed-URL backup
- Hard-delete the auth user (not just their data)
- Generate one-time admin tokens
- Cross-tenant audit query

…you can add a `case` to the switch in `supabase/functions/admin-actions/index.ts` instead of standing up new infra.

## Local development

```bash
# inside the function dir, using the Deno runtime
cd supabase/functions/admin-actions
deno task dev          # serves on http://localhost:8000

# in another terminal — invoke it
curl -X POST http://localhost:8000 \
  -H "Authorization: Bearer $(supabase auth token)" \
  -H "Content-Type: application/json" \
  -d '{"action":"noop"}'
```

## Deploy

```bash
# one-time: link the local repo to your project
supabase link --project-ref tvsbqntjlmeiguuwgmpf

# deploy this function
supabase functions deploy admin-actions
```

After deploy the function is reachable at:

```
https://<project-ref>.functions.supabase.co/admin-actions
```

## Secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-populated by Supabase — you never set them. To add custom secrets:

```bash
supabase secrets set MY_SECRET=value
supabase secrets list
```

In the function: `Deno.env.get('MY_SECRET')`.

## Invoking from the React app

```ts
import { supabase } from './lib/supabase'

const { data, error } = await supabase.functions.invoke('admin-actions', {
  body: { action: 'wipe_account_hard' },
})
```

The supabase-js client automatically includes the user's JWT in the `Authorization` header, so the function can validate it and act accordingly.

## Security checklist

When adding a new case to the switch:

- [ ] Validate the JWT — confirm `auth.getUser(token)` returns a real user.
- [ ] Check authorization — confirm the user is allowed to do the action (in single-tenant mode this is just "any authenticated user").
- [ ] Return narrow error messages — don't leak internal SQL or stack traces to the client.
- [ ] If you mutate cross-table data, wrap it in a Postgres transaction via the service-role client.
- [ ] Log the action server-side (Supabase keeps function logs for debugging).
