import { describe, expect, it } from 'vitest'
import { PERMISSION_KEYS as APP_PERMISSION_KEYS, PERMISSIONS } from '@/auth/permissions'
import {
  ALL_PERMISSIONS,
  PERMISSION_KEYS as SCRIPT_PERMISSION_KEYS,
  buildSuperAdminProfile,
  isWellFormedSuperAdmin,
} from '../scripts/lib/access.mjs'

describe('bootstrap access definition', () => {
  it('matches the application permission catalogue exactly', () => {
    expect([...SCRIPT_PERMISSION_KEYS].sort()).toEqual([...APP_PERMISSION_KEYS].sort())
    expect([...SCRIPT_PERMISSION_KEYS].sort()).toEqual([...PERMISSIONS.map((entry) => entry.key)].sort())
  })

  it('grants every permission and nothing else', () => {
    expect(Object.keys(ALL_PERMISSIONS).sort()).toEqual([...APP_PERMISSION_KEYS].sort())
    for (const key of APP_PERMISSION_KEYS) {
      expect(ALL_PERMISSIONS[key]).toBe(true)
    }
  })
})

describe('buildSuperAdminProfile', () => {
  const profile = buildSuperAdminProfile({
    uid: 'uid-12345678',
    email: ' Owner@Example.COM ',
    displayName: '  ',
    outletIds: ['o1', 'o1', 'o2'],
    now: '2026-10-01T10:00:00.000Z',
  }) as Record<string, unknown>

  it('produces the Super Admin role and active state', () => {
    expect(profile.role).toBe('super_admin')
    expect(profile.active).toBe(true)
    expect(profile.uid).toBe('uid-12345678')
    expect(profile.departmentIds).toEqual([])
  })

  it('normalises the email and de-duplicates outlets', () => {
    expect(profile.email).toBe('owner@example.com')
    expect(profile.outletIds).toEqual(['o1', 'o2'])
  })

  it('falls back to a sensible display name', () => {
    expect(profile.displayName).toBe('Super Admin')
  })

  it('never contains a password or credential field', () => {
    const keys = Object.keys(profile).map((key) => key.toLowerCase())
    for (const forbidden of ['password', 'passwd', 'secret', 'token', 'privatekey', 'apikey']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false)
    }
  })

  it('passes its own integrity check', () => {
    expect(isWellFormedSuperAdmin(profile)).toBe(true)
  })
})

describe('isWellFormedSuperAdmin rejects unsafe documents', () => {
  const valid = buildSuperAdminProfile({
    uid: 'u1',
    email: 'a@b.com',
    displayName: 'A',
    outletIds: ['o1'],
    now: '2026-10-01T10:00:00.000Z',
  })

  it('rejects a non-Super-Admin role', () => {
    expect(isWellFormedSuperAdmin({ ...valid, role: 'manager' })).toBe(false)
    expect(isWellFormedSuperAdmin({ ...valid, role: 'cake_admin' })).toBe(false)
  })

  it('rejects an inactive or malformed document', () => {
    expect(isWellFormedSuperAdmin({ ...valid, active: false })).toBe(false)
    expect(isWellFormedSuperAdmin({ ...valid, outletIds: 'o1' })).toBe(false)
    expect(isWellFormedSuperAdmin({ ...valid, departmentIds: undefined })).toBe(false)
    expect(isWellFormedSuperAdmin(null)).toBe(false)
  })

  it('rejects a partial or over-broad permission map', () => {
    const partial = { ...valid, permissions: { ...(valid.permissions as Record<string, boolean>) } }
    delete (partial.permissions as Record<string, boolean>).usersManage
    expect(isWellFormedSuperAdmin(partial)).toBe(false)

    const overbroad = {
      ...valid,
      permissions: { ...(valid.permissions as Record<string, boolean>), extra: true },
    }
    expect(isWellFormedSuperAdmin(overbroad)).toBe(false)
  })

  it('rejects a permission explicitly set to false', () => {
    expect(
      isWellFormedSuperAdmin({
        ...valid,
        permissions: { ...(valid.permissions as Record<string, boolean>), usersManage: false },
      }),
    ).toBe(false)
  })
})
