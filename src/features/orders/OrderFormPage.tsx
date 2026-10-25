import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Banknote,
  CircleDollarSign,
  Info,
  Plus,
  ReceiptText,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { useProductCatalogue } from '@/data/productCatalogue'
import { customersQuery } from '@/data/queries'
import { createOrderSecure } from '@/data/orders'
import { stockDemandByProduct } from '@/features/orders/orderStockWarning'
import { calculateLine, resolveOrderDiscount } from '@/lib/calculations'
import { formatINR, formatQuantity } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { uniqueId } from '@/lib/utils'
import { orderFormSchema, type OrderFormValues } from '@/lib/validation'
import type { Customer, OrderLine, Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { TextField, TextareaField, SelectField } from '@/components/ui/Field'
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

export function OrderFormPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, outlets, departments, business } = useWorkspace()
  const navigate = useNavigate()
  const requestId = useRef(uniqueId())
  const requestedDepartmentApplied = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const canRecordPayments = hasPermission(profile, 'paymentsManage')

  const outletId = selectedOutletId ?? ''
  const allowedDepartments = useMemo(
    () => scopedDepartments(profile, departments, outletId),
    [profile, departments, outletId],
  )
  const [searchParams] = useSearchParams()
  const requestedDepartmentId = searchParams.get('department')
  const requestedDepartment = requestedDepartmentId && allowedDepartments.some((item) => item.id === requestedDepartmentId)
    ? requestedDepartmentId
    : null
  const productsState = useProductCatalogue(profile, outletId)
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
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      outletId,
      departmentId: requestedDepartment ?? allowedDepartments[0]?.id ?? '',
      customerId: '',
      customerName: '',
      customerPhone: '',
      orderType: 'takeaway',
      channel: 'counter',
      notes: '',
      pickupAt: '',
      lines: [],
      discountType: 'none',
      discountValue: 0,
      advanceAmount: 0,
      paymentMode: 'cash',
      paymentReference: '',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchedLines = useWatch({ control, name: 'lines' })
  const departmentId = watch('departmentId')
  const discountType = watch('discountType')
  const advanceAmount = watch('advanceAmount')
  const paymentMode = watch('paymentMode')
  const customerId = watch('customerId')

  const productMap = useMemo(
    () => new Map(productsState.rows.map((product) => [product.id, product])),
    [productsState.rows],
  )

  const stockDemandByProductMap = useMemo(() => {
    return stockDemandByProduct(watchedLines ?? [], productMap)
  }, [productMap, watchedLines])

  useEffect(() => {
    if (outletId) setValue('outletId', outletId)
  }, [outletId, setValue])

  useEffect(() => {
    const current = getValues('departmentId')
    // Apply the workspace's requested department once, then leave the field
    // fully under the operator's control.
    if (!requestedDepartmentApplied.current && requestedDepartment) {
      requestedDepartmentApplied.current = true
      if (current !== requestedDepartment) setValue('departmentId', requestedDepartment)
      return
    }
    if (allowedDepartments.length > 0 && !allowedDepartments.some((item) => item.id === current)) {
      setValue('departmentId', allowedDepartments[0].id)
    }
  }, [allowedDepartments, requestedDepartment, getValues, setValue])

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
      discountType === 'amount' ? Math.round((Number(watch('discountValue')) || 0) * 100) : Number(watch('discountValue')) || 0,
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
  }, [watchedLines, productMap, discountType, advanceAmount, business?.pricesIncludeTax, watch])

  if (!selectedOutletId || !selectedOutlet) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before creating an order." />
  }
  if (!hasPermission(profile, 'ordersManage')) {
    return <ErrorState title="You cannot create orders" message="Your role does not include the Create & edit orders permission." />
  }

  function addProduct(product: Product) {
    if (product.departmentId !== getValues('departmentId')) {
      toast.error('That product belongs to a different department.')
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

  function switchDepartment(nextDepartment: string) {
    if (nextDepartment === departmentId) return
    if (fields.length > 0) {
      const message = 'Changing department will clear the current items. Continue?'
      if (!window.confirm(message)) return
      remove()
      toast.info('Items cleared for the new department')
    }
    setValue('departmentId', nextDepartment, { shouldDirty: true })
  }

  function selectCustomer(id: string) {
    setValue('customerId', id, { shouldDirty: true })
    const customer = customersState.rows.find((item) => item.id === id)
    if (customer) {
      setValue('customerName', customer.name, { shouldDirty: true })
      setValue('customerPhone', customer.phone ?? '', { shouldDirty: true })
    }
  }

  async function onSubmit(values: OrderFormValues) {
    if (!profile || !selectedOutlet) return
    if (values.lines.length === 0) {
      setError('root', { message: 'Add at least one product before saving the order.' })
      return
    }
    if (values.advanceAmount > 0 && !canRecordPayments) {
      setError('advanceAmount', { message: 'Your role cannot record payments. Save without an advance and collect later.' })
      return
    }
    if (totals.advancePaise > totals.totalPaise) {
      setError('advanceAmount', { message: 'The advance cannot be greater than the order total.' })
      return
    }
    try {
      const result = await createOrderSecure({
        values,
        requestId: requestId.current,
      })
      toast.success(`Order ${result.orderNumber} created`)
      navigate(`/admin/orders/${result.id}`, { replace: true })
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to="/admin/orders">Back to orders</Link>
      </Button>

      <PageHeader
        eyebrow={`${selectedOutlet.name} · Counter operations`}
        title="New order"
        description="Enter a counter or phone order. Stock is checked again at submission; prices and totals are recalculated from product records."
        help="orders"
        actions={<Badge tone="neutral">{outlets.length} outlet{outlets.length === 1 ? '' : 's'} available</Badge>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_360px]" noValidate>
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Order details</h2>
                <p className="text-xs text-ink-500">Department controls which products can be sold on this order.</p>
              </div>
              <ReceiptText className="h-5 w-5 text-ink-300" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Department"
                required
                value={departmentId}
                onChange={(event) => switchDepartment(event.target.value)}
                options={allowedDepartments.map((department) => ({ value: department.id, label: department.name }))}
                error={errors.departmentId?.message}
                disabled={allowedDepartments.length === 0}
                hint={allowedDepartments.length === 0 ? 'No active department is assigned to you for this outlet.' : undefined}
              />
              <SelectField
                label="Order type"
                options={[
                  { value: 'takeaway', label: 'Takeaway' },
                  { value: 'delivery', label: 'Delivery' },
                  { value: 'dine_in', label: 'Dine in' },
                ]}
                error={errors.orderType?.message}
                {...register('orderType')}
              />
              <SelectField
                label="Channel"
                options={[
                  { value: 'counter', label: 'Counter' },
                  { value: 'phone', label: 'Phone' },
                ]}
                error={errors.channel?.message}
                {...register('channel')}
              />
              <TextField
                label="Pickup / delivery time (optional)"
                type="datetime-local"
                error={errors.pickupAt?.message}
                {...register('pickupAt')}
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="font-display text-lg font-semibold">Customer</h2>
              <p className="text-xs text-ink-500">Link an existing account for history, or enter a walk-in name.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Customer account (optional)"
                value={customerId}
                onChange={(event) => selectCustomer(event.target.value)}
                options={[
                  { value: '', label: 'Walk-in / no account' },
                  ...customersState.rows
                    .filter((customer) => customer.active)
                    .map((customer) => ({ value: customer.id, label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}` })),
                ]}
                hint={customersState.loading ? 'Loading customer accounts…' : 'Selecting an account fills the name and phone.'}
              />
              <div className="flex items-end">
                {hasPermission(profile, 'customersManage') ? (
                  <Button asChild variant="outline" size="sm" leftIcon={<UserRoundPlus className="h-3.5 w-3.5" />}>
                    <Link to="/admin/customers/new">New customer account</Link>
                  </Button>
                ) : (
                  <p className="text-xs text-ink-400">Ask an administrator to add a customer account.</p>
                )}
              </div>
              <TextField label="Customer name" required placeholder="Walk-in customer" error={errors.customerName?.message} {...register('customerName')} />
              <TextField
                label="Phone (optional)"
                inputMode="tel"
                maxLength={10}
                placeholder="10-digit mobile"
                error={errors.customerPhone?.message}
                {...register('customerPhone')}
              />
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Items</h2>
                <p className="text-xs text-ink-500">{fields.length} line{fields.length === 1 ? '' : 's'} · edit quantity, rate and line discount</p>
              </div>
              <Button
                size="sm"
                onClick={() => setPickerOpen(true)}
                disabled={!departmentId}
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
                description="Add products from the catalogue. Only available products in the selected department appear in the picker."
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
                  const stockDemand = product?.trackStock
                    ? (stockDemandByProductMap.get(product.id) ?? 0)
                    : 0
                  const stockWarning =
                    product?.trackStock &&
                    product.stockQty !== undefined &&
                    Number.isFinite(product.stockQty) &&
                    stockDemand > product.stockQty
                  return (
                    <div key={field.id} className="px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-3">
                        <ProductThumb product={product} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink-900">{product?.name ?? 'Unknown product'}</p>
                              <p className="mt-0.5 text-[11px] text-ink-500">
                                {product?.category} · tax {product?.taxPercent ?? 0}% · {lineUnit(product)}
                              </p>
                            </div>
                            <IconButton label={`Remove ${product?.name ?? 'line'}`} size="sm" variant="ghost" onClick={() => remove(index)}>
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
                              placeholder="Message on cake, packing note…"
                              maxLength={160}
                              error={errors.lines?.[index]?.notes?.message}
                              {...register(`lines.${index}.notes`)}
                            />
                            {product?.trackStock && (
                              <p className={`pb-2 text-[11px] ${stockWarning ? 'font-semibold text-brand-700' : 'text-ink-500'}`}>
                                Stock: {formatQuantity(product.stockQty ?? 0, product.unit)}
                                {stockWarning ? ' · required quantity exceeds available stock' : ''}
                              </p>
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
            <h2 className="font-display text-lg font-semibold">Notes</h2>
            <p className="mb-3 text-xs text-ink-500">Visible to permitted staff on the order and where configured on slips.</p>
            <TextareaField
              label="Order notes"
              placeholder="Special instructions, delivery details or counter remarks."
              maxLength={500}
              error={errors.notes?.message}
              {...register('notes')}
            />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{formatINR(totals.subtotalPaise)}</dd></div>
              {totals.lineDiscountPaise > 0 && (
                <div className="flex justify-between text-sage-700"><dt>Line discounts</dt><dd className="tabular-nums">− {formatINR(totals.lineDiscountPaise)}</dd></div>
              )}
              {totals.orderDiscountPaise > 0 && (
                <div className="flex justify-between text-sage-700"><dt>Order discount</dt><dd className="tabular-nums">− {formatINR(totals.orderDiscountPaise)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-ink-500">Tax {totals.pricesIncludeTax ? '(included)' : ''}</dt><dd className="tabular-nums">{formatINR(totals.taxPaise)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(totals.totalPaise)}</dd></div>
              <div className="flex justify-between text-sage-700"><dt>Advance taken</dt><dd className="tabular-nums">{formatINR(totals.advancePaise)}</dd></div>
              <div className="flex justify-between font-semibold text-brand-700"><dt>Balance</dt><dd className="tabular-nums">{formatINR(totals.balancePaise)}</dd></div>
            </dl>
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
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Banknote className="h-4 w-4 text-sage-600" /> Advance payment</h2>
            <p className="text-xs text-ink-500">Optional. A separate receipt record is created for any advance.</p>
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
                <TextField
                  label="Payment reference"
                  placeholder={paymentMode === 'upi' ? 'UPI reference / UTR' : 'Reference number'}
                  error={errors.paymentReference?.message}
                  {...register('paymentReference')}
                />
              )}
              <p className="rounded-lg bg-ivory-50 px-3 py-2 text-[11px] text-ink-500">
                <CircleDollarSign className="mr-1 inline h-3 w-3" />
                Record further payments from the order screen after saving.
              </p>
            </div>
          </section>

          {errors.root?.message && (
            <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{errors.root.message}</p>
          )}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={isSubmitting} className="w-full" leftIcon={<ReceiptText className="h-4 w-4" />}>
              Save order
            </Button>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link to="/admin/orders">Cancel</Link>
            </Button>
            <p className="flex gap-1.5 px-1 text-[10px] leading-relaxed text-ink-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Stock is decremented once. The request is idempotent, so a retry after a network error will not duplicate the order.
            </p>
          </div>
        </aside>
      </form>

      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={productsState.rows}
        departments={departments}
        departmentIds={departmentId ? [departmentId] : []}
        onPick={addProduct}
      />
    </div>
  )
}
