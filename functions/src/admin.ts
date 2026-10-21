import {
  cert,
  getApps,
  initializeApp,
  type App,
  type AppOptions,
  type ServiceAccount,
} from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminDb: Firestore | null = null
let adminAuth: Auth | null = null

function serviceAccountFromEnvironment(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!rawJson) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>
  } catch {
    // Never include the value itself in an error or log line.
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.')
  }

  const parsedProjectId = typeof parsed.project_id === 'string'
    ? parsed.project_id
    : undefined
  const parsedClientEmail = typeof parsed.client_email === 'string'
    ? parsed.client_email
    : undefined
  const parsedPrivateKey = typeof parsed.private_key === 'string'
    ? parsed.private_key.replace(/\\n/g, '\n')
    : undefined

  if (!parsedProjectId || !parsedClientEmail || !parsedPrivateKey) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key.',
    )
  }

  return {
    projectId: parsedProjectId,
    clientEmail: parsedClientEmail,
    privateKey: parsedPrivateKey,
  }
}

function createApp(): App {
  const existingDefault = getApps().find((app) => app.name === '[DEFAULT]')
  if (existingDefault) return existingDefault

  const serviceAccount = serviceAccountFromEnvironment()
  const projectId = process.env.GCLOUD_PROJECT
    ?? process.env.FIREBASE_PROJECT_ID
    ?? serviceAccount?.projectId

  const options: AppOptions = {
    ...(projectId ? { projectId } : {}),
    ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
  }

  // Outside Google infrastructure, credentials must come from
  // FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or
  // FIREBASE_SERVICE_ACCOUNT_JSON. On Google infrastructure (including the
  // Firebase Functions emulator/Cloud Functions), Application Default
  // Credentials or the emulator host variables are used instead.
  return initializeApp(options)
}

function app(): App {
  adminApp ??= createApp()
  return adminApp
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(app())
    adminDb.settings({ ignoreUndefinedProperties: true })
  }
  return adminDb
}

export function getAdminAuth(): Auth {
  adminAuth ??= getAuth(app())
  return adminAuth
}
