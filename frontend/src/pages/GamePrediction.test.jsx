import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock API layer via hoisted factory
vi.mock('../lib/api', () => {
  return {
    getTeams: vi.fn(async () => ['Boston Celtics', 'Los Angeles Lakers']),
    getSeasons: vi.fn(async (team) => (team === 'Boston Celtics' ? [2022, 2021] : [2021, 2020])),
    getRatingsSeries: vi.fn(async () => []),
    predictGame: vi.fn(async ({ home_team, home_season, away_team, away_season }) => ({
      inputs: { home_team, home_season, away_team, away_season },
      home_rating: 1530,
      away_rating: 1500,
      rating_diff: 30,
      home_win_prob: 0.6,
      predicted_margin: 1.2,
      model_version: 'glicko_csv_v1',
    })),
  }
})

import GamePrediction from './GamePrediction'
import { getSeasons as getSeasonsMock, predictGame as predictGameMock } from '../lib/api'

describe('GamePrediction page', () => {
  it('walks happy path: loads teams, selects seasons, predicts and shows result', async () => {
    render(<GamePrediction />)

    // Initial loading indicator
    expect(screen.getByText(/Loading teams/i)).toBeInTheDocument()

    // Wait for teams to load and form to render
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('Away')).toBeInTheDocument()
    })

    // Two team selects
    const teamSelects = screen.getAllByLabelText('Team')
    expect(teamSelects.length).toBe(2)

    // Trigger seasons fetch by focusing season selects (teams are prefilled)
    // After teams load, component fetches seasons — await their options to appear
    await waitFor(() => {
      expect(getSeasonsMock).toHaveBeenCalled()
    })

    // Select seasons in each card
    const seasonSelects = screen.getAllByLabelText('Season')
    await userEvent.selectOptions(seasonSelects[0], '2022') // home
    await userEvent.selectOptions(seasonSelects[1], '2021') // away

    // Submit prediction
    await userEvent.click(screen.getByRole('button', { name: /Predict/i }))

    await waitFor(() => {
      expect(predictGameMock).toHaveBeenCalled()
      expect(screen.getByText(/Home win probability 60 percent/i)).toBeInTheDocument()
      expect(screen.getByText(/Model version glicko_csv_v1/i)).toBeInTheDocument()
    })
  })
})
