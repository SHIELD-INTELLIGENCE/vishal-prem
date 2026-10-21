import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, CheckCircle2, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { PermissionDenied } from '@/components/ui/Feedback'
import { LogoMark } from '@/components/ui/Logo'
import { setupSchema, type SetupValues } from '@/lib/validation'
import { setupWorkspace } from '@/data/settings'
import { useDocumentData } from '@/data/hooks'
import type { Business } from '@/types/models'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { friendlyFirebaseError } from '@/lib/errors'

export function SetupPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { data: business, loading } = useDocumentData<Business>('business/main')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      businessName: 'Vishal Prem Bakery & Sweets',
      legalName: 'Vishal Prem Bakery & Sweets',
      phone: '',
      email: '',
      addressLine1: '',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      pin: '',
      outletOneName: 'Vishal Prem — Main Outlet',
      outletOneCode: 'VP1',
      outletTwoName: 'Vishal Prem — Second Outlet',
      outletTwoCode: 'VP2',
    },
  })

  if (!profile || profile.role !== 'super_admin') return <PermissionDenied title="Only a Super Admin can run setup" />

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ivory-50">
        <div className="text-sm font-medium text-ink-500">Checking workspace…</div>
      </div>
    )
  }

  if (business) return <Navigate to="/admin" replace />

  async function onSubmit(values: SetupValues) {
    setSubmitError(null)
    try {
      await setupWorkspace(values, profile!)
      toast.success('Workspace created. Add your products and staff to get started.')
      navigate('/admin', { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <div className="min-h-dvh bg-ivory-50 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={52} />
          <div>
            <p className="font-display text-2xl font-semibold">Vishal Prem</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Workspace setup</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="surface-card p-5 sm:p-7">
            <div className="mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">First run</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Set up the business</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                This creates the business profile, both outlets and the four standard departments. You can edit everything later.
              </p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-800"><Building2 className="h-4 w-4 text-brand-600" /> Business</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Business name" required error={errors.businessName?.message} {...register('businessName')} />
                  <TextField label="Legal / invoice name" required error={errors.legalName?.message} {...register('legalName')} />
                  <TextField label="Phone" required inputMode="tel" placeholder="98765 43210" error={errors.phone?.message} {...register('phone')} />
                  <TextField label="Email (optional)" type="email" placeholder="hello@vishalprem.in" error={errors.email?.message} {...register('email')} />
                  <TextField label="Address" required containerClassName="sm:col-span-2" error={errors.addressLine1?.message} {...register('addressLine1')} />
                  <TextField label="City" required error={errors.city?.message} {...register('city')} />
                  <TextField label="State" required error={errors.state?.message} {...register('state')} />
                  <TextField label="PIN code" required inputMode="numeric" maxLength={6} error={errors.pin?.message} {...register('pin')} />
                </div>
              </section>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-800"><Store className="h-4 w-4 text-brand-600" /> Two outlets</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-ink-200 bg-ivory-50/50 p-3.5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">Outlet 1</p>
                    <div className="space-y-3">
                      <TextField label="Name" required error={errors.outletOneName?.message} {...register('outletOneName')} />
                      <TextField label="Short code" required maxLength={8} hint="Used in order numbers, e.g. VP1" error={errors.outletOneCode?.message} {...register('outletOneCode')} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-ink-200 bg-ivory-50/50 p-3.5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">Outlet 2</p>
                    <div className="space-y-3">
                      <TextField label="Name" required error={errors.outletTwoName?.message} {...register('outletTwoName')} />
                      <TextField label="Short code" required maxLength={8} hint="Used in order numbers, e.g. VP2" error={errors.outletTwoCode?.message} {...register('outletTwoCode')} />
                    </div>
                  </div>
                </div>
              </section>

              {submitError && <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{submitError}</p>}

              <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
                Create workspace
              </Button>
            </form>
          </div>

          <aside className="space-y-4">
            <div className="surface-card p-5">
              <h2 className="font-display text-lg font-semibold">What gets created</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-ink-600">
                {['Business profile for receipts and invoices', 'Two outlets, selectable in the top bar', 'Cake, Sweets, Hot Section and Gajak departments', 'No products, customers or orders — add those next'].map((item) => (
                  <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" /> {item}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
