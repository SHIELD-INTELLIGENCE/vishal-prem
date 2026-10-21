import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { LoadingScreen } from '@/components/ui/Feedback'
import { ErrorState } from '@/components/ui/States'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/ui/Logo'

export function WorkspaceGate() {
  const { loading, error, business, reload } = useWorkspace()
  const { signOut } = useAuth()

  if (loading) return <LoadingScreen />
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ivory-50 px-4">
        <div className="surface-card w-full max-w-lg">
          <div className="flex justify-center pt-6"><LogoMark size={48} /></div>
          <ErrorState
            title="Could not load the workspace"
            message={`${error} If the workspace still does not load, contact the Super Admin.`}
            onRetry={reload}
          />
          <div className="flex justify-center pb-6">
            <Button variant="outline" size="sm" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    )
  }
  if (!business) return <Navigate to="/admin/setup" replace />
  return <Outlet />
}
