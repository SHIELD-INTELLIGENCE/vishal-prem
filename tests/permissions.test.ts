import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  canAccessDepartment,
  canAccessOutlet,
  defaultPermissionsForRole,
  hasPermission,
  isDepartmentAdmin,
  isSuperAdmin,
  roleDefinition,
  scopedDepartments,
} from '@/auth/permissions'
import type { Department, UserProfile } from '@/types/models'

const BASE_DEPARTMENT: Department = {
  id: 'dept-cake',
  code: 'cake',
  name: 'Cake',
  outletIds: ['outlet-1', 'outlet-2'],
  color: '#C8102E',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'user-1',
    displayName: 'Test User',
    email: 'test@example.com',
    role: 'cake_admin',
    permissions: defaultPermissionsForRole('cake_admin'),
    outletIds: ['outlet-1'],
    departmentIds: ['dept-cake'],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('role permissions', () => {
  it('gives the Super Admin every permission regardless of stored flags', () => {
    const admin = profile({ role: 'super_admin', permissions: {} as UserProfile['permissions'] })
    expect(hasPermission(admin, 'usersManage')).toBe(true)
    expect(hasPermission(admin, 'settingsManage')).toBe(true)
    expect(isSuperAdmin(admin)).toBe(true)
  })

  it('rejects inactive profiles even when permissions are set', () => {
    const inactive = profile({ permissions: { ...ALL_PERMISSIONS }, active: false })
    expect(hasPermission(inactive, 'ordersView')).toBe(false)
    expect(isSuperAdmin(inactive)).toBe(false)
    expect(canAccessOutlet(inactive, 'outlet-1')).toBe(false)
  })

  it('honours explicit permission flags for non-admin roles', () => {
    const manager = profile({ role: 'manager', permissions: defaultPermissionsForRole('manager') })
    expect(hasPermission(manager, 'ordersManage')).toBe(true)
    expect(hasPermission(manager, 'usersManage')).toBe(false)
    expect(hasPermission(manager, 'settingsManage')).toBe(false)
  })

  it('does not grant department admins staff or catalogue-wide authority', () => {
    const cake = profile()
    expect(hasPermission(cake, 'ordersManage')).toBe(true)
    expect(hasPermission(cake, 'usersManage')).toBe(false)
    expect(hasPermission(cake, 'outletsManage')).toBe(false)
    expect(isDepartmentAdmin(cake)).toBe(true)
  })

  it('defines a label and permission map for every role', () => {
    expect(roleDefinition('hot_admin').label).toBe('Hot Section Admin')
    expect(defaultPermissionsForRole('accountant').paymentsManage).toBe(true)
    expect(defaultPermissionsForRole('accountant').productsManage).toBe(false)
  })

  it('does not grant stock adjustment to ordinary catalogue managers by default', () => {
    expect(defaultPermissionsForRole('super_admin').inventoryAdjust).toBe(true)
    expect(defaultPermissionsForRole('manager').inventoryAdjust).toBe(false)
    expect(defaultPermissionsForRole('cake_admin').inventoryAdjust).toBe(false)
    expect(defaultPermissionsForRole('accountant').inventoryAdjust).toBe(false)
  })
})

describe('outlet and department scope', () => {
  it('limits non-admins to assigned outlets', () => {
    const cake = profile()
    expect(canAccessOutlet(cake, 'outlet-1')).toBe(true)
    expect(canAccessOutlet(cake, 'outlet-2')).toBe(false)
    expect(canAccessOutlet(profile({ role: 'super_admin' }), 'outlet-2')).toBe(true)
  })

  it('limits non-admins to assigned departments', () => {
    expect(canAccessDepartment(profile(), 'dept-cake')).toBe(true)
    expect(canAccessDepartment(profile(), 'dept-sweets')).toBe(false)
    expect(canAccessDepartment(profile({ role: 'super_admin' }), 'dept-sweets')).toBe(true)
    expect(canAccessDepartment(profile(), undefined)).toBe(false)
  })

  it('treats managers and accountants as outlet-wide across departments', () => {
    const manager = profile({ role: 'manager', permissions: defaultPermissionsForRole('manager') })
    const accountant = profile({ role: 'accountant', permissions: defaultPermissionsForRole('accountant') })
    expect(canAccessDepartment(manager, 'dept-sweets')).toBe(true)
    expect(canAccessDepartment(accountant, 'dept-sweets')).toBe(true)
    expect(canAccessDepartment(profile(), 'dept-sweets')).toBe(false)
  })

  it('filters departments by outlet, active state and profile scope', () => {
    const departments: Department[] = [
      BASE_DEPARTMENT,
      { ...BASE_DEPARTMENT, id: 'dept-sweets', code: 'sweets', name: 'Sweets' },
      { ...BASE_DEPARTMENT, id: 'dept-gajak', code: 'gajak', name: 'Gajak', active: false },
      { ...BASE_DEPARTMENT, id: 'dept-other', code: 'other', name: 'Other', outletIds: ['outlet-2'] },
    ]

    expect(scopedDepartments(profile(), departments, 'outlet-1').map((item) => item.id)).toEqual(['dept-cake'])
    expect(scopedDepartments(profile({ role: 'super_admin' }), departments, 'outlet-1').map((item) => item.id)).toEqual([
      'dept-cake',
      'dept-sweets',
    ])
    expect(
      scopedDepartments(
        profile({ role: 'manager', permissions: defaultPermissionsForRole('manager') }),
        departments,
        'outlet-1',
      ).map((item) => item.id),
    ).toEqual(['dept-cake', 'dept-sweets'])
    expect(scopedDepartments(profile(), departments, 'outlet-3')).toEqual([])
  })
})
