import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Boxes,
  Check,
  ImagePlus,
  IndianRupee,
  Package,
  Plus,
  Trash2,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { useDocumentData } from '@/data/hooks'
import { deleteProductImage, saveProduct, type ProductImageValue } from '@/data/products'
import { productSchema, PRICING_MODES, type ProductValues } from '@/lib/validation'
import type { Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { CheckboxField, SelectField, TextField, TextareaField, ToggleField } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { formatINR, formatQuantity } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'

function toValues(product: Product): ProductValues {
  return {
    name: product.name,
    alias: product.alias ?? '',
    printName: product.printName,
    group: product.group,
    category: product.category,
    departmentId: product.departmentId,
    outletIds: product.outletIds,
    pricingMode: product.pricingMode,
    unit: product.unit,
    altUnit: product.altUnit ?? '',
    conversionFactor: product.conversionFactor,
    packagingUnit: product.packagingUnit ?? '',
    boxQuantity: product.boxQuantity,
    cakeSizes: product.cakeSizes?.map((size) => ({
      label: size.label,
      pounds: size.pounds,
      price: size.pricePaise / 100,
    })) ?? [],
    salePrice: product.salePricePaise / 100,
    purchasePrice: product.purchasePricePaise !== undefined ? product.purchasePricePaise / 100 : undefined,
    mrp: product.mrpPaise !== undefined ? product.mrpPaise / 100 : undefined,
    minSalePrice: product.minSalePricePaise !== undefined ? product.minSalePricePaise / 100 : undefined,
    discountPercent: product.discountPercent ?? 0,
    taxPercent: product.taxPercent,
    taxCategory: product.taxCategory ?? '',
    hsn: product.hsn ?? '',
    trackStock: product.trackStock,
    openingStock: product.openingStock,
    stockQty: product.stockQty,
    criticalStock: product.criticalStock,
    batchTracking: product.batchTracking ?? false,
    expiryTracking: product.expiryTracking ?? false,
    description: product.description ?? '',
    active: product.active,
    available: product.available,
  }
}

function sameImage(
  first: ProductImageValue | null,
  second: ProductImageValue | null,
): boolean {
  return (first?.url ?? '') === (second?.url ?? '') && (first?.path ?? '') === (second?.path ?? '')
}

const optionalNumber = (value: string) => (value === '' ? undefined : Number(value))

export function ProductFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, outlets, departments, business } = useWorkspace()
  const outletId = selectedOutletId ?? ''
  const productState = useDocumentData<Product>(id ? `products/${id}` : null, [id], Boolean(id))
  const canAdjustStock = hasPermission(profile, 'inventoryAdjust')

  const allowedDepartments = useMemo(
    () => scopedDepartments(profile, departments, outletId),
    [profile, departments, outletId],
  )

  const [image, setImage] = useState<ProductImageValue | null>(null)
  const [baselineImage, setBaselineImage] = useState<ProductImageValue | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const hydratedProductIdRef = useRef<string | null>(null)
  const baselineProductRef = useRef<Product | null>(null)
  const pendingImagePathsRef = useRef<Set<string>>(new Set())
  const isDirtyRef = useRef(false)
  const imageDirtyRef = useRef(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      alias: '',
      printName: '',
      group: '',
      category: '',
      departmentId: allowedDepartments[0]?.id ?? '',
      outletIds: outletId ? [outletId] : [],
      pricingMode: 'fixed',
      unit: 'piece',
      altUnit: '',
      conversionFactor: 1,
      packagingUnit: '',
      cakeSizes: [],
      salePrice: 0,
      purchasePrice: undefined,
      mrp: undefined,
      minSalePrice: undefined,
      discountPercent: 0,
      taxPercent: business?.defaultTaxPercent ?? 5,
      taxCategory: 'GST',
      hsn: '',
      trackStock: false,
      openingStock: undefined,
      stockQty: undefined,
      criticalStock: undefined,
      batchTracking: false,
      expiryTracking: false,
      description: '',
      active: true,
      available: true,
    },
  })

  const imageDirty = !sameImage(image, baselineImage)
  isDirtyRef.current = isDirty
  imageDirtyRef.current = imageDirty

  const { fields: cakeSizes, append: appendCakeSize, remove: removeCakeSize } = useFieldArray({ control, name: 'cakeSizes' })
  const pricingMode = watch('pricingMode')
  const trackStock = watch('trackStock')
  const name = useWatch({ control, name: 'name' })
  const salePrice = useWatch({ control, name: 'salePrice' })
  const taxPercent = useWatch({ control, name: 'taxPercent' })
  const active = watch('active')
  const available = watch('available')

  useEffect(() => {
    const product = productState.data
    if (!product) return

    const nextImage = product.imageUrl
      ? { url: product.imageUrl, path: product.imagePath ?? '' }
      : null
    const isInitialHydration = hydratedProductIdRef.current !== product.id

    if (isInitialHydration) {
      hydratedProductIdRef.current = product.id
      baselineProductRef.current = product
      pendingImagePathsRef.current.clear()
      reset(toValues(product))
      setImage(nextImage)
      setBaselineImage(nextImage)
      return
    }

    // A live catalogue update must not silently replace what the user is
    // editing. Only refresh a pristine form whose image has not changed.
    if (isDirtyRef.current || imageDirtyRef.current) return
    baselineProductRef.current = product
    reset(toValues(product))
    setImage(nextImage)
    setBaselineImage(nextImage)
  }, [productState.data, reset])

  const hasUnsavedChanges = isDirty || imageDirty

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  if (!selectedOutletId || !selectedOutlet) {
    return <ErrorState title="No outlet selected" message="Select an outlet before creating a product." />
  }
  if (!hasPermission(profile, 'productsManage')) {
    return <ErrorState title="You cannot edit the catalogue" message="Your role does not include the Manage catalogue permission." />
  }
  if (isEdit && productState.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }
  if (isEdit && (productState.error || !productState.data)) {
    return <ErrorState title="Product not available" message={productState.error ?? 'This product does not exist or you do not have access to it.'} onRetry={productState.reload} />
  }

  function handleImageUploaded(value: ProductImageValue) {
    if (value.path) pendingImagePathsRef.current.add(value.path)
  }

  async function onSubmit(values: ProductValues) {
    if (!profile) return
    setSubmitError(null)
    if (values.outletIds.length === 0) {
      setSubmitError('Assign this product to at least one outlet.')
      return
    }
    try {
      const savedId = await saveProduct({
        values,
        // Keep the form's loaded snapshot as the comparison baseline. The data
        // layer reads the live document separately and preserves its stock.
        existing: baselineProductRef.current ?? productState.data,
        image,
        profile,
      })

      const previousImagePath = baselineImage?.path ?? ''
      const savedImagePath = image?.path ?? ''
      const pathsToDelete = new Set<string>()
      if (previousImagePath && previousImagePath !== savedImagePath) {
        pathsToDelete.add(previousImagePath)
      }
      for (const path of pendingImagePathsRef.current) {
        if (path && path !== savedImagePath) pathsToDelete.add(path)
      }

      pendingImagePathsRef.current.clear()
      setBaselineImage(image)
      for (const path of pathsToDelete) {
        void deleteProductImage(path).catch(() => undefined)
      }

      toast.success(isEdit ? 'Product updated' : 'Product created')
      navigate(`/admin/products/${savedId}`, { replace: true })
    } catch (error) {
      const orphanCount = pendingImagePathsRef.current.size
      if (orphanCount > 0) {
        console.warn(
          `[product-image] ${orphanCount} uploaded image(s) are not referenced because the product save failed.`,
        )
      }
      const message = friendlyFirebaseError(error)
      const nextMessage = orphanCount > 0
        ? `${message} The new image was uploaded but the product was not saved. Retry saving; the previous image has not been removed.`
        : message
      setSubmitError(nextMessage)
      toast.error(nextMessage)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to={isEdit ? `/admin/products/${id}` : '/admin/products'}>Back to products</Link>
      </Button>

      <PageHeader
        eyebrow="Catalogue"
        title={isEdit ? `Edit ${productState.data?.name ?? 'product'}` : 'New product'}
        description="Pricing, units, stock and availability feed order entry, booking totals and printed slips."
        help="product-pricing"
        actions={isEdit ? <Badge tone={active ? 'success' : 'neutral'}>{active ? (available ? 'Active & sellable' : 'Active, unavailable') : 'Inactive'}</Badge> : undefined}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_340px]" noValidate>
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Package className="h-4 w-4 text-brand-600" /> Identity</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Product name" required placeholder="Chocolate Truffle Cake" error={errors.name?.message} {...register('name')} />
              <TextField label="Alias / short name" placeholder="Truffle cake" error={errors.alias?.message} {...register('alias')} />
              <TextField label="Print name" required placeholder="TRUFFLE CAKE" hint="Shown on kitchen and packing slips." error={errors.printName?.message} {...register('printName')} />
              <TextField label="Group" required placeholder="Cakes" error={errors.group?.message} {...register('group')} />
              <TextField label="Category" required placeholder="Celebration Cakes" error={errors.category?.message} {...register('category')} />
              <SelectField
                label="Department"
                required
                options={allowedDepartments.map((department) => ({ value: department.id, label: department.name }))}
                error={errors.departmentId?.message}
                {...register('departmentId')}
              />
              <div className="sm:col-span-2">
                <p className="field-label">Available at outlets</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {outlets.map((outlet) => (
                    <CheckboxField key={outlet.id} label={outlet.name} description={outlet.code} value={outlet.id} {...register('outletIds')} />
                  ))}
                </div>
                {errors.outletIds?.message && <p className="field-error" role="alert">{errors.outletIds.message}</p>}
              </div>
              <TextareaField label="Description" containerClassName="sm:col-span-2" maxLength={600} placeholder="Ingredients, finish and staff notes." error={errors.description?.message} {...register('description')} />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><IndianRupee className="h-4 w-4 text-brand-600" /> Pricing and units</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Pricing mode"
                required
                options={PRICING_MODES.map((mode) => ({
                  value: mode,
                  label: { fixed: 'Fixed price per unit', per_kg: 'Price per kilogram', per_box: 'Price per box', cake_lb: 'Cake price per pound' }[mode],
                }))}
                error={errors.pricingMode?.message}
                {...register('pricingMode')}
              />
              <TextField
                label="Selling unit"
                required
                placeholder={pricingMode === 'cake_lb' ? 'lb' : pricingMode === 'per_kg' ? 'kg' : pricingMode === 'per_box' ? 'box' : 'piece'}
                hint={pricingMode === 'cake_lb' ? 'Must contain “lb”.' : pricingMode === 'per_kg' ? 'Must contain “kg”.' : undefined}
                error={errors.unit?.message}
                {...register('unit')}
              />
              <TextField
                label="Sale price (₹)"
                required
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                error={errors.salePrice?.message}
                {...register('salePrice', { valueAsNumber: true })}
              />
              <TextField
                label="MRP (₹, optional)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                error={errors.mrp?.message}
                {...register('mrp', { setValueAs: optionalNumber })}
              />
              <TextField
                label="Purchase price (₹, optional)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                error={errors.purchasePrice?.message}
                {...register('purchasePrice', { setValueAs: optionalNumber })}
              />
              <TextField
                label="Minimum sale price (₹, optional)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                hint="Order entry refuses rates below this value."
                error={errors.minSalePrice?.message}
                {...register('minSalePrice', { setValueAs: optionalNumber })}
              />
              <TextField
                label="Default line discount (%)"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                error={errors.discountPercent?.message}
                {...register('discountPercent', { valueAsNumber: true })}
              />
              <TextField
                label="Tax percent"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                error={errors.taxPercent?.message}
                {...register('taxPercent', { valueAsNumber: true })}
              />
              <TextField label="Tax category" placeholder="GST 5%" error={errors.taxCategory?.message} {...register('taxCategory')} />
              <TextField label="HSN / SAC" placeholder="1905" maxLength={8} error={errors.hsn?.message} {...register('hsn')} />
            </div>

            <div className="mt-4 grid gap-4 rounded-xl border border-ink-200 bg-ivory-50/60 p-3.5 sm:grid-cols-3">
              <TextField label="Alternate unit (optional)" placeholder="500 g" error={errors.altUnit?.message} {...register('altUnit')} />
              <TextField
                label="Conversion factor"
                type="number"
                inputMode="decimal"
                min={0.0001}
                step="0.0001"
                disabled={isEdit}
                hint={isEdit
                  ? 'Locked after creation because existing order snapshots use this value.'
                  : 'Stock units consumed per selling unit.'}
                error={errors.conversionFactor?.message}
                {...register('conversionFactor', { setValueAs: optionalNumber })}
              />
              <TextField label="Packaging unit (optional)" placeholder="Box" error={errors.packagingUnit?.message} {...register('packagingUnit')} />
              {pricingMode === 'per_box' && (
                <TextField
                  label="Pieces per box"
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  error={errors.boxQuantity?.message}
                  {...register('boxQuantity', { setValueAs: optionalNumber })}
                />
              )}
            </div>

            {pricingMode === 'cake_lb' && (
              <div className="mt-5 rounded-xl border border-ink-200 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Cake size price list</h3>
                    <p className="text-xs text-ink-500">Prices are per size. Order entry starts at the 1 lb price where available.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => appendCakeSize({ label: '', pounds: 1, price: salePrice || 0 })}
                  >
                    Add size
                  </Button>
                </div>
                {cakeSizes.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-ivory-50 px-3 py-2 text-xs text-ink-500">Add at least one size (for example 500 g, 1 lb, 2 lb).</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {cakeSizes.map((size, index) => (
                      <div key={size.id} className="grid items-end gap-2 sm:grid-cols-[1fr_100px_130px_36px]">
                        <TextField label="Label" placeholder="1 lb" error={errors.cakeSizes?.[index]?.label?.message} {...register(`cakeSizes.${index}.label`)} />
                        <TextField label="Pounds" type="number" min={0.1} step="0.1" error={errors.cakeSizes?.[index]?.pounds?.message} {...register(`cakeSizes.${index}.pounds`, { valueAsNumber: true })} />
                        <TextField label="Price (₹)" type="number" min={0} step="0.01" error={errors.cakeSizes?.[index]?.price?.message} {...register(`cakeSizes.${index}.price`, { valueAsNumber: true })} />
                        <IconButton label="Remove size" size="sm" variant="ghost" onClick={() => removeCakeSize(index)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </div>
                    ))}
                  </div>
                )}
                {typeof errors.cakeSizes?.message === 'string' && <p className="field-error mt-2">{errors.cakeSizes.message}</p>}
              </div>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Warehouse className="h-4 w-4 text-brand-600" /> Stock</h2>
            {isEdit ? (
              <div className="mt-4 space-y-4">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-ivory-50 px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Current stock</dt>
                    <dd className="mt-1 text-base font-semibold tabular-nums">
                      {trackStock
                        ? formatQuantity(productState.data?.stockQty ?? 0, productState.data?.unit ?? 'unit')
                        : 'Not tracked'}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-ivory-50 px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Opening stock</dt>
                    <dd className="mt-1 text-base font-semibold tabular-nums">
                      {productState.data?.openingStock !== undefined
                        ? formatQuantity(productState.data.openingStock, productState.data.unit)
                        : '—'}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-ivory-50 px-3 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Inventory control</dt>
                    <dd className="mt-1 text-sm font-semibold">{trackStock ? 'Tracked' : 'Not tracked'}</dd>
                  </div>
                </dl>
                {trackStock && (
                  <TextField
                    label="Critical level"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    hint="Low-stock warnings appear at or below this level."
                    error={errors.criticalStock?.message}
                    {...register('criticalStock', { setValueAs: optionalNumber })}
                  />
                )}
                <p className="rounded-xl border border-ink-200 bg-ivory-50/60 px-3.5 py-3 text-[11px] leading-relaxed text-ink-500">
                  Stock quantity and opening balance are controlled by the separate <strong>Adjust stock</strong> action on the product page. Saving product details keeps the live balance. Stock tracking and the conversion factor are locked after creation so existing order snapshots and stock meaning cannot be changed by a metadata edit.
                </p>
              </div>
            ) : canAdjustStock ? (
              <div className="mt-4 space-y-3">
                <ToggleField
                  checked={trackStock}
                  onCheckedChange={(checked) => setValue('trackStock', checked, { shouldDirty: true })}
                  label="Track stock for this product"
                  description="When enabled, stock is checked and decremented by counter orders."
                />
                {trackStock && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Opening stock"
                      required
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      hint="Recorded once when the tracked product is created."
                      error={errors.openingStock?.message}
                      {...register('openingStock', { setValueAs: optionalNumber })}
                    />
                    <TextField
                      label="Critical level"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      hint="Low-stock warnings appear at or below this level."
                      error={errors.criticalStock?.message}
                      {...register('criticalStock', { setValueAs: optionalNumber })}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-ink-200 bg-ivory-50/60 px-3.5 py-3 text-xs leading-relaxed text-ink-500">
                You can create an untracked product. Only staff with the <strong>Adjust stock</strong> permission can create a stock-tracked product or set opening stock.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><ImagePlus className="h-4 w-4 text-brand-600" /> Product image</h2>
            <div className="mt-3">
              <ImageUpload
                imageUrl={image?.url}
                outletId={outletId}
                onChange={setImage}
                onUploaded={handleImageUploaded}
              />
              <TextField
                label="Or use an image URL"
                containerClassName="mt-3"
                placeholder="https://…"
                value={image?.url ?? ''}
                onChange={(event) => setImage(event.target.value ? { url: event.target.value, path: image?.path ?? '' } : null)}
                hint="Paste a hosted image URL, or upload a file above."
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Preview</h2>
            <div className="mt-3 flex gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ivory-100">
                {image?.url ? <img src={image.url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-ink-300" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{name || 'Product name'}</p>
                <p className="text-xs text-ink-500">{formatINR(Math.round((salePrice || 0) * 100))} per {watch('unit') || 'unit'}</p>
                <p className="mt-1 text-[11px] text-ink-400">Tax {taxPercent || 0}% · {business?.pricesIncludeTax ? 'price includes tax' : 'tax added at billing'}</p>
              </div>
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Availability</h2>
            <div className="mt-3 space-y-3">
              <ToggleField
                checked={active}
                onCheckedChange={(checked) => setValue('active', checked, { shouldDirty: true })}
                label="Product is active"
                description="Inactive products stay in history but cannot be sold."
              />
              <ToggleField
                checked={available}
                onCheckedChange={(checked) => setValue('available', checked, { shouldDirty: true })}
                label="Currently available"
                description="Turn off temporarily when an item is sold out."
                disabled={!active}
              />
              <p className="flex gap-1.5 text-[11px] leading-relaxed text-ink-400">
                <Boxes className="mt-0.5 h-3 w-3 shrink-0" /> Outlet and department assignment also limits where this product appears.
              </p>
            </div>
          </section>

          {submitError && <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">{submitError}</p>}

          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" loading={isSubmitting} className="w-full" leftIcon={<Check className="h-4 w-4" />}>
              {isEdit ? 'Save changes' : 'Create product'}
            </Button>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link to={isEdit ? `/admin/products/${id}` : '/admin/products'}>Cancel</Link>
            </Button>
          </div>
        </aside>
      </form>
    </div>
  )
}
