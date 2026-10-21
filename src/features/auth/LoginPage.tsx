import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { loginSchema, type LoginValues } from '@/lib/validation'
import { friendlyFirebaseError } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { LoadingScreen } from '@/components/ui/Feedback'
import { LogoMark } from '@/components/ui/Logo'
import { safeAdminDestination } from '@/routing'
import { PasswordField } from './PasswordField'
import { AccountNotLinked, AccountSuspended, AuthErrorState, ConfigMissing } from './AuthStates'

export function LoginPage() {
  const { status, signIn, configMissing, firebaseUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as {
    from?: { pathname?: string; search?: string; hash?: string }
  } | null)?.from
  const from = safeAdminDestination(
    fromState?.pathname
      ? `${fromState.pathname}${fromState.search ?? ''}${fromState.hash ?? ''}`
      : null,
  )

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (status === 'ready') navigate(from, { replace: true })
  }, [status, navigate, from])

  if (configMissing) return <ConfigMissing />
  if (status === 'unlinked') return <AccountNotLinked />
  if (status === 'suspended') return <AccountSuspended />
  if (status === 'error') return <AuthErrorState />
  if (status === 'ready') return <Navigate to={from} replace />
  if (status === 'loading' && !firebaseUser) return <LoadingScreen label="Checking your session…" />

  async function onSubmit(values: LoginValues) {
    try {
      await signIn(values.email, values.password)
      toast.success('Signed in')
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 15%, #f6c2ca 0, transparent 28%), radial-gradient(circle at 85% 80%, #c8922c 0, transparent 32%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white p-1.5 shadow-lg">
              <LogoMark size={56} />
            </div>
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight">Vishal Prem</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-100">Bakery &amp; Sweets</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-lg font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-white xl:text-[54px]">
            The counter, the kitchen and the books — in one place.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-brand-100">
            Operations for both outlets. Orders, party bookings, payments and department-level control, without losing the daily rhythm of the shop.
          </p>
          <div className="mt-9 grid max-w-md gap-3 text-sm">
            {[
              { icon: Store, text: 'Two outlets with separate daily operations' },
              { icon: ShieldCheck, text: 'Roles scoped by department and outlet' },
              { icon: LockKeyhole, text: 'Deny-by-default Firestore authorization' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 backdrop-blur">
                <item.icon className="h-4 w-4 text-gold-200" />
                <span className="text-brand-50">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center justify-between border-t border-white/15 pt-5 text-[11px] text-brand-200">
          <span>Authorised staff only</span>
          <span>Operations &amp; billing</span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={48} />
            <div>
              <p className="font-display text-xl font-semibold">Vishal Prem</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Management</p>
            </div>
          </div>

          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">Staff access</p>
            <h2 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-ink-950">Sign in to the workspace</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">Use the staff account issued by your Super Admin.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <TextField
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@vishalprem.in"
              leftIcon={<Mail className="h-4 w-4" />}
              required
              error={errors.email?.message}
              {...register('email')}
            />
            <PasswordField
              id="login-password"
              label="Password"
              autoComplete="current-password"
              placeholder="Your password"
              required
              error={errors.password?.message}
              {...register('password')}
            />
            {errors.root?.message && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">
                {errors.root.message}
              </div>
            )}
            <div className="flex justify-end">
              <Link to="/admin/forgot-password" className="text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline">
                Forgot your password?
              </Link>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-400">
            Access is logged and role-restricted. If you believe you should have access, contact the Super Admin. Never share your password.
          </p>
        </div>
      </main>
    </div>
  )
}
