import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  PackagePlus,
  Plus,
  Scale,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { productsQuery } from '@/data/queries'
import {
  inventoryCountsQuery,
  inventoryItemsQuery,
  inventoryMovementsQuery,
} from '@/data/operationsQueries'
import {
  createInventoryItem,
  recordInventoryCount,
  recordInventoryMovement,
  transferInventory,
} from '@/data/inventory'
import { adjustProductStock } from '@/data/productStock'
import type {
  InventoryCount,
  InventoryItem,
  InventoryKind,
  InventoryMovement,
  InventoryMovementType,
  Product,
} from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { formatDateTime, formatINR, formatQuantity, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { uniqueId } from '@/lib/utils'

const MOVEMENT_TYPES: Array<{ value: InventoryMovementType; label: string; direction: 1 | -1 | 0 }> = [
  { value: 'purchase', label: 'Purchase / receipt', direction: 1 },
  { value: 'issue', label: 'Issue to production', direction: -1 },
  { value: 'consumption', label: 'Consumption', direction: -1 },
  { value: 'wastage', label: 'Wastage', direction: -1 },
  { value: 'customer_return', label: 'Customer return', direction: 1 },
  { value: 'supplier_return', label: 'Return to supplier', direction: -1 },
  { value: 'purchase_return', label: 'Purchase return', direction: -1 },
  { value: 'opening_balance', label: 'Opening balance', direction: 1 },
  { value: 'count_adjustment', label: 'Count adjustment (signed)', direction: 0 },
]

function movementLabel(type: InventoryMovementType): string {
  return MOVEMENT_TYPES.find((item) => item.value === type)?.label ?? titleCase(type)
}

export function InventoryPage() {
  const { profile } = useAuth()
  const { selectedOutlet, departments } = useWorkspace()
  const [tab, setTab] = useState('items')
  const [createOpen, setCreateOpen] = useState(false)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null)
  const [countItem, setCountItem] = useState<InventoryItem | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [kindFilter, setKindFilter] = useState('all')

  const outletId = selectedOutlet?.id ?? ''
  const itemsState = useCollectionData<InventoryItem>(
    () => (profile && outletId ? inventoryItemsQuery(outletId, profile, 600) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const movementsState = useCollectionData<InventoryMovement>(
    () => (profile && outletId ? inventoryMovementsQuery(outletId, profile, 1500) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const countsState = useCollectionData<InventoryCount>(
    () => (profile && outletId ? inventoryCountsQuery(outletId, profile, 400) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const productsState = useCollectionData<Product>(
    () => (profile && outletId ? productsQuery(outletId, profile, 500) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const items = useMemo(
    () => itemsState.rows.filter((item) => kindFilter === 'all' || item.kind === kindFilter),
    [itemsState.rows, kindFilter],
  )
  const lowStock = itemsState.rows.filter(
    (item) => item.active && item.criticalQty !== undefined && item.currentQty <= item.criticalQty,
  )
  const todayMovements = movementsState.rows.filter(
    (movement) => movement.occurredAt.slice(0, 10) === format(new Date(), 'yyyy-MM-dd'),
  )
  const canManage = hasPermission(profile, 'inventoryManage')
  const canAdjust = hasPermission(profile, 'inventoryAdjust')

  const itemColumns: DataColumn<InventoryItem>[] = [
    {
      key: 'name',
      header: 'Item',
      accessor: (item) => item.name,
      render: (item) => (
        <div>
          <p className="font-semibold text-ink-900">{item.name}</p>
          <p className="text-[11px] text-ink-500">{titleCase(item.kind)}{item.sku ? ` · ${item.sku}` : ''}</p>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'department',
      header: 'Department',
      accessor: (item) => departments.find((department) => department.id === item.departmentId)?.name ?? '—',
      hideBelow: 'md',
    },
    {
      key: 'stock',
      header: 'On hand',
      accessor: (item) => item.currentQty,
      render: (item) => (
        <div className={item.criticalQty !== undefined && item.currentQty <= item.criticalQty ? 'text-brand-700' : ''}>
          <p className="font-semibold tabular-nums">{formatQuantity(item.currentQty, item.unit)}</p>
          {item.criticalQty !== undefined && <p className="text-[11px] text-ink-500">Critical at {formatQuantity(item.criticalQty, item.unit)}</p>}
        </div>
      ),
      align: 'right',
      sortable: true,
    },
    {
      key: 'last',
      header: 'Last movement',
      accessor: (item) => item.lastMovementAt ?? '',
      render: (item) => item.lastMovementAt ? formatDateTime(item.lastMovementAt) : '—',
      hideBelow: 'lg',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (item) => item.active ? 'Active' : 'Inactive',
      render: (item) => <Badge tone={item.active ? 'success' : 'neutral'}>{item.active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  const movementColumns: DataColumn<InventoryMovement>[] = [
    {
      key: 'date',
      header: 'Date',
      accessor: (movement) => movement.occurredAt,
      render: (movement) => formatDateTime(movement.occurredAt),
      sortable: true,
    },
    {
      key: 'item',
      header: 'Item',
      accessor: (movement) => movement.itemName,
      render: (movement) => <span className="font-semibold">{movement.itemName}</span>,
      sortable: true,
    },
    { key: 'type', header: 'Type', accessor: (movement) => movementLabel(movement.type), hideBelow: 'md' },
    {
      key: 'quantity',
      header: 'Quantity',
      accessor: (movement) => movement.quantity,
      render: (movement) => (
        <span className={movement.quantity >= 0 ? 'font-semibold text-sage-700' : 'font-semibold text-brand-700'}>
          {movement.quantity > 0 ? '+' : ''}{formatQuantity(movement.quantity, movement.unit)}
        </span>
      ),
      align: 'right',
      sortable: true,
    },
    { key: 'balance', header: 'Balance', accessor: (movement) => movement.balanceAfter, render: (movement) => formatQuantity(movement.balanceAfter, movement.unit), align: 'right', hideBelow: 'lg' },
    { key: 'reason', header: 'Reason', accessor: (movement) => movement.reason, hideBelow: 'xl' },
    { key: 'actor', header: 'Recorded by', accessor: (movement) => movement.actorName, hideBelow: 'xl' },
    { key: 'department', header: 'Department', accessor: (movement) => departments.find((department) => department.id === movement.departmentId)?.name ?? '—', hideBelow: 'lg' },
  ]

  const countColumns: DataColumn<InventoryCount>[] = [
    { key: 'date', header: 'Counted', accessor: (count) => count.countedAt, render: (count) => formatDateTime(count.countedAt), sortable: true },
    { key: 'item', header: 'Item', accessor: (count) => count.itemName },
    { key: 'recorded', header: 'Recorded', accessor: (count) => count.recordedQty, render: (count) => formatQuantity(count.recordedQty, count.unit), align: 'right' },
    { key: 'counted', header: 'Counted', accessor: (count) => count.countedQty, render: (count) => formatQuantity(count.countedQty, count.unit), align: 'right' },
    {
      key: 'variance',
      header: 'Variance',
      accessor: (count) => count.variance,
      render: (count) => (
        <span className={count.variance === 0 ? 'text-sage-700' : 'font-semibold text-brand-700'}>
          {count.variance > 0 ? '+' : ''}{formatQuantity(count.variance, count.unit)}
        </span>
      ),
      align: 'right',
      sortable: true,
    },
    { key: 'reason', header: 'Reason', accessor: (count) => count.reason },
    { key: 'actor', header: 'Counted by', accessor: (count) => count.actorName, hideBelow: 'lg' },
  ]

  if (!hasPermission(profile, 'inventoryView')) {
    return <ErrorState title="Inventory is not available" message="Your role does not include View inventory." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={selectedOutlet?.name}
        title="Inventory"
        description="Append-only raw-material and packaging ledger with outlet and department balances. Finished products stay in the product master and use the trusted stock-adjustment operation."
        help="inventory"
        actions={
          <>
            {canManage && <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>New item</Button>}
            {canManage && <Button variant="outline" onClick={() => setTransferOpen(true)} leftIcon={<ArrowLeftRight className="h-4 w-4" />}>Transfer</Button>}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked items" value={itemsState.rows.length} hint="Raw materials and packaging" icon={<Boxes className="h-4 w-4" />} loading={itemsState.loading} />
        <StatCard label="Low stock" value={lowStock.length} hint="At or below critical level" tone="brand" icon={<Scale className="h-4 w-4" />} loading={itemsState.loading} />
        <StatCard label="Movements today" value={todayMovements.length} hint="Purchases, issues and wastage" tone="gold" icon={<SlidersHorizontal className="h-4 w-4" />} loading={movementsState.loading} />
        <StatCard label="Physical counts" value={countsState.rows.length} hint="Recorded count sessions" tone="sage" icon={<ClipboardCheck className="h-4 w-4" />} loading={countsState.loading} />
      </div>

      <Tabs
        tabs={[
          { id: 'items', label: 'Stock items', icon: <Boxes className="h-4 w-4" /> },
          { id: 'movements', label: 'Movement ledger', icon: <SlidersHorizontal className="h-4 w-4" /> },
          { id: 'counts', label: 'Stock counts', icon: <ClipboardCheck className="h-4 w-4" /> },
          { id: 'finished', label: 'Finished products', icon: <PackagePlus className="h-4 w-4" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {itemsState.error || movementsState.error ? (
        <ErrorState message={itemsState.error ?? movementsState.error ?? ''} onRetry={() => { itemsState.reload(); movementsState.reload() }} help="inventory" />
      ) : tab === 'items' ? (
        <DataTable
          rows={items}
          columns={itemColumns}
          getRowId={(item) => item.id}
          loading={itemsState.loading}
          searchPlaceholder="Search item, SKU or department…"
          searchFields={(item) => [item.name, item.sku, item.unit, departments.find((department) => department.id === item.departmentId)?.name]}
          exportFilename={`inventory-items-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No inventory items"
          emptyDescription="Create raw-material or packaging items with an opening count. Finished products remain in the product catalogue."
          emptyAction={canManage ? <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Create first item</Button> : undefined}
          toolbar={
            <SelectField
              aria-label="Filter item kind"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
              options={[
                { value: 'all', label: 'All kinds' },
                { value: 'raw_material', label: 'Raw materials' },
                { value: 'packaging', label: 'Packaging' },
              ]}
              containerClassName="w-40"
            />
          }
          mobileTitle={(item) => item.name}
          mobileSubtitle={(item) => `${formatQuantity(item.currentQty, item.unit)} on hand`}
          mobileMeta={(item) => item.criticalQty !== undefined && item.currentQty <= item.criticalQty ? <Badge tone="danger">Low stock</Badge> : <Badge tone="success">In stock</Badge>}
          rowActions={(item) => canManage ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="outline" onClick={() => setMovementItem(item)}>Movement</Button>
              <Button size="sm" variant="ghost" onClick={() => setCountItem(item)}>Count</Button>
            </div>
          ) : undefined}
        />
      ) : tab === 'movements' ? (
        <DataTable
          rows={movementsState.rows}
          columns={movementColumns}
          getRowId={(movement) => movement.id}
          loading={movementsState.loading}
          searchPlaceholder="Search item, reason, reference or staff…"
          searchFields={(movement) => [movement.itemName, movement.reason, movement.reference, movement.actorName, movement.type]}
          exportFilename={`inventory-movements-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No stock movements"
          emptyDescription="Purchases, issues, consumption, returns, wastage, transfers and count adjustments appear here. History cannot be edited."
          mobileTitle={(movement) => movement.itemName}
          mobileSubtitle={(movement) => `${movementLabel(movement.type)} · ${formatDateTime(movement.occurredAt)}`}
          mobileMeta={(movement) => <span className={movement.quantity >= 0 ? 'text-sage-700' : 'text-brand-700'}>{movement.quantity > 0 ? '+' : ''}{formatQuantity(movement.quantity, movement.unit)}</span>}
        />
      ) : tab === 'counts' ? (
        <DataTable
          rows={countsState.rows}
          columns={countColumns}
          getRowId={(count) => count.id}
          loading={countsState.loading}
          searchPlaceholder="Search item, reason or staff…"
          searchFields={(count) => [count.itemName, count.reason, count.actorName]}
          exportFilename={`inventory-counts-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No stock counts"
          emptyDescription="Record a physical count to compare it with the ledger. A variance creates an audited count-adjustment movement."
          mobileTitle={(count) => count.itemName}
          mobileSubtitle={(count) => `${formatDateTime(count.countedAt)} · ${count.actorName}`}
          mobileMeta={(count) => <Badge tone={count.variance === 0 ? 'success' : 'warning'}>{count.variance === 0 ? 'Matched' : `${count.variance > 0 ? '+' : ''}${formatQuantity(count.variance, count.unit)}`}</Badge>}
        />
      ) : (
        <DataTable
          rows={productsState.rows.filter((product) => product.trackStock)}
          columns={[
            { key: 'name', header: 'Product', accessor: (product) => product.name, render: (product) => <span className="font-semibold">{product.name}</span>, sortable: true },
            { key: 'department', header: 'Department', accessor: (product) => departments.find((department) => department.id === product.departmentId)?.name ?? '—', hideBelow: 'md' },
            { key: 'stock', header: 'Stock on hand', accessor: (product) => product.stockQty ?? 0, render: (product) => formatQuantity(product.stockQty ?? 0, product.unit), align: 'right', sortable: true },
            { key: 'critical', header: 'Critical level', accessor: (product) => product.criticalStock ?? 0, render: (product) => formatQuantity(product.criticalStock ?? 0, product.unit), align: 'right', hideBelow: 'lg' },
            { key: 'value', header: 'Sale price', accessor: (product) => product.salePricePaise, render: (product) => formatINR(product.salePricePaise), align: 'right', hideBelow: 'lg' },
          ]}
          getRowId={(product) => product.id}
          loading={productsState.loading}
          searchPlaceholder="Search finished product…"
          searchFields={(product) => [product.name, product.alias]}
          exportFilename={`finished-stock-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No tracked finished products"
          emptyDescription="Products with stock tracking enabled appear here. Their master price and catalogue record are not duplicated."
          mobileTitle={(product) => product.name}
          mobileSubtitle={(product) => `${formatQuantity(product.stockQty ?? 0, product.unit)} on hand`}
          rowActions={(product) => canAdjust ? <Button size="sm" variant="outline" onClick={() => setAdjustProduct(product)}>Adjust</Button> : undefined}
        />
      )}

      <CreateItemDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        outletId={outletId}
        departments={departments}
      />
      <MovementDialog item={movementItem} onClose={() => setMovementItem(null)} />
      <CountDialog item={countItem} onClose={() => setCountItem(null)} />
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        items={itemsState.rows.filter((item) => item.active)}
        departments={departments}
      />
      <AdjustProductDialog product={adjustProduct} onClose={() => setAdjustProduct(null)} />
    </div>
  )
}

function CreateItemDialog({
  open,
  onOpenChange,
  outletId,
  departments,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  outletId: string
  departments: Array<{ id: string; name: string; active: boolean }>
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<InventoryKind>('raw_material')
  const [departmentId, setDepartmentId] = useState('')
  const [unit, setUnit] = useState('kg')
  const [opening, setOpening] = useState('0')
  const [critical, setCritical] = useState('')
  const [sku, setSku] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim() || !departmentId || !unit.trim()) {
      toast.error('Enter a name, department and base unit.')
      return
    }
    setBusy(true)
    try {
      await createInventoryItem({
        requestId: uniqueId(),
        name,
        sku: sku || undefined,
        kind,
        outletId,
        departmentId,
        unit,
        openingQty: Number(opening) || 0,
        criticalQty: critical === '' ? undefined : Number(critical),
      })
      toast.success('Inventory item created')
      setName('')
      setSku('')
      setOpening('0')
      setCritical('')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New inventory item"
      description="Raw materials and packaging are tracked per outlet and department. Existing finished products stay in the product catalogue."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy} leftIcon={<Plus className="h-4 w-4" />}>Create item</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Item name" required value={name} onChange={(event) => setName(event.target.value)} maxLength={120} containerClassName="sm:col-span-2" />
        <SelectField label="Kind" value={kind} onChange={(event) => setKind(event.target.value as InventoryKind)} options={[{ value: 'raw_material', label: 'Raw material' }, { value: 'packaging', label: 'Packaging' }]} />
        <SelectField label="Department" required value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} options={departments.filter((department) => department.active).map((department) => ({ value: department.id, label: department.name }))} placeholder="Choose department" />
        <TextField label="Base unit" required value={unit} onChange={(event) => setUnit(event.target.value)} hint="For example kg, litre, piece or box" />
        <TextField label="SKU (optional)" value={sku} onChange={(event) => setSku(event.target.value)} />
        <TextField label="Opening quantity" type="number" min="0" step="0.001" value={opening} onChange={(event) => setOpening(event.target.value)} />
        <TextField label="Critical level (optional)" type="number" min="0" step="0.001" value={critical} onChange={(event) => setCritical(event.target.value)} />
      </div>
    </Dialog>
  )
}

function MovementDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const [type, setType] = useState<InventoryMovementType>('purchase')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16))
  const [busy, setBusy] = useState(false)

  if (!item) return null
  const selected = MOVEMENT_TYPES.find((option) => option.value === type)!
  const signed = selected.direction === 0 ? Number(quantity) : Math.abs(Number(quantity)) * selected.direction

  async function submit() {
    if (!quantity || !reason.trim()) {
      toast.error('Enter a quantity and reason.')
      return
    }
    setBusy(true)
    try {
      await recordInventoryMovement({
        requestId: uniqueId(),
        itemId: item!.id,
        type,
        quantity: signed,
        reason,
        reference: reference || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
      })
      toast.success('Stock movement recorded')
      setQuantity('')
      setReason('')
      setReference('')
      onClose()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(openState) => { if (!openState) onClose() }}
      title={`Stock movement · ${item.name}`}
      description={`Current balance: ${formatQuantity(item.currentQty, item.unit)} in ${item.departmentId}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Record movement</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Movement type" value={type} onChange={(event) => setType(event.target.value as InventoryMovementType)} options={MOVEMENT_TYPES.map((option) => ({ value: option.value, label: option.label }))} containerClassName="sm:col-span-2" />
        <TextField label={`Quantity (${item.unit})`} required type="number" step="0.001" min={selected.direction === 0 ? undefined : '0'} value={quantity} onChange={(event) => setQuantity(event.target.value)} hint={selected.direction === 0 ? 'Use a negative value to reduce stock.' : selected.direction > 0 ? 'This movement increases stock.' : 'This movement decreases stock.'} />
        <TextField label="Reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} hint="Invoice, supplier or batch reference" />
        <TextField label="Occurred at" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} containerClassName="sm:col-span-2" />
        <TextareaField label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} containerClassName="sm:col-span-2" />
      </div>
    </Dialog>
  )
}

function CountDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('Physical stock verification')
  const [busy, setBusy] = useState(false)

  if (!item) return null
  const variance = (Number(counted) || 0) - item.currentQty

  async function submit() {
    if (counted === '' || !reason.trim()) {
      toast.error('Enter the counted quantity and a reason.')
      return
    }
    setBusy(true)
    try {
      const result = await recordInventoryCount({
        requestId: uniqueId(),
        itemId: item!.id,
        countedQty: Number(counted),
        reason,
        countedAt: new Date().toISOString(),
      })
      toast.success(`Count recorded. Variance ${result.variance > 0 ? '+' : ''}${formatQuantity(result.variance, item!.unit)}.`)
      onClose()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(openState) => { if (!openState) onClose() }}
      title={`Physical count · ${item.name}`}
      description={`Ledger balance: ${formatQuantity(item.currentQty, item.unit)}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Record count</Button></>}
    >
      <div className="space-y-3">
        <TextField label={`Counted quantity (${item.unit})`} required type="number" min="0" step="0.001" value={counted} onChange={(event) => setCounted(event.target.value)} />
        {counted !== '' && (
          <div className={`rounded-xl px-3 py-2 text-sm ${variance === 0 ? 'bg-sage-50 text-sage-800' : 'bg-gold-50 text-gold-900'}`}>
            Variance: <strong>{variance > 0 ? '+' : ''}{formatQuantity(variance, item.unit)}</strong>
            {variance !== 0 && <span className="block text-xs">A count-adjustment movement will be posted with your name.</span>}
          </div>
        )}
        <TextareaField label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </div>
    </Dialog>
  )
}

function TransferDialog({
  open,
  onOpenChange,
  items,
  departments,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: InventoryItem[]
  departments: Array<{ id: string; name: string }>
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('Department transfer')
  const [busy, setBusy] = useState(false)
  const fromItem = items.find((item) => item.id === from)
  const toItem = items.find((item) => item.id === to)

  async function submit() {
    if (!fromItem || !toItem || !quantity || !reason.trim()) {
      toast.error('Choose both locations and enter a quantity and reason.')
      return
    }
    setBusy(true)
    try {
      await transferInventory({
        requestId: uniqueId(),
        fromItemId: fromItem.id,
        toItemId: toItem.id,
        quantity: Number(quantity),
        reason,
        occurredAt: new Date().toISOString(),
      })
      toast.success('Transfer recorded')
      setQuantity('')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  function label(item: InventoryItem): string {
    return `${item.name} · ${departments.find((department) => department.id === item.departmentId)?.name ?? item.departmentId} · ${formatQuantity(item.currentQty, item.unit)}`
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer stock"
      description="Transfers write a paired out/in movement atomically. Both locations must use the same base unit."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy} leftIcon={<ArrowLeftRight className="h-4 w-4" />}>Transfer</Button></>}
    >
      <div className="grid gap-3">
        <SelectField label="From item" required value={from} onChange={(event) => setFrom(event.target.value)} options={items.map((item) => ({ value: item.id, label: label(item) }))} placeholder="Choose source" />
        <SelectField label="To item" required value={to} onChange={(event) => setTo(event.target.value)} options={items.filter((item) => item.id !== from).map((item) => ({ value: item.id, label: label(item) }))} placeholder="Choose destination" />
        {fromItem && <TextField label={`Quantity (${fromItem.unit})`} required type="number" min="0" step="0.001" max={fromItem.currentQty} value={quantity} onChange={(event) => setQuantity(event.target.value)} />}
        <TextareaField label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </div>
    </Dialog>
  )
}

function AdjustProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  if (!product) return null

  async function submit() {
    if (!delta || !reason.trim()) {
      toast.error('Enter the adjustment and a reason.')
      return
    }
    setBusy(true)
    try {
      await adjustProductStock({
        requestId: uniqueId(),
        productId: product!.id,
        delta: Number(delta),
        reason,
      })
      toast.success('Finished stock adjusted')
      setDelta('')
      setReason('')
      onClose()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(openState) => { if (!openState) onClose() }}
      title={`Adjust finished stock · ${product.name}`}
      description={`Current stock: ${formatQuantity(product.stockQty ?? 0, product.unit)}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Post adjustment</Button></>}
    >
      <div className="space-y-3">
        <TextField label={`Quantity change (${product.unit})`} required type="number" step="0.001" value={delta} onChange={(event) => setDelta(event.target.value)} hint="Use a negative value to reduce stock." />
        <TextareaField label="Reason" required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        <p className="rounded-lg bg-ivory-100 px-3 py-2 text-xs text-ink-500">This uses the existing trusted finished-stock operation and writes its own audit record. It does not edit the product price or catalogue details.</p>
      </div>
    </Dialog>
  )
}
