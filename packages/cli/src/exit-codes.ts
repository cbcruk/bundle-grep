/**
 * The exit codes every command shares, following `grep`.
 *
 * @module
 */

/** Exit codes: `ok` for success, `none` for no matches or a partial failure, `error` for unusable input or a failed run. */
export const EXIT = { ok: 0, none: 1, error: 2 } as const
