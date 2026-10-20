import { describe, expect, test } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'

import { ndjsonResponse } from '../src/api/ndjson-response'

function tracked(): { calls: string[]; onCancel: () => void; onClose: () => void } {
  const calls: string[] = []
  return { calls, onCancel: () => calls.push('cancel'), onClose: () => calls.push('close') }
}

async function* slow(steps: number, ms: number, calls: string[]): AsyncGenerator<{ n: number }, void> {
  try {
    for (let n = 1; n <= steps; n++) {
      await sleep(ms)
      yield { n }
    }
  } finally {
    calls.push('finally')
  }
}

describe('ndjsonResponse', () => {
  test('sends one line per event, then closes once', async () => {
    const hooks = tracked()
    const response = ndjsonResponse(slow(3, 0, hooks.calls), hooks)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect(await response.text()).toBe('{"n":1}\n{"n":2}\n{"n":3}\n')
    expect(hooks.calls).toEqual(['finally', 'close'])
  })

  test('sends heartbeats while an event is slow', async () => {
    const text = await ndjsonResponse(slow(1, 60, []), { heartbeatMs: 10 }).text()
    const lines = text.trim().split('\n')
    expect(lines.at(-1)).toBe('{"n":1}')
    expect(lines.slice(0, -1).every(line => line === '{"type":"heartbeat"}')).toBe(true)
    expect(lines.length).toBeGreaterThan(2)
  })

  test('a cancel before reading still closes once', async () => {
    const hooks = tracked()
    await ndjsonResponse(slow(3, 0, hooks.calls), hooks).body!.cancel()
    expect(hooks.calls).toEqual(['cancel', 'close'])
  })

  test('a cancel during a slow step closes only once that step is over', async () => {
    const hooks = tracked()
    const reader = ndjsonResponse(slow(3, 150, hooks.calls), { ...hooks, heartbeatMs: 20 }).body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('{"type":"heartbeat"}\n')
    const cancelled = reader.cancel()
    await sleep(60)
    expect(hooks.calls).toEqual(['cancel'])
    await cancelled
    expect(hooks.calls).toEqual(['cancel', 'finally', 'close'])
  })

  test('an iterator that throws fails the body and closes once', async () => {
    const hooks = tracked()
    const broken: AsyncIterator<never, void> = { next: () => Promise.reject(new Error('boom')) }
    await expect(ndjsonResponse(broken, hooks).text()).rejects.toThrow('boom')
    expect(hooks.calls).toEqual(['close'])
  })
})
