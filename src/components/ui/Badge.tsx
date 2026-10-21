import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'info' | 'gold' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-sage-50 text-sage-700 ring-sage-200',
  warning: 'bg-gold-50 text-gold-800 ring-gold-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  gold: 'bg-gold-100 text-gold-800 ring-gold-200',
  danger: 'bg-brand-50 text-brand-800 ring-brand-300',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn('h-1.5 w-1.5 rounded-full bg-current', className)} aria-hidden />
}

export function StatusBadge({
  status,
  label,
}: {
  status: string
  label?: ReactNode
}) {
  const map: Record<string, Tone> = {
    draft: 'neutral',
    enquiry: 'neutral',
    confirmed: 'info',
    preparing: 'warning',
    in_production: 'warning',
    ready: 'gold',
    completed: 'success',
    cancelled: 'danger',
    unpaid: 'danger',
    partial: 'warning',
    paid: 'success',
    refunded: 'info',
    pending: 'neutral',
    in_progress: 'warning',
    done: 'success',
    packed: 'success',
    handed_over: 'info',
    active: 'success',
    inactive: 'neutral',
    suspended: 'danger',
    pending_invite: 'warning',
    accepted: 'success',
    revoked: 'neutral',
    cash: 'success',
    upi: 'info',
    card: 'brand',
    bank_transfer: 'brand',
    other: 'neutral',
  }
  const display = label ?? status.replace(/_/g, ' ')
  return <Badge tone={map[status] ?? 'neutral'} className="capitalize">{display}</Badge>
}
