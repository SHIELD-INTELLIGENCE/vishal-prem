import { describe, expect, it } from 'vitest'
import {
  countOtherActiveSuperAdmins,
  evaluateStaffRemoval,
  isActiveSuperAdmin,
  staffFinalizePatch,
  staffRevokePatch,
  type StaffRemovalActor,
  type StaffRemovalContext,
  type StaffRemovalTarget,
} from '@/data/staffRemoval'
import { isDeletedStaff } from '@/features/admin/staffView'
import { PERMISSION_KEYS } from '@/auth/permissions'

const owner: StaffRemovalActor = {
  uid: 'caller-uid',
  role: 'super_admin',
  active: true,
}

const staff: StaffRemovalTarget = {
  uid: 'target-uid',
  role: 'manager',
  active: true,
  email: 'staff@example.com',
  displayName: 'Target Staff',
}

function context(overrides: Partial<StaffRemovalContext> = {}): StaffRemovalContext {
  return {
    actor: owner,
    target: staff,
    confirmEmail: 'staff@example.com',
    otherActiveSuperAdmins: 0,
    ...overrides,
  }
}

describe('evaluateStaffRemoval', () => {
  it('rejects an unauthenticated caller', () => {
    const result = evaluateStaffRemoval(context({ actor: null }))
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' })
  })

  it('rejects an inactive caller', () => {
    const result = evaluateStaffRemoval(context({ actor: { ...owner, active: false } }))
    expect(result).toMatchObject({ ok: false, code: 'permission-denied' })
  })

  it('rejects a non-super-admin caller', () => {
    const result = evaluateStaffRemoval(context({ actor: { ...owner, role: 'manager' } }))
    expect(result).toMatchObject({ ok: false, code: 'permission-denied' })
  })

  it('rejects self-removal even for a Super Admin', () => {
    const result = evaluateStaffRemoval(
      context({
        target: owner,
        confirmEmail: 'owner@example.com',
        otherActiveSuperAdmins: 1,
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'failed-precondition' })
    if (!result.ok) expect(result.message).toMatch(/your own account/i)
  })

  it('rejects a target profile that no longer exists', () => {
    const result = evaluateStaffRemoval(context({ target: null }))
    expect(result).toMatchObject({ ok: false, code: 'not-found' })
  })

  it('rejects a profile that has already been removed', () => {
    const result = evaluateStaffRemoval(
      context({ target: { ...staff, deletionState: 'deleted' } }),
    )
    expect(result).toMatchObject({ ok: false, code: 'failed-precondition' })
    if (!result.ok) expect(result.message).toMatch(/already been removed/i)
  })

  it('rejects a confirmation email that does not match the stored profile', () => {
    const result = evaluateStaffRemoval(context({ confirmEmail: 'someone-else@example.com' }))
    expect(result).toMatchObject({ ok: false, code: 'failed-precondition' })
    if (!result.ok) expect(result.message).toMatch(/confirmation email/i)
  })

  it('matches the confirmation email case-insensitively and trims it', () => {
    expect(evaluateStaffRemoval(context({ confirmEmail: '  STAFF@Example.com ' }))).toEqual({ ok: true })
  })

  it('allows removing an ordinary staff member', () => {
    expect(evaluateStaffRemoval(context())).toEqual({ ok: true })
  })

  it('skips the email check when the stored profile has no email', () => {
    const result = evaluateStaffRemoval(
      context({ target: { ...staff, email: undefined }, confirmEmail: 'anything@example.com' }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects removing the last active Super Admin', () => {
    const result = evaluateStaffRemoval(
      context({
        target: { ...owner, uid: 'other-owner', email: 'other@example.com' },
        confirmEmail: 'other@example.com',
        otherActiveSuperAdmins: 0,
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'failed-precondition' })
    if (!result.ok) expect(result.message).toMatch(/last active Super Admin/i)
  })

  it('allows removing a Super Admin when another active one remains', () => {
    const result = evaluateStaffRemoval(
      context({
        target: { ...owner, uid: 'other-owner', email: 'other@example.com' },
        confirmEmail: 'other@example.com',
        otherActiveSuperAdmins: 1,
      }),
    )
    expect(result).toEqual({ ok: true })
  })
})

describe('staff removal helpers', () => {
  it('treats only an active super_admin profile as authorised', () => {
    expect(isActiveSuperAdmin(owner)).toBe(true)
    expect(isActiveSuperAdmin({ ...owner, active: false })).toBe(false)
    expect(isActiveSuperAdmin({ ...owner, role: 'cake_admin' })).toBe(false)
    expect(isActiveSuperAdmin(null)).toBe(false)
  })

  it('counts only other active Super Admins', () => {
    const rows = [
      { uid: 'target-uid', role: 'super_admin', active: true },
      { uid: 'other-owner', role: 'super_admin', active: true },
      { uid: 'suspended-owner', role: 'super_admin', active: false },
      { uid: 'tombstoned-owner', role: 'super_admin', active: false },
      { uid: 'manager', role: 'manager', active: true },
    ]
    expect(countOtherActiveSuperAdmins(rows, 'target-uid')).toBe(1)
    expect(countOtherActiveSuperAdmins(rows, 'other-owner')).toBe(1)
    expect(countOtherActiveSuperAdmins([{ uid: 'only', role: 'super_admin', active: true }], 'only')).toBe(0)
  })

  it('detects a deleted tombstone profile', () => {
    expect(isDeletedStaff({ deletionState: 'deleted' })).toBe(true)
    expect(isDeletedStaff({ deletionState: 'revoking' })).toBe(false)
    expect(isDeletedStaff({})).toBe(false)
    expect(isDeletedStaff(null)).toBe(false)
  })

  it('revokes access without touching permissions or scope', () => {
    const patch = staffRevokePatch('2026-01-01T00:00:00.000Z', 'caller-uid')
    expect(patch).toMatchObject({
      active: false,
      deletionState: 'revoking',
      deletionRequestedAt: '2026-01-01T00:00:00.000Z',
      deletionRequestedBy: 'caller-uid',
      updatedBy: 'caller-uid',
    })
    expect(patch).not.toHaveProperty('permissions')
    expect(patch).not.toHaveProperty('outletIds')
  })

  it('finalises the profile to a disabled tombstone', () => {
    const patch = staffFinalizePatch('2026-01-01T00:00:00.000Z', 'caller-uid')
    expect(patch).toMatchObject({
      active: false,
      deletionState: 'deleted',
      deletedAt: '2026-01-01T00:00:00.000Z',
      deletedBy: 'caller-uid',
      outletIds: [],
      departmentIds: [],
      phone: '',
    })
    expect(Object.keys(patch.permissions)).toHaveLength(PERMISSION_KEYS.length)
    expect(Object.values(patch.permissions).every((value) => value === false)).toBe(true)
  })
})
