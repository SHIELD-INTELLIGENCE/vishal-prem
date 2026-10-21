import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { addDays, format } from 'date-fns'
import {
  ArrowLeft,
  Banknote,
  CalendarHeart,
  Check,
  CircleDollarSign,
  Info,
  Plus,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { customersQuery, productsQuery } from '@/data/queries'
import { createBookingSecure } from '@/data/bookings'
import { calculateLine, resolveOrderDiscount } from '@/lib/calculations'
import { formatDate, formatINR, formatQuantity } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { uniqueId } from '@/lib/utils'
import { bookingFormSchema, type BookingFormValues } from '@/lib/validation'
import type { Customer, OrderLine, Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { CheckboxField, SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { ProductPickerDialog, ProductThumb } from '@/components/ProductPickerDialog'

function defaultPrice(product: Product): number {
  if (product.pricingMode === 'cake_lb' && product.cakeSizes?.length) {
    const onePound = product.cakeSizes.find((size) => size.pounds === 1)
    return (onePound ?? product.cakeSizes[0]).pricePaise / 100
  }
  return product.salePricePaise / 100
}

function lineUnit(product: Product | undefined): string {
  if (!product) return ''
  if (product.pricingMode === 'cake_lb') return 'lb'
  if (product.pricingMode === 'per_kg') return 'kg'
  if (product.pricingMode === 'per_box') return 'box'
  return product.unit
}

export function BookingFormPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments, business } = useWorkspace()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestId = useRef(uniqueId())
  const prefilledCustomer = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const canRecordPayments = hasPermission(profile, 'paymentsManage')

  const outletId = selectedOutletId ?? ''
  const allowedDepartments = useMemo(
    () => scopedDepartments(profile, departments, outletId),
    [profile, departments, outletId],
  )
  const productsState = useCollectionData<Product>(
    () => (profile && outletId ? productsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const customersState = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, 500) : null),
    [outletId],
    Boolean(outletId),
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    watch,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      outletId,
      customerId: '',
      eventType: 'birthday',
      eventDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      eventTime: '12:00',
      fulfillment: 'pickup',
      deliveryAddress: '',
      departmentIds: allowedDepartments[0] ? [allowedDepartments[0].id] : [],
      instructions: '',
      lines: [],
      discountType: 'none',
      discountValue: 0,
      advanceAmount: 0,
      paymentMode: 'cash',
      paymentReference: '',
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' })
  const watchedLines = useWatch({ control, name: 'lines' })
  const selectedDepartments = useWatch({ control, name: 'departmentIds' }) ?? []
  const discountType = watch('discountType')
  const discountValue = useWatch({ control, name: 'discountValue' })
  const advanceAmount = useWatch({ control, name: 'advanceAmount' })
  const paymentMode = watch('paymentMode')
  const fulfillment = watch('fulfillment')
  const customerId = watch('customerId')

  const productMap = useMemo(
    () => new Map(productsState.rows.map((product) => [product.id, product])),
    [productsState.rows],
  )

  useEffect(() => {
    if (outletId) setValue('outletId', outletId)
  }, [outletId, setValue])

  useEffect(() => {
    const preset = searchParams.get('customerId')
    if (!preset || prefilledCustomer.current || customersState.loading) return
    const customer = customersState.rows.find((item) => item.id === preset)
    if (!customer) return
    prefilledCustomer.current = true
    setValue('customerId', customer.id, { shouldDirty: false })
    const address = customer.addresses.find((item) => item.label === 'shipping') ?? customer.addresses[0]
    if (address) {
      setValue(
        'deliveryAddress',
        [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', '),
        { shouldDirty: false },
      )
    }
  }, [searchParams, customersState.loading, customersState.rows, setValue])

  useEffect(() => {
    const current = getValues('departmentIds')
    const allowedIds = new Set(allowedDepartments.map((department) => department.id))
    const next = current.filter((id) => allowedIds.has(id))
    if (next.length !== current.length) setValue('departmentIds', next)
  }, [allowedDepartments, getValues, setValue])

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const totals = useMemo(() => {
    const lines: OrderLine[] = (watchedLines ?? []).map((line, index) => {
      const product = productMap.get(line?.productId ?? '')
      return {
        id: `draft-${index}`,
        productId: line?.productId ?? '',
        name: product?.name ?? '',
        printName: product?.printName ?? '',
        departmentId: product?.departmentId ?? '',
        pricingMode: product?.pricingMode ?? 'fixed',
        quantity: Number(line?.quantity) || 0,
        unit: lineUnit(product),
        unitPricePaise: Math.round((Number(line?.unitPrice) || 0) * 100),
        discountPercent: Number(line?.discountPercent) || 0,
        taxPercent: product?.taxPercent ?? 0,
      }
    })
    const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
      const base = Math.round(line.quantity * line.unitPricePaise)
      return sum + base - Math.round((base * line.discountPercent) / 100)
    }, 0)
    const orderDiscountPaise = resolveOrderDiscount(
      subtotalAfterLineDiscount,
      discountType,
      discountType === 'amount' ? Math.round((Number(discountValue) || 0) * 100) : Number(discountValue) || 0,
    )
    const pricesIncludeTax = business?.pricesIncludeTax ?? false
    const lineTotals = lines.map((line) => calculateLine(line, pricesIncludeTax))
    const subtotalPaise = lineTotals.reduce((sum, line) => sum + line.basePaise, 0)
    const lineDiscountPaise = lineTotals.reduce((sum, line) => sum + line.discountPaise, 0)
    const net = Math.max(0, subtotalPaise - lineDiscountPaise - orderDiscountPaise)
    const factor = subtotalPaise - lineDiscountPaise > 0 ? net / (subtotalPaise - lineDiscountPaise) : 0
    const taxPaise = Math.round(lineTotals.reduce((sum, line) => sum + line.taxPaise, 0) * factor)
    const totalPaise = pricesIncludeTax ? net : net + taxPaise
    const advancePaise = Math.min(totalPaise, Math.round((Number(advanceAmount) || 0) * 100))
    return {
      subtotalPaise,
      lineDiscountPaise,
      orderDiscountPaise,
      taxPaise,
      totalPaise,
      advancePaise,
      balancePaise: Math.max(0, totalPaise - advancePaise),
      pricesIncludeTax,
    }
  }, [watchedLines, productMap, discountType, discountValue, advanceAmount, business?.pricesIncludeTax])

  if (!selectedOutletId || !selectedOutlet) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before creating a booking." />
  }
  if (!hasPermission(profile, 'bookingsManage')) {
    return <ErrorState title="You cannot create bookings" message="Your role does not include the Manage party bookings permission." />
  }

  function addProduct(product: Product) {
    if (!getValues('departmentIds').includes(product.departmentId)) {
      toast.error('Select the product’s department first.')
      return
    }
    append({
      productId: product.id,
      quantity: 1,
      unitPrice: defaultPrice(product),
      discountPercent: product.discountPercent ?? 0,
      notes: '',
    })
  }

  function toggleDepartment(id: string) {
    const current = getValues('departmentIds')
    const has = current.includes(id)
    const currentLines = getValues('lines') ?? []
    const remainingLines = has
      ? currentLines.filter((line) => productMap.get(line.productId)?.departmentId !== id)
      : currentLines
    if (has && remainingLines.length !== currentLines.length) {
      if (!window.confirm('Removing this department will remove its items. Continue?')) return
    }
    const next = has ? current.filter((item) => item !== id) : [...current, id]
    setValue('departmentIds', next, { shouldDirty: true })
    if (remainingLines.length !== currentLines.length) replace(remainingLines)
  }

  function selectCustomer(id: string) {
    setValue('customerId', id, { shouldDirty: true })
    const customer = customersState.rows.find((item) => item.id === id)
    if (customer) {
      const address = customer.addresses.find((item) => item.label === 'shipping') ?? customer.addresses[0]
      if (address) {
        setValue(
          'deliveryAddress',
          [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', '),
          { shouldDirty: true },
        )
      }
    }
  }

  async function onSubmit(values: BookingFormValues) {
    if (!profile || !selectedOutlet) return
    const customer = customersState.rows.find((item) => item.id === values.customerId)
    if (!customer) {
      setError('customerId', { message: 'Choose a customer or party account.' })
      return
    }
    if (values.lines.length === 0) {
      setError('root', { message: 'Add at least one product before saving the booking.' })
      return
    }
    if (values.advanceAmount > 0 && !canRecordPayments) {
      setError('advanceAmount', { message: 'Your role cannot record payments. Save without an advance and collect later.' })
      return
    }
    if (values.fulfillment === 'delivery' && !values.deliveryAddress?.trim()) {
      setError('deliveryAddress', { message: 'Add a delivery address, or switch to pickup.' })
      return
    }
    try {
      const result = await createBookingSecure({
        values,
        requestId: requestId.current,
      })
      toast.success(`Booking ${result.bookingNumber} created`)
      navigate(`/admin/bookings/${result.id}`, { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to="/admin/bookings">Back to bookings</Link>
      </Button>

      <PageHeader
        eyebrow={`${selectedOutlet.name} · Party bookings`}
        title="New party booking"
        description="Record a confirmed booking. Only active customer accounts can be linked to a booking."
        help="bookings"
        actions={<Badge tone="info">Advance optional</Badge>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_360px]" noValidate>
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Event details</h2>
                <p className="text-xs text-ink-500">This is the operational and delivery date, not the booking date.</p>
              </div>
              <CalendarHeart className="h-5 w-5 text-ink-300" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Event type"
                required
                options={[
                  { value: 'wedding', label: 'Wedding' },
                  { value: 'birthday', label: 'Birthday' },
                  { value: 'anniversary', label: 'Anniversary' },
                  { value: 'corporate', label: 'Corporate' },
                  { value: 'catering', label: 'Catering' },
                  { value: 'festival', label: 'Festival' },
                  { value: 'other', label: 'Other' },
                ]}
                error={errors.eventType?.message}
                {...register('eventType')}
              />
              <SelectField
                label="Fulfilment"
                options={[
                  { value: 'pickup', label: 'Pickup' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
                error={errors.fulfillment?.message}
                {...register('fulfillment')}
              />
              <TextField label="Event date" type="date" required error={errors.eventDate?.message} {...register('eventDate')} />
              <TextField label="Event time" type="time" required error={errors.eventTime?.message} {...register('eventTime')} />
              {fulfillment === 'delivery' && (
                <TextareaField
                  label="Delivery address"
                  required
                  containerClassName="sm:col-span-2"
                  placeholder="Venue, hall, landmark and contact instructions"
                  error={errors.deliveryAddress?.message}
                  {...register('deliveryAddress')}
                />
              )}
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Customer or party</h2>
                <p className="text-xs text-ink-500">Bookings must be linked to an account so advances and history stay together.</p>
              </div>
              {hasPermission(profile, 'customersManage') && (
                <Button asChild variant="outline" size="sm" leftIcon={<UserRoundPlus className="h-3.5 w-3.5" />}>
                  <Link to="/admin/customers/new">New account</Link>
                </Button>
              )}
            </div>
            <SelectField
              label="Customer account"
              required
              value={customerId}
              onChange={(event) => selectCustomer(event.target.value)}
              placeholder="Choose an account"
              options={customersState.rows
                .filter((customer) => customer.active)
                .map((customer) => ({ value: customer.id, label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}` }))}
              error={errors.customerId?.message}
              hint={customersState.loading ? 'Loading accounts…' : 'Only active accounts are listed.'}
            />
            {customerId && (() => {
              const customer = customersState.rows.find((item) => item.id === customerId)
              if (!customer) return null
              return (
                <div className="mt-3 grid gap-2 rounded-xl border border-ink-200 bg-ivory-50 p-3 text-xs text-ink-600 sm:grid-cols-3">
                  <p><span className="font-semibold text-ink-800">Phone:</span> {customer.phone || '—'}</p>
                  <p><span className="font-semibold text-ink-800">Group:</span> {customer.accountGroup.replace('_', ' ')}</p>
                  <p><span className="font-semibold text-ink-800">GSTIN:</span> {customer.gstin || '—'}</p>
                </div>
              )
            })()}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Responsible departments</h2>
            <p className="text-xs text-ink-500">Every item must belong to a selected department. Department admins only see their own.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {allowedDepartments.map((department) => (
                <CheckboxField
                  key={department.id}
                  label={department.name}
                  description={department.description}
                  checked={selectedDepartments.includes(department.id)}
                  onChange={() => toggleDepartment(department.id)}
                />
              ))}
            </div>
            {errors.departmentIds?.message && <p className="field-error mt-2" role="alert">{errors.departmentIds.message}</p>}
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Items</h2>
                <p className="text-xs text-ink-500">{fields.length} line{fields.length === 1 ? '' : 's'} across {selectedDepartments.length} department{selectedDepartments.length === 1 ? '' : 's'}</p>
              </div>
              <Button
                size="sm"
                onClick={() => setPickerOpen(true)}
                disabled={selectedDepartments.length === 0}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Add product
              </Button>
            </div>

            {productsState.loading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : productsState.error ? (
              <ErrorState message={productsState.error} onRetry={productsState.reload} />
            ) : fields.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-5 w-5" />}
                title="No items yet"
                description="Add cakes, sweets, snacks or gajak for this booking. Stock is checked at submission."
                action={<Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>Add the first product</Button>}
              />
            ) : (
              <div className="divide-y divide-ink-100">
                {fields.map((field, index) => {
                  const line = watchedLines?.[index]
                  const product = productMap.get(line?.productId ?? '')
                  const lineTotal = calculateLine(
                    {
                      quantity: Number(line?.quantity) || 0,
                      unitPricePaise: Math.round((Number(line?.unitPrice) || 0) * 100),
                      discountPercent: Number(line?.discountPercent) || 0,
                      taxPercent: product?.taxPercent ?? 0,
                    },
                    totals.pricesIncludeTax,
                  )
                  return (
                    <div key={field.id} className="px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-3">
                        <ProductThumb product={product} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink-900">{product?.name ?? 'Unknown product'}</p>
                              <p className="mt-0.5 text-[11px] text-ink-500">
                                {departments.find((item) => item.id === product?.departmentId)?.name} · tax {product?.taxPercent ?? 0}% · {lineUnit(product)}
                              </p>
                            </div>
                            <IconButton label="Remove line" size="sm" variant="ghost" onClick={() => remove(index)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <TextField
                              label="Quantity"
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={product?.pricingMode === 'fixed' || product?.pricingMode === 'per_box' ? 1 : 0.01}
                              suffix={lineUnit(product)}
                              error={errors.lines?.[index]?.quantity?.message}
                              {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                            />
                            <TextField
                              label="Rate (₹)"
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              error={errors.lines?.[index]?.unitPrice?.message}
                              {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                            />
                            <TextField
                              label="Discount %"
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step="0.01"
                              error={errors.lines?.[index]?.discountPercent?.message}
                              {...register(`lines.${index}.discountPercent`, { valueAsNumber: true })}
                            />
                            <div className="flex flex-col justify-end">
                              <p className="field-label">Line total</p>
                              <p className="flex h-10 items-center text-sm font-bold tabular-nums text-ink-900">{formatINR(lineTotal.totalPaise)}</p>
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                            <TextField
                              label="Line note (optional)"
                              placeholder="Cake message, design or packing note"
                              maxLength={160}
                              error={errors.lines?.[index]?.notes?.message}
                              {...register(`lines.${index}.notes`)}
                            />
                            {product?.trackStock && (
                              <p className="pb-2 text-[11px] text-ink-500">Stock: {formatQuantity(product.stockQty ?? 0, product.unit)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {typeof errors.lines?.message === 'string' && <p className="px-5 pb-4 text-sm text-brand-700">{errors.lines.message}</p>}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Instructions</h2>
            <p className="mb-3 text-xs text-ink-500">Design notes, delivery instructions and preparation requirements.</p>
            <TextareaField
              label="Booking instructions"
              placeholder="Cake message, colours, packaging, venue contact…"
              maxLength={1000}
              error={errors.instructions?.message}
              {...register('instructions')}
            />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{formatINR(totals.subtotalPaise)}</dd></div>
              {totals.lineDiscountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Line discounts</dt><dd className="tabular-nums">− {formatINR(totals.lineDiscountPaise)}</dd></div>}
              {totals.orderDiscountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Order discount</dt><dd className="tabular-nums">− {formatINR(totals.orderDiscountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-500">Tax {totals.pricesIncludeTax ? '(included)' : ''}</dt><dd className="tabular-nums">{formatINR(totals.taxPaise)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(totals.totalPaise)}</dd></div>
              <div className="flex justify-between text-sage-700"><dt>Advance</dt><dd className="tabular-nums">{formatINR(totals.advancePaise)}</dd></div>
              <div className="flex justify-between font-semibold text-brand-700"><dt>Balance</dt><dd className="tabular-nums">{formatINR(totals.balancePaise)}</dd></div>
            </dl>
            <p className="mt-3 text-[10px] text-ink-400">Event date: {formatDate(watch('eventDate'))} at {watch('eventTime') || '—'}</p>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Discount</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SelectField
                label="Type"
                options={[
                  { value: 'none', label: 'No discount' },
                  { value: 'percent', label: 'Percent' },
                  { value: 'amount', label: 'Amount' },
                ]}
                error={errors.discountType?.message}
                {...register('discountType')}
              />
              <TextField
                label={discountType === 'percent' ? 'Percent' : 'Amount (₹)'}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={discountType === 'none'}
                suffix={discountType === 'percent' ? '%' : undefined}
                error={errors.discountValue?.message}
                {...register('discountValue', { valueAsNumber: true })}
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Banknote className="h-4 w-4 text-sage-600" /> Advance</h2>
            {!canRecordPayments && (
              <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-[11px] text-ink-600">
                Your role cannot record payments. Save without an advance; a permitted user can collect later.
              </p>
            )}
            <div className="mt-3 space-y-3">
              <TextField
                label="Advance received (₹)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={!canRecordPayments}
                error={errors.advanceAmount?.message}
                {...register('advanceAmount', { valueAsNumber: true })}
              />
              <SelectField
                label="Payment mode"
                disabled={!canRecordPayments || totals.advancePaise <= 0}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'bank_transfer', label: 'Bank transfer' },
                  { value: 'other', label: 'Other' },
                ]}
                error={errors.paymentMode?.message}
                {...register('paymentMode')}
              />
              {totals.advancePaise > 0 && paymentMode !== 'cash' && (
                <TextField label="Payment reference" placeholder="UPI reference / UTR" error={errors.paymentReference?.message} {...register('paymentReference')} />
              )}
              <p className="flex gap-1.5 rounded-lg bg-ivory-50 px-3 py-2 text-[11px] text-ink-500">
                <CircleDollarSign className="mt-0.5 h-3 w-3 shrink-0" /> Advances create a separate payment receipt. Remaining balance is collected later.
              </p>
            </div>
          </section>

          {errors.root?.message && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{errors.root.message}</p>
          )}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={isSubmitting} className="w-full" leftIcon={<Check className="h-4 w-4" />}>
              Save booking
            </Button>
            <Button variant="outline" size="sm" asChild className="w-full"><Link to="/admin/bookings">Cancel</Link></Button>
            <p className="flex gap-1.5 px-1 text-[10px] leading-relaxed text-ink-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Saving creates a confirmed booking. Stock is checked at submission and is not reserved automatically; adjust stock separately if the booking consumes it.
            </p>
          </div>
        </aside>
      </form>

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={productsState.rows}
        departments={departments}
        departmentIds={selectedDepartments}
        onPick={addProduct}
      />
    </div>
  )
}
