import { describe, it, expect, vi } from 'vitest'

describe('lib/api env baseURL', () => {
  it('uses VITE_API_BASE_URL when provided', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test/api')
    const mod = await import('./api')
    expect(mod.api.defaults.baseURL).toBe('https://example.test/api')
    vi.unstubAllEnvs()
  })
})

