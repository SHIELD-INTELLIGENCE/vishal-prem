import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Boxes,
  Edit3,
  ImagePlus,
  Package,
  ReceiptText,
  ShieldCheck,
  Warehouse,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useDocumentData } from '@/data/hooks'
import { updateProductFlags } from '@/data/products'
import type { Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ToggleField } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatDateTime, formatINR, formatQuantity, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { StockAdjustmentDialog } from './StockAdjustmentDialog'

const PRICING_LABELS: Record<Product['pricingMode'], string> = {
  fixed: 'Fixed price',
  per_kg: 'Price per kg',
  per_box: 'Price per box',
  cake_lb: 'Cake price per pound',
}

export function ProductDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const { departments, outlets } = useWorkspace()
  const state = useDocumentData<Product>(`products/${id}`, [id], Boolean(id))
  const product = state.data
  const [busy, setBusy] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [product?.imageUrl])

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div>
      </div>
    )
  }
  if (state.error || !product) {
    return <ErrorState title="Product not available" message={state.error ?? 'This product does not exist or you do not have access to it.'} onRetry={state.reload} />
  }

  const department = departments.find((item) => item.id === product.departmentId)
  const lowStock = product.trackStock && (product.stockQty ?? 0) <= (product.criticalStock ?? 0)
  const canManage = hasPermission(profile, 'productsManage')
  const canAdjustStock = hasPermission(profile, 'inventoryAdjust')

  async function toggleFlag(patch: { active?: boolean; available?: boolean }) {
    if (!profile) return
    try {
      setBusy(true)
      await updateProductFlags(product!.id, patch, profile)
      toast.success('Product availability updated')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to="/admin/products">Back to products</Link>
      </Button>

      <PageHeader
        eyebrow={`${department?.name ?? 'Catalogue'} · ${product.category}`}
        title={product.name}
        description={`${product.group}${product.alias ? ` · ${product.alias}` : ''} · Updated ${formatDateTime(product.updatedAt)}`}
        help="products"
        actions={
          <>
            {canAdjustStock && product.trackStock && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ArrowUpDown className="h-3.5 w-3.5" />}
                onClick={() => setAdjustOpen(true)}
                disabled={busy}
              >
                Adjust stock
              </Button>
            )}
            {canManage && (
              <Button asChild variant="outline" size="sm" leftIcon={<Edit3 className="h-3.5 w-3.5" />}>
                <Link to={`/admin/products/${product.id}/edit`}>Edit product</Link>
              </Button>
            )}
            {hasPermission(profile, 'ordersManage') && product.active && product.available && (
              <Button asChild size="sm" leftIcon={<ReceiptText className="h-3.5 w-3.5" />}>
                <Link to="/admin/orders/new">Sell this product</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={product.active ? 'success' : 'neutral'}>{product.active ? 'Active' : 'Inactive'}</Badge>
        <Badge tone={product.available ? 'info' : 'warning'}>{product.available ? 'Sellable' : 'Temporarily unavailable'}</Badge>
        <Badge tone="neutral">{PRICING_LABELS[product.pricingMode]}</Badge>
        {product.trackStock ? (
          <Badge tone={lowStock ? 'warning' : 'neutral'}>
            {lowStock ? 'Low stock' : 'Stock tracked'} · {formatQuantity(product.stockQty ?? 0, product.unit)}
          </Badge>
        ) : (
          <Badge tone="neutral">Stock not tracked</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="surface-card overflow-hidden">
            <div className="grid gap-5 p-4 sm:grid-cols-[180px_1fr] sm:p-5">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-ivory-50">
                {product.imageUrl && !imageFailed ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-ink-400">
                    <ImagePlus className="h-7 w-7" />
                    <span className="text-[11px]">{product.imageUrl ? 'Image unavailable' : 'No image'}</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold">Catalogue details</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Print name</dt><dd className="font-medium">{product.printName}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Department</dt><dd className="font-medium">{department?.name ?? '—'}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Group</dt><dd className="font-medium">{product.group}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Category</dt><dd className="font-medium">{product.category}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Selling unit</dt><dd className="font-medium">{product.unit}{product.altUnit ? ` (alternate ${product.altUnit})` : ''}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Packaging</dt><dd className="font-medium">{product.packagingUnit || '—'}{product.boxQuantity ? ` · ${product.boxQuantity} per box` : ''}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">HSN / SAC</dt><dd className="font-medium">{product.hsn || '—'}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Tax</dt><dd className="font-medium">{product.taxPercent}% {product.taxCategory ? `· ${product.taxCategory}` : ''}</dd></div>
                </dl>
                {product.description && <p className="mt-4 text-sm leading-relaxed text-ink-600">{product.description}</p>}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {product.outletIds.map((id) => {
                    const outlet = outlets.find((item) => item.id === id)
                    return outlet ? <Badge key={id} tone="neutral">{outlet.name}</Badge> : null
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Boxes className="h-4 w-4 text-brand-600" /> Pricing</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Sale price</dt><dd className="mt-1 text-lg font-bold tabular-nums text-ink-900">{formatINR(product.salePricePaise)}</dd><dd className="text-[11px] text-ink-500">per {product.unit}</dd></div>
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">MRP</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{product.mrpPaise !== undefined ? formatINR(product.mrpPaise) : '—'}</dd><dd className="text-[11px] text-ink-500">optional</dd></div>
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Minimum sale</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{product.minSalePricePaise !== undefined ? formatINR(product.minSalePricePaise) : '—'}</dd><dd className="text-[11px] text-ink-500">order entry limit</dd></div>
            </dl>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between"><dt className="text-ink-500">Purchase price</dt><dd>{product.purchasePricePaise !== undefined ? formatINR(product.purchasePricePaise) : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Default discount</dt><dd>{product.discountPercent ? `${product.discountPercent}%` : 'None'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Conversion factor</dt><dd>{product.conversionFactor ?? 1}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Pricing mode</dt><dd>{titleCase(product.pricingMode)}</dd></div>
            </dl>
            {product.pricingMode === 'cake_lb' && product.cakeSizes?.length ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-ink-200">
                <table className="table-base">
                  <thead><tr><th>Size</th><th className="text-right">Pounds</th><th className="text-right">Price</th></tr></thead>
                  <tbody>
                    {product.cakeSizes.map((size) => (
                      <tr key={size.label}><td className="font-medium">{size.label}</td><td className="text-right">{size.pounds}</td><td className="text-right font-semibold tabular-nums">{formatINR(size.pricePaise)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Warehouse className="h-4 w-4 text-brand-600" /> Stock</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Current</dt><dd className={`mt-1 text-lg font-bold tabular-nums ${lowStock ? 'text-gold-800' : 'text-ink-900'}`}>{product.trackStock ? formatQuantity(product.stockQty ?? 0, product.unit) : 'Not tracked'}</dd></div>
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Critical level</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{product.trackStock ? formatQuantity(product.criticalStock ?? 0, product.unit) : '—'}</dd></div>
              <div className="rounded-xl bg-ivory-50 px-3 py-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Opening stock</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{product.openingStock !== undefined ? formatQuantity(product.openingStock, product.unit) : '—'}</dd></div>
            </div>
            {lowStock && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-medium text-gold-900">
                <AlertTriangle className="h-3.5 w-3.5" /> Stock is at or below the critical level.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {canManage && (
            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold">Availability controls</h2>
              <div className="mt-3 space-y-3">
                <ToggleField
                  checked={product.active}
                  onCheckedChange={(checked) => void toggleFlag({ active: checked })}
                  label="Product is active"
                  description="Inactive products cannot be ordered."
                  disabled={busy}
                />
                <ToggleField
                  checked={product.available}
                  onCheckedChange={(checked) => void toggleFlag({ available: checked })}
                  label="Currently available"
                  description="Turn off when sold out today."
                  disabled={busy || !product.active}
                />
              </div>
            </section>
          )}

          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><ShieldCheck className="h-4 w-4 text-sage-600" /> Record</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-ink-500">Product ID</dt><dd className="max-w-[170px] truncate font-mono">{product.id}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Created</dt><dd>{formatDateTime(product.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Updated</dt><dd>{formatDateTime(product.updatedAt)}</dd></div>
            </dl>
            <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-ink-400">
              <Package className="mt-0.5 h-3 w-3 shrink-0" /> Product history is preserved in placed orders even if this record is deactivated.
            </p>
          </section>
        </aside>
      </div>

      {canAdjustStock && product.trackStock && (
        <StockAdjustmentDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          product={product}
          onAdjusted={() => state.reload()}
        />
      )}
    </div>
  )
}
