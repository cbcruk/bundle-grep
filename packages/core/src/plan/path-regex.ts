/**
 * Turns `path:` values and bare terms into regular expression sources for
 * matching file paths.
 *
 * @module
 */

/** Escapes every character that is special in a JavaScript regular expression. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Converts an unquoted `path:` value to a regex source, following GitHub.
 *
 * - Without `*` or `?` it is a substring match.
 * - `*` matches within one path segment, `?` one character other than `/`, and
 *   `**` any number of segments. A glob must match up to the end of the path.
 * - A leading `/` anchors the match to the start of the path; otherwise it may
 *   start anywhere.
 *
 * @example Converting an anchored glob
 * ```ts
 * import { globToRegex } from "./path-regex";
 *
 * globToRegex("/src/**\/*.js"); // "^src/(?:.*\/)?[^/]*\\.js$"
 * ```
 */
export function globToRegex(glob: string): string {
  const anchored = glob.startsWith('/')
  const body = anchored ? glob.slice(1) : glob
  const prefix = anchored ? '^' : ''
  if (!/[*?]/.test(body)) return prefix + escapeRegex(body)

  let source = ''
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char === '*' && body[i + 1] === '*') {
      const segment = body[i + 2] === '/'
      source += segment ? '(?:.*/)?' : '.*'
      i += segment ? 2 : 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegex(char)
    }
  }
  return `${prefix + source}$`
}
