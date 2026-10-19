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
 * CSS. A `<!--` in a script changes how the HTML parser finds its end, and
 * has no escape that is safe everywhere in JavaScript, so it fails the
 * build. So does anything left over — a file the HTML still points at, or a
 * chunk or asset that was not inlined — since only the HTML is embedded.
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
            if (output.code.includes('<!--')) this.error(`${fileName} contains "<!--", which cannot be inlined safely`)
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
      const left = Object.keys(bundle).filter(fileName => !fileName.endsWith('.html'))
      if (left.length > 0) this.error(`Files were not inlined, so the embedded UI would miss them: ${left.join(', ')}`)
    },
  }
}
