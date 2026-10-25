// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { PermissionMap, UserProfile } from '@/types/models'

/**
 * Route-level tests for the public/admin split.
 *
 * The authentication and workspace contexts are replaced with controllable
 * stubs, and the heavy pages are stubbed so a path can be rendered and asserted
 * without touching Firebase. The guards, route tree and workspace gate are the
 * real implementations, so this exercises the actual separation.
 */

const authState = vi.hoisted(() => ({
  current: {
    status: 'signed_out',
    profile: null as UserProfile | null,
    configMissing: false,
    firebaseUser: null as { uid: string; email: string | null } | null,
    signIn: async () => {},
    signOut: async () => {},
  },
}))

vi.mock('@/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => authState.current,
}))

const workspaceState = vi.hoisted(() => ({
  current: {
    business: null as { id: string } | null,
    outlets: [] as unknown[],
    departments: [] as unknown[],
    selectedOutletId: null as string | null,
    selectedOutlet: null,
    setSelectedOutletId: () => {},
    loading: false,
    error: null as string | null,
    reload: () => {},
    sidebarCollapsed: false,
    setSidebarCollapsed: () => {},
    allowedOutlets: () => [],
  },
}))

vi.mock('@/auth/WorkspaceProvider', () => ({
  WorkspaceProvider: ({ children }: { children: ReactNode }) => children,
  useWorkspace: () => workspaceState.current,
}))

// Keep the real Firebase SDK out of the test environment.
vi.mock('@/lib/firebase', () => ({
  firebaseApp: null,
  auth: null,
  db: null,
  storage: null,
  firebaseReady: false,
  FirebaseUnavailableError: class FirebaseUnavailableError extends Error {},
  requireDb: () => {
    throw new Error('Firestore is not available in tests')
  },
  requireAuth: () => {
    throw new Error('Authentication is not available in tests')
  },
}))

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-shell">{children}</div>
  ),
}))

vi.mock('@/features/dashboard/DashboardPage', () => ({
  DashboardPage: () => <div>ADMIN DASHBOARD</div>,
}))
vi.mock('@/features/orders/OrdersPage', () => ({ OrdersPage: () => <div>ORDERS LIST</div> }))
vi.mock('@/features/orders/OrderFormPage', () => ({ OrderFormPage: () => <div>ORDER FORM</div> }))
vi.mock('@/features/auth/LoginPage', () => ({
  LoginPage: () => {
    const location = useLocation()
    const state = location.state as
      | { from?: { pathname?: string; search?: string } }
      | null
    const from = state?.from ? `${state.from.pathname ?? ''}${state.from.search ?? ''}` : ''
    return <div>ADMIN LOGIN{from ? ` from=${from}` : ''}</div>
  },
}))

import { AppRoutes } from '@/App'

function makePermissions(value: boolean): PermissionMap {
  return {
    dashboardView: value,
    outletsManage: value,
    departmentsManage: value,
    productsView: value,
    productsManage: value,
    inventoryView: value,
    inventoryManage: value,
    inventoryAdjust: value,
    customersView: value,
    customersManage: value,
    ordersView: value,
    ordersManage: value,
    ordersCancel: value,
    bookingsView: value,
    bookingsManage: value,
    paymentsView: value,
    paymentsManage: value,
    productionView: value,
    productionManage: value,
    deliveryView: value,
    deliveryManage: value,
    financeView: value,
    financeManage: value,
    reportsView: value,
    usersManage: value,
    settingsManage: value,
    busyView: value,
    labelsView: value,
    labelsManage: value,
    labelsReconcile: value,
    purchasesView: value,
    purchasesManage: value,
  }
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'owner-uid',
    displayName: 'Owner',
    email: 'owner@example.com',
    role: 'super_admin',
    permissions: makePermissions(false),
    outletIds: [],
    departmentIds: [],
    active: true,
    phone: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function signIn() {
  authState.current.status = 'ready'
  authState.current.profile = makeProfile()
  workspaceState.current.business = { id: 'main' }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  authState.current.status = 'signed_out'
  authState.current.profile = null
  authState.current.configMissing = false
  authState.current.firebaseUser = null
  workspaceState.current.business = null
  workspaceState.current.loading = false
  workspaceState.current.error = null
})

afterEach(cleanup)

describe('public / admin route separation', () => {
  it('renders the public landing at / and not the admin dashboard', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /cakes, sweets and fresh bakes/i })).toBeTruthy()
    expect(screen.queryByTestId('admin-shell')).toBeNull()
    expect(screen.queryByText('ADMIN DASHBOARD')).toBeNull()
  })

  it('renders the protected dashboard at /admin for an authenticated Super Admin', () => {
    signIn()
    renderAt('/admin')
    expect(screen.getByTestId('admin-shell')).toBeTruthy()
    expect(screen.getByText('ADMIN DASHBOARD')).toBeTruthy()
    expect(screen.queryByText('ADMIN LOGIN')).toBeNull()
  })

  it('renders nested admin routes on direct navigation', () => {
    signIn()
    renderAt('/admin/orders')
    expect(screen.getByTestId('admin-shell')).toBeTruthy()
    expect(screen.getByText('ORDERS LIST')).toBeTruthy()
  })

  it('renders deeper nested admin routes on direct navigation', () => {
    signIn()
    renderAt('/admin/orders/new')
    expect(screen.getByTestId('admin-shell')).toBeTruthy()
    expect(screen.getByText('ORDER FORM')).toBeTruthy()
  })

  it('redirects an unauthenticated admin deep link to the admin sign-in', () => {
    renderAt('/admin/orders')
    expect(screen.getByText('ADMIN LOGIN from=/admin/orders')).toBeTruthy()
    expect(screen.queryByTestId('admin-shell')).toBeNull()
    expect(screen.queryByText('ORDERS LIST')).toBeNull()
  })

  it('preserves the intended destination, including its query string, for post-login return', () => {
    renderAt('/admin/orders?status=pending')
    expect(screen.getByText('ADMIN LOGIN from=/admin/orders?status=pending')).toBeTruthy()
  })

  it('enforces the per-route permission guard for a signed-in staff member', () => {
    authState.current.status = 'ready'
    authState.current.profile = makeProfile({ role: 'accountant', permissions: makePermissions(false) })
    workspaceState.current.business = { id: 'main' }
    renderAt('/admin/orders')
    expect(screen.getByText(/do not have access/i)).toBeTruthy()
    expect(screen.queryByText('ORDERS LIST')).toBeNull()
  })

  it('shows the in-workspace 404 for an unknown admin path', () => {
    signIn()
    renderAt('/admin/not-a-page')
    expect(screen.getByText('Page not found')).toBeTruthy()
  })
})
