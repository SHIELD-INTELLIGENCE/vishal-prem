import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface FieldShellProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  htmlFor?: string
  className?: string
  children: ReactNode
}

export function FieldShell({ label, hint, error, required, htmlFor, className, children }: FieldShellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {required && <span className="ml-1 text-brand-600" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps extends ComponentProps<'input'> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  containerClassName?: string
  leftIcon?: ReactNode
  suffix?: ReactNode
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  id,
  leftIcon,
  suffix,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400" aria-hidden>
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'field-input',
            Boolean(leftIcon) && 'pl-9',
            Boolean(suffix) && 'pr-12',
            error && 'border-brand-400 focus:border-brand-500 focus:ring-brand-100',
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {suffix && <div className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-ink-500">{suffix}</div>}
      </div>
    </FieldShell>
  )
}

export interface TextareaFieldProps extends ComponentProps<'textarea'> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  containerClassName?: string
}

export function TextareaField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  id,
  ...props
}: TextareaFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <textarea
        id={inputId}
        className={cn('field-input min-h-24 resize-y', error && 'border-brand-400', className)}
        aria-invalid={Boolean(error) || undefined}
        {...props}
      />
    </FieldShell>
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectFieldProps extends ComponentProps<'select'> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  containerClassName?: string
  options: SelectOption[]
  placeholder?: string
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  id,
  options,
  placeholder,
  ...props
}: SelectFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <select
        id={inputId}
        className={cn('field-input appearance-none bg-[right_0.75rem_center] bg-no-repeat pr-9', error && 'border-brand-400', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23857463' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        aria-invalid={Boolean(error) || undefined}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export interface CheckboxFieldProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode
  description?: ReactNode
  error?: string
}

export function CheckboxField({ label, description, error, className, id, ...props }: CheckboxFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2.5">
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            id={inputId}
            type="checkbox"
            className="peer h-4 w-4 appearance-none rounded border border-ink-300 bg-white transition checked:border-brand-600 checked:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            {...props}
          />
          <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
        </span>
        <span>
          <span className="block text-sm font-medium text-ink-800">{label}</span>
          {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{description}</span>}
        </span>
      </label>
      {error && <p className="field-error ml-6" role="alert">{error}</p>}
    </div>
  )
}

export interface ToggleFieldProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  id?: string
}

export function ToggleField({ checked, onCheckedChange, label, description, disabled, id }: ToggleFieldProps) {
  const generatedId = useId()
  const toggleId = id ?? generatedId
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-ink-200 bg-white px-4 py-3">
      <label htmlFor={toggleId} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold text-ink-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{description}</span>}
      </label>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-ink-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}
