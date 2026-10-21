import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { evaluateStaffRemoval, staffFinalizePatch, staffRevokePatch } from '@/data/staffRemoval'
import { nowIso, uniqueId } from '@/lib/utils'
import type { Invite, UserProfile } from '@/types/models'
import type { InviteValues } from '@/lib/validation'
import { defaultPermissionsForRole, roleDefinition } from '@/auth/permissions'
import type { PermissionMap, RoleCode } from '@/types/models'

export async function createInvite({
  values,
  profile,
}: {
  values: InviteValues
  profile: UserProfile
}): Promise<{ id: string; link: string }> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()
  const token = uniqueId()
  const expiresMillis = Date.now() + values.expiresInDays * 24 * 60 * 60 * 1000
  const expires = new Date(expiresMillis).toISOString()
  const email = values.email.trim().toLowerCase()

  const invite: Invite = {
    id: token,
    token,
    email,
    displayName: values.displayName.trim(),
    role: values.role,
    permissions: values.permissions as PermissionMap,
    outletIds: values.outletIds,
    departmentIds: values.departmentIds,
    status: 'pending',
    createdAt: now,
    expiresAt: expires,
    expiresAtMillis: expiresMillis,
    createdBy: profile.uid,
  }

  try {
    await setDoc(doc(db, 'invites', token), invite)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }

  return { id: token, link: `${window.location.origin}/admin/join/${token}` }
}

export async function revokeInvite(invite: Invite): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  await updateDoc(doc(db, 'invites', invite.id), { status: 'revoked' })
}

export async function getInvite(token: string): Promise<Invite | null> {
  if (!db) throw new Error('Firestore is not available.')
  try {
    const snapshot = await getDoc(doc(db, 'invites', token))
    if (!snapshot.exists()) return null
    return { ...(snapshot.data() as Invite), id: snapshot.id }
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export async function acceptInvite({
  token,
  uid,
  email,
  displayName,
  passwordSetAt,
}: {
  token: string
  uid: string
  email: string
  displayName: string
  passwordSetAt: string
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  const invite = await getInvite(token)
  if (!invite) throw new Error('This invitation link is not valid.')
  if (invite.status !== 'pending') throw new Error('This invitation has already been used or revoked.')
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('This invitation has expired.')
  if (invite.email !== email.trim().toLowerCase()) {
    throw new Error('Sign in with the exact email address this invitation was sent to.')
  }
  const now = nowIso()
  const user: UserProfile = {
    uid,
    displayName: displayName.trim() || invite.displayName,
    email: invite.email,
    role: invite.role,
    permissions: invite.permissions,
    outletIds: invite.outletIds,
    departmentIds: invite.departmentIds,
    active: true,
    createdAt: now,
    updatedAt: now,
    inviteToken: token,
    lastLoginAt: passwordSetAt,
  }
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid), user)
  batch.update(doc(db, 'invites', token), {
    status: 'accepted',
    acceptedUid: uid,
    acceptedAt: now,
  })
  try {
    await batch.commit()
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export async function updateStaff(
  uid: string,
  patch: {
    role?: RoleCode
    permissions?: PermissionMap
    outletIds?: string[]
    departmentIds?: string[]
    active?: boolean
    displayName?: string
    phone?: string
  },
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  const nextPatch: Record<string, unknown> = {
    ...patch,
    updatedAt: nowIso(),
    updatedBy: profile.uid,
  }
  try {
    await updateDoc(doc(db, 'users', uid), nextPatch)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export interface RemoveStaffAccountResult {
  uid: string
  email: string | null
  displayName: string | null
  /** Always false: a browser session cannot delete a Firebase Authentication user. */
  authDeleted: false
  /** The Firestore profile is retained as a disabled tombstone. */
  profileRetained: true
}

/**
 * Remove a staff member from the workspace.
 *
 * The browser cannot delete another person's Firebase Authentication user and
 * must never hold Admin SDK credentials, so this does **not** touch Firebase
 * Authentication. It performs the two writes that are safe from the client:
 *
 *   1. revoke access  — `active: false` (+ `deletionState: 'revoking'`). The
 *      security rules deny every read and write for this uid from this point.
 *   2. finalise       — the profile is reduced to a disabled tombstone
 *      (`deletionState: 'deleted'`).
 *
 * The second write is retried independently: if it fails, access is already
 * revoked and repeating the removal finishes the job. Name, email and role are
 * kept so historical `createdBy`/`updatedBy` attribution still resolves and a
 * SHIELD operator can identify the Firebase Auth account to remove. No orders,
 * bookings, payments or invitations are touched.
 *
 * Authorization mirrors `firestore.rules` (only an active Super Admin may
 * update another `users/{uid}`) and is also re-checked by `evaluateStaffRemoval`
 * so the UI and the write agree on who is allowed to act.
 */
export async function removeStaffAccount({
  actor,
  target,
  confirmEmail,
  otherActiveSuperAdmins,
}: {
  actor: UserProfile | null
  target: UserProfile
  confirmEmail: string
  otherActiveSuperAdmins: number
}): Promise<RemoveStaffAccountResult> {
  if (!db) throw new Error('Firestore is not available.')

  const decision = evaluateStaffRemoval({ actor, target, confirmEmail, otherActiveSuperAdmins })
  if (!decision.ok) throw new Error(decision.message)
  // `decision.ok` means the caller is an active Super Admin; narrow for TypeScript.
  if (!actor) throw new Error('Sign in again to continue.')

  const now = nowIso()
  const ref = doc(db, 'users', target.uid)

  try {
    await updateDoc(ref, staffRevokePatch(now, actor.uid))
  } catch (error) {
    throw new Error(`Workspace access could not be revoked, so nothing was changed. ${friendlyFirebaseError(error)}`)
  }

  try {
    await updateDoc(ref, staffFinalizePatch(now, actor.uid))
  } catch (error) {
    throw new Error(
      `Workspace access is revoked, but the profile could not be marked removed. Retry the removal — it is safe to repeat. ${friendlyFirebaseError(error)}`,
    )
  }

  const email = typeof target.email === 'string' ? target.email.trim() : ''
  const displayName = typeof target.displayName === 'string' ? target.displayName.trim() : ''

  return {
    uid: target.uid,
    email: email || null,
    displayName: displayName || null,
    authDeleted: false,
    profileRetained: true,
  }
}

export async function sendStaffPasswordReset(email: string | null | undefined): Promise<void> {
  if (!auth) throw new Error('Firebase Authentication is not available.')
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) throw new Error('This staff profile has no email address on file.')
  try {
    // Firebase sends the reset link itself. This works for any address and does
    // not reveal whether the address has an account.
    await sendPasswordResetEmail(auth, normalized)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export function permissionsForRole(role: RoleCode): PermissionMap {
  return { ...roleDefinition(role).permissions }
}

export function inviteRoleDefaults(role: RoleCode): PermissionMap {
  return defaultPermissionsForRole(role)
}

export function inviteStatus(invite: Invite): 'pending' | 'expired' | 'accepted' | 'revoked' {
  if (invite.status !== 'pending') return invite.status
  if (new Date(invite.expiresAt).getTime() < Date.now()) return 'expired'
  return 'pending'
}
