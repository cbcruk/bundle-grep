/**
 * Writes the licenses of everything the package redistributes.
 *
 * @module
 */

import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

import type { TsdownPlugin } from 'tsdown'

/** Packages shipped outside the JavaScript bundle, such as copied files, by where they resolve from. */
export interface ShippedPackages {
  /** A directory to resolve the packages from, relative to the working directory. */
  from: string
  /** Their names. */
  names: string[]
}

interface Notice {
  name: string
  version: string
  license: string
  text: string
}

function packageDir(id: string): string | undefined {
  return /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1]
}

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

/** Finds the first copyright line in a package's source, type, or CSS files. */
function copyrightIn(dir: string): string | undefined {
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => /\.(m?[jt]s|css|flow)$/.test(name) && !name.includes('node_modules'))
    .slice(0, 200)
  for (const name of files) {
    const line = /Copyright \(c\)[^\n*]*/.exec(readFileSync(join(dir, name), 'utf8'))?.[0]
    if (line) return line.trim()
  }
  return undefined
}

/**
 * The text of a package without a license file: the MIT license under the
 * copyright line its sources carry, when it says MIT and has one.
 */
function fallbackText(dir: string, license: string | undefined): string {
  const copyright = license === 'MIT' ? copyrightIn(dir) : undefined
  return copyright ? `MIT License\n\n${copyright}\n\n${MIT}` : `No license file; package.json says ${license ?? 'nothing'}.`
}

function noticeOf(dir: string): Notice {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string }
  const file = readdirSync(dir).find(name => /^(licen[cs]e|copying)(\.|$)/i.test(name))
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? 'unknown',
    text: file ? readFileSync(join(dir, file), 'utf8').trim() : fallbackText(dir, manifest.license),
  }
}

/**
 * Emits `THIRD_PARTY_LICENSES.md` with the license of every package bundled
 * into the output, plus `shipped` ones that reach the package another way,
 * plus those other builds bundled, as JSON arrays of package directories in
 * the `manifests` files.
 */
export function thirdPartyLicenses(shipped: ShippedPackages[], manifests: string[] = []): TsdownPlugin {
  return {
    name: 'third-party-licenses',
    generateBundle(): void {
      const dirs = new Set<string>()
      for (const id of this.getModuleIds()) {
        const dir = id.startsWith('\0') ? undefined : packageDir(id)
        if (dir) dirs.add(dir)
      }
      for (const { from, names } of shipped) {
        const require = createRequire(join(resolve(from), 'noop.js'))
        for (const name of names) dirs.add(dirname(require.resolve(`${name}/package.json`)))
      }
      for (const manifest of manifests) {
        for (const dir of JSON.parse(readFileSync(resolve(manifest), 'utf8')) as string[]) dirs.add(dir)
      }
      const notices = new Map<string, Notice>()
      for (const dir of dirs) {
        const notice = noticeOf(dir)
        notices.set(`${notice.name}@${notice.version}`, notice)
      }
      const sections = [...notices.values()]
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map(notice => `## ${notice.name} ${notice.version} (${notice.license})\n\n\`\`\`\n${notice.text}\n\`\`\``)
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_LICENSES.md',
        source: `# Third-party licenses\n\nbundle-grep includes the following packages.\n\n${sections.join('\n\n')}\n`,
      })
    },
  }
}
