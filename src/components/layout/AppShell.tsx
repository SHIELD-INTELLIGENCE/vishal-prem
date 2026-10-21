import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { CalendarHeart, ClipboardList, LayoutDashboard, Menu, Package } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { cn } from '@/lib/utils'
import { OfflineBanner } from '@/components/ui/States'
import { Sidebar, MobileSidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ShortcutsDialog } from './ShortcutsDialog'

const MOBILE_ITEMS = [
  { to: '/admin', label: 'Home', icon: LayoutDashboard, permission: 'dashboardView' as const, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList, permission: 'ordersView' as const },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarHeart, permission: 'bookingsView' as const },
  { to: '/admin/products', label: 'Products', icon: Package, permission: 'productsView' as const },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { sidebarCollapsed, setSidebarCollapsed } = useWorkspace()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const lastG = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typing) return

      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('[data-search-input]')
        if (search) {
          event.preventDefault()
          search.focus()
        }
        return
      }
      if (event.key.toLowerCase() === 'g') {
        lastG.current = Date.now()
        return
      }
      if (Date.now() - lastG.current < 1000) {
        const map: Record<string, string> = {
          d: '/admin',
          o: '/admin/orders',
          b: '/admin/bookings',
          p: '/admin/products',
          c: '/admin/customers',
        }
        const destination = map[event.key.toLowerCase()]
        if (destination) {
          event.preventDefault()
          lastG.current = 0
          navigate(destination)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className={cn('min-h-dvh transition-[padding] duration-200', sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
        <Topbar
          onOpenMobile={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        {!online && <OfflineBanner />}
        <main id="main-content" className="px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-7">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden no-print"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5">
          {MOBILE_ITEMS.filter((item) => hasPermission(profile, item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition',
                  isActive ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800',
                )
              }
            >
              <item.icon className="h-5 w-5" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-ink-500"
            aria-label="Open all navigation"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
            Menu
          </button>
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
