import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { HelpLink } from './HelpLink'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-4" aria-label="Loading data" role="status">
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-ink-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading records…
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton key={columnIndex} className={cn('h-4', columnIndex === 0 ? 'w-4/5' : 'w-2/3')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  help,
  className,
  compact,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  help?: string
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ivory-100 text-ink-400 ring-1 ring-ink-200">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
      {help && (
        <div className="mt-3">
          <HelpLink article={help} />
        </div>
      )}
    </div>
  )
}

export function ErrorState({
  title = 'Could not load this data',
  message,
  onRetry,
  help,
  className,
}: {
  title?: string
  message?: string
  onRetry?: () => void
  help?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)} role="alert">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-500">
        {message ?? 'Check your connection or permissions, then try again.'}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Retry
        </Button>
      )}
      {help && (
        <div className="mt-3">
          <HelpLink article={help} label="See troubleshooting help" />
        </div>
      )}
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-gold-200 bg-gold-50 px-4 py-2 text-xs font-medium text-gold-900 no-print">
      <WifiOff className="h-3.5 w-3.5" /> You are offline. Cached data is shown; changes will sync when the connection returns.
    </div>
  )
}
