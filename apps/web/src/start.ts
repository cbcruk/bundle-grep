import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

import { guardRequest } from './server/guard.server'
import { webConfig } from './server/web-config.server'

const guard = createMiddleware().server(({ request, next }) => {
  const refused = guardRequest(request, webConfig())
  if (refused) return refused
  setResponseHeader('cache-control', 'no-store')
  setResponseHeader('referrer-policy', 'no-referrer')
  setResponseHeader('x-frame-options', 'DENY')
  setResponseHeader('x-content-type-options', 'nosniff')
  return next()
})

const csrf = createCsrfMiddleware({ filter: context => context.handlerType === 'serverFn' })

/** The app's request middleware: the guard on every request, then the CSRF check on server functions. */
export const startInstance = createStart(() => ({ requestMiddleware: [guard, csrf] }))
