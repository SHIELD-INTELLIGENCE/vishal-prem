import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Check,
  CircleUserRound,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useDocumentData } from '@/data/hooks'
import { saveCustomer } from '@/data/customers'
import { customerSchema, ACCOUNT_GROUPS, type CustomerValues } from '@/lib/validation'
import type { Customer } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatINR, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'

function toValues(customer: Customer): CustomerValues {
  return {
    name: customer.name,
    alias: customer.alias ?? '',
    type: customer.type,
    accountGroup: customer.accountGroup,
    phone: customer.phone ?? '',
    altPhone: customer.altPhone ?? '',
    email: customer.email ?? '',
    addresses: customer.addresses.map((address) => ({ ...address })),
    state: customer.state ?? '',
    pin: customer.pin ?? '',
    gstin: customer.gstin ?? '',
    pan: customer.pan ?? '',
    openingBalance: customer.openingBalancePaise / 100,
    creditLimit: customer.creditLimitPaise !== undefined ? customer.creditLimitPaise / 100 : undefined,
    notes: customer.notes ?? '',
    outletIds: customer.outletIds,
    active: customer.active,
  }
}

const optionalNumber = (value: string) => (value === '' ? undefined : Number(value))

export function CustomerFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, outlets } = useWorkspace()
  const customerState = useDocumentData<Customer>(id ? `customers/${id}` : null, [id], Boolean(id))
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      alias: '',
      type: 'individual',
      accountGroup: 'retail_customer',
      phone: '',
      altPhone: '',
      email: '',
      addresses: [],
      state: 'Uttar Pradesh',
      pin: '',
      gstin: '',
      pan: '',
      openingBalance: 0,
      creditLimit: undefined,
      notes: '',
      outletIds: selectedOutletId ? [selectedOutletId] : [],
      active: true,
    },
  })

  const { fields: addresses, append, remove } = useFieldArray({ control, name: 'addresses' })
  const type = watch('type')

  useEffect(() => {
    if (!customerState.data) return
    reset(toValues(customerState.data))
  }, [customerState.data, reset])

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  if (!selectedOutletId || !selectedOutlet) {
    return <ErrorState title="No outlet selected" message="Assign an outlet to your profile before creating a customer account." />
  }
  if (!hasPermission(profile, 'customersManage')) {
    return <ErrorState title="You cannot edit customer accounts" message="Your role does not include the Manage customers & parties permission." />
  }
  if (isEdit && customerState.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    )
  }
  if (isEdit && (customerState.error || !customerState.data)) {
    return <ErrorState title="Customer not available" message={customerState.error ?? 'This customer does not exist or you do not have access to it.'} onRetry={customerState.reload} />
  }

  async function onSubmit(values: CustomerValues) {
    if (!profile) return
    setSubmitError(null)
    if (values.outletIds.length === 0) {
      setSubmitError('Assign this account to at least one outlet.')
      return
    }
    try {
      const savedId = await saveCustomer({ values, existing: customerState.data, profile })
      toast.success(isEdit ? 'Customer account updated' : 'Customer account created')
      navigate(`/admin/customers/${savedId}`, { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to={isEdit ? `/admin/customers/${id}` : '/admin/customers'}>Back to customers</Link>
      </Button>

      <PageHeader
        eyebrow="Accounts"
        title={isEdit ? `Edit ${customerState.data?.name ?? 'customer'}` : 'New customer or party'}
        description="Collect only what is needed for billing and delivery. Aadhaar and other identity numbers are not required."
        help="customers"
        actions={<Badge tone="info"><ShieldCheck className="mr-1 h-3 w-3" /> Minimal data</Badge>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_340px]" noValidate>
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><CircleUserRound className="h-4 w-4 text-brand-600" /> Account</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Name / party name" required placeholder="Meera Sharma or Gupta Wedding Events" error={errors.name?.message} {...register('name')} />
              <TextField label="Alias / short name" placeholder="Meera" error={errors.alias?.message} {...register('alias')} />
              <SelectField
                label="Account type"
                options={[{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business / party' }]}
                error={errors.type?.message}
                {...register('type')}
              />
              <SelectField
                label="Account group"
                options={ACCOUNT_GROUPS.map((value) => ({ value, label: titleCase(value) }))}
                error={errors.accountGroup?.message}
                {...register('accountGroup')}
              />
              <TextField label="Mobile number" inputMode="tel" maxLength={10} placeholder="10-digit mobile" error={errors.phone?.message} {...register('phone')} />
              <TextField label="Alternate phone" inputMode="tel" placeholder="Optional" error={errors.altPhone?.message} {...register('altPhone')} />
              <TextField label="Email" type="email" placeholder="Optional" error={errors.email?.message} {...register('email')} />
              <div className="sm:col-span-2">
                <p className="field-label">Accounts at outlets</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {outlets.map((outlet) => (
                    <CheckboxField key={outlet.id} label={outlet.name} description={outlet.code} value={outlet.id} {...register('outletIds')} />
                  ))}
                </div>
                {errors.outletIds?.message && <p className="field-error" role="alert">{errors.outletIds.message}</p>}
              </div>
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><MapPin className="h-4 w-4 text-brand-600" /> Addresses</h2>
                <p className="text-xs text-ink-500">Optional. Add a billing or delivery address when the account needs one.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                disabled={addresses.length >= 4}
                onClick={() => append({ label: addresses.length === 0 ? 'billing' : 'shipping', line1: '', line2: '', city: '', state: 'Uttar Pradesh', pin: '' })}
              >
                Add address
              </Button>
            </div>
            {addresses.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ivory-50 px-4 py-5 text-center text-xs text-ink-500">
                No address on file. The account can still be used for counter sales.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {addresses.map((address, index) => (
                  <div key={address.id} className="rounded-xl border border-ink-200 p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Address {index + 1}</p>
                      <IconButton label="Remove address" size="sm" variant="ghost" onClick={() => remove(index)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Label"
                        options={[{ value: 'billing', label: 'Billing' }, { value: 'shipping', label: 'Shipping' }, { value: 'other', label: 'Other' }]}
                        error={errors.addresses?.[index]?.label?.message}
                        {...register(`addresses.${index}.label`)}
                      />
                      <TextField label="PIN code" inputMode="numeric" maxLength={6} error={errors.addresses?.[index]?.pin?.message} {...register(`addresses.${index}.pin`)} />
                      <TextField label="Address line 1" containerClassName="sm:col-span-2" error={errors.addresses?.[index]?.line1?.message} {...register(`addresses.${index}.line1`)} />
                      <TextField label="Address line 2" containerClassName="sm:col-span-2" error={errors.addresses?.[index]?.line2?.message} {...register(`addresses.${index}.line2`)} />
                      <TextField label="City" error={errors.addresses?.[index]?.city?.message} {...register(`addresses.${index}.city`)} />
                      <TextField label="State" error={errors.addresses?.[index]?.state?.message} {...register(`addresses.${index}.state`)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Tax details</h2>
            <p className="text-xs text-ink-500">Required only for business invoicing. Never collect Aadhaar for customer accounts.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="GSTIN" maxLength={15} placeholder="22AAAAA0000A1Z5" error={errors.gstin?.message} {...register('gstin')} />
              <TextField label="PAN" maxLength={10} placeholder="ABCDE1234F" error={errors.pan?.message} {...register('pan')} />
              <TextField label="State" placeholder="Uttar Pradesh" error={errors.state?.message} {...register('state')} />
              <TextField label="PIN code" inputMode="numeric" maxLength={6} error={errors.pin?.message} {...register('pin')} />
              {type === 'business' && !watch('gstin') && !watch('pan') && (
                <p className="sm:col-span-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-900">A business account needs either a GSTIN or a PAN.</p>
              )}
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Opening balance and notes</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField
                label="Opening balance (₹)"
                type="number"
                inputMode="decimal"
                step="0.01"
                hint="Positive = advance/credit held. Negative = amount outstanding."
                error={errors.openingBalance?.message}
                {...register('openingBalance', { valueAsNumber: true })}
              />
              <TextField
                label="Credit limit (₹, optional)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                error={errors.creditLimit?.message}
                {...register('creditLimit', { setValueAs: optionalNumber })}
              />
              <TextareaField label="Internal notes" containerClassName="sm:col-span-2" maxLength={500} placeholder="Preferences, delivery notes or account context." error={errors.notes?.message} {...register('notes')} />
            </div>
            <p className="mt-3 text-[11px] text-ink-400">Opening balances are informational records. They are not auto-settled by new payments.</p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Account status</h2>
            <div className="mt-3 space-y-3">
              <ToggleField
                checked={watch('active')}
                onCheckedChange={(checked) => setValue('active', checked, { shouldDirty: true })}
                label="Account is active"
                description="Inactive accounts stay in history but cannot be chosen for new bookings."
              />
              <p className="text-xs text-ink-500">New accounts are available at every outlet you selected above.</p>
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Preview</h2>
            <p className="mt-2 font-semibold text-ink-900">{watch('name') || 'Customer name'}</p>
            <p className="text-xs text-ink-500">{watch('phone') || 'No phone'} · {titleCase(watch('accountGroup'))}</p>
            <p className="mt-2 text-sm tabular-nums">Opening: {formatINR(Math.round((watch('openingBalance') || 0) * 100))}</p>
            {watch('gstin') && <p className="mt-1 font-mono text-[11px] text-ink-500">{watch('gstin')}</p>}
          </section>

          {submitError && <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{submitError}</p>}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={isSubmitting} className="w-full" leftIcon={<Check className="h-4 w-4" />}>
              {isEdit ? 'Save changes' : 'Create account'}
            </Button>
            <Button variant="outline" size="sm" asChild className="w-full"><Link to={isEdit ? `/admin/customers/${id}` : '/admin/customers'}>Cancel</Link></Button>
          </div>
        </aside>
      </form>
    </div>
  )
}
