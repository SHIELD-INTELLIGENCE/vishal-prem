import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Verifies the client staff-removal flow.
 *
 * The browser cannot delete a Firebase Authentication user, so the flow must
 * only revoke access and tombstone the Firestore profile, must never report a
 * false success, and must refuse unauthorized or unsafe requests before it
 * writes anything. Firestore is mocked so no project is contacted.
 */

const doc = vi.hoisted(() =>
  vi.fn((_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` })),
)
const updateDoc = vi.hoisted(() => vi.fn())

vi.mock('firebase/firestore', () => ({
  doc,
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc,
  writeBatch: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  firebaseApp: { name: 'test' },
  auth: null,
  db: { name: 'test-db' },
  storage: null,
  firebaseReady: true,
  FirebaseUnavailableError: class FirebaseUnavailableError extends Error {},
  requireDb: () => {
    throw new Error('Firestore is not available in tests')
  },
  requireAuth: () => {
    throw new Error('Authentication is not available in tests')
  },
}))

import { removeStaffAccount } from '@/data/users'
import { defaultPermissionsForRole } from '@/auth/permissions'
import type { UserProfile } from '@/types/models'

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'caller-uid',
    displayName: 'Owner',
    email: 'owner@example.com',
    role: 'super_admin',
    permissions: defaultPermissionsForRole('super_admin'),
    outletIds: [],
    departmentIds: [],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const target = () =>
  profile({ uid: 'target-uid', displayName: 'Staff Member', email: 'staff@example.com', role: 'manager' })

beforeEach(() => {
  doc.mockClear()
  updateDoc.mockReset()
  updateDoc.mockResolvedValue(undefined)
})

describe('removeStaffAccount', () => {
  it('revokes access first, then finalises the profile to a tombstone', async () => {
    await removeStaffAccount({
      actor: profile(),
      target: target(),
      confirmEmail: 'staff@example.com',
      otherActiveSuperAdmins: 0,
    })

    expect(doc).toHaveBeenCalledWith({ name: 'test-db' }, 'users', 'target-uid')
    expect(updateDoc).toHaveBeenCalledTimes(2)

    const [, revokePatch] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(revokePatch).toMatchObject({ active: false, deletionState: 'revoking' })
    expect(revokePatch).not.toHaveProperty('permissions')

    const [, finalizePatch] = updateDoc.mock.calls[1] as [unknown, Record<string, unknown>]
    expect(finalizePatch).toMatchObject({
      active: false,
      deletionState: 'deleted',
      outletIds: [],
      departmentIds: [],
      phone: '',
    })
    expect(
      Object.values(finalizePatch.permissions as Record<string, boolean>).every((value) => value === false),
    ).toBe(true)
  })

  it('never claims the Firebase Authentication account was deleted', async () => {
    const result = await removeStaffAccount({
      actor: profile(),
      target: target(),
      confirmEmail: 'staff@example.com',
      otherActiveSuperAdmins: 0,
    })

    expect(result.authDeleted).toBe(false)
    expect(result.profileRetained).toBe(true)
    expect(result).toMatchObject({ uid: 'target-uid', email: 'staff@example.com', displayName: 'Staff Member' })
  })

  it('refuses a non-Super-Admin caller without writing', async () => {
    await expect(
      removeStaffAccount({
        actor: profile({ role: 'manager', permissions: defaultPermissionsForRole('manager') }),
        target: target(),
        confirmEmail: 'staff@example.com',
        otherActiveSuperAdmins: 1,
      }),
    ).rejects.toThrow(/Super Admin/i)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('refuses self-removal without writing', async () => {
    const actor = profile()
    await expect(
      removeStaffAccount({
        actor,
        target: actor,
        confirmEmail: 'owner@example.com',
        otherActiveSuperAdmins: 1,
      }),
    ).rejects.toThrow(/your own account/i)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('refuses removing the last active Super Admin without writing', async () => {
    await expect(
      removeStaffAccount({
        actor: profile(),
        target: profile({ uid: 'other-owner', email: 'other@example.com' }),
        confirmEmail: 'other@example.com',
        otherActiveSuperAdmins: 0,
      }),
    ).rejects.toThrow(/last active Super Admin/i)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('refuses a confirmation email that does not match the target', async () => {
    await expect(
      removeStaffAccount({
        actor: profile(),
        target: target(),
        confirmEmail: 'wrong@example.com',
        otherActiveSuperAdmins: 0,
      }),
    ).rejects.toThrow(/confirmation email/i)
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('reports a revoke failure as "nothing changed"', async () => {
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(
      removeStaffAccount({
        actor: profile(),
        target: target(),
        confirmEmail: 'staff@example.com',
        otherActiveSuperAdmins: 0,
      }),
    ).rejects.toThrow(/nothing was changed/i)
  })

  it('reports a finalise failure as already-revoked and retryable', async () => {
    updateDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'))
    await expect(
      removeStaffAccount({
        actor: profile(),
        target: target(),
        confirmEmail: 'staff@example.com',
        otherActiveSuperAdmins: 0,
      }),
    ).rejects.toThrow(/retry/i)
  })
})
