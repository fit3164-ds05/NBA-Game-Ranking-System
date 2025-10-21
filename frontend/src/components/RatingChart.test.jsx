import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock API to avoid network
vi.mock('../lib/api', () => ({
  getRatingsSeries: vi.fn(async () => [
    { date: '2021-12-20', team: 'Boston Celtics', rating: 1500 },
    { date: '2022-04-01', team: 'Boston Celtics', rating: 1520 },
    { date: '2021-12-20', team: 'Los Angeles Lakers', rating: 1510 },
    { date: '2022-04-01', team: 'Los Angeles Lakers', rating: 1530 },
  ]),
  getSeasonalRatings: vi.fn(async () => [
    { season: '2020/21', team: 'Boston Celtics', rating: 1485 },
    { season: '2020/21', team: 'Los Angeles Lakers', rating: 1495 },
    { season: '2021/22', team: 'Boston Celtics', rating: 1520 },
    { season: '2021/22', team: 'Los Angeles Lakers', rating: 1530 },
  ]),
}))

import RatingChart from './RatingChart'

describe('RatingChart', () => {
  it('renders chart container with data and no empty message', async () => {
    render(
      <RatingChart
        teams={["Boston Celtics", "Los Angeles Lakers"]}
        selectedYear={2022}
        highlightedTeams={["Boston Celtics"]}
      />
    )

    // Heading present
    expect(screen.getByText('Seasonal Historical Ratings')).toBeInTheDocument()

    // Wait for data load to settle
    await waitFor(() => {
      // container should be present even if jsdom doesn't render ticks
      expect(document.querySelector('.recharts-responsive-container')).toBeTruthy()
    })

    // Should not show the empty-state message
    expect(
      screen.queryByText('No rating data available for selected teams.')
    ).not.toBeInTheDocument()
  })
})
