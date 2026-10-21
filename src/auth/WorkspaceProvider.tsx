import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { collection, limit, onSnapshot, orderBy, query, doc } from 'firebase/firestore'
import { useLocation } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { isAdminPath } from '@/routing'
import type { Business, Department, Outlet, UserProfile } from '@/types/models'
import { useAuth } from './AuthProvider'

const OUTLET_KEY = 'vp.selectedOutlet'
const SIDEBAR_KEY = 'vp.sidebarCollapsed.v2'

interface WorkspaceContextValue {
  business: Business | null
  outlets: Outlet[]
  departments: Department[]
  selectedOutletId: string | null
  selectedOutlet: Outlet | null
  setSelectedOutletId: (id: string) => void
  loading: boolean
  error: string | null
  reload: () => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (value: boolean) => void
  allowedOutlets: (profile: UserProfile) => Outlet[]
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  // The public site at `/` must not read management data. Subscriptions start
  // only once an authenticated user is inside the `/admin` workspace.
  const inAdmin = isAdminPath(pathname)
  const [business, setBusiness] = useState<Business | null>(null)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [selectedOutletId, setSelectedOutletIdState] = useState<string | null>(
    () => localStorage.getItem(OUTLET_KEY),
  )
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  )

  const setSidebarCollapsed = useCallback((value: boolean) => {
    setSidebarCollapsedState(value)
    localStorage.setItem(SIDEBAR_KEY, String(value))
  }, [])

  const allowedOutlets = useCallback(
    (currentProfile: UserProfile) => {
      if (currentProfile.role === 'super_admin') return outlets
      return outlets.filter((outlet) => currentProfile.outletIds.includes(outlet.id))
    },
    [outlets],
  )

  useEffect(() => {
    if (!db || !profile || !inAdmin) return
    setLoading(true)
    setError(null)
    let businessReady = false
    let outletsReady = false
    let departmentsReady = false

    function checkReady() {
      if (businessReady && outletsReady && departmentsReady) setLoading(false)
    }

    const unsubBusiness = onSnapshot(
      doc(db, 'business', 'main'),
      (snapshot) => {
        setBusiness(snapshot.exists() ? ({ ...(snapshot.data() as Business), id: 'main' }) : null)
        businessReady = true
        checkReady()
      },
      (snapshotError) => {
        setError(friendlyFirebaseError(snapshotError))
        setLoading(false)
      },
    )

    const unsubOutlets = onSnapshot(
      query(collection(db, 'outlets'), orderBy('name', 'asc'), limit(50)),
      (snapshot) => {
        setOutlets(snapshot.docs.map((item) => ({ ...(item.data() as Outlet), id: item.id })))
        outletsReady = true
        checkReady()
      },
      (snapshotError) => {
        setError(friendlyFirebaseError(snapshotError))
        setLoading(false)
      },
    )

    const unsubDepartments = onSnapshot(
      query(collection(db, 'departments'), orderBy('name', 'asc'), limit(100)),
      (snapshot) => {
        setDepartments(snapshot.docs.map((item) => ({ ...(item.data() as Department), id: item.id })))
        departmentsReady = true
        checkReady()
      },
      (snapshotError) => {
        setError(friendlyFirebaseError(snapshotError))
        setLoading(false)
      },
    )

    return () => {
      unsubBusiness()
      unsubOutlets()
      unsubDepartments()
    }
  }, [profile, nonce, inAdmin])

  const setSelectedOutletId = useCallback((id: string) => {
    setSelectedOutletIdState(id)
    localStorage.setItem(OUTLET_KEY, id)
  }, [])

  useEffect(() => {
    if (!profile || outlets.length === 0) return
    const allowed = allowedOutlets(profile)
    if (allowed.length === 0) {
      setSelectedOutletIdState(null)
      return
    }
    const current = selectedOutletId
    if (!current || !allowed.some((outlet) => outlet.id === current)) {
      setSelectedOutletId(allowed[0].id)
    }
  }, [profile, outlets, selectedOutletId, allowedOutlets, setSelectedOutletId])

  const selectedOutlet = outlets.find((outlet) => outlet.id === selectedOutletId) ?? null

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      business,
      outlets,
      departments,
      selectedOutletId,
      selectedOutlet,
      setSelectedOutletId,
      loading,
      error,
      reload: () => setNonce((value) => value + 1),
      sidebarCollapsed,
      setSidebarCollapsed,
      allowedOutlets,
    }),
    [
      business,
      outlets,
      departments,
      selectedOutletId,
      selectedOutlet,
      setSelectedOutletId,
      loading,
      error,
      sidebarCollapsed,
      setSidebarCollapsed,
      allowedOutlets,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
