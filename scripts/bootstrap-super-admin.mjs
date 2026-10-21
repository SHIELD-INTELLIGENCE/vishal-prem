#!/usr/bin/env node
/**
 * Bootstrap the FIRST Super Admin for a real Firebase project.
 *
 * Why this exists
 * ---------------
 * Firestore rules authorize every request from the caller's own
 * `users/{uid}` document. On a brand-new project no such document exists, so
 * nobody can write one through the app. This script breaks that chicken-and-egg
 * once, using the Admin SDK in a trusted local context. It is the only place
 * that is allowed to create a Super Admin profile directly; the running app
 * never can (see firestore.rules → match /users/{uid}).
 *
 * Safety properties
 * -----------------
 * - Credentials are read from the local machine only (GOOGLE_APPLICATION_CREDENTIALS
 *   or --service-account). No key is bundled, committed or shipped to Netlify.
 * - It refuses to run without --confirm, so a mistake cannot silently write.
 * - The target UID is looked up in Firebase Authentication and must exist.
 * - The supplied email must match that Auth account's email, so privileges
 *   cannot be granted to a typo'd or arbitrary UID.
 * - It never asks for, receives or stores a password.
 * - It refuses to overwrite an existing profile unless --force is given.
 * - It re-reads the written document and verifies it before reporting success.
 *
 * Usage (see docs/BOOTSTRAP_SUPER_ADMIN.md):
 *   GOOGLE_APPLICATION_CREDENTIALS=/secure/vishal-prem-sa.json \
 *   node scripts/bootstrap-super-admin.mjs --uid <UID> --email <EMAIL> --confirm
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { buildSuperAdminProfile, isWellFormedSuperAdmin, PERMISSION_KEYS } from './lib/access.mjs'

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
  console.error(`Bootstrap refused: ${message}`)
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
  // Fall back to Application Default Credentials (gcloud auth application-default login).
  const adcPath = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  if (!existsSync(adcPath)) {
    fail(
      'no trusted credentials were found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, pass --service-account <path>, or run "gcloud auth application-default login". See docs/BOOTSTRAP_SUPER_ADMIN.md.',
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
    fail('--email <owner-email> is required so the UID is verified against the Auth account.')
    return
  }
  if (uid.includes('@') || uid.length < 8) {
    fail('--uid does not look like a Firebase Auth UID. Copy it from Authentication → Users.')
    return
  }

  initializeApp({ credential: loaded.credential, projectId })
  const auth = getAuth()
  const db = getFirestore()

  // 1. The UID must be a real Auth account, and the email must match it.
  let authUser
  try {
    authUser = await auth.getUser(uid)
  } catch {
    fail(`no Firebase Authentication user exists with UID "${uid}". Create the sign-in account first, then re-run.`)
    return
  }
  if ((authUser.email ?? '').toLowerCase() !== email.trim().toLowerCase()) {
    fail(
      `the UID belongs to "${authUser.email ?? 'an account without an email'}", not "${email}". Refusing to grant Super Admin.`,
    )
    return
  }

  const profileRef = db.collection('users').doc(uid)
  const existing = await profileRef.get()

  if (existing.exists && !force) {
    const data = existing.data() ?? {}
    console.log('')
    console.log('A staff profile already exists for this UID.')
    console.log(`  role:   ${data.role}`)
    console.log(`  active: ${data.active}`)
    console.log('')
    console.log('Nothing was written. Re-run with --force only if you intend to replace it.')
    return
  }

  // 2. Resolve outlets. Super Admins are global in the rules, but we still
  //    record the real outlet ids so the profile is accurate.
  let outletIds = []
  if (args.values.outlets) {
    outletIds = args.values.outlets.split(',').map((value) => value.trim()).filter(Boolean)
  } else {
    const outlets = await db.collection('outlets').get()
    outletIds = outlets.docs.map((doc) => doc.id)
  }

  const now = new Date().toISOString()
  const profile = buildSuperAdminProfile({
    uid,
    email,
    displayName: args.values['display-name'] || authUser.displayName || 'Super Admin',
    outletIds,
    now,
  })

  if (!isWellFormedSuperAdmin(profile)) {
    fail('the generated profile failed its own integrity check. Nothing was written.')
    return
  }

  console.log('')
  console.log('Bootstrap plan')
  console.log(`  Project:     ${projectId}`)
  console.log(`  UID:         ${uid}`)
  console.log(`  Email:       ${profile.email}`)
  console.log(`  Role:        ${profile.role}`)
  console.log(`  Permissions: ${PERMISSION_KEYS.length} / ${PERMISSION_KEYS.length} granted`)
  console.log(`  Outlets:     ${outletIds.length ? outletIds.join(', ') : '(none yet — re-run after first-time setup)'}`)
  console.log(`  Existing:    ${existing.exists ? 'yes, will be replaced (--force)' : 'no'}`)

  if (!confirmed) {
    console.log('')
    console.log('Dry run only. Nothing was written. Add --confirm to apply.')
    return
  }

  await profileRef.set(profile)

  // 3. Verify by reading the document back.
  const verify = await profileRef.get()
  const written = verify.data()
  if (!verify.exists || !isWellFormedSuperAdmin(written)) {
    fail('the write did not produce a valid Super Admin document. Check Firestore rules and permissions.')
    return
  }

  console.log('')
  console.log('Super Admin provisioned and verified.')
  console.log(`  users/${uid} → role=${written.role}, active=${written.active}, outlets=${(written.outletIds || []).length}, permissions=${Object.keys(written.permissions).length}`)
  console.log('')
  console.log('Next: sign in at the app with this email. If the workspace is empty you will be sent to /admin/setup.')
}

main().catch((error) => {
  console.error('')
  console.error(`Bootstrap failed: ${error?.message ?? error}`)
  console.error('If Firestore is not enabled, enable it (Native mode) and re-run.')
  process.exitCode = 1
})
