/**
 * Reads newline-delimited JSON as it arrives.
 *
 * @module
 */

/**
 * Yields each line of a byte stream parsed as JSON, skipping blank lines.
 *
 * Stopping early cancels the stream, which is how a search is abandoned. A
 * line that is not JSON, or a stream that fails, throws.
 */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) if (line.trim() !== '') yield JSON.parse(line)
    }
    finished = true
    buffer += decoder.decode()
    if (buffer.trim() !== '') yield JSON.parse(buffer)
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined)
  }
}
