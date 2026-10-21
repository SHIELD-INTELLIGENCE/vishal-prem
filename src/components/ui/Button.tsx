import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-ink-900 text-white shadow-sm hover:bg-ink-800 active:bg-ink-950 disabled:bg-ink-400',
  outline:
    'border border-ink-200 bg-white text-ink-800 shadow-sm hover:border-ink-300 hover:bg-ivory-50 active:bg-ivory-100 disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-ivory-100 hover:text-ink-950 active:bg-ivory-200',
  danger: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[15px]',
  icon: 'h-9 w-9 rounded-lg',
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  asChild?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = 'button',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = (asChild ? Slot : 'button') as ElementType
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {asChild ? <Slottable>{children}</Slottable> : children}
      {!loading && rightIcon}
    </Comp>
  )
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonProps & { label: string }) {
  return <Button size="icon" variant="ghost" aria-label={label} title={label} className={className} {...props} />
}
