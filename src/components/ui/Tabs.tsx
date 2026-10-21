import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  badge?: ReactNode
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  ariaLabel = 'Sections',
}: {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
  ariaLabel?: string
}) {
  const id = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === active)
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    const next = tabs[nextIndex]
    onChange(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div
      className={cn('flex gap-1 overflow-x-auto border-b border-ink-200', className)}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${id}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600',
              selected ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        )
      })}
    </div>
  )
}
