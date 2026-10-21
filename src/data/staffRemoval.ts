import { PERMISSION_KEYS } from '@/auth/permissions'
import type { PermissionMap } from '@/types/models'

/**
 * Staff-account removal policy.
 *
 * Pure, dependency-free decision logic for the in-app removal flow. It is kept
 * separate from the Firestore write path so the checks can be unit tested
 * without a project, an emulator or a network round-trip.
 *
 * The browser cannot delete a Firebase Authentication user, so this flow only
 * revokes workspace access and disables the Firestore profile. Permanent
 * sign-in removal is a manual SHIELD Intelligence operation (see
 * `src/lib/support.ts`). These checks are also enforced by `firestore.rules`,
 * which only lets an active Super Admin update another `users/{uid}` document.
 */

export interface StaffRemovalActor {
  uid: string
  role?: string | null
  active?: boolean
}

export interface StaffRemovalTarget {
  uid: string
  role?: string | null
  active?: boolean
  email?: string | null
  displayName?: string | null
  deletionState?: string | null
}

export type StaffRemovalFailureCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'failed-precondition'
  | 'not-found'

export interface StaffRemovalFailure {
  ok: false
  code: StaffRemovalFailureCode
  message: string
}

export type StaffRemovalDecision = { ok: true } | StaffRemovalFailure

export interface StaffRemovalContext {
  /** The caller's stored profile. */
  actor: StaffRemovalActor | null
  /** The target's stored profile. */
  target: StaffRemovalTarget | null
  /** What the Super Admin typed as confirmation. */
  confirmEmail: string
  /** Count of active Super Admins other than the target. */
  otherActiveSuperAdmins: number
}

function failure(code: StaffRemovalFailureCode, message: string): StaffRemovalFailure {
  return { ok: false, code, message }
}

/** Only an active profile holding the super_admin role may remove anyone. */
export function isActiveSuperAdmin(profile: StaffRemovalActor | null | undefined): boolean {
  return profile?.active === true && profile?.role === 'super_admin'
}

/**
 * Decides whether a staff removal may proceed. Reads only the passed-in stored
 * profiles plus the counted Super Admins. Returns the first blocking reason so
 * the UI can show one actionable message.
 */
export function evaluateStaffRemoval(context: StaffRemovalContext): StaffRemovalDecision {
  const { actor, target, confirmEmail } = context

  if (!actor) {
    return failure('unauthenticated', 'Sign in again to continue.')
  }
  if (!isActiveSuperAdmin(actor)) {
    return failure('permission-denied', 'Only an active Super Admin can remove a staff account.')
  }
  if (!target) {
    return failure('not-found', 'That staff profile no longer exists. Refresh the list.')
  }
  if (actor.uid && actor.uid === target.uid) {
    return failure('failed-precondition', 'You cannot remove your own account from staff management.')
  }
  if (target.deletionState === 'deleted') {
    return failure('failed-precondition', 'This staff account has already been removed.')
  }

  const targetEmail = typeof target.email === 'string' ? target.email.trim().toLowerCase() : ''
  if (targetEmail && targetEmail !== confirmEmail.trim().toLowerCase()) {
    return failure(
      'failed-precondition',
      'The confirmation email does not match this staff member. Refresh the list and try again.',
    )
  }

  if (target.role === 'super_admin' && target.active === true && context.otherActiveSuperAdmins < 1) {
    return failure(
      'failed-precondition',
      'This is the last active Super Admin. Promote another Super Admin before removing this account.',
    )
  }

  return { ok: true }
}

/**
 * Counts active Super Admins other than the target. Used by both the UI guard
 * and the removal policy; inactive and tombstoned profiles never count.
 */
export function countOtherActiveSuperAdmins(
  users: ReadonlyArray<{ uid?: string; role?: string | null; active?: boolean }>,
  excludeUid: string,
): number {
  return users.filter(
    (user) => user.uid !== excludeUid && user.active === true && user.role === 'super_admin',
  ).length
}

const DISABLED_PERMISSIONS: PermissionMap = PERMISSION_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: false }),
  {} as PermissionMap,
)

/**
 * Step 1 — revoke workspace access. `active: false` makes `firestore.rules`
 * deny every read and write for this uid immediately, even if the finalise
 * write below never runs.
 */
export function staffRevokePatch(now: string, actorUid: string) {
  return {
    active: false,
    deletionState: 'revoking',
    deletionRequestedAt: now,
    deletionRequestedBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
  }
}

/**
 * Step 2 — reduce the profile to a minimal disabled tombstone. Name, email and
 * role are kept so historical `createdBy`/`updatedBy` attribution still
 * resolves and so the SHIELD operator can identify the Firebase Auth account.
 * No orders, bookings, payments or invitations are touched.
 */
export function staffFinalizePatch(now: string, actorUid: string) {
  return {
    active: false,
    deletionState: 'deleted',
    deletedAt: now,
    deletedBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
    permissions: DISABLED_PERMISSIONS,
    outletIds: [] as string[],
    departmentIds: [] as string[],
    phone: '',
  }
}
