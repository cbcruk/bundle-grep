import { createFileRoute } from '@tanstack/react-router'

import { redeemSession } from '../server/guard.server'
import { webState } from '../server/web-config.server'

/** `GET /session?code=…`: trades this run's one-time code for the session cookie. */
export const Route = createFileRoute('/session')({
  server: { handlers: { GET: ({ request }) => redeemSession(request, webState()) } },
})
