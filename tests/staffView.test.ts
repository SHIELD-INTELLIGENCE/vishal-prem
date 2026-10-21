import { describe, expect, it } from 'vitest'
import {
  enabledPermissionCount,
  hasPermissionData,
  idList,
  isDepartmentAdminRole,
  isKnownRole,
  permissionSummary,
  staffDisplayName,
  staffEmail,
  staffRoleLabel,
} from '@/features/admin/staffView'

describe('staffView helpers', () => {
  it('does not crash on a profile with no permission map', () => {
    const legacy = { displayName: 'Legacy', permissions: undefined }
    expect(() => enabledPermissionCount(legacy)).not.toThrow()
    expect(enabledPermissionCount(legacy)).toBe(0)
    expect(hasPermissionData(legacy)).toBe(false)
  })

  it('treats malformed permission data as not configured instead of all-enabled', () => {
    expect(permissionSummary({ permissions: undefined })).toBe('Not configured')
    expect(permissionSummary({ permissions: null })).toBe('Not configured')
    expect(permissionSummary({ permissions: [] })).toBe('Not configured')
    expect(permissionSummary({ permissions: 'yes' })).toBe('Not configured')
  })

  it('counts only explicitly true permissions', () => {
    expect(enabledPermissionCount({ permissions: { dashboardView: true, ordersView: false } })).toBe(1)
    expect(enabledPermissionCount({ permissions: { dashboardView: true, ordersView: 'true' } })).toBe(1)
  })

  it('reports Super Admin as all permissions regardless of map', () => {
    expect(permissionSummary({ role: 'super_admin' })).toBe('All permissions')
    expect(permissionSummary({ role: 'super_admin', permissions: undefined })).toBe('All permissions')
  })

  it('reports a real count when the map exists', () => {
    expect(permissionSummary({ role: 'manager', permissions: { a: true, b: true } })).toBe('2 enabled')
  })

  it('normalises missing id arrays to empty arrays', () => {
    expect(idList({ outletIds: undefined }, 'outletIds')).toEqual([])
    expect(idList({ departmentIds: null }, 'departmentIds')).toEqual([])
    expect(idList({ outletIds: ['a', 2, '', 'b'] }, 'outletIds')).toEqual(['a', 'b'])
  })

  it('renders fallbacks for missing name, email and role', () => {
    expect(staffDisplayName(undefined)).toBe('Unnamed staff')
    expect(staffDisplayName({ displayName: '   ' })).toBe('Unnamed staff')
    expect(staffEmail({})).toBe('No email on file')
    expect(staffRoleLabel(undefined)).toBe('No role assigned')
    expect(staffRoleLabel('not_a_role')).toBe('Unknown role')
    expect(staffRoleLabel('cake_admin')).toBe('Cake Admin')
  })

  it('detects department-admin and known roles safely', () => {
    expect(isDepartmentAdminRole(undefined)).toBe(false)
    expect(isDepartmentAdminRole('cake_admin')).toBe(true)
    expect(isDepartmentAdminRole('manager')).toBe(false)
    expect(isKnownRole('gajak_admin')).toBe(true)
    expect(isKnownRole('ghost')).toBe(false)
    expect(isKnownRole('toString')).toBe(false)
    expect(staffRoleLabel('toString')).toBe('Unknown role')
  })
})
