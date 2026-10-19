/**
 * A Vite plugin that folds the built scripts and stylesheets into
 * `index.html`, so the UI is one file the desktop app can embed.
 *
 * @module
 */

import type { Plugin } from 'vite'

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Inlines every emitted chunk and stylesheet into the HTML that references
 * it, then drops them from the bundle.
 *
 * A `</script` or `</style` inside the inlined code would end its element
 * early, so it is escaped; `<\/` means the same in JavaScript strings and
 * CSS. The build fails if the HTML still points at a file afterwards.
 */
export function inlineBundle(): Plugin {
  return {
    name: 'bundle-grep:inline-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle): void {
      for (const html of Object.values(bundle)) {
        if (html.type !== 'asset' || !html.fileName.endsWith('.html')) continue
        let source = String(html.source)
        for (const [fileName, output] of Object.entries(bundle)) {
          const reference = `"[^"]*${escapeRegex(fileName)}"`
          if (output.type === 'chunk') {
            const tag = new RegExp(`<script\\b[^>]*\\bsrc=${reference}[^>]*></script>`)
            if (!tag.test(source)) continue
            const code = output.code.replace(/<\/script/gi, '<\\/script')
            source = source.replace(tag, () => `<script type="module">${code}</script>`)
            delete bundle[fileName]
          } else if (fileName.endsWith('.css')) {
            const tag = new RegExp(`<link\\b[^>]*\\bhref=${reference}[^>]*>`)
            if (!tag.test(source)) continue
            const css = String(output.source).replace(/<\/style/gi, '<\\/style')
            source = source.replace(tag, () => `<style>${css}</style>`)
            delete bundle[fileName]
          }
        }
        const left = /<(?:script|link)\b[^>]*\b(?:src|href)="[^"]*"/.exec(source)
        if (left) this.error(`${html.fileName} still references a file after inlining: ${left[0]}`)
        html.source = source
      }
    },
  }
}
