import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const pickerSpy = vi.fn()

vi.mock('../components/PlayerSeasonPicker', () => ({
  __esModule: true,
  default: (props) => {
    pickerSpy(props)
    return <div data-testid="mock-picker">picker:{props.measure}</div>
  },
}))

import DashboardHome from './DashboardHome'

describe('DashboardHome page', () => {
beforeEach(() => {
  pickerSpy.mockClear()
})

afterEach(() => {
  cleanup()
  pickerSpy.mockClear()
})

  it('renders header and passes default measure to picker', () => {
    render(<DashboardHome />)

    expect(screen.getByText('Player Shot Data')).toBeInTheDocument()
    expect(screen.getByTestId('mock-picker')).toHaveTextContent('picker:FGA')
    expect(pickerSpy).toHaveBeenCalled()
    const props = pickerSpy.mock.calls.at(-1)?.[0]
    expect(props?.measure).toBe('FGA')
  })

  it('updates measure selection and forwards it to picker', async () => {
    const user = userEvent.setup()
    render(<DashboardHome />)

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'FG3M')

    const props = pickerSpy.mock.calls.at(-1)?.[0]
    expect(props?.measure).toBe('FG3M')
    expect(screen.getByTestId('mock-picker')).toHaveTextContent('picker:FG3M')
  })
})
