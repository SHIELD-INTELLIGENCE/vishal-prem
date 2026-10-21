import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, CircleHelp, X } from 'lucide-react'
import { LogoMark } from '@/components/ui/Logo'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { NAV_GROUPS, type NavGroup } from '@/navigation'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { resolveSidebarExpanded } from './sidebarState'

function useVisibleGroups() {
  const { profile } = useAuth()
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(profile, item.permission)),
  })).filter((group) => group.items.length > 0)
}

export function SidebarContent({
  collapsed = false,
  onNavigate,
  onToggle,
  mobile,
}: {
  collapsed?: boolean
  onNavigate?: () => void
  onToggle?: () => void
  mobile?: boolean
}) {
  const groups = useVisibleGroups()
  const { profile } = useAuth()
  const { selectedOutletId, departments } = useWorkspace()
  const navRef = useRef<HTMLElement>(null)

  // A collapsed rail must always start at the top. Otherwise a scrolled list
  // stays scrolled after the hover expansion ends, which looks broken.
  useEffect(() => {
    if (!collapsed) return
    navRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [collapsed])

  const departmentItems = useMemo(
    () => scopedDepartments(profile, departments, selectedOutletId ?? undefined).map((department) => ({
      id: department.id,
      name: department.name,
      color: department.color,
    })),
    [profile, departments, selectedOutletId],
  )

  type SidebarBlock =
    | { kind: 'group'; group: NavGroup }
    | { kind: 'departments'; items: typeof departmentItems }

  const blocks: SidebarBlock[] = groups.map((group) => ({ kind: 'group', group }))
  if (departmentItems.length > 0) {
    const catalogueIndex = blocks.findIndex((block) => block.kind === 'group' && block.group.label === 'Catalogue')
    const departmentBlock: SidebarBlock = { kind: 'departments', items: departmentItems }
    const insertAt = catalogueIndex >= 0 ? catalogueIndex + 1 : Math.min(1, blocks.length)
    blocks.splice(insertAt, 0, departmentBlock)
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center border-b border-ink-200/70 px-4', collapsed && 'justify-center px-2')}>
        <Link
          to="/admin"
          onClick={onNavigate}
          aria-label="Vishal Prem dashboard"
          className="flex min-w-0 items-center gap-0 overflow-hidden"
        >
          <LogoMark size={38} />
          <div
            className={cn(
              'min-w-0 overflow-hidden transition-[max-width,padding-left,opacity] duration-200 ease-out motion-reduce:transition-none',
              collapsed ? 'max-w-0 pl-0 opacity-0' : 'max-w-[150px] pl-2.5 opacity-100',
            )}
          >
            <p className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight text-ink-950">Vishal Prem</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Management</p>
          </div>
        </Link>
        {mobile && (
          <DialogPrimitive.Close className="ml-auto rounded-lg p-2 text-ink-500 hover:bg-ivory-100" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        )}
      </div>

      <nav
        ref={navRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-2.5 py-4',
          collapsed ? 'scrollbar-none' : 'scrollbar-slim',
        )}
        aria-label="Main navigation"
      >
        {blocks.map((block) => block.kind === 'group' ? (
          <div key={block.group.label} className="mb-5 last:mb-0">
            <p
              className={cn(
                'overflow-hidden px-2.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-400 transition-[max-height,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
                collapsed ? 'mb-0 max-h-0 opacity-0' : 'mb-1.5 max-h-4 opacity-100',
              )}
            >
              {block.group.label}
            </p>
            <ul className="space-y-0.5">
              {block.group.items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'nav-link gap-0',
                        isActive && 'nav-link-active',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    <item.icon
                      className={cn(
                        'shrink-0 transition-[width,height] duration-200 ease-out motion-reduce:transition-none',
                        collapsed ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]',
                      )}
                      strokeWidth={1.8}
                    />
                    <span
                      className={cn(
                        'truncate transition-[max-width,padding-left,opacity] duration-200 ease-out motion-reduce:transition-none',
                        collapsed ? 'max-w-0 pl-0 opacity-0' : 'max-w-[190px] pl-3 opacity-100',
                      )}
                    >
                      {item.label}
                    </span>
                  </NavLink>
                )
                return (
                  <li key={item.to}>
                    {collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div key="department-workspaces" className="mb-5 last:mb-0">
            <p
              className={cn(
                'overflow-hidden px-2.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-400 transition-[max-height,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
                collapsed ? 'mb-0 max-h-0 opacity-0' : 'mb-1.5 max-h-4 opacity-100',
              )}
            >
              Departments
            </p>
            <ul className="space-y-0.5">
              {block.items.map((department) => {
                const link = (
                  <NavLink
                    to={`/admin/departments/${department.id}`}
                    onClick={onNavigate}
                    aria-label={collapsed ? department.name : undefined}
                    title={collapsed ? department.name : undefined}
                    className={({ isActive }) =>
                      cn(
                        'nav-link gap-0',
                        isActive && 'nav-link-active',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    <span
                      className={cn(
                        'flex shrink-0 items-center justify-center transition-[width,height] duration-200 ease-out motion-reduce:transition-none',
                        collapsed ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]',
                      )}
                      aria-hidden
                    >
                      <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: department.color }} />
                    </span>
                    <span
                      className={cn(
                        'truncate transition-[max-width,padding-left,opacity] duration-200 ease-out motion-reduce:transition-none',
                        collapsed ? 'max-w-0 pl-0 opacity-0' : 'max-w-[190px] pl-3 opacity-100',
                      )}
                    >
                      {department.name}
                    </span>
                  </NavLink>
                )
                return (
                  <li key={department.id}>
                    {collapsed ? <Tooltip label={department.name}>{link}</Tooltip> : link}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-200/70 p-2.5">
        <div
          className={cn(
            'overflow-hidden rounded-xl bg-ivory-100/80 transition-[max-height,opacity,padding,margin] duration-200 ease-out motion-reduce:transition-none',
            collapsed ? 'mb-0 max-h-0 px-0 py-0 opacity-0' : 'mb-2 max-h-24 px-3 py-2.5 opacity-100',
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Signed in</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-ink-800">{profile?.displayName}</p>
          <p className="truncate text-[10px] text-ink-500">{profile?.email}</p>
        </div>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          <Link
            to="/admin/help"
            onClick={onNavigate}
            aria-hidden={collapsed || undefined}
            tabIndex={collapsed ? -1 : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-lg text-[11px] font-semibold text-ink-500 transition-[max-width,opacity,padding] duration-200 ease-out hover:bg-ivory-100 hover:text-ink-800 motion-reduce:transition-none',
              collapsed ? 'max-w-0 px-0 py-0 opacity-0' : 'max-w-[80px] px-2 py-1.5 opacity-100',
            )}
          >
            <CircleHelp className="h-3.5 w-3.5" /> Help
          </Link>
          {!mobile && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded-lg p-2 text-ink-400 transition hover:bg-ivory-100 hover:text-ink-700"
            >
              <ChevronLeft
                className={cn(
                  'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
                  collapsed && 'rotate-180',
                )}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)

  const expanded = resolveSidebarExpanded({ collapsed, hovered, focusWithin, canHover })
  const effectiveCollapsed = !expanded

  function handleToggle() {
    // If the pointer is currently inside the rail, clear the temporary hover
    // state so an explicit "collapse" is not immediately undone by that hover.
    setHovered(false)
    setFocusWithin(false)
    onToggle()
  }

  return (
    <aside
      onMouseEnter={() => { if (canHover) setHovered(true) }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocusWithin(false)
      }}
      data-expanded={expanded}
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden overflow-hidden border-r border-ink-200/80 bg-white/85 backdrop-blur-xl transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none lg:block',
        effectiveCollapsed ? 'w-[76px]' : 'w-[264px]',
        collapsed && expanded && 'shadow-float',
      )}
    >
      <SidebarContent
        collapsed={effectiveCollapsed}
        onToggle={handleToggle}
        onNavigate={() => {
          // Return to the saved preference after navigating so a hover-expanded
          // rail does not stay open (and feel stuck) on the new page.
          setHovered(false)
          setFocusWithin(false)
        }}
      />
    </aside>
  )
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-[2px] lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[286px] max-w-[86vw] border-r border-ink-200 bg-white shadow-float focus:outline-none lg:hidden">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Workspace navigation and signed-in staff profile.</DialogPrimitive.Description>
          <SidebarContent mobile onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
