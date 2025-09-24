import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'

import YearDropdown from '../YearDropdown'

afterEach(() => {
  cleanup()
})

describe('YearDropdown', () => {
  it('renders provided years and calls onChange', async () => {
    const changeSpy = vi.fn()
    const user = userEvent.setup()

    render(
      <YearDropdown
        years={['2024-25', '2023-24']}
        value=""
        onChange={changeSpy}
        label="Season"
      />
    )

    const select = screen.getAllByRole('combobox')[0]
    await user.selectOptions(select, '2023-24')
    expect(changeSpy).toHaveBeenCalledWith('2023-24')
  })

  it('disables select when loading', () => {
    render(<YearDropdown years={['2024-25']} loading={true} />)

    const select = screen.getAllByRole('combobox')[0]
    expect(select).toBeDisabled()
    expect(screen.getByText('Loading seasons...')).toBeInTheDocument()
  })
})
