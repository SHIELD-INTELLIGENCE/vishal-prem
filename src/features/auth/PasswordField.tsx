import { useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

export function PasswordField({
  label = 'Password',
  error,
  hint,
  className,
  ...props
}: ComponentProps<'input'> & { label?: ReactNode; error?: string; hint?: ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="min-w-0">
      <label htmlFor={props.id} className="field-label">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className={cn('field-input pr-10', error && 'border-brand-400', className)}
          aria-invalid={Boolean(error) || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-ink-400 transition hover:text-ink-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  )
}
