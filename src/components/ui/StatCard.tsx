import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  tone = 'default',
  loading,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  trend?: { value: number; label?: string }
  tone?: 'default' | 'brand' | 'gold' | 'sage'
  loading?: boolean
}) {
  const tones = {
    default: 'bg-ivory-100 text-ink-600',
    brand: 'bg-brand-50 text-brand-700',
    gold: 'bg-gold-100 text-gold-700',
    sage: 'bg-sage-100 text-sage-700',
  }
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">{label}</p>
        {icon && <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-28" />
      ) : (
        <div className="stat-value mt-2.5">{value}</div>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-semibold',
              trend.value > 0 ? 'text-sage-700' : trend.value < 0 ? 'text-brand-700' : 'text-ink-500',
            )}
          >
            {trend.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : trend.value < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {trend.value > 0 ? '+' : ''}{trend.value.toFixed(0)}%
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  )
}
