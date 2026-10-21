/**
 * Types for turning iterators into streams.
 *
 * @module
 */

/** Options for {@linkcode iteratorStream}. */
export interface IteratorStreamOptions {
  /** Runs when the reader cancels the stream, before the iterator is ended. */
  onCancel?: () => void
  /** Runs once when the iterator is over, however it ended. */
  onClose?: () => void
}
