import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Download, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useProductCatalogue } from '@/data/productCatalogue'
import { setProductsActive } from '@/data/products'
import type { Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatINR, formatQuantity } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { ProductThumb } from '@/components/ProductPickerDialog'

const PRICING_LABELS: Record<Product['pricingMode'], string> = {
  fixed: 'Fixed',
  per_kg: 'Per kg',
  per_box: 'Per box',
  cake_lb: 'Cake / lb',
}

export function ProductsPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const navigate = useNavigate()
  const [department, setDepartment] = useState('all')
  const [state, setState] = useState('all')
  const [busy, setBusy] = useState(false)

  const outletId = selectedOutletId ?? ''
  const products = useProductCatalogue(profile, outletId)

  const rows = useMemo(() => {
    return products.rows.filter((product) => {
      if (department !== 'all' && product.departmentId !== department) return false
      if (state === 'active' && !product.active) return false
      if (state === 'inactive' && product.active) return false
      if (state === 'low' && !(product.trackStock && (product.stockQty ?? 0) <= (product.criticalStock ?? 0))) return false
      if (state === 'unavailable' && product.available) return false
      return true
    })
  }, [products.rows, department, state])

  const summary = useMemo(() => {
    const active = products.rows.filter((product) => product.active)
    const low = products.rows.filter((product) => product.trackStock && (product.stockQty ?? 0) <= (product.criticalStock ?? 0))
    return {
      total: products.rows.length,
      active: active.length,
      available: active.filter((product) => product.available).length,
      low: low.length,
    }
  }, [products.rows])

  const columns: DataColumn<Product>[] = [
    {
      key: 'product',
      header: 'Product',
      accessor: (product) => product.name,
      sortable: true,
      render: (product) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={product} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{product.name}</p>
            <p className="truncate text-[11px] text-ink-500">{product.category} · {product.group}{product.alias ? ` · ${product.alias}` : ''}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      accessor: (product) => departments.find((item) => item.id === product.departmentId)?.name ?? '—',
      hideBelow: 'lg',
      render: (product) => <span className="text-xs text-ink-600">{departments.find((item) => item.id === product.departmentId)?.name ?? '—'}</span>,
    },
    {
      key: 'pricing',
      header: 'Pricing',
      accessor: (product) => product.pricingMode,
      hideBelow: 'md',
      render: (product) => <Badge tone="neutral">{PRICING_LABELS[product.pricingMode]}</Badge>,
    },
    {
      key: 'price',
      header: 'Sale price',
      accessor: (product) => product.salePricePaise,
      sortable: true,
      align: 'right',
      csvValue: (product) => (product.salePricePaise / 100).toFixed(2),
      render: (product) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatINR(product.salePricePaise)}</p>
          <p className="text-[10px] text-ink-500">per {product.unit}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      accessor: (product) => (product.trackStock ? product.stockQty ?? 0 : Number.MAX_SAFE_INTEGER),
      sortable: true,
      hideBelow: 'md',
      render: (product) => {
        if (!product.trackStock) return <span className="text-[11px] text-ink-400">Not tracked</span>
        const low = (product.stockQty ?? 0) <= (product.criticalStock ?? 0)
        return (
          <div className="flex items-center gap-1.5">
            {low && <AlertTriangle className="h-3.5 w-3.5 text-gold-700" />}
            <span className={`text-xs tabular-nums ${low ? 'font-semibold text-gold-800' : 'text-ink-600'}`}>
              {formatQuantity(product.stockQty ?? 0, product.unit)}
            </span>
            <span className="text-[10px] text-ink-400">/ {formatQuantity(product.criticalStock ?? 0, product.unit)} critical</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (product) => (product.active ? (product.available ? 'Active' : 'Unavailable') : 'Inactive'),
      sortable: true,
      render: (product) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={product.active ? 'success' : 'neutral'}>{product.active ? 'Active' : 'Inactive'}</Badge>
          {product.active && <Badge tone={product.available ? 'info' : 'warning'}>{product.available ? 'Sellable' : 'Unavailable'}</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (product) => (
        <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link to={`/admin/products/${product.id}`}>View</Link>
        </Button>
      ),
    },
  ]

  async function bulkActive(selected: Product[], active: boolean, clear: () => void) {
    if (!profile) return
    try {
      setBusy(true)
      await setProductsActive(selected, active, profile)
      toast.success(`${selected.length} product${selected.length === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}`)
      clear()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing products." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description={`Product master for ${selectedOutlet?.name ?? 'this outlet'}. Pricing, stock, tax and availability are scoped by department.`}
        actions={
          hasPermission(profile, 'productsManage') ? (
            <Button asChild leftIcon={<Plus className="h-4 w-4" />}><Link to="/admin/products/new">New product</Link></Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Products', value: summary.total.toString() },
          { label: 'Active', value: summary.active.toString() },
          { label: 'Sellable now', value: summary.available.toString() },
          { label: 'Low stock', value: summary.low.toString() },
        ].map((item) => (
          <div key={item.label} className="surface-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{item.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(product) => product.id}
        loading={products.loading}
        error={products.error}
        onRetry={products.reload}
        searchPlaceholder="Search product, alias, category or group…"
        searchFields={(product) => [product.name, product.alias, product.printName, product.sku, product.category, product.group, product.hsn, product.id]}
        exportFilename={`products-${selectedOutlet?.code ?? 'outlet'}.csv`}
        emptyTitle="No products yet"
        emptyDescription="Add products so staff can sell them from the order entry screen. Products can be scoped to one or both outlets."
        emptyHelp="products"
        emptyAction={
          hasPermission(profile, 'productsManage') ? (
            <Button asChild size="sm" leftIcon={<Package className="h-4 w-4" />}><Link to="/admin/products/new">Add a product</Link></Button>
          ) : undefined
        }
        onRowClick={(product) => navigate(`/admin/products/${product.id}`)}
        mobileTitle={(product) => product.name}
        mobileSubtitle={(product) => `${product.category} · ${formatINR(product.salePricePaise)}`}
        mobileMeta={(product) => (
          <>
            <Badge tone={product.active ? 'success' : 'neutral'}>{product.active ? 'Active' : 'Inactive'}</Badge>
            {product.available && product.active && <Badge tone="info">Sellable</Badge>}
            {product.trackStock && <span>Stock {formatQuantity(product.stockQty ?? 0, product.unit)}</span>}
          </>
        )}
        rowActions={(product) => (
          <Button asChild size="sm" variant="ghost" aria-label={`View ${product.name}`}><Link to={`/admin/products/${product.id}`}><ArrowRight className="h-4 w-4" /></Link></Button>
        )}
        toolbar={
          <>
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Department">
              <option value="all">All departments</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={state} onChange={(event) => setState(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Product state">
              <option value="all">All states</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="unavailable">Temporarily unavailable</option>
              <option value="low">Low stock</option>
            </select>
            {products.hasMore && (
              <Button size="sm" variant="outline" onClick={products.loadMore} loading={products.loading}>
                Load more ({products.loaded} loaded)
              </Button>
            )}
          </>
        }
        initialSort={{ key: 'product', direction: 'asc' }}
        selectable={hasPermission(profile, 'productsManage')}
        bulkActions={(selected, clear) => (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulkActive(selected, true, clear)}>Activate</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulkActive(selected, false, clear)}>Deactivate</Button>
            <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
          </>
        )}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <Download className="h-3 w-3" /> CSV exports contain the filtered, sorted records visible in this table.
      </p>
    </div>
  )
}
