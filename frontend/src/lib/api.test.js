import { describe, it, expect, afterEach } from 'vitest'
import { server } from '../test/msw/server'
import { http, HttpResponse } from 'msw'
import { getTeams, getSeasons, predictGame, getRatingsSeries } from './api'

const PATH = (p) => `*/api${p}`

afterEach(() => {
  getRatingsSeries.clearCache?.()
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear()
  }
})

describe('lib/api', () => {
  it('getTeams returns list', async () => {
    server.use(http.get(PATH('/teams'), () => HttpResponse.json({ teams: ['A', 'B'] })))
    await expect(getTeams()).resolves.toEqual(['A', 'B'])
  })

  it('getSeasons validates team param and returns seasons', async () => {
    server.use(
      http.get(PATH('/seasons'), ({ request }) => {
        const url = new URL(request.url)
        const team = url.searchParams.get('team')
        if (!team) return HttpResponse.json({ error: 'team required' }, { status: 400 })
        return HttpResponse.json({ team, seasons: [2023, 2022] })
      })
    )
    await expect(getSeasons('Boston Celtics')).resolves.toEqual([2023, 2022])
  })

  it('predictGame returns payload and normalises errors', async () => {
    // Happy path
    server.use(
      http.post(PATH('/predict'), async ({ request }) => {
        const body = await request.json()
        return HttpResponse.json({ ...body, home_win_prob: 0.7, model_version: 'glicko_csv_v1' })
      })
    )
    const ok = await predictGame({ home_team: 'A', home_season: 2021, away_team: 'B', away_season: 2021 })
    expect(ok.home_win_prob).toBeGreaterThan(0)

    // Error path
    server.use(http.post(PATH('/predict'), () => HttpResponse.json({ error: 'boom' }, { status: 400 })))
    await expect(
      predictGame({ home_team: 'A', home_season: 2021, away_team: 'B', away_season: 2021 })
    ).rejects.toThrow('boom')
  })

  it('getRatingsSeries handles normal JSON and sanitises NaN strings', async () => {
    // Normal JSON payload
    server.use(
      http.get(PATH('/ratings/series'), () =>
        HttpResponse.json({ data: [{ date: '2021-01-01', team: 'A', rating: 1500 }] })
      )
    )
    const payload = await getRatingsSeries({ teams: ['A'] })
    expect(payload.data).toEqual([{ date: '2021-01-01', team: 'A', rating: 1500 }])
    expect(payload.aggregates).toBeNull()

    // Return string with NaN token -> should be parsed and NaN replaced with null
    server.use(
      http.get(PATH('/ratings/series'), () =>
        HttpResponse.text('{"data": [{"date":"2021-01-02","team":"B","rating": NaN}]}')
      )
    )
    const payload2 = await getRatingsSeries({ teams: ['B'] })
    expect(payload2.data).toEqual([{ date: '2021-01-02', team: 'B', rating: null }])
  })

  it('getRatingsSeries caches responses for identical params', async () => {
    let calls = 0
    server.use(
      http.get(PATH('/ratings/series'), () => {
        calls += 1
        return HttpResponse.json({ data: [{ date: '2022-01-01', team: 'A', rating: 1600 + calls }] })
      })
    )

    const first = await getRatingsSeries({ teams: ['A'] })
    const second = await getRatingsSeries({ teams: ['A'] })

    expect(calls).toBe(1)
    expect(second).toEqual(first)
  })

  it('getRatingsSeries forceRefresh bypasses the cache', async () => {
    let calls = 0
    server.use(
      http.get(PATH('/ratings/series'), () => {
        calls += 1
        return HttpResponse.json({ data: [{ date: '2022-01-02', team: 'A', rating: 1700 + calls }] })
      })
    )

    const first = await getRatingsSeries({ teams: ['A'] })
    const second = await getRatingsSeries({ teams: ['A'], forceRefresh: true })

    expect(calls).toBe(2)
    expect(second).not.toEqual(first)
  })

  it('rehydrates ratings cache from sessionStorage on reload', async () => {
    if (typeof sessionStorage === 'undefined') return

    sessionStorage.clear()

    let calls = 0
    server.use(
      http.get(PATH('/ratings/series'), () => {
        calls += 1
        return HttpResponse.json({ data: [{ date: '2023-01-01', team: 'A', rating: 1800 }] })
      })
    )

    const first = await getRatingsSeries({ teams: ['A'] })
    expect(calls).toBe(1)

    getRatingsSeries.clearCache({ persist: false })
    getRatingsSeries._hydrateFromStorageForTests?.()

    const second = await getRatingsSeries({ teams: ['A'] })
    expect(calls).toBe(1)
    expect(second).toEqual(first)
  })
})
