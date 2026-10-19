import { describe, expect, test } from 'bun:test'

import { targetFromUrl } from '../../src'

describe('targetFromUrl', () => {
  test.each([
    ['https://github.com/cbcruk/barlo', 'cbcruk', 'barlo'],
    ['https://github.com/cbcruk/barlo.git', 'cbcruk', 'barlo'],
    ['https://github.com/cbcruk/barlo/', 'cbcruk', 'barlo'],
    ['git@github.com:cbcruk/barlo.git', 'cbcruk', 'barlo'],
    ['ssh://git@example.com:2222/team/app.git', 'team', 'app'],
    ['/home/me/src/app', 'src', 'app'],
    ['file:///srv/git/team/app.git', 'team', 'app'],
  ])('%s', (url, owner, name) => {
    expect(targetFromUrl(url).unwrap()).toEqual({ owner, name, url })
  })

  test.each(['https://github.com/', 'app', 'git@github.com:app.git'])('rejects %s', url => {
    const result = targetFromUrl(url)
    expect(result.isErr() && result.error._tag).toBe('InvalidRepoNameError')
  })
})
