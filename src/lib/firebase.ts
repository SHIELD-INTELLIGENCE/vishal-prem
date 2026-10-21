import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage'
import {
  isFirebaseConfigured,
  emulatorConfig,
  firebaseConfig,
  useFirebaseEmulators,
} from './env'

interface FirebaseBundle {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
}

declare global {
  var __vishalPremFirebase: FirebaseBundle | undefined
}

function createFirebase(): FirebaseBundle {
  const app = initializeApp(firebaseConfig as Record<string, string>)
  const auth = getAuth(app)

  let db: Firestore
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    db = getFirestore(app)
  }

  const storage = getStorage(app)

  if (useFirebaseEmulators) {
    const { host, authPort, firestorePort, storagePort } = emulatorConfig
    connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true })
    connectFirestoreEmulator(db, host, firestorePort)
    connectStorageEmulator(storage, host, storagePort)
  }

  return { app, auth, db, storage }
}

const bundle = isFirebaseConfigured
  ? globalThis.__vishalPremFirebase ?? createFirebase()
  : null

if (bundle) globalThis.__vishalPremFirebase = bundle

export const firebaseApp = bundle?.app ?? null
export const auth = bundle?.auth ?? null
export const db = bundle?.db ?? null
export const storage = bundle?.storage ?? null
export const firebaseReady = bundle !== null

export class FirebaseUnavailableError extends Error {
  constructor() {
    super('Firebase is not configured. Add the VITE_FIREBASE_* variables to .env.local.')
    this.name = 'FirebaseUnavailableError'
  }
}

export function requireDb(): Firestore {
  if (!db) throw new FirebaseUnavailableError()
  return db
}

export function requireAuth(): Auth {
  if (!auth) throw new FirebaseUnavailableError()
  return auth
}
