import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import DashboardHome from './DashboardHome'

describe('DashboardHome page', () => {
  const renderWithRouter = () => {
    render(
      <MemoryRouter initialEntries={['/dashboardhome']}>
        <DashboardHome />
      </MemoryRouter>,
    )
  }

  it('renders the dashboard hero with navigation tabs', () => {
    renderWithRouter()

    expect(screen.getByText('Statistics Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Discover NBA data interactively')).toBeInTheDocument()
    expect(screen.getByText('Move from league-wide signals to focused breakdowns with a single gesture.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/dashboardhome')
    expect(screen.getByRole('link', { name: 'Shot Chart' })).toHaveAttribute('href', '/dashboardshotchart')
  })

  it('shows the momentum and spotlight cards', () => {
    renderWithRouter()

    expect(screen.getAllByText('Shot Charts').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Drivers of Ratings').length).toBeGreaterThan(0)
    expect(screen.getAllByText('League Trends').length).toBeGreaterThan(0)
  })
})
