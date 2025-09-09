import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { server } from './msw/server'

// Extend expect with jest-dom matchers for Vitest
expect.extend(matchers)

// Start MSW before all tests. Individual tests can add handlers via server.use(...)
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Minimal ResizeObserver polyfill for libraries that expect it (e.g., Recharts ResponsiveContainer)
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
if (typeof global.ResizeObserver === 'undefined') {
  // @ts-ignore
  global.ResizeObserver = RO
}
