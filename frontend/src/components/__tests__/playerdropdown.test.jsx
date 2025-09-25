import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, beforeEach, expect, vi } from 'vitest'

vi.mock('../../lib/api', () => ({
  searchPlayers: vi.fn(),
}))

import { searchPlayers } from '../../lib/api'
import PlayerDropdown from '../PlayerDropdown'

describe('PlayerDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries and displays player suggestions', async () => {
    searchPlayers.mockResolvedValue([
      { playerId: 23, name: 'LeBron James', team: 'Los Angeles Lakers', active: true },
    ])

    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PlayerDropdown season="2024-25" onSelect={onSelect} />)

    const input = screen.getAllByPlaceholderText('Search player...')[0]
    await user.type(input, 'Leb')

    const option = await screen.findByRole('option', { name: /LeBron James/ })
    await user.click(option)

    expect(searchPlayers).toHaveBeenCalledWith('Leb', '2024-25')
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 23, name: 'LeBron James' })
    )
  })

  it('shows a no results message when nothing matches', async () => {
    searchPlayers.mockResolvedValue([])

    const user = userEvent.setup()
    render(<PlayerDropdown season="2024-25" />)

    const input = screen.getAllByPlaceholderText('Search player...')[0]
    await user.type(input, 'xyz')

    expect(await screen.findByText('No results')).toBeInTheDocument()
  })
})
