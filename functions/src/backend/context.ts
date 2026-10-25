import {
  canAccessDepartment,
  canAccessOutlet,
  hasPermission,
  normalizePermissionMap,
} from '../../../src/auth/permissions'
import type { PermissionKey, RoleCode, UserProfile } from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { OperationError } from './errors'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Resolves the actor from a UID that has already been verified by the
 * transport. Client-supplied profile, role, outlet or department claims are
 * never trusted.
 */
export async function requireActorByUid(uid: string): Promise<UserProfile> {
  if (!uid) {
    throw new OperationError('unauthenticated', 'Sign in before making this request.')
  }

  const snapshot = await getAdminDb().collection('users').doc(uid).get()
  if (!snapshot.exists) {
    throw new OperationError('permission-denied', 'Your staff profile is not available.')
  }

  const raw = snapshot.data() as Partial<UserProfile> & Record<string, unknown>
  if (
    raw.active !== true
    || typeof raw.role !== 'string'
    || !isStringArray(raw.outletIds)
    || !isStringArray(raw.departmentIds)
  ) {
    throw new OperationError(
      'permission-denied',
      'Your staff profile is inactive or invalid.',
    )
  }

  const role = raw.role as RoleCode
  return {
    ...(raw as UserProfile),
    uid,
    role,
    permissions: normalizePermissionMap(role, raw.permissions, raw),
  }
}

export function requirePermission(profile: UserProfile, permission: PermissionKey): void {
  if (!hasPermission(profile, permission)) {
    throw new OperationError(
      'permission-denied',
      'You do not have permission to perform this action.',
    )
  }
}

export function requireOutletScope(profile: UserProfile, outletId: string): void {
  if (!canAccessOutlet(profile, outletId)) {
    throw new OperationError('permission-denied', 'This outlet is not assigned to you.')
  }
}

export function requireDepartmentScope(profile: UserProfile, departmentId: string): void {
  if (!canAccessDepartment(profile, departmentId)) {
    throw new OperationError('permission-denied', 'This department is not assigned to you.')
  }
}
