/** Firebase client configuration. These values are public identifiers, not secrets. */
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const requiredFirebaseKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const

export const missingFirebaseKeys = requiredFirebaseKeys.filter(
  (key) => !firebaseConfig[key] || String(firebaseConfig[key]).startsWith('your-'),
)

export const isFirebaseConfigured = missingFirebaseKeys.length === 0
export const useFirebaseEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true'

export const emulatorConfig = {
  host: (env.VITE_EMULATOR_HOST as string | undefined) || '127.0.0.1',
  authPort: Number(env.VITE_AUTH_EMULATOR_PORT ?? 9099),
  firestorePort: Number(env.VITE_FIRESTORE_EMULATOR_PORT ?? 8080),
  storagePort: Number(env.VITE_STORAGE_EMULATOR_PORT ?? 9199),
}
