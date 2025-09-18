import { describe, it, expect } from 'vitest'
import { server } from '../test/msw/server'
import { http, HttpResponse } from 'msw'
import { getRatingsSeries } from './api'

describe('lib/api params', () => {
  it('encodes teams as comma-separated query param', async () => {
    server.use(
      http.get('*/api/ratings/series', ({ request }) => {
        const url = new URL(request.url)
        const teams = url.searchParams.get('teams')
        if (teams !== 'A,B') {
          return HttpResponse.json({ error: `unexpected teams param: ${teams}` }, { status: 400 })
        }
        return HttpResponse.json({ data: [] })
      })
    )
    await expect(getRatingsSeries({ teams: ['A', 'B'] })).resolves.toEqual([])
  })
})

