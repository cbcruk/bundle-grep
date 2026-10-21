import { createRouter } from '@tanstack/react-router'

import { parseSearchString, stringifySearchObject } from './lib/route'
import { routeTree } from './routeTree.gen'

/** The app's router type, which `Register` makes every route API see. */
export type AppRouter = ReturnType<typeof createRouter<typeof routeTree>>

/**
 * Makes the app's router, once per request on the server and once in the page.
 *
 * Search parameters are plain strings, as `URLSearchParams` reads them, so a
 * query such as `"exact phrase"` or `123` stays the text that was typed.
 */
export function getRouter(): AppRouter {
  return createRouter({
    routeTree,
    parseSearch: parseSearchString,
    stringifySearch: stringifySearchObject,
    defaultPreload: false,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
