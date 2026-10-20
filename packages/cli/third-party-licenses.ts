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

function noticeOf(dir: string): Notice {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string }
  const file = readdirSync(dir).find(name => /^(licen[cs]e|copying)(\.|$)/i.test(name))
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? 'unknown',
    text: file ? readFileSync(join(dir, file), 'utf8').trim() : `No license file; package.json says ${manifest.license ?? 'nothing'}.`,
  }
}

/**
 * Emits `THIRD_PARTY_LICENSES.md` with the license of every package bundled
 * into the output, plus `shipped` ones that reach the package another way.
 */
export function thirdPartyLicenses(shipped: ShippedPackages[]): TsdownPlugin {
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
