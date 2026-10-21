import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Mail, MailCheck } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation'
import { friendlyFirebaseError } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { LogoMark } from '@/components/ui/Logo'
import { ConfigMissing } from './AuthStates'

export function ForgotPasswordPage() {
  const { resetPassword, configMissing } = useAuth()
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  if (configMissing) return <ConfigMissing />

  async function onSubmit(values: ForgotPasswordValues) {
    setSubmitError(null)
    try {
      await resetPassword(values.email)
      setSent(true)
    } catch (error) {
      setSubmitError(friendlyFirebaseError(error))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ivory-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark size={48} />
        <div>
          <p className="font-display text-xl font-semibold">Vishal Prem</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Management</p>
        </div>
      </div>
      <div className="surface-card w-full max-w-md p-6 sm:p-7">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-50 text-sage-700 ring-1 ring-sage-200">
              <MailCheck className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              If a staff account exists for that address, Firebase will send a password reset link. Check the spam folder if it does not arrive within a few minutes.
            </p>
            <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>Use a different email</Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">Enter your staff email. We will ask Firebase Authentication to send a reset link.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
              <TextField
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@vishalprem.in"
                leftIcon={<Mail className="h-4 w-4" />}
                required
                error={errors.email?.message}
                {...register('email')}
              />
              {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
              <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
            </form>
          </>
        )}
        <Link to="/admin/login" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-brand-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  )
}
