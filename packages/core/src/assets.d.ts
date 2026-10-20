/**
 * Module types for the files Bun imports by attribute.
 *
 * @module
 */

declare module '*.wasm' {
  /** The file's path, or its embedded path in a compiled binary, from `with { type: "file" }`. */
  const path: string
  export default path
}

declare module '*.scm' {
  /** The file's contents, from `with { type: "text" }`. */
  const text: string
  export default text
}
