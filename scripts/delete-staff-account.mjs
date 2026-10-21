#!/usr/bin/env node
/**
 * Remove a staff member's Firebase Authentication record (operator tool).
 *
 * Why this exists
 * ---------------
 * The browser cannot delete another person's Firebase Authentication user, and
 * the app deliberately does not try to: the in-app "Revoke access & remove
 * profile" action only revokes workspace access and tombstones the Firestore
 * profile. Permanently deleting the sign-in credential requires the Admin SDK
 * in a trusted context. This script is that context for an authorised operator.
 *
 * The Firestore profile is kept as a tombstone (a disabled record) so
 * historical createdBy/updatedBy attribution still resolves to a name. It is
 * therefore retained by default; pass --purge-profile if you really need the
 * row gone as well. Pending invitations for the address are cleared.
 *
 * Safety properties
 * -----------------
 * - Credentials are read from the local machine only; no key is bundled.
 * - Refuses to run without --confirm.
 * - Verifies the UID exists in Firebase Auth and that --email matches it.
 * - Refuses to delete a Super Admin unless --force is given.
 * - Refuses to delete the last remaining Super Admin, even with --force.
 * - Keeps the Firestore profile tombstone unless --purge-profile is given.
 * - Re-reads both stores after deletion and reports what was removed.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/secure/vishal-prem-sa.json \
 *   node scripts/delete-staff-account.mjs --uid <UID> --email <EMAIL> --confirm
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const body = token.slice(2)
    const eq = body.indexOf('=')
    if (eq !== -1) {
      args.values[body.slice(0, eq)] = body.slice(eq + 1)
      continue
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args.values[body] = next
      index += 1
    } else {
      args.flags.add(body)
    }
  }
  return args
}

function fail(message, code = 1) {
  console.error('')
  console.error(`Delete refused: ${message}`)
  console.error('')
  process.exitCode = code
}

function loadCredential(serviceAccountPath) {
  const path = serviceAccountPath || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (path) {
    let raw
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      fail(`could not read the service account file at ${path} (${error.message}).`)
      return null
    }
    if (raw.type !== 'service_account' || !raw.project_id || !raw.private_key) {
      fail('that file is not a Firebase service account key. Download it from Project settings → Service accounts.')
      return null
    }
    return { credential: cert(raw), projectId: raw.project_id }
  }
  const adcPath = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  if (!existsSync(adcPath)) {
    fail(
      'no trusted credentials were found. Set GOOGLE_APPLICATION_CREDENTIALS, pass --service-account <path>, or run "gcloud auth application-default login".',
    )
    return null
  }
  return { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || null }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const uid = args.values.uid
  const email = args.values.email
  const confirmed = args.flags.has('confirm')
  const force = args.flags.has('force')
  const purgeProfile = args.flags.has('purge-profile')

  const loaded = loadCredential(args.values['service-account'])
  if (!loaded) return

  const projectId = args.values.project || loaded.projectId
  if (!projectId) {
    fail('no project id could be determined. Pass --project <projectId> or use a service account key.')
    return
  }
  if (!uid) {
    fail('--uid <firebase-auth-uid> is required.')
    return
  }
  if (!email) {
    fail('--email <account-email> is required so the UID is verified against the Auth account.')
    return
  }
  if (uid.includes('@') || uid.length < 8) {
    fail('--uid does not look like a Firebase Auth UID. Copy it from Authentication → Users.')
    return
  }

  initializeApp({ credential: loaded.credential, projectId })
  const auth = getAuth()
  const db = getFirestore()

  let authUser
  try {
    authUser = await auth.getUser(uid)
  } catch {
    fail(`no Firebase Authentication user exists with UID "${uid}".`)
    return
  }
  if ((authUser.email ?? '').toLowerCase() !== email.trim().toLowerCase()) {
    fail(
      `the UID belongs to "${authUser.email ?? 'an account without an email'}", not "${email}". Refusing.`,
    )
    return
  }

  const profileRef = db.collection('users').doc(uid)
  const profile = await profileRef.get()
  const profileData = profile.data() ?? {}

  if (profileData.role === 'super_admin') {
    if (!force) {
      fail('this is a Super Admin. Re-run with --force only if another Super Admin will remain.')
      return
    }
    const supers = await db.collection('users').where('role', '==', 'super_admin').get()
    if (supers.size <= 1) {
      fail('this is the last Super Admin. The workspace would lock itself out. Promote another Super Admin first.')
      return
    }
  }

  const invites = await db.collection('invites').where('email', '==', email.trim().toLowerCase()).get()

  console.log('')
  console.log('Delete plan')
  console.log(`  Project:  ${projectId}`)
  console.log(`  UID:      ${uid}`)
  console.log(`  Email:    ${email}`)
  console.log(`  Profile:  ${profile.exists ? `role=${profileData.role}, active=${profileData.active} — ${purgeProfile ? 'will be removed (--purge-profile)' : 'tombstone retained for audit'}` : 'none'}`)
  console.log(`  Invites:  ${invites.size} matching invite(s) will be removed`)
  console.log('  Auth:     will be deleted')

  if (!confirmed) {
    console.log('')
    console.log('Dry run only. Nothing was deleted. Add --confirm to apply.')
    return
  }

  // Revoke data access first, then remove the credential. The profile row is a
  // tombstone for audit attribution and is kept unless --purge-profile is set.
  const batch = db.batch()
  invites.docs.forEach((invite) => batch.delete(invite.ref))
  if (profile.exists && purgeProfile) batch.delete(profileRef)
  await batch.commit()
  await auth.deleteUser(uid)

  const [profileAfter, authAfter] = await Promise.all([
    profileRef.get(),
    auth.getUser(uid).then(() => true).catch(() => false),
  ])

  if (authAfter || (purgeProfile && profileAfter.exists)) {
    fail('the deletion did not fully complete. Re-run or finish it in the Firebase Console.')
    return
  }

  console.log('')
  console.log('Firebase Authentication record deleted and verified.')
  if (purgeProfile) {
    console.log(`  Removed users/${uid} and ${invites.size} invite(s); Firebase Auth user is gone.`)
  } else {
    console.log(`  Removed ${invites.size} invite(s); Firebase Auth user is gone; the users/${uid} tombstone is retained for audit.`)
  }
}

main().catch((error) => {
  console.error('')
  console.error(`Delete failed: ${error?.message ?? error}`)
  process.exitCode = 1
})
