import { useMemo, useState } from 'react'
import { ImagePlus, PackageSearch, Search, ShoppingBag } from 'lucide-react'
import type { Department, Product } from '@/types/models'
import { formatINR, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { EmptyState } from './ui/States'

export function ProductPickerDialog({
  open,
  onOpenChange,
  products,
  departments,
  departmentIds,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  departments: Department[]
  departmentIds: string[]
  onPick: (product: Product) => void
}) {
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  const available = useMemo(
    () =>
      products
        .filter((product) => product.active && product.available)
        .filter((product) => departmentIds.includes(product.departmentId))
        .filter((product) => department === 'all' || product.departmentId === department),
    [products, departmentIds, department],
  )

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return available
    return available.filter((product) =>
      [product.name, product.alias, product.printName, product.category, product.group]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(value)),
    )
  }, [available, search])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a product"
      description="Only active and available products in the selected department(s) are shown."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, alias or category…"
              className="field-input h-10 pl-9"
              aria-label="Search products"
              autoFocus
            />
          </div>
          {departmentIds.length > 1 && (
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="field-input h-10 sm:w-52"
              aria-label="Filter by department"
            >
              <option value="all">All selected departments</option>
              {departments
                .filter((item) => departmentIds.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={<PackageSearch className="h-5 w-5" />}
            title={available.length === 0 ? 'No sellable products here' : 'No matching products'}
            description={
              available.length === 0
                ? 'Add products in this department from the catalogue, or check their availability settings.'
                : 'Try a different search or department filter.'
            }
          />
        ) : (
          <ul className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filtered.map((product) => {
              const dept = departments.find((item) => item.id === product.departmentId)
              const lowStock =
                product.trackStock &&
                product.stockQty !== undefined &&
                product.stockQty <= (product.criticalStock ?? 0)
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(product)
                      onOpenChange(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ivory-100 text-ink-300">
                      {product.imageUrl && !failedImages.has(product.id) ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={() => setFailedImages((prev) => new Set(prev).add(product.id))}
                        />
                      ) : (
                        <ImagePlus className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                        {dept?.name ?? 'Department'} · {formatINR(product.salePricePaise)} / {product.unit}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {lowStock && <Badge tone="warning">Low stock</Badge>}
                        {product.trackStock && !lowStock && (
                          <span className="text-[10px] text-ink-500">
                            {formatQuantity(product.stockQty ?? 0, product.unit)} in stock
                          </span>
                        )}
                        {!product.trackStock && <span className="text-[10px] text-ink-400">Stock not tracked</span>}
                      </span>
                    </span>
                    <ShoppingBag className="h-4 w-4 shrink-0 text-ink-300" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex justify-end border-t border-ink-100 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}

export function ProductThumb({ product, className }: { product?: Product; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ivory-100 text-ink-300', className)}>
      {product?.imageUrl && !failed ? (
        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <ImagePlus className="h-4 w-4" />
      )}
    </span>
  )
}
