import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, beforeEach, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({
  searchPlayers: vi.fn(),
  getPlayerSeasons: vi.fn(),
  getPlayerShots: vi.fn(),
}))

import { searchPlayers, getPlayerSeasons, getPlayerShots } from '../../lib/api'
import PlayerSeasonPicker from '../PlayerSeasonPicker'

function primeApiMocks() {
  searchPlayers.mockResolvedValue([
    { playerId: 23, name: 'LeBron James', active: true, team: 'Los Angeles Lakers' },
  ])
  getPlayerSeasons.mockResolvedValue(['2024-25', '2023-24'])
  getPlayerShots.mockResolvedValue({
    playerId: 23,
    season: '2024-25',
    measure: 'FGA',
    teamId: 0,
    count: 1,
    shots: [{ x: 0, y: 0, made: 1 }],
  })
}

describe('PlayerSeasonPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads seasons and shots after selecting a player', async () => {
    primeApiMocks()
    const onComplete = vi.fn()
    const user = userEvent.setup()

    render(<PlayerSeasonPicker defaultSeason="2024-25" onComplete={onComplete} />)

    const input = screen.getAllByPlaceholderText('Search player...')[0]
    await user.type(input, 'LeBron')

    const option = await screen.findByRole('option', { name: /LeBron James/i })
    await user.click(option)

    await waitFor(() => expect(getPlayerSeasons).toHaveBeenCalledWith(23, { onlyWithGames: true }))
    await waitFor(() => expect(getPlayerShots).toHaveBeenCalledWith(23, '2024-25', { teamId: 0 }))

    expect(await screen.findByText('1 shots loaded.')).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledWith({
      player: expect.objectContaining({ name: 'LeBron James', playerId: 23 }),
      season: '2024-25',
      shots: expect.objectContaining({ count: 1 }),
    })
  })

  it('surfaces an error message when shot retrieval fails', async () => {
    searchPlayers.mockResolvedValue([
      { playerId: 23, name: 'LeBron James', active: true, team: 'Los Angeles Lakers' },
    ])
    getPlayerSeasons.mockResolvedValue(['2024-25'])
    getPlayerShots.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()

    render(<PlayerSeasonPicker defaultSeason="2024-25" />)

    const input = screen.getAllByPlaceholderText('Search player...')[0]
    await user.type(input, 'LeBron')

    const option = await screen.findByRole('option', { name: /LeBron James/i })
    await user.click(option)

    expect(await screen.findByText('Failed to load shot chart.')).toBeInTheDocument()
    expect(getPlayerShots).toHaveBeenCalled()
  })
})
