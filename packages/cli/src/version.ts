/**
 * The version of `bundle-grep`, read from the CLI's package manifest.
 *
 * @module
 */

import manifest from '../package.json' with { type: 'json' }

/** The CLI's version, which a release tag must match as `v<version>`. */
export const VERSION: string = manifest.version
