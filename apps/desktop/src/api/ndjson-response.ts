/**
 * Streams events as newline-delimited JSON, with heartbeats.
 *
 * @module
 */

import type { NdjsonResponseOptions } from '../desktop.types'

/**
 * How long a stream may go quiet before a heartbeat line is sent, in milliseconds.
 *
 * Bun closes a connection that sends nothing for 10 seconds, and a regex over
 * a large archive, or a fetch of a large repository, can take longer than that.
 */
export const DEFAULT_HEARTBEAT_MS = 5000

const HEARTBEAT = lineOf({ type: 'heartbeat' })

function lineOf(event: unknown): string {
  return `${JSON.stringify(event)}\n`
}

/**
 * Answers with one JSON line per event, read from the iterator as the client
 * reads the body.
 *
 * A `{"type":"heartbeat"}` line is sent whenever no event came for
 * `heartbeatMs`, so the connection is not closed as idle; readers skip it.
 * Cancelling the body calls `onCancel` and then ends the iterator. `onClose`
 * runs once, after the last line, a failure, or a cancel — including a
 * cancel before the iterator was ever started. After a cancel it waits for the
 * iterator to finish its current step, so work behind a lock is really over.
 *
 * @example Streaming a generator
 * ```ts
 * import { ndjsonResponse } from "@bundle-grep/desktop";
 *
 * async function* count(): AsyncGenerator<{ n: number }, void> {
 *   for (let n = 1; n <= 3; n++) yield { n };
 * }
 *
 * const response = ndjsonResponse(count(), { onClose: () => console.log("done") });
 * ```
 *
 * `await response.text()` is `{"n":1}`, `{"n":2}` and `{"n":3}`, one per line.
 */
export function ndjsonResponse<T>(events: AsyncIterator<T, void>, options: NdjsonResponseOptions = {}): Response {
  const { heartbeatMs = DEFAULT_HEARTBEAT_MS, onCancel, onClose } = options
  const encoder = new TextEncoder()
  let pending: Promise<IteratorResult<T, void>> | undefined
  let closed = false
  let cancelling = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const close = (): void => {
    if (closed) return
    closed = true
    onClose?.()
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      pending ??= events.next()
      const beat = new Promise<'heartbeat'>(resolve => (timer = setTimeout(resolve, heartbeatMs, 'heartbeat')))
      try {
        const next = await Promise.race([pending, beat])
        if (cancelling) return
        if (next === 'heartbeat') {
          controller.enqueue(encoder.encode(HEARTBEAT))
          return
        }
        pending = undefined
        if (next.done) {
          controller.close()
          close()
        } else {
          controller.enqueue(encoder.encode(lineOf(next.value)))
        }
      } catch (error) {
        if (cancelling) return
        close()
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
    async cancel(): Promise<void> {
      cancelling = true
      clearTimeout(timer)
      onCancel?.()
      try {
        await events.return?.(undefined)
      } finally {
        close()
      }
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}
