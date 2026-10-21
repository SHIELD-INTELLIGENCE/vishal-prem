#!/usr/bin/env node
/**
 * Seeds a local Firebase emulator workspace for development.
 *
 * Requires the emulator suite to be running (`npm run emulators`).
 * Firestore writes use the emulator's owner bearer token, which is an
 * emulator-only admin bypass. It does not work against a real project and
 * no credential is read from disk.
 */

import { ALL_PERMISSIONS } from './lib/access.mjs'

const HOST = process.env.EMULATOR_HOST || process.env.VITE_EMULATOR_HOST || '127.0.0.1'
const AUTH_PORT = process.env.VITE_AUTH_EMULATOR_PORT || '9099'
const FIRESTORE_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080'
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  'vishal-prem'

const OWNER = 'owner@vishalprem.local'
const PASSWORD = 'vishalprem123'

const AUTH_BASE = `http://${HOST}:${AUTH_PORT}/identitytoolkit.googleapis.com/v1`
const FIRESTORE_BASE = `http://${HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } }
  }
  throw new Error(`Cannot encode value of type ${typeof value}`)
}

function encodeFields(data) {
  const fields = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    fields[key] = encode(value)
  }
  return fields
}

async function waitFor(url, label, attempts = 60) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404 || response.status === 400) return
    } catch {
      // emulator not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${label} did not respond at ${url}`)
}

async function ensureAuthUser() {
  const signUp = await fetch(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER, password: PASSWORD, returnSecureToken: true }),
  })
  const signUpBody = await signUp.json()
  if (signUp.ok && signUpBody.localId) return signUpBody.localId
  if (signUpBody?.error?.message === 'EMAIL_EXISTS') {
    const signIn = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OWNER, password: PASSWORD, returnSecureToken: true }),
    })
    const signInBody = await signIn.json()
    if (signIn.ok && signInBody.localId) return signInBody.localId
    throw new Error(`Auth sign-in failed: ${signInBody?.error?.message ?? signIn.status}`)
  }
  throw new Error(`Auth sign-up failed: ${signUpBody?.error?.message ?? signUp.status}`)
}

async function setDocument(path, data) {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({ fields: encodeFields(data) }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to write ${path}: ${response.status} ${body}`)
  }
}

async function main() {
  console.log(`Seeding emulator workspace for project "${PROJECT_ID}"…`)
  await waitFor(`http://${HOST}:${AUTH_PORT}`, 'Auth emulator')
  await waitFor(`http://${HOST}:${FIRESTORE_PORT}`, 'Firestore emulator')

  const uid = await ensureAuthUser()
  const now = new Date().toISOString()

  await setDocument('business/main', {
    id: 'main',
    name: 'Vishal Prem Bakery & Sweets',
    legalName: 'Vishal Prem Bakery & Sweets',
    tagline: 'Bakery & Sweets',
    phone: '9876543210',
    email: '',
    addressLine1: 'Civil Lines',
    addressLine2: '',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    pin: '208001',
    gstin: '',
    upiId: '',
    receiptFooter: 'Local emulator workspace. Data is not real.',
    pricesIncludeTax: false,
    defaultTaxPercent: 5,
    invoicePrefix: 'VP',
    printer: { receiptWidth: '80mm', kitchenWidth: '80mm', packingSlipSize: 'a5' },
    busy: { status: 'not_connected', notes: '' },
    updatedAt: now,
  })

  await setDocument('outlets/emu-outlet-1', {
    id: 'emu-outlet-1',
    code: 'VP1',
    name: 'Vishal Prem — Main Outlet',
    address: 'Civil Lines, Kanpur',
    phone: '9876543210',
    email: '',
    gstin: '',
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  })

  await setDocument('outlets/emu-outlet-2', {
    id: 'emu-outlet-2',
    code: 'VP2',
    name: 'Vishal Prem — Second Outlet',
    address: 'Swaroop Nagar, Kanpur',
    phone: '9876543210',
    email: '',
    gstin: '',
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  })

  const departments = [
    { id: 'emu-dept-cake', code: 'cake', name: 'Cake', color: '#C8102E', description: 'Cakes, pastries and celebration desserts.' },
    { id: 'emu-dept-sweets', code: 'sweets', name: 'Sweets', color: '#C8922C', description: 'Mithai, barfi and festival sweets.' },
    { id: 'emu-dept-hot', code: 'hot', name: 'Hot Section', color: '#B4532A', description: 'Patties, samosas, puffs and hot snacks.' },
    { id: 'emu-dept-gajak', code: 'gajak', name: 'Gajak', color: '#7A5C2E', description: 'Gajak, rewari and sesame specialties.' },
  ]

  for (const department of departments) {
    await setDocument(`departments/${department.id}`, {
      ...department,
      outletIds: ['emu-outlet-1', 'emu-outlet-2'],
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    })
  }

  await setDocument(`users/${uid}`, {
    uid,
    displayName: 'Emulator Super Admin',
    email: OWNER,
    phone: '',
    role: 'super_admin',
    permissions: ALL_PERMISSIONS,
    outletIds: ['emu-outlet-1', 'emu-outlet-2'],
    departmentIds: [],
    active: true,
    createdAt: now,
    updatedAt: now,
  })

  console.log('')
  console.log('Emulator workspace ready.')
  console.log(`  Email:    ${OWNER}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  UID:      ${uid}`)
  console.log('')
  console.log('Demo catalogue records can be loaded from Settings → Demonstration data.')
}

main().catch((error) => {
  console.error('')
  console.error(`Seed failed: ${error.message}`)
  console.error('Is the emulator suite running? Try: npm run emulators')
  process.exitCode = 1
})
