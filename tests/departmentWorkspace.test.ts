import { describe, expect, it } from 'vitest'
import {
  canAccessDepartment,
  defaultPermissionsForRole,
  scopedDepartments,
} from '@/auth/permissions'
import type { Department, RoleCode, UserProfile } from '@/types/models'

const DEPARTMENTS: Department[] = [
  { code: 'cake', name: 'Cake' },
  { code: 'sweets', name: 'Sweets' },
  { code: 'hot', name: 'Hot Section / Patties' },
  { code: 'gajak', name: 'Gajak' },
].map(({ code, name }, index) => ({
  id: `dept-${code}`,
  code,
  name,
  outletIds: ['outlet-1', 'outlet-2'],
  color: ['#C8102E', '#C8922C', '#2F6F4E', '#8A5A2B'][index] ?? '#C8102E',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}))

function profile(role: RoleCode, departmentIds: string[]): UserProfile {
  return {
    uid: `user-${role}`,
    displayName: role,
    email: `${role}@example.com`,
    role,
    permissions: defaultPermissionsForRole(role),
    outletIds: ['outlet-1'],
    departmentIds,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function scopedCodes(current: UserProfile, outletId = 'outlet-1'): string[] {
  return scopedDepartments(current, DEPARTMENTS, outletId).map((department) => department.code)
}

describe('department workspace scoping', () => {
  it('gives each department admin exactly its own workspace', () => {
    expect(scopedCodes(profile('cake_admin', ['dept-cake']))).toEqual(['cake'])
    expect(scopedCodes(profile('sweets_admin', ['dept-sweets']))).toEqual(['sweets'])
    expect(scopedCodes(profile('hot_admin', ['dept-hot']))).toEqual(['hot'])
    expect(scopedCodes(profile('gajak_admin', ['dept-gajak']))).toEqual(['gajak'])
  })

  it('never leaks another department through the scope helper', () => {
    const cake = profile('cake_admin', ['dept-cake'])
    expect(canAccessDepartment(cake, 'dept-cake')).toBe(true)
    expect(canAccessDepartment(cake, 'dept-sweets')).toBe(false)
    expect(canAccessDepartment(cake, 'dept-hot')).toBe(false)
    expect(canAccessDepartment(cake, 'dept-gajak')).toBe(false)
  })

  it('keeps Super Admin cross-department oversight', () => {
    expect(scopedCodes(profile('super_admin', []))).toEqual(['cake', 'sweets', 'hot', 'gajak'])
  })

  it('keeps outlet managers outlet-wide but still outlet-bound', () => {
    const manager = profile('manager', [])
    expect(scopedCodes(manager)).toEqual(['cake', 'sweets', 'hot', 'gajak'])
    expect(scopedCodes(manager, 'outlet-3')).toEqual([])
  })

  it('returns no workspace when the profile has no department scope', () => {
    expect(scopedCodes(profile('cake_admin', []))).toEqual([])
  })
})
