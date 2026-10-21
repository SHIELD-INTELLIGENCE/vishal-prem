import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  CheckCircle2,
  Printer,
  ReceiptText,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { saveBusiness } from '@/data/settings'
import { savePrinterSettings } from '@/data/admin'
import { businessSettingsSchema, type BusinessSettingsValues } from '@/lib/validation'
import { friendlyFirebaseError } from '@/lib/errors'
import type { Business } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField, TextareaField, ToggleField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'

const EMPTY: BusinessSettingsValues = {
  name: '',
  legalName: '',
  tagline: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pin: '',
  gstin: '',
  pricesIncludeTax: false,
  defaultTaxPercent: 5,
  invoicePrefix: 'VP',
  upiId: '',
  receiptFooter: '',
}

function toValues(business: Business): BusinessSettingsValues {
  return {
    name: business.name,
    legalName: business.legalName,
    tagline: business.tagline ?? '',
    phone: business.phone,
    email: business.email ?? '',
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2 ?? '',
    city: business.city,
    state: business.state,
    pin: business.pin,
    gstin: business.gstin ?? '',
    pricesIncludeTax: business.pricesIncludeTax,
    defaultTaxPercent: business.defaultTaxPercent,
    invoicePrefix: business.invoicePrefix,
    upiId: business.upiId ?? '',
    receiptFooter: business.receiptFooter ?? '',
  }
}

export function SettingsPage() {
  const { profile } = useAuth()
  const { business } = useWorkspace()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [printer, setPrinter] = useState<Business['printer']>({
    receiptWidth: '80mm',
    kitchenWidth: '80mm',
    packingSlipSize: 'a5',
  })
  const [printerBusy, setPrinterBusy] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BusinessSettingsValues>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (!business) return
    reset(toValues(business))
    setPrinter(business.printer)
  }, [business, reset])

  const pricesIncludeTax = watch('pricesIncludeTax')
  const taxPercent = watch('defaultTaxPercent')

  if (!profile) return null
  if (!business) {
    return (
      <ErrorState
        title="Business profile unavailable"
        message="The workspace has not been set up yet, or the business profile could not be read."
      />
    )
  }

  async function onSubmit(values: BusinessSettingsValues) {
    setSubmitError(null)
    try {
      await saveBusiness(values, business, profile!)
      toast.success('Business profile saved')
      reset(values)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  async function savePrinter() {
    setPrinterBusy(true)
    try {
      await savePrinterSettings(printer, profile!)
      toast.success('Printing preferences saved')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Business identity, tax defaults and print preferences. Changes apply to both outlets."
        help="settings"
        actions={
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isDirty}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            Save business profile
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Business profile</h2>
                <p className="text-xs leading-relaxed text-ink-500">This appears on receipts, packing slips, quotations and invoices.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Business name" required error={errors.name?.message} {...register('name')} />
              <TextField label="Legal / invoice name" required error={errors.legalName?.message} {...register('legalName')} />
              <TextField label="Tagline" error={errors.tagline?.message} {...register('tagline')} />
              <TextField label="Phone" required inputMode="tel" error={errors.phone?.message} {...register('phone')} />
              <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
              <TextField label="GSTIN" maxLength={15} hint="Leave blank if the business is not GST-registered." error={errors.gstin?.message} {...register('gstin')} />
              <TextField label="Address line 1" required containerClassName="sm:col-span-2" error={errors.addressLine1?.message} {...register('addressLine1')} />
              <TextField label="Address line 2" containerClassName="sm:col-span-2" error={errors.addressLine2?.message} {...register('addressLine2')} />
              <TextField label="City" required error={errors.city?.message} {...register('city')} />
              <TextField label="State" required error={errors.state?.message} {...register('state')} />
              <TextField label="PIN code" required inputMode="numeric" maxLength={6} error={errors.pin?.message} {...register('pin')} />
              <TextField label="UPI ID" placeholder="business@bank" hint="Printed on receipts when provided." error={errors.upiId?.message} {...register('upiId')} />
              <TextareaField
                label="Receipt footer"
                containerClassName="sm:col-span-2"
                rows={3}
                hint="A short thank-you or exchange note. Keep it factual."
                error={errors.receiptFooter?.message}
                {...register('receiptFooter')}
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
                <ReceiptText className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Tax and invoicing</h2>
                <p className="text-xs leading-relaxed text-ink-500">Defaults for new catalogue entries. Existing products keep their own tax values.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Default tax rate (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                error={errors.defaultTaxPercent?.message}
                {...register('defaultTaxPercent', { valueAsNumber: true })}
              />
              <TextField
                label="Invoice prefix"
                required
                maxLength={12}
                hint="Used when showing invoice references, e.g. VP/VP1/ORD-…"
                error={errors.invoicePrefix?.message}
                {...register('invoicePrefix')}
              />
              <div className="sm:col-span-2">
                <ToggleField
                  checked={pricesIncludeTax}
                  onCheckedChange={(checked) => setValue('pricesIncludeTax', checked, { shouldDirty: true })}
                  label="Selling prices include GST"
                  description={
                    pricesIncludeTax
                      ? 'Tax is extracted from the selling price instead of being added on top.'
                      : `Tax is added on top of the selling price at the product’s rate (default ${taxPercent || 0}%).`
                  }
                />
              </div>
            </div>
          </section>

          {submitError && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save business profile</Button>
            <Button type="button" variant="outline" disabled={!isDirty} onClick={() => reset(toValues(business))}>
              Discard changes
            </Button>
            {isDirty && <span className="text-xs font-medium text-gold-800">Unsaved changes</span>}
          </div>
        </form>

        <aside className="space-y-5">
          <section className="surface-card p-4 sm:p-5">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ivory-100 text-ink-600">
                <Printer className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Printing</h2>
                <p className="text-xs text-ink-500">Preview width preferences.</p>
              </div>
            </div>

            <div className="space-y-4">
              <SelectField
                label="Receipt paper"
                value={printer.receiptWidth}
                onChange={(event) =>
                  setPrinter((current) => ({ ...current, receiptWidth: event.target.value as Business['printer']['receiptWidth'] }))
                }
                options={[
                  { value: '80mm', label: '80 mm thermal roll' },
                  { value: 'a5', label: 'A5 sheet' },
                ]}
                hint="Sets the paper width used by the receipt preview."
              />
              <div className="rounded-xl border border-ink-200 bg-ivory-50/60 p-3 text-xs leading-relaxed text-ink-600">
                <p className="font-semibold text-ink-800">Fixed paper sizes</p>
                <p className="mt-0.5">Kitchen tickets: 80 mm. Packing slips: A5.</p>
              </div>
              <Button variant="outline" className="w-full" loading={printerBusy} onClick={() => void savePrinter()}>
                Save printing preferences
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
