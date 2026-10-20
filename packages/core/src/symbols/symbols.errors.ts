/**
 * The ways building a symbol index can fail besides git itself failing.
 *
 * @module
 */

import { TaggedError } from 'better-result'

/** tree-sitter or one of its grammars could not be loaded. */
export class SymbolParserError extends TaggedError('SymbolParserError')<{
  /** Human-readable summary, suitable for showing the user. */
  readonly message: string
}> {}
