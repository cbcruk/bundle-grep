/**
 * Turns async iterators into streams a server function can return.
 *
 * @module
 */

import type { IteratorStreamOptions } from './iterator-stream.types'

/**
 * Streams an iterator's values, one per pull, so that nothing runs ahead of
 * the reader.
 *
 * Cancelling the stream, which happens when the page stops reading or the
 * connection closes, calls `onCancel` and then ends the iterator, so its
 * `finally` blocks run once its current step is over. A value the iterator
 * throws errors the stream. `onClose` runs once the iterator is over,
 * however it ended, even when the stream is cancelled before the first pull.
 */
export function iteratorStream<T>(iterator: AsyncIterator<T, void>, options: IteratorStreamOptions = {}): ReadableStream<T> {
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    try {
      await iterator.return?.()
    } finally {
      options.onClose?.()
    }
  }
  return new ReadableStream<T>(
    {
      async pull(controller): Promise<void> {
        try {
          const next = await iterator.next()
          if (!next.done) return controller.enqueue(next.value)
          await close()
          controller.close()
        } catch (error) {
          await close().catch(() => undefined)
          controller.error(error)
        }
      },
      async cancel(): Promise<void> {
        options.onCancel?.()
        await close()
      },
    },
    { highWaterMark: 0 },
  )
}
