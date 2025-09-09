import { setupServer } from 'msw/node'

// Create a singleton MSW server for tests. Tests can import and use `server.use(...)`.
export const server = setupServer()

