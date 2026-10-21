import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  EmailAuthProvider,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { auth, db, firebaseReady } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import type { UserProfile } from '@/types/models'

export type AuthStatus =
  | 'loading'
  | 'signed_out'
  | 'unlinked'
  | 'suspended'
  | 'ready'
  | 'error'
  | 'unconfigured'

interface AuthContextValue {
  status: AuthStatus
  firebaseUser: User | null
  profile: UserProfile | null
  error: string | null
  configMissing: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateOwnProfile: (values: { displayName: string; phone?: string }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  deleteAccount: (currentPassword: string) => Promise<void>
  requestEmailChange: (newEmail: string, currentPassword: string) => Promise<void>
  refreshAuthUser: () => Promise<User | null>
  syncProfileEmail: () => Promise<boolean>
  hasPasswordProvider: boolean
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(firebaseReady ? 'loading' : 'unconfigured')
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profileNonce, setProfileNonce] = useState(0)

  useEffect(() => {
    if (!firebaseReady || !auth) return
    let profileUnsubscribe: (() => void) | null = null

    const authUnsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        profileUnsubscribe?.()
        profileUnsubscribe = null
        setFirebaseUser(user)

        if (!user) {
          setProfile(null)
          setStatus('signed_out')
          setError(null)
          return
        }

        if (!db) {
          setStatus('error')
          setError('Firestore is unavailable.')
          return
        }

        setStatus('loading')
        setError(null)
        const profileRef = doc(db, 'users', user.uid)
        profileUnsubscribe = onSnapshot(
          profileRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setProfile(null)
              setStatus('unlinked')
              return
            }
            const data = { ...(snapshot.data() as UserProfile), uid: user.uid }
            setProfile(data)
            if (!data.active) {
              setStatus('suspended')
              return
            }
            setStatus('ready')
            const lastLogin = data.lastLoginAt ? new Date(data.lastLoginAt).getTime() : 0
            if (Date.now() - lastLogin > 15 * 60 * 1000) {
              updateDoc(profileRef, { lastLoginAt: new Date().toISOString() }).catch(() => undefined)
            }
          },
          (snapshotError) => {
            setStatus('error')
            setError(friendlyFirebaseError(snapshotError))
          },
        )
      },
      (authError) => {
        setStatus('error')
        setError(friendlyFirebaseError(authError))
      },
    )

    return () => {
      profileUnsubscribe?.()
      authUnsubscribe()
    }
  }, [profileNonce])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase Authentication is not configured.')
    setError(null)
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  }, [])

  const signOut = useCallback(async () => {
    if (!auth) return
    await firebaseSignOut(auth)
    setProfile(null)
    setStatus('signed_out')
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error('Firebase Authentication is not configured.')
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  }, [])

  const updateOwnProfile = useCallback(
    async (values: { displayName: string; phone?: string }) => {
      if (!firebaseUser || !db) throw new Error('You are not signed in.')
      await updateProfile(firebaseUser, { displayName: values.displayName })
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        displayName: values.displayName,
        phone: values.phone ?? '',
        updatedAt: new Date().toISOString(),
      })
    },
    [firebaseUser],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!firebaseUser) throw new Error('You are not signed in.')
      const email = firebaseUser.email
      if (!email) throw new Error('This account does not use email and password sign-in.')
      const credential = EmailAuthProvider.credential(email, currentPassword)
      await reauthenticateWithCredential(firebaseUser, credential)
      await updatePassword(firebaseUser, newPassword)
    },
    [firebaseUser],
  )

  const deleteAccount = useCallback(
    async (currentPassword: string) => {
      if (!firebaseUser) throw new Error('You are not signed in.')
      const email = firebaseUser.email
      if (!email) throw new Error('This account does not use email and password sign-in.')
      // Firebase requires a fresh credential before destructive account actions.
      const credential = EmailAuthProvider.credential(email, currentPassword)
      await reauthenticateWithCredential(firebaseUser, credential)
      await deleteUser(firebaseUser)
      setProfile(null)
      setStatus('signed_out')
    },
    [firebaseUser],
  )

  const requestEmailChange = useCallback(
    async (newEmail: string, currentPassword: string) => {
      if (!firebaseUser) throw new Error('You are not signed in.')
      const email = firebaseUser.email
      if (!email) throw new Error('This account does not use email and password sign-in.')
      const credential = EmailAuthProvider.credential(email, currentPassword)
      await reauthenticateWithCredential(firebaseUser, credential)
      await verifyBeforeUpdateEmail(firebaseUser, newEmail.trim().toLowerCase())
    },
    [firebaseUser],
  )

  const refreshAuthUser = useCallback(async () => {
    if (!firebaseUser) return null
    await firebaseUser.reload()
    const current = auth?.currentUser ?? firebaseUser
    setFirebaseUser(current)
    return current
  }, [firebaseUser])

  const syncProfileEmail = useCallback(async () => {
    if (!firebaseUser || !db || !profile) return false
    if (profile.role !== 'super_admin') return false
    const email = auth?.currentUser?.email ?? firebaseUser.email
    if (!email) return false
    const normalized = email.trim().toLowerCase()
    if (normalized === profile.email.trim().toLowerCase()) return false
    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      email: normalized,
      updatedAt: new Date().toISOString(),
    })
    return true
  }, [firebaseUser, profile])

  const hasPasswordProvider = Boolean(
    firebaseUser?.providerData.some((provider) => provider.providerId === 'password'),
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      profile,
      error,
      configMissing: !firebaseReady,
      signIn,
      signOut,
      resetPassword,
      updateOwnProfile,
      changePassword,
      deleteAccount,
      requestEmailChange,
      refreshAuthUser,
      syncProfileEmail,
      hasPasswordProvider,
      clearError: () => {
        setError(null)
        if (status === 'error') setProfileNonce((value) => value + 1)
      },
    }),
    [
      status,
      firebaseUser,
      profile,
      error,
      signIn,
      signOut,
      resetPassword,
      updateOwnProfile,
      changePassword,
      deleteAccount,
      requestEmailChange,
      refreshAuthUser,
      syncProfileEmail,
      hasPasswordProvider,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
