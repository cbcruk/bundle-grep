/**
 * Types for loading a file.
 *
 * @module
 */

import type { WireError } from '../api/api.types'

/** A file being loaded, or what came of it. */
export type BlobState =
  | {
      /** The request is in flight. */
      status: 'loading'
    }
  | {
      /** The file is text. */
      status: 'text'
      /** Its lines, without line terminators. */
      lines: string[]
    }
  | {
      /** The file is binary, so it is not shown. */
      status: 'binary'
      /** Its size in bytes. */
      size: number
    }
  | {
      /** The file could not be read: missing, too large, or the request failed. */
      status: 'error'
      /** Why. */
      error: WireError
    }
