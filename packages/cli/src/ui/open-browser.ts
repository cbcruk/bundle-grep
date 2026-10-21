/**
 * Opens a URL in the user's browser.
 *
 * @module
 */

import { Result } from 'better-result'
import { spawn } from 'node:child_process'

/** The command that opens a URL in the default browser on this platform. */
function opener(url: string): string[] {
  if (process.platform === 'darwin') return ['open', url]
  return ['xdg-open', url]
}

/** How long to wait for the opener before assuming it worked and leaving it be. */
const OPENER_WAIT_MS = 3000

/**
 * Opens a URL in the default browser, with `open` on macOS and `xdg-open`
 * elsewhere.
 *
 * Some openers wait for the browser they started, so one still running after
 * a few seconds is left running and counted as a success.
 *
 * @returns Whether the opener started and did not fail; nothing tells whether
 * a browser actually showed the page.
 */
export async function openBrowser(url: string): Promise<boolean> {
  const [command, ...args] = opener(url)
  const spawned = Result.try(() => spawn(command!, args, { stdio: 'ignore' }))
  if (spawned.isErr()) return false
  const child = spawned.value
  const exited = new Promise<boolean>(resolve => {
    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const waited = new Promise<true>(resolve => (timer = setTimeout(resolve, OPENER_WAIT_MS, true)))
  const opened = await Promise.race([exited, waited])
  clearTimeout(timer)
  child.unref()
  return opened
}
