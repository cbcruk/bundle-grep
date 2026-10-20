import { describe, expect, test } from 'vitest'

import { targetFromUrl } from '../../src'

describe('targetFromUrl', () => {
  test.each([
    'https://github.com/cbcruk/barlo',
    'https://github.com/cbcruk/barlo.git',
    'https://github.com/cbcruk/barlo/',
    'https://github.com/cbcruk/barlo/tree/main/src',
    'https://github.com/cbcruk/barlo?tab=readme',
    'https://user:token@github.com/cbcruk/barlo.git',
  ])('normalizes the GitHub page %s', url => {
    expect(targetFromUrl(url).unwrap()).toEqual({
      owner: 'cbcruk',
      name: 'barlo',
      url: 'https://github.com/cbcruk/barlo',
    })
  })

  test.each([
    ['git@github.com:cbcruk/barlo.git', 'cbcruk', 'barlo'],
    ['https://example.com/team/app.git#readme', 'team', 'app'],
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
