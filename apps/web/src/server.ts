import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export { configure } from './server/web-config.server'
export type { WebConfig } from './server/web-config.types'

/** The built server: Start's handler, with {@linkcode configure} beside it for the host to call first. */
export default createServerEntry({ fetch: request => handler.fetch(request) })
