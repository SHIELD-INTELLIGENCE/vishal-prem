import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { hasPermission } from './permissions'
import type { PermissionKey } from '@/types/models'
import { LoadingScreen, PermissionDenied } from '@/components/ui/Feedback'
import { AccountNotLinked, AccountSuspended, AuthErrorState, ConfigMissing } from '@/features/auth/AuthStates'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'unconfigured') return <ConfigMissing />
  if (status === 'loading') return <LoadingScreen />
  if (status === 'signed_out') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }
  if (status === 'unlinked') return <AccountNotLinked />
  if (status === 'suspended') return <AccountSuspended />
  if (status === 'error') return <AuthErrorState />
  return <>{children}</>
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey
  children: ReactNode
}) {
  const { profile } = useAuth()
  if (!hasPermission(profile, permission)) return <PermissionDenied />
  return <>{children}</>
}
