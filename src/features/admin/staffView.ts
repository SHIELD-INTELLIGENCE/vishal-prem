import { ROLE_LABELS } from '@/auth/permissions'
import type { RoleCode } from '@/types/models'

/**
 * Lightweight, defensive views over a staff profile.
 *
 * Firestore documents are not schema-enforced: a legacy or manually created
 * profile can legally omit `permissions`, `outletIds` or `departmentIds`.
 * The UI must survive that instead of throwing. These helpers never grant a
 * permission and never treat missing data as "all enabled".
 */
export interface StaffLike {
  displayName?: unknown
  email?: unknown
  permissions?: unknown
  outletIds?: unknown
  departmentIds?: unknown
  role?: string | null
  active?: boolean
  deletionState?: unknown
}

/**
 * A profile marked deleted by the Super Admin staff-removal flow. It is
 * retained as a tombstone for audit attribution, not shown as an active staff
 * member.
 */
export function isDeletedStaff(staff: StaffLike | null | undefined): boolean {
  return staff?.deletionState === 'deleted'
}

export function staffDisplayName(staff: StaffLike | null | undefined): string {
  const value = staff?.displayName
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unnamed staff'
}

export function staffEmail(staff: StaffLike | null | undefined): string {
  const value = staff?.email
  return typeof value === 'string' && value.trim() ? value.trim() : 'No email on file'
}

export function hasPermissionData(staff: StaffLike | null | undefined): boolean {
  const value = staff?.permissions
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function enabledPermissionCount(staff: StaffLike | null | undefined): number {
  if (!hasPermissionData(staff)) return 0
  const permissions = staff?.permissions as Record<string, unknown>
  return Object.values(permissions).filter((value) => value === true).length
}

export function idList(staff: StaffLike | null | undefined, key: 'outletIds' | 'departmentIds'): string[] {
  const value = staff?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export function staffRoleLabel(role: string | null | undefined): string {
  if (!role) return 'No role assigned'
  if (!isKnownRole(role)) return 'Unknown role'
  return ROLE_LABELS[role]
}

export function isDepartmentAdminRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && role.endsWith('_admin')
}

/**
 * Human-readable permission summary. A profile with no permission map is
 * reported as "Not configured" rather than "0 enabled" or, worse, "all".
 */
export function permissionSummary(staff: StaffLike | null | undefined): string {
  if (staff?.role === 'super_admin') return 'All permissions'
  if (!hasPermissionData(staff)) return 'Not configured'
  return `${enabledPermissionCount(staff)} enabled`
}

/** Roles accepted by the permission editor come only from the known role list. */
export function isKnownRole(role: string | null | undefined): role is RoleCode {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LABELS, role)
}
