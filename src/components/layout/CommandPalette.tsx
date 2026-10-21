import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, ChefHat, Search } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { NAV_GROUPS, QUICK_ACTIONS, type NavItem } from '@/navigation'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'
import { clampActive, isPaletteNavigationKey, nextActiveIndex } from './commandPaletteNav'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profile } = useAuth()
  const { selectedOutletId, departments } = useWorkspace()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])

  const departmentItems = useMemo<NavItem[]>(
    () => scopedDepartments(profile, departments, selectedOutletId ?? undefined).map((department) => ({
      to: `/admin/departments/${department.id}`,
      label: department.name,
      icon: ChefHat,
      permission: 'dashboardView',
      description: `Department workspace · ${department.code}`,
    })),
    [profile, departments, selectedOutletId],
  )

  const items = useMemo(() => {
    const nav = [...NAV_GROUPS.flatMap((group) => group.items), ...departmentItems]
    const all = [...QUICK_ACTIONS, ...nav]
    const seen = new Set<string>()
    return all.filter((item) => {
      if (!hasPermission(profile, item.permission)) return false
      if (seen.has(item.to)) return false
      seen.add(item.to)
      return true
    })
  }, [profile, departmentItems])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return items
    return items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(value))
  }, [items, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  // Keep the active index valid when filtering shrinks the list.
  useEffect(() => {
    setActive((value) => clampActive(value, filtered.length))
  }, [filtered.length])

  // Keep the active result visible for keyboard and pointer selection alike.
  useEffect(() => {
    if (!open) return
    const element = optionRefs.current[active]
    if (!element) return
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [active, filtered.length, open])

  function go(item: NavItem) {
    onOpenChange(false)
    navigate(item.to)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to"
      description="Navigate or start a common task."
      size="sm"
      hideClose
    >
      <div className="relative -mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const key = event.key
            if (isPaletteNavigationKey(key)) {
              event.preventDefault()
              setActive((value) => nextActiveIndex(value, key, filtered.length))
              return
            }
            if (key === 'Enter' && filtered[active]) {
              event.preventDefault()
              go(filtered[active])
            }
          }}
          placeholder="Search pages and actions…"
          className="field-input h-11 pl-9"
          aria-label="Search pages and actions"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={filtered[active] ? `command-${active}` : undefined}
        />
      </div>
      <ul id="command-list" role="listbox" className="mt-3 max-h-[52vh] space-y-0.5 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-500">No matching pages or actions.</li>
        )}
        {filtered.map((item, index) => (
          <li
            key={`${item.to}-${item.label}`}
            ref={(element) => { optionRefs.current[index] = element }}
            role="option"
            aria-selected={index === active}
            id={`command-${index}`}
          >
            <button
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                index === active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ivory-50',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.label}</span>
                <span className="block truncate text-[11px] text-ink-500">{item.description}</span>
              </span>
              {index === active && <CornerDownLeft className="h-3.5 w-3.5 text-ink-400" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[10px] text-ink-400">
        <span>↑↓ to move · Enter to open</span>
        <span>Esc to close</span>
      </div>
    </Dialog>
  )
}
