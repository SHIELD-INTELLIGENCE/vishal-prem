import { hasPermission } from '../../../src/auth/permissions'
import type { PermissionKey, UserProfile } from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { requireOutletScope } from './context'
import { OperationError } from './errors'
import type { StaffDirectoryInput } from './validation'

export interface StaffDirectoryEntry {
  uid: string
  displayName: string
  role: string
  departmentIds: string[]
}

/**
 * Minimal, permission-checked staff directory for assignment controls. It
 * deliberately omits email, permissions and other profile fields.
 */
export async function staffDirectoryForActor(
  profile: UserProfile,
  input: StaffDirectoryInput,
): Promise<StaffDirectoryEntry[]> {
  const assignPermissions: PermissionKey[] = [
    'productionManage',
    'deliveryManage',
    'financeManage',
    'usersManage',
  ]
  const allowed = assignPermissions.some((permission) => hasPermission(profile, permission))
  if (!allowed) {
    throw new OperationError('permission-denied', 'You do not have permission to assign work.')
  }
  requireOutletScope(profile, input.outletId)
  const snapshot = await getAdminDb().collection('users').limit(300).get()
  return snapshot.docs
    .map((item) => ({ ...(item.data() as UserProfile), uid: item.id }))
    .filter((staff) => staff.active === true && staff.outletIds?.includes(input.outletId))
    .filter((staff) => !input.departmentId || ['super_admin', 'manager', 'accountant'].includes(staff.role) || staff.departmentIds?.includes(input.departmentId))
    .map((staff) => ({
      uid: staff.uid,
      displayName: staff.displayName?.trim() || staff.email || staff.uid,
      role: staff.role,
      departmentIds: [...(staff.departmentIds ?? [])],
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en-IN'))
}
