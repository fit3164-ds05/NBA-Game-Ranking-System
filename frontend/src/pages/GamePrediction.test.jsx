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
      model_version: 'glicko_csv_v1',
      models: {
        elo: {
          label: 'Ratings (logistic)',
          home_win_prob: 0.6,
          predicted_margin: 1.2,
          home_rating: 1530,
          away_rating: 1500,
          margin_sigma: 8.4,
          win_prob_from_margin: 0.62,
        },
      },
      available_models: ['elo'],
      head_to_head: {
        scope: 'historical',
        home_team,
        away_team,
        home_season,
        away_season,
        total_games: 3,
        home_wins: 1,
        away_wins: 2,
        average_margin: -4.5,
        note: 'Most recent meetings',
        recent_games: [
          {
            date: '2022-01-01',
            home_team,
            away_team,
            home_score: 102,
            away_score: 110,
            margin_for_home: -8,
          },
        ],
      },
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
      expect(screen.getByText(/Classifier win probability/i)).toBeInTheDocument()
      expect(screen.getByText('60%')).toBeInTheDocument()
      expect(screen.getAllByText(/Confidence/i)[0]).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
      expect(screen.getAllByText(/margin favours/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/Margin win probability/i)).toBeInTheDocument()
      expect(screen.getByText(/How to interpret/i)).toBeInTheDocument()
      expect(screen.getByText(/Head-to-head/i)).toBeInTheDocument()
      expect(screen.getByText(/Model bundle glicko_csv_v1/i)).toBeInTheDocument()
    })
  })
})
