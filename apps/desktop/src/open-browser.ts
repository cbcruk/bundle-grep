/**
 * Opens a URL in the user's browser.
 *
 * @module
 */

import { Result } from 'better-result'

/** The command that opens a URL in the default browser on this platform. */
function opener(url: string): string[] {
  if (process.platform === 'darwin') return ['open', url]
  return ['xdg-open', url]
}

/**
 * Opens a URL in the default browser, with `open` on macOS and `xdg-open`
 * elsewhere.
 *
 * @returns Whether the opener ran and exited with 0; nothing tells whether a
 * browser actually showed the page.
 */
export async function openBrowser(url: string): Promise<boolean> {
  const spawned = Result.try(() => Bun.spawn(opener(url), { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }))
  if (spawned.isErr()) return false
  return (await spawned.value.exited) === 0
}
