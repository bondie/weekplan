import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

const calls: Array<{ url: string; init: RequestInit }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  })
})

const headersOf = (init: RequestInit) => new Headers(init.headers as HeadersInit)

describe('request headers', () => {
  it('omits the JSON content type when there is no body', async () => {
    // Fastify answers 500 to an empty body with a JSON content type, which broke every
    // DELETE and body-less POST in the UI.
    await api.hideIssue('WEEK-1')
    expect(headersOf(calls[0].init).has('content-type')).toBe(false)
  })

  it('omits it for DELETE too', async () => {
    await api.deleteAssignment('abc', '2026-08-10')
    expect(headersOf(calls[0].init).has('content-type')).toBe(false)
  })

  it('sends the JSON content type when there is a body', async () => {
    await api.createAssignment({ issueKey: 'WEEK-1', date: '2026-08-12' }, '2026-08-10')
    expect(headersOf(calls[0].init).get('content-type')).toBe('application/json')
  })
})
