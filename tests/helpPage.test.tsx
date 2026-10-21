// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HelpPage } from '@/features/help/HelpPage'

/**
 * Interaction tests for the Help centre.
 *
 * The Help centre is the only place where business policy, permissions and
 * known gaps are explained to staff, so the navigation behaviour matters as
 * much as the content: search must filter, training paths must open real
 * articles, unresolved workflows must be visibly marked, and the search box
 * must be reachable by the global "/" shortcut.
 */

vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ profile: { role: 'super_admin', displayName: 'Test Owner' } }),
}))

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

function renderHelp(entry = '/admin/help') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/admin/help" element={<HelpPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Help centre', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  })

  afterEach(() => {
    cleanup()
  })

  it('lists the guide index with the training paths', () => {
    renderHelp()
    expect(screen.getByRole('heading', { name: 'Help centre' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Training paths' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Start with / }).length).toBeGreaterThan(0)
  })

  it('exposes the search box to the global slash shortcut', () => {
    const { container } = renderHelp()
    const search = container.querySelector('[data-search-input]')
    expect(search).toBeTruthy()
    expect(search?.getAttribute('id')).toBe('help-search')
  })

  it('filters guides with the search box', async () => {
    const user = userEvent.setup()
    const { container } = renderHelp()
    const input = container.querySelector('[data-search-input]') as HTMLInputElement

    await user.type(input, 'cash session')

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('guide')
    expect(status.textContent).toContain('matching')
    expect(screen.getAllByText('Open and close a cash session').length).toBeGreaterThan(0)
    expect(screen.queryByText('Create and maintain products')).toBeNull()
  })

  it('opens an article from a training path and shows its prerequisites', async () => {
    const user = userEvent.setup()
    renderHelp()

    const buttons = screen.getAllByRole('button', { name: 'Open and close a cash session' })
    await user.click(buttons[0])

    expect(screen.getByRole('heading', { name: 'Open and close a cash session', level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Before you start' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Step by step' })).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toContain('article=cash-sessions')
  })

  it('marks unresolved workflows as still unresolved', async () => {
    const user = userEvent.setup()
    renderHelp('/admin/help?article=delivery-reconciliation')

    expect(screen.getByRole('heading', { name: 'Still unresolved' })).toBeTruthy()
    expect(screen.getAllByText(/pending reconciliation/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'All guides' }))
    expect(screen.getByRole('heading', { name: 'Help centre' })).toBeTruthy()
  })

  it('returns to the guide index from an article', async () => {
    const user = userEvent.setup()
    renderHelp('/admin/help?article=orders')

    expect(screen.getByRole('heading', { name: 'Create an order', level: 1 })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to all guides' }))

    expect(screen.getByRole('heading', { name: 'Help centre' })).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/admin/help')
  })
})
