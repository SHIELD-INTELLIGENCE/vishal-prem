import { Link, useLocation } from 'react-router-dom'
import { Compass, Home, LifeBuoy, SearchX } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { isAdminPath } from '@/routing'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/ui/Logo'

export function NotFoundPage() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const inAdmin = isAdminPath(pathname)

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-16 text-center sm:py-24">
      <div className="mb-5 flex items-center gap-3">
        <LogoMark size={48} />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">Vishal Prem</span>
      </div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ivory-100 text-ink-500 ring-1 ring-ink-200">
        <SearchX className="h-7 w-7" />
      </div>
      <p className="mt-5 font-display text-5xl font-semibold tracking-tight text-ink-950">404</p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-ink-950">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        The address may be mistyped, or the page may have moved. Nothing was changed by opening this page.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {inAdmin ? (
          <>
            <Button asChild leftIcon={<Home className="h-4 w-4" />}>
              <Link to="/admin">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline" leftIcon={<LifeBuoy className="h-4 w-4" />}>
              <Link to="/admin/help">Help</Link>
            </Button>
            <Button asChild variant="ghost" leftIcon={<Compass className="h-4 w-4" />}>
              <Link to="/admin/orders">Open orders</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild leftIcon={<Home className="h-4 w-4" />}>
              <Link to="/">Go to home page</Link>
            </Button>
            <Button asChild variant="outline" leftIcon={<Compass className="h-4 w-4" />}>
              <Link to="/admin">Staff sign in</Link>
            </Button>
          </>
        )}
      </div>
      {inAdmin && profile && (
        <p className="mt-6 text-[11px] text-ink-400">
          Signed in as {profile.email} · {profile.role.replace(/_/g, ' ')}
        </p>
      )}
    </div>
  )
}
