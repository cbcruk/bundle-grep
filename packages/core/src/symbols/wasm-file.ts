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

let resolver: ((specifier: string) => string) | undefined

/**
 * Makes {@linkcode wasmFile} ask `resolve` instead of looking for itself.
 *
 * A bundle that carries its own copy of this package, such as the web app's
 * server, is not next to the `wasm` directory and has no `node_modules`; the
 * program that loads it hands over its own `wasmFile` so that both find the
 * same files.
 *
 * @example Sharing the host's WebAssembly files
 * ```ts
 * import { setWasmResolver, wasmFile } from "@bundle-grep/core";
 *
 * setWasmResolver(wasmFile);
 * ```
 */
export function setWasmResolver(resolve: (specifier: string) => string): void {
  resolver = resolve === wasmFile ? undefined : resolve
}

/**
 * Resolves a package's `.wasm` file, such as `tree-sitter-c/tree-sitter-c.wasm`,
 * to a path on disk.
 *
 * A bundled build ships every file it needs in a `wasm` directory next to the
 * bundle, which is used when present; otherwise the file is resolved from
 * `node_modules`, as when running from a checkout. A resolver set with
 * {@linkcode setWasmResolver} takes precedence over both.
 *
 * @throws When neither has the file, which a broken install is the only cause of.
 */
export function wasmFile(specifier: string): string {
  if (resolver) return resolver(specifier)
  const bundled = new URL(`wasm/${basename(specifier)}`, import.meta.url)
  return existsSync(bundled) ? fileURLToPath(bundled) : require.resolve(specifier)
}
