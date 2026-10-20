import { serve } from 'srvx'

/** A test server on a free port of 127.0.0.1. */
export interface Listening extends AsyncDisposable {
  /** The port it took. */
  port: number
  /** `http://127.0.0.1:<port>`. */
  origin: string
  /** Closes it and every open connection. */
  close: () => Promise<void>
}

/** Serves a fetch handler on a free port of 127.0.0.1 until closed or disposed. */
export async function listen(fetch: (request: Request) => Response | Promise<Response>): Promise<Listening> {
  const server = await serve({ hostname: '127.0.0.1', port: 0, silent: true, gracefulShutdown: false, fetch }).ready()
  const port = Number(new URL(server.url!).port)
  const close = (): Promise<void> => server.close(true)
  return { port, origin: `http://127.0.0.1:${port}`, close, [Symbol.asyncDispose]: close }
}
