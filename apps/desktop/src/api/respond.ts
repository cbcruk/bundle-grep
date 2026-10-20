/**
 * Builds the API's JSON responses.
 *
 * @module
 */

import type { WireError } from '../desktop.types'

/** Answers with `{ "error": … }` and a status. */
export function errorResponse(status: number, error: WireError): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
}

/** Answers `200` with a value as JSON. */
export function jsonResponse(value: unknown): Response {
  return Response.json(value, { headers: { 'cache-control': 'no-store' } })
}
