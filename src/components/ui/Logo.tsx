import logoImage from '@/assets/logo.jpg'
import { cn } from '@/lib/utils'

export function LogoMark({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <img
      src={logoImage}
      width={size}
      height={size}
      alt="Vishal Prem Bakery & Sweets"
      className={cn('shrink-0 rounded-xl object-contain ring-1 ring-ink-200/60', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function BrandLockup({
  compact,
  className,
  subtitle = 'Management',
}: {
  compact?: boolean
  className?: string
  subtitle?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 36 : 44} />
      <div className="min-w-0">
        <p className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight text-ink-950">
          Vishal Prem
        </p>
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">{subtitle}</p>
      </div>
    </div>
  )
}
