import { describe, expect, test } from 'bun:test'

import { applySuggestion, suggest, wordAt } from '../../www/src/lib/complete'

const sources = { repos: ['me/app', 'me/lib', 'you/tool'], languages: ['TypeScript', 'Go', 'Common Lisp'] }

function at(query: string, caret = query.length): ReturnType<typeof suggest> {
  const word = wordAt(query, caret)
  return word ? suggest(word, sources) : []
}

describe('wordAt', () => {
  test('is bounded by whitespace and parentheses, and is undefined between words', () => {
    expect(wordAt('foo lang', 8)).toEqual({ start: 4, end: 8, typed: 'lang' })
    expect(wordAt('(repo:me', 8)).toEqual({ start: 1, end: 8, typed: 'repo:me' })
    expect(wordAt('foo language:go bar', 10)).toEqual({ start: 4, end: 15, typed: 'langua' })
    expect(wordAt('foo ', 4)).toBeUndefined()
  })
})

describe('suggest', () => {
  test('qualifier names for a bare word', () => {
    expect(at('la').map(s => s.label)).toEqual(['language:'])
    expect(at('sym').map(s => s.label)).toEqual(['symbol:'])
    expect(at('x -re')).toEqual([{ label: 'repo:', insert: '-repo:', complete: false }])
    expect(at('zzz')).toEqual([])
  })

  test('values for a qualifier, prefix matches before substring matches', () => {
    expect(at('repo:').map(s => s.label)).toEqual(['me/app', 'me/lib', 'you/tool'])
    expect(at('repo:l').map(s => s.label)).toEqual(['me/lib', 'you/tool'])
    expect(at('repo:y').map(s => s.label)).toEqual(['you/tool'])
    expect(at('language:co')).toEqual([{ label: 'Common Lisp', insert: 'language:"Common Lisp"', complete: true }])
    expect(at('language:"co').map(s => s.label)).toEqual(['Common Lisp'])
    expect(at('org:').map(s => s.label)).toEqual(['me', 'you'])
    expect(at('is:f').map(s => s.label)).toEqual(['fork'])
    expect(at('path:s')).toEqual([])
  })

  test('a value typed in full is not suggested again', () => {
    expect(at('language:go')).toEqual([])
  })
})

describe('applySuggestion', () => {
  test('replaces the whole word and moves the caret past a completed qualifier', () => {
    const query = 'x langu y'
    const word = wordAt(query, 4)!
    expect(applySuggestion(query, word, { label: 'language:', insert: 'language:', complete: false })).toEqual({
      query: 'x language: y',
      caret: 11,
    })
    const value = wordAt('x language:t', 12)!
    expect(applySuggestion('x language:t', value, { label: 'TypeScript', insert: 'language:TypeScript', complete: true })).toEqual({
      query: 'x language:TypeScript ',
      caret: 22,
    })
  })
})
