import { vi } from 'vitest'

// Deploy-hook calls are recorded instead of leaving the machine.
export const hookCalls: string[] = []
;(globalThis as unknown as { __hookCalls: string[] }).__hookCalls = hookCalls
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string | URL) => {
    hookCalls.push(String(url))
    return new Response('{}', { status: 200 })
  }),
)
