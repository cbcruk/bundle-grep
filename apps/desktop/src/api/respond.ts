/**
 * Builds the API's error responses.
 *
 * @module
 */

import type { WireError } from '../desktop.types'

/** Answers with `{ "error": … }` and a status. */
export function errorResponse(status: number, error: WireError): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
}
