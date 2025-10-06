import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock API to avoid network
vi.mock('../lib/api', () => ({
  getRatingsSeries: vi.fn(async () => ({
    data: [
      { date: '2021-12-20', team: 'Boston Celtics', rating: 1500 },
      { date: '2022-04-01', team: 'Boston Celtics', rating: 1520 },
      { date: '2021-12-20', team: 'Los Angeles Lakers', rating: 1510 },
      { date: '2022-04-01', team: 'Los Angeles Lakers', rating: 1530 },
    ],
    total: 4,
    offset: 0,
    limit: null,
    aggregates: {
      seasonPivot: [
        { date: 2021, 'Boston Celtics': 1520, 'Los Angeles Lakers': 1530 },
      ],
      seasonDetail: {
        '2021': {
          label: '21/22',
          rows: [
            {
              seasonKey: '2021',
              date: '2021-12-20',
              timestamp: 1640044800000,
              dayIndex: 1,
              values: {
                'Boston Celtics': 1500,
                'Los Angeles Lakers': 1510,
              },
            },
            {
              seasonKey: '2021',
              date: '2022-04-01',
              timestamp: 1648771200000,
              dayIndex: 2,
              values: {
                'Boston Celtics': 1520,
                'Los Angeles Lakers': 1530,
              },
            },
          ],
          range: [1640044800000, 1648771200000],
        },
        ALL: {
          label: 'All seasons',
          rows: [
            {
              seasonKey: '2021',
              date: '2021-12-20',
              timestamp: 1640044800000,
              dayIndex: 1,
              values: {
                'Boston Celtics': 1500,
                'Los Angeles Lakers': 1510,
              },
            },
            {
              seasonKey: '2021',
              date: '2022-04-01',
              timestamp: 1648771200000,
              dayIndex: 2,
              values: {
                'Boston Celtics': 1520,
                'Los Angeles Lakers': 1530,
              },
            },
          ],
          range: [1640044800000, 1648771200000],
        },
      },
      seasonOptions: [
        { value: 'ALL', label: 'All seasons', range: [1640044800000, 1648771200000] },
        { value: '2021', label: '21/22', range: [1640044800000, 1648771200000] },
      ],
      seasonRange: { min: 2021, max: 2021 },
      detailRange: [1640044800000, 1648771200000],
      teams: ['Boston Celtics', 'Los Angeles Lakers'],
    },
  })),
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
    expect(screen.getByText('Team Ratings Over Time')).toBeInTheDocument()

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
