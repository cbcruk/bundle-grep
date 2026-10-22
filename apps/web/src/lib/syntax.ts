/**
 * Colors code lines by syntax with `@pierre/highlights`.
 *
 * @module
 */

import { codeToTokens, isSupportedLanguage, type Lang, type Theme, type ThemedToken } from '@pierre/highlights'
import type { CSSProperties } from 'react'

import type { SyntaxToken } from './syntax.types'

/** Lines this long or longer stay one uncolored run, which keeps minified files from flooding the page with elements. */
const MAX_LINE_LENGTH = 1000

/** The color the palette gives text no scope claims, which is left to inherit. */
const FOREGROUND = 'var(--color-syntax-foreground)'

/** Maps highlighter scopes to the Astryx theme's `--color-syntax-*` tokens, so code follows the theme and its color scheme. */
const astryxSyntax: Theme = {
  name: 'Astryx',
  appearance: 'light',
  style: {
    syntax: {
      attribute: 'attribute',
      boolean: 'constant',
      comment: 'comment',
      constant: 'constant',
      constructor: 'type',
      enum: 'type',
      function: 'function',
      keyword: 'keyword',
      label: 'property',
      link_uri: 'string',
      namespace: 'type',
      number: 'number',
      operator: 'operator',
      preproc: 'keyword',
      property: 'property',
      punctuation: 'punctuation',
      selector: 'tag',
      string: 'string',
      'string.escape': 'constant',
      tag: 'tag',
      'text.literal': 'string',
      title: 'keyword',
      type: 'type',
      variable: 'variable',
    },
  },
  cssVariables: { prefix: '--color-syntax-' },
}

function tokenStyle(token: ThemedToken): CSSProperties | undefined {
  const style: CSSProperties = {}
  if (token.color && token.color !== FOREGROUND) style.color = token.color
  if (token.fontStyle && token.fontStyle & 1) style.fontStyle = 'italic'
  if (token.fontStyle && token.fontStyle & 2) style.fontWeight = 'bold'
  return Object.keys(style).length > 0 ? style : undefined
}

/**
 * Picks the grammar for a file: its Linguist language name, then its
 * extension, then its whole name, as for `Dockerfile` or `Makefile`.
 *
 * @param path The file's path in the repository.
 * @param language The Linguist language name the search reported, if any.
 * @returns The grammar, or `undefined` when the highlighter has none for the file.
 */
export function syntaxLanguage(path: string, language?: string): Lang | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const candidates = [language?.toLowerCase().replace(/\s+/g, '-'), name.slice(name.lastIndexOf('.') + 1), name]
  return candidates.find((candidate): candidate is Lang => candidate !== undefined && isSupportedLanguage(candidate))
}

/**
 * Splits consecutive lines into syntax-colored runs.
 *
 * The lines are tokenized together, so a comment or string that spans lines
 * keeps its color on each of them.
 *
 * @param lines Consecutive lines of one file, without line terminators.
 * @param lang The grammar from {@linkcode syntaxLanguage}.
 * @returns Each line's runs, or `undefined` without a grammar or when the highlighter fails.
 */
export function syntaxTokens(lines: readonly string[], lang: Lang | undefined): SyntaxToken[][] | undefined {
  if (!lang) return undefined
  try {
    const { tokens } = codeToTokens(lines.join('\n'), { lang, theme: astryxSyntax, tokenizeMaxLineLength: MAX_LINE_LENGTH })
    if (tokens.length !== lines.length) return undefined
    return tokens.map(line => line.map(token => ({ text: token.content, style: tokenStyle(token) })))
  } catch {
    return undefined
  }
}
