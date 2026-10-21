import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  CalendarHeart,
  Check,
  Info,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { useCollectionData, useDocumentData } from '@/data/hooks'
import { customersQuery, productsQuery } from '@/data/queries'
import { updateBookingDetailsSecure } from '@/data/bookings'
import { calculateLine, resolveOrderDiscount } from '@/lib/calculations'
import { bookingEditSchema, type BookingEditValues } from '@/lib/validation'
import { formatDate, formatINR } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import type { Booking, Customer, OrderLine, Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CheckboxField, SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { ProductPickerDialog, ProductThumb } from '@/components/ProductPickerDialog'

function unitForProduct(product: Product | undefined): string {
  if (!product) return ''
  if (product.pricingMode === 'cake_lb') return 'lb'
  if (product.pricingMode === 'per_kg') return 'kg'
  if (product.pricingMode === 'per_box') return 'box'
  return product.unit
}

function defaultPrice(product: Product): number {
  if (product.pricingMode === 'cake_lb' && product.cakeSizes?.length) {
    const onePound = product.cakeSizes.find((size) => size.pounds === 1)
    return (onePound ?? product.cakeSizes[0]).pricePaise / 100
  }
  return product.salePricePaise / 100
}

/**
 * Booking edit screen. It writes only the editable commercial fields and keeps
 * immutable identity, stock snapshots, payments and operational history intact.
 */
export function BookingEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments, business } = useWorkspace()
  const bookingState = useDocumentData<Booking>(`bookings/${id}`, [id], Boolean(id))
  const booking = bookingState.data
  const [pickerOpen, setPickerOpen] = useState(false)
  const initialised = useRef(false)

  const outletId = booking?.outletId ?? selectedOutletId ?? ''
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
    reset,
    setValue,
    setError,
    watch,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BookingEditValues>({
    resolver: zodResolver(bookingEditSchema),
    defaultValues: {
      customerId: '',
      eventType: 'birthday',
      eventDate: '',
      eventTime: '12:00',
      fulfillment: 'pickup',
      deliveryAddress: '',
      departmentIds: [],
      instructions: '',
      lines: [],
      discountType: 'none',
      discountValue: 0,
      editReason: '',
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' })
  const watchedLines = useWatch({ control, name: 'lines' })
  const selectedDepartments = useWatch({ control, name: 'departmentIds' }) ?? []
  const discountType = watch('discountType')
  const discountValue = useWatch({ control, name: 'discountValue' })
  const fulfillment = watch('fulfillment')
  const customerId = watch('customerId')

  const productMap = useMemo(
    () => new Map(productsState.rows.map((product) => [product.id, product])),
    [productsState.rows],
  )

  useEffect(() => {
    if (!booking || initialised.current) return
    initialised.current = true
    reset({
      customerId: booking.customerId,
      eventType: booking.eventType,
      eventDate: booking.eventDate.slice(0, 10),
      eventTime: booking.eventTime,
      fulfillment: booking.fulfillment,
      deliveryAddress: booking.deliveryAddress ?? '',
      departmentIds: [...booking.departmentIds],
      instructions: booking.instructions ?? '',
      lines: booking.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPricePaise / 100,
        discountPercent: line.discountPercent,
        notes: line.notes ?? '',
      })),
      discountType: booking.discountType ?? 'none',
      discountValue: booking.discountValue ?? 0,
      editReason: '',
    })
  }, [booking, reset])

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
      const product = productMap.get(line.productId)
      const existing = booking?.lines.find((item) => item.id === line.id)
      return {
        id: line.id ?? `draft-${index}`,
        productId: line.productId,
        name: product?.name ?? existing?.name ?? '',
        printName: product?.printName ?? existing?.printName ?? '',
        departmentId: product?.departmentId ?? existing?.departmentId ?? '',
        pricingMode: product?.pricingMode ?? existing?.pricingMode ?? 'fixed',
        quantity: Number(line.quantity) || 0,
        unit: unitForProduct(product) || existing?.unit || '',
        unitPricePaise: Math.round((Number(line.unitPrice) || 0) * 100),
        discountPercent: Number(line.discountPercent) || 0,
        taxPercent: product?.taxPercent ?? existing?.taxPercent ?? 0,
      }
    })
    const beforeDiscount = lines.reduce((sum, line) => {
      const base = Math.round(line.quantity * line.unitPricePaise)
      return sum + base - Math.round((base * line.discountPercent) / 100)
    }, 0)
    const orderDiscountPaise = resolveOrderDiscount(
      beforeDiscount,
      discountType ?? 'none',
      discountType === 'amount'
        ? Math.round((Number(discountValue) || 0) * 100)
        : Number(discountValue) || 0,
    )
    const pricesIncludeTax = booking?.pricesIncludeTax ?? business?.pricesIncludeTax ?? false
    const lineTotals = lines.map((line) => calculateLine(line, pricesIncludeTax))
    const subtotalPaise = lineTotals.reduce((sum, line) => sum + line.basePaise, 0)
    const lineDiscountPaise = lineTotals.reduce((sum, line) => sum + line.discountPaise, 0)
    const net = Math.max(0, subtotalPaise - lineDiscountPaise - orderDiscountPaise)
    const factor = subtotalPaise - lineDiscountPaise > 0
      ? net / (subtotalPaise - lineDiscountPaise)
      : 0
    const taxPaise = Math.round(lineTotals.reduce((sum, line) => sum + line.taxPaise, 0) * factor)
    const totalPaise = pricesIncludeTax ? net : net + taxPaise
    return { subtotalPaise, lineDiscountPaise, orderDiscountPaise, taxPaise, totalPaise, pricesIncludeTax }
  }, [watchedLines, productMap, booking, business?.pricesIncludeTax, discountType, discountValue])

  if (bookingState.loading) {
    return <Skeleton className="h-96 w-full" />
  }
  if (bookingState.error || !booking) {
    return <ErrorState title="Booking not available" message={bookingState.error ?? 'This booking does not exist or you do not have access to it.'} onRetry={bookingState.reload} />
  }
  if (!hasPermission(profile, 'bookingsManage')) {
    return <ErrorState title="You cannot edit bookings" message="Your role does not include the Manage party bookings permission." />
  }
  if (!allowedDepartments.length) {
    return <EmptyState title="No department scope" description="Your profile does not include a department for this outlet." />
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

  function toggleDepartment(departmentId: string) {
    const current = getValues('departmentIds')
    const has = current.includes(departmentId)
    const currentLines = getValues('lines') ?? []
    const remaining = has
      ? currentLines.filter((line) => productMap.get(line.productId)?.departmentId !== departmentId)
      : currentLines
    if (has && remaining.length !== currentLines.length) {
      if (!window.confirm('Removing this department will remove its items. Continue?')) return
    }
    setValue('departmentIds', has ? current.filter((item) => item !== departmentId) : [...current, departmentId], { shouldDirty: true })
    if (remaining.length !== currentLines.length) replace(remaining)
  }

  async function onSubmit(values: BookingEditValues) {
    if (!profile) return
    if (values.fulfillment === 'delivery' && !values.deliveryAddress?.trim()) {
      setError('deliveryAddress', { message: 'Add a delivery address, or switch to pickup.' })
      return
    }
    try {
      await updateBookingDetailsSecure({
        bookingId: booking!.id,
        expectedRevision: booking!.revision ?? 0,
        values,
      })
      toast.success('Booking details updated')
      navigate(`/admin/bookings/${booking!.id}`, { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to={`/admin/bookings/${booking.id}`}>Back to booking</Link>
      </Button>

      <PageHeader
        eyebrow={`${selectedOutlet?.name ?? 'Outlet'} · Revision ${booking.revision ?? 0}`}
        title={`Edit ${booking.bookingNumber}`}
        description="Changes are recorded with your staff ID and a new revision. Payments, stock snapshots and lifecycle history are preserved."
        help="bookings"
        actions={<Badge tone="warning">Audited edit</Badge>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_340px]" noValidate>
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><CalendarHeart className="h-4 w-4 text-brand-600" /> Event details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Event type"
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
                options={[{ value: 'pickup', label: 'Pickup' }, { value: 'delivery', label: 'Delivery' }]}
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
                  error={errors.deliveryAddress?.message}
                  {...register('deliveryAddress')}
                />
              )}
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><UserRound className="h-4 w-4 text-brand-600" /> Customer</h2>
            <div className="mt-4">
              <SelectField
                label="Customer account"
                required
                value={customerId}
                onChange={(event) => setValue('customerId', event.target.value, { shouldDirty: true })}
                options={customersState.rows.filter((customer) => customer.active).map((customer) => ({
                  value: customer.id,
                  label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}`,
                }))}
                error={errors.customerId?.message}
                hint={booking.paidPaise > 0 ? 'A booking with recorded payments cannot be moved to another customer.' : undefined}
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Responsible departments</h2>
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
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Items</h2>
                <p className="text-xs text-ink-500">Existing line IDs are kept so completed production work is not detached.</p>
              </div>
              <Button size="sm" onClick={() => setPickerOpen(true)} disabled={!selectedDepartments.length} leftIcon={<Plus className="h-3.5 w-3.5" />}>Add product</Button>
            </div>
            {fields.length === 0 ? (
              <EmptyState compact title="No items" description="Add at least one product." />
            ) : (
              <div className="divide-y divide-ink-100">
                {fields.map((field, index) => {
                  const line = watchedLines?.[index]
                  const product = productMap.get(line?.productId ?? '')
                  const existing = booking.lines.find((item) => item.id === field.id)
                  const lineTotal = calculateLine({
                    quantity: Number(line?.quantity) || 0,
                    unitPricePaise: Math.round((Number(line?.unitPrice) || 0) * 100),
                    discountPercent: Number(line?.discountPercent) || 0,
                    taxPercent: product?.taxPercent ?? existing?.taxPercent ?? 0,
                  }, totals.pricesIncludeTax)
                  return (
                    <div key={field.id} className="px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-3">
                        <ProductThumb product={product} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{product?.name ?? existing?.name ?? 'Unknown product'}</p>
                              <p className="text-[11px] text-ink-500">{departments.find((item) => item.id === (product?.departmentId ?? existing?.departmentId))?.name} · {unitForProduct(product) || existing?.unit}</p>
                            </div>
                            <IconButton label="Remove line" size="sm" variant="ghost" onClick={() => remove(index)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <TextField label="Quantity" type="number" step="0.01" min={0} suffix={unitForProduct(product) || existing?.unit} error={errors.lines?.[index]?.quantity?.message} {...register(`lines.${index}.quantity`, { valueAsNumber: true })} />
                            <TextField label="Rate (₹)" type="number" step="0.01" min={0} error={errors.lines?.[index]?.unitPrice?.message} {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })} />
                            <TextField label="Discount %" type="number" step="0.01" min={0} max={100} error={errors.lines?.[index]?.discountPercent?.message} {...register(`lines.${index}.discountPercent`, { valueAsNumber: true })} />
                            <div><p className="field-label">Line total</p><p className="flex h-10 items-center text-sm font-bold tabular-nums">{formatINR(lineTotal.totalPaise)}</p></div>
                          </div>
                          <TextField label="Line note" maxLength={160} containerClassName="mt-2" error={errors.lines?.[index]?.notes?.message} {...register(`lines.${index}.notes`)} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Instructions</h2>
            <TextareaField containerClassName="mt-3" label="Booking instructions" maxLength={1000} error={errors.instructions?.message} {...register('instructions')} />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Revised summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{formatINR(totals.subtotalPaise)}</dd></div>
              {totals.lineDiscountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Line discounts</dt><dd>− {formatINR(totals.lineDiscountPaise)}</dd></div>}
              {totals.orderDiscountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Order discount</dt><dd>− {formatINR(totals.orderDiscountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-500">Tax</dt><dd>{formatINR(totals.taxPaise)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatINR(totals.totalPaise)}</dd></div>
              <div className="flex justify-between text-sage-700"><dt>Already paid</dt><dd>{formatINR(booking.paidPaise)}</dd></div>
              <div className="flex justify-between font-semibold text-brand-700"><dt>New balance</dt><dd>{formatINR(Math.max(0, totals.totalPaise - booking.paidPaise))}</dd></div>
            </dl>
            {totals.totalPaise < booking.paidPaise && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">The new total is below the amount already paid. Refund the difference before saving.</p>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Discount</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SelectField label="Type" options={[{ value: 'none', label: 'None' }, { value: 'percent', label: 'Percent' }, { value: 'amount', label: 'Amount' }]} error={errors.discountType?.message} {...register('discountType')} />
              <TextField label={discountType === 'percent' ? 'Percent' : 'Amount (₹)'} type="number" step="0.01" min={0} disabled={discountType === 'none'} error={errors.discountValue?.message} {...register('discountValue', { valueAsNumber: true })} />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Edit reason</h2>
            <TextareaField
              containerClassName="mt-3"
              label="Why is this booking changing?"
              required={booking.status === 'in_production'}
              maxLength={500}
              hint={booking.status === 'in_production' ? 'Required while the booking is in production.' : 'Optional, but useful for audit.'}
              error={errors.editReason?.message}
              {...register('editReason')}
            />
          </section>

          {errors.root?.message && <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{errors.root.message}</p>}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={isSubmitting} leftIcon={<Check className="h-4 w-4" />}>Save changes</Button>
            <Button variant="outline" asChild><Link to={`/admin/bookings/${booking.id}`}>Cancel</Link></Button>
            <p className="flex gap-1.5 px-1 text-[10px] leading-relaxed text-ink-400"><Info className="mt-0.5 h-3 w-3 shrink-0" /> Event date {formatDate(booking.eventDate)} · Revision {(booking.revision ?? 0) + 1}</p>
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
