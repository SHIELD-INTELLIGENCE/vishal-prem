import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { HelpLink } from './HelpLink'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  help,
  className,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  help?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p>}
        {help && (
          <div className="mt-2">
            <HelpLink article={help} />
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink-950">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
