/**
 * Finds the WebAssembly files that symbols are extracted with.
 *
 * @module
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Resolves a package's `.wasm` file, such as `tree-sitter-c/tree-sitter-c.wasm`,
 * to a path on disk.
 *
 * A bundled build ships every file it needs in a `wasm` directory next to the
 * bundle, which is used when present; otherwise the file is resolved from
 * `node_modules`, as when running from a checkout.
 *
 * @throws When neither has the file, which a broken install is the only cause of.
 */
export function wasmFile(specifier: string): string {
  const bundled = new URL(`wasm/${basename(specifier)}`, import.meta.url)
  return existsSync(bundled) ? fileURLToPath(bundled) : require.resolve(specifier)
}
