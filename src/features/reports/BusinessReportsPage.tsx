import { useMemo, useState, type ReactNode } from 'react'
import { endOfDay, format, parseISO, startOfDay, subDays } from 'date-fns'
import {
  AlertTriangle,
  BadgeIndianRupee,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  IndianRupee,
  PackageSearch,
  ReceiptText,
  Scale,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { useProductCatalogue } from '@/data/productCatalogue'
import {
  bookingsInRangeQuery,
  customersQuery,
  ordersInRangeQuery,
  paymentsInRangeQuery,
} from '@/data/queries'
import {
  inventoryItemsQuery,
  inventoryMovementsInRangeQuery,
  productionTasksQuery,
} from '@/data/operationsQueries'
import { purchasesInRangeQuery } from '@/data/purchases'
import {
  buildAnalysisSummary,
  buildItemAnalysis,
  buildPartyAnalysis,
} from '@/lib/analysis'
import {
  buildGstSummary,
  buildPurchaseHsnSummary,
  buildPurchaseTaxRateSummary,
  buildSupplierTaxSummary,
  buildTreatmentSummary,
  ACCOUNTING_PREREQUISITES,
} from '@/lib/gstReports'
import {
  buildInventoryBalance,
  buildMovementTypeBreakdown,
  buildProductStockSnapshot,
  buildProductionSummary,
} from '@/lib/inventoryReports'
import { GST_TREATMENT_LABELS } from '@/lib/gst'
import type {
  Booking,
  Customer,
  InventoryItem,
  InventoryMovement,
  Order,
  Payment,
  ProductionTask,
  Purchase,
} from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { CsvExportButton } from '@/components/ui/CsvExportButton'
import { SelectField, TextField } from '@/components/ui/Field'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/States'
import { formatDate, formatDateShort, formatINR, formatQuantity, titleCase, todayInput } from '@/lib/format'

type RangeKey = '7d' | '30d' | '90d' | 'custom'
type ReportTab = 'inventory' | 'production' | 'analysis' | 'gst'

const MAX_MOVEMENTS = 1500
const MAX_TASKS = 600
const MAX_PURCHASES = 500
const MAX_ORDERS = 2000
const MAX_PAYMENTS = 2000
const MAX_BOOKINGS = 1000
const MAX_CUSTOMERS = 500

function MiniTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: Array<Array<ReactNode>>
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-sm text-ink-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="min-w-full text-sm">
        <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
          <tr>
            {headers.map((header, index) => (
              <th key={header} className={`px-3 py-2 font-semibold ${index === 0 ? '' : 'text-right'}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={`px-3 py-2 ${cellIndex === 0 ? '' : 'text-right'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BusinessReportsPage() {
  const { profile } = useAuth()
  const { selectedOutletId } = useWorkspace()
  const outletId = selectedOutletId ?? ''

  const [range, setRange] = useState<RangeKey>('30d')
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(todayInput())
  const [tab, setTab] = useState<ReportTab>('inventory')

  const canInventory = hasPermission(profile, 'inventoryView')
  const canProduction = hasPermission(profile, 'productionView')
  const canPurchases = hasPermission(profile, 'purchasesView')
  const canParties = hasPermission(profile, 'customersView')

  const { from, to } = useMemo(() => {
    if (range === 'custom') {
      return {
        from: startOfDay(parseISO(customFrom)).toISOString(),
        to: endOfDay(parseISO(customTo)).toISOString(),
      }
    }
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    return {
      from: startOfDay(subDays(new Date(), days - 1)).toISOString(),
      to: endOfDay(new Date()).toISOString(),
    }
  }, [range, customFrom, customTo])

  const orders = useCollectionData<Order>(
    () => (profile && outletId ? ordersInRangeQuery(outletId, profile, from, to, MAX_ORDERS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to],
    Boolean(profile && outletId),
  )
  const bookings = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsInRangeQuery(outletId, profile, from, to, MAX_BOOKINGS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to],
    Boolean(profile && outletId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsInRangeQuery(outletId, profile, from, to, MAX_PAYMENTS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to],
    Boolean(profile && outletId),
  )
  const purchases = useCollectionData<Purchase>(
    () => (profile && outletId && canPurchases ? purchasesInRangeQuery(outletId, profile, from, to, MAX_PURCHASES) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to, canPurchases],
    Boolean(profile && outletId && canPurchases),
  )
  const customers = useCollectionData<Customer>(
    () => (outletId && canParties ? customersQuery(outletId, MAX_CUSTOMERS) : null),
    [outletId, canParties],
    Boolean(outletId && canParties),
  )
  const items = useCollectionData<InventoryItem>(
    () => (profile && outletId && canInventory ? inventoryItemsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), canInventory],
    Boolean(profile && outletId && canInventory),
  )
  const movements = useCollectionData<InventoryMovement>(
    () => (profile && outletId && canInventory ? inventoryMovementsInRangeQuery(outletId, profile, from, to, MAX_MOVEMENTS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to, canInventory],
    Boolean(profile && outletId && canInventory),
  )
  const products = useProductCatalogue(profile, outletId, canInventory)
  const tasks = useCollectionData<ProductionTask>(
    () => (profile && outletId && canProduction ? productionTasksQuery(outletId, profile, MAX_TASKS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), canProduction],
    Boolean(profile && outletId && canProduction),
  )

  const inventoryRows = useMemo(
    () => buildInventoryBalance({ items: items.rows, movements: movements.rows }),
    [items.rows, movements.rows],
  )
  const movementTypes = useMemo(() => buildMovementTypeBreakdown(movements.rows), [movements.rows])
  const productStock = useMemo(() => buildProductStockSnapshot(products.rows), [products.rows])

  const tasksInRange = useMemo(
    () => tasks.rows.filter((task) => task.dueAt >= from && task.dueAt <= to),
    [tasks.rows, from, to],
  )
  const productionRows = useMemo(
    () => buildProductionSummary(tasksInRange, new Date().toISOString()),
    [tasksInRange],
  )

  const itemRows = useMemo(
    () => buildItemAnalysis({ orders: orders.rows, bookings: bookings.rows, purchases: purchases.rows }),
    [orders.rows, bookings.rows, purchases.rows],
  )
  const analysisSummary = useMemo(
    () => buildAnalysisSummary({ orders: orders.rows, bookings: bookings.rows, purchases: purchases.rows, itemRows }),
    [orders.rows, bookings.rows, purchases.rows, itemRows],
  )
  const partyRows = useMemo(
    () => buildPartyAnalysis({ customers: customers.rows, orders: orders.rows, bookings: bookings.rows, payments: payments.rows }),
    [customers.rows, orders.rows, bookings.rows, payments.rows],
  )

  const gst = useMemo(
    () => buildGstSummary({ orders: orders.rows, bookings: bookings.rows, purchases: purchases.rows }),
    [orders.rows, bookings.rows, purchases.rows],
  )
  const treatments = useMemo(() => buildTreatmentSummary(purchases.rows), [purchases.rows])
  const supplierTax = useMemo(() => buildSupplierTaxSummary(purchases.rows), [purchases.rows])
  const hsnRows = useMemo(() => buildPurchaseHsnSummary(purchases.rows), [purchases.rows])
  const taxRates = useMemo(() => buildPurchaseTaxRateSummary(purchases.rows), [purchases.rows])

  const inventorySummary = useMemo(
    () => ({
      items: inventoryRows.length,
      inQty: inventoryRows.reduce((sum, row) => sum + row.inQty, 0),
      outQty: inventoryRows.reduce((sum, row) => sum + row.outQty, 0),
      mismatched: inventoryRows.filter((row) => row.movements > 0 && !row.reconciles).length,
      lowStock: productStock.filter((row) => row.low).length,
    }),
    [inventoryRows, productStock],
  )

  const productionSummary = useMemo(
    () => ({
      tasks: tasksInRange.filter((task) => task.status !== 'cancelled').length,
      required: productionRows.reduce((sum, row) => sum + row.requiredQty, 0),
      completed: productionRows.reduce((sum, row) => sum + row.completedQty, 0),
      rejected: productionRows.reduce((sum, row) => sum + row.rejectedQty, 0),
      overdue: productionRows.reduce((sum, row) => sum + row.overdueTasks, 0),
    }),
    [tasksInRange, productionRows],
  )

  const tabs = [
    canInventory ? { id: 'inventory' as const, label: 'Inventory', icon: <PackageSearch className="h-4 w-4" /> } : null,
    canProduction ? { id: 'production' as const, label: 'Production', icon: <ClipboardCheck className="h-4 w-4" /> } : null,
    { id: 'analysis' as const, label: 'Analysis', icon: <ChartNoAxesCombined className="h-4 w-4" /> },
    { id: 'gst' as const, label: 'GST & accounting', icon: <ReceiptText className="h-4 w-4" /> },
  ].filter(Boolean) as Array<{ id: ReportTab; label: string; icon: ReactNode }>

  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id ?? 'analysis'

  const inventoryColumns: DataColumn<(typeof inventoryRows)[number]>[] = [
    {
      key: 'item',
      header: 'Item',
      accessor: (row) => row.itemName,
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-900">{row.itemName}</p>
          <p className="text-[11px] text-ink-500">{row.movements} movements</p>
        </div>
      ),
    },
    { key: 'opening', header: 'Opening', accessor: (row) => row.openingQty ?? 0, align: 'right', render: (row) => row.openingQty === null ? '—' : formatQuantity(row.openingQty, row.unit) },
    { key: 'in', header: 'In', accessor: (row) => row.inQty, align: 'right', render: (row) => formatQuantity(row.inQty, row.unit) },
    { key: 'out', header: 'Out', accessor: (row) => row.outQty, align: 'right', render: (row) => formatQuantity(row.outQty, row.unit) },
    { key: 'net', header: 'Net', accessor: (row) => row.netQty, align: 'right', render: (row) => formatQuantity(row.netQty, row.unit) },
    { key: 'closing', header: 'Closing', accessor: (row) => row.closingQty ?? 0, align: 'right', hideBelow: 'md', render: (row) => row.closingQty === null ? '—' : formatQuantity(row.closingQty, row.unit) },
    { key: 'current', header: 'Current', accessor: (row) => row.currentQty, align: 'right', hideBelow: 'lg', render: (row) => formatQuantity(row.currentQty, row.unit) },
    {
      key: 'status',
      header: 'Ledger',
      render: (row) => row.movements === 0
        ? <Badge tone="neutral">No movements</Badge>
        : row.reconciles
          ? <Badge tone="success">Reconciles</Badge>
          : <Badge tone="danger">Mismatch</Badge>,
    },
  ]

  const productionColumns: DataColumn<(typeof productionRows)[number]>[] = [
    { key: 'product', header: 'Product', accessor: (row) => row.productName, sortable: true, render: (row) => <span className="font-semibold">{row.productName}</span> },
    { key: 'tasks', header: 'Tasks', accessor: (row) => row.tasks, align: 'right' },
    { key: 'required', header: 'Required', accessor: (row) => row.requiredQty, align: 'right', render: (row) => formatQuantity(row.requiredQty, row.unit) },
    { key: 'completed', header: 'Completed', accessor: (row) => row.completedQty, align: 'right', render: (row) => formatQuantity(row.completedQty, row.unit) },
    { key: 'rejected', header: 'Rejected', accessor: (row) => row.rejectedQty, align: 'right', hideBelow: 'md', render: (row) => formatQuantity(row.rejectedQty, row.unit) },
    { key: 'rework', header: 'Rework', accessor: (row) => row.reworkQty, align: 'right', hideBelow: 'lg', render: (row) => formatQuantity(row.reworkQty, row.unit) },
    { key: 'completion', header: 'Completion', accessor: (row) => row.completionPercent ?? 0, align: 'right', render: (row) => row.completionPercent === null ? '—' : `${row.completionPercent}%` },
    { key: 'overdue', header: 'Overdue', accessor: (row) => row.overdueTasks, align: 'right', render: (row) => row.overdueTasks > 0 ? <span className="font-semibold text-brand-700">{row.overdueTasks}</span> : '—' },
  ]

  const itemColumns: DataColumn<(typeof itemRows)[number]>[] = [
    {
      key: 'name',
      header: 'Item',
      accessor: (row) => row.name,
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-900">{row.name}</p>
          <p className="text-[11px] text-ink-500">{row.itemType === 'product' ? 'Finished product' : 'Inventory item'} · {row.unit}</p>
        </div>
      ),
    },
    { key: 'sold', header: 'Sold qty', accessor: (row) => row.quantitySold, align: 'right', render: (row) => formatQuantity(row.quantitySold, row.unit) },
    { key: 'sales', header: 'Taxable sales', accessor: (row) => row.taxableSalesPaise, align: 'right', sortable: true, render: (row) => formatINR(row.taxableSalesPaise) },
    { key: 'purchased', header: 'Purchased qty', accessor: (row) => row.quantityPurchased, align: 'right', hideBelow: 'md', render: (row) => formatQuantity(row.quantityPurchased, row.unit) },
    { key: 'purchase', header: 'Taxable purchases', accessor: (row) => row.taxablePurchasePaise, align: 'right', hideBelow: 'md', render: (row) => formatINR(row.taxablePurchasePaise) },
    { key: 'margin', header: 'Margin', accessor: (row) => row.marginPaise ?? 0, align: 'right', hideBelow: 'lg', render: (row) => row.marginPaise === null ? '—' : <span className={row.marginPaise >= 0 ? 'text-sage-700' : 'text-brand-700'}>{formatINR(row.marginPaise)}</span> },
    { key: 'marginPercent', header: 'Margin %', accessor: (row) => row.marginPercent ?? 0, align: 'right', hideBelow: 'lg', render: (row) => row.marginPercent === null ? '—' : `${row.marginPercent}%` },
  ]

  const partyColumns: DataColumn<(typeof partyRows)[number]>[] = [
    {
      key: 'party',
      header: 'Party',
      accessor: (row) => row.name,
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-900">{row.name}</p>
          <p className="text-[11px] text-ink-500">{row.phone || titleCase(row.group)}</p>
        </div>
      ),
    },
    { key: 'documents', header: 'Documents', accessor: (row) => row.documents, align: 'right', hideBelow: 'md' },
    { key: 'billed', header: 'Billed', accessor: (row) => row.billedPaise, align: 'right', sortable: true, render: (row) => formatINR(row.billedPaise) },
    { key: 'received', header: 'Received', accessor: (row) => row.receivedPaise, align: 'right', hideBelow: 'md', render: (row) => formatINR(row.receivedPaise) },
    { key: 'balance', header: 'Balance', accessor: (row) => row.balancePaise, align: 'right', render: (row) => <span className={row.balancePaise > 0 ? 'font-semibold text-brand-700' : 'font-semibold text-sage-700'}>{formatINR(row.balancePaise)}</span> },
    { key: 'average', header: 'Average bill', accessor: (row) => row.averageBillPaise ?? 0, align: 'right', hideBelow: 'lg', render: (row) => row.averageBillPaise === null ? '—' : formatINR(row.averageBillPaise) },
    { key: 'last', header: 'Last activity', accessor: (row) => row.lastActivityAt ?? '', align: 'right', hideBelow: 'xl', render: (row) => row.lastActivityAt ? formatDateShort(row.lastActivityAt) : '—' },
  ]

  const capped: string[] = []
  if (movements.rows.length >= MAX_MOVEMENTS) capped.push('inventory movements')
  if (purchases.rows.length >= MAX_PURCHASES) capped.push('purchases')
  if (orders.rows.length >= MAX_ORDERS) capped.push('orders')
  if (bookings.rows.length >= MAX_BOOKINGS) capped.push('bookings')
  if (payments.rows.length >= MAX_PAYMENTS) capped.push('payments')

  const loading =
    (activeTab === 'inventory' && (items.loading || movements.loading || products.loading))
    || (activeTab === 'production' && tasks.loading)
    || (activeTab === 'analysis' && (orders.loading || purchases.loading || customers.loading))
    || (activeTab === 'gst' && (orders.loading || purchases.loading))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Inventory, analysis and GST"
        description="Reconstruct inventory movement windows, review production and item/party performance, and see the GST working position from posted documents."
        help="business-reports"
      />

      <section className="surface-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField
            label="Period"
            value={range}
            onChange={(event) => setRange(event.target.value as RangeKey)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'custom', label: 'Custom range' },
            ]}
          />
          {range === 'custom' ? (
            <>
              <TextField label="From" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              <TextField label="To" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="flex items-end">
            <p className="text-[11px] leading-relaxed text-ink-500">
              {formatDate(from)} → {formatDate(to)}. Inventory movements and purchases are queried for this window.
            </p>
          </div>
        </div>
        {capped.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Data is capped for {capped.join(', ')}. Narrow the period for a complete register.
          </p>
        )}
      </section>

      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setTab(id as ReportTab)} ariaLabel="Business reports" />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      ) : activeTab === 'inventory' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Inventory items" value={inventorySummary.items} icon={<Boxes className="h-4 w-4" />} />
            <StatCard label="Received in period" value={formatQuantity(inventorySummary.inQty)} tone="sage" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Issued in period" value={formatQuantity(inventorySummary.outQty)} tone="gold" icon={<Scale className="h-4 w-4" />} />
            <StatCard label="Ledger mismatches" value={inventorySummary.mismatched} tone="brand" hint="Opening + net ≠ closing" icon={<ShieldAlert className="h-4 w-4" />} />
            <StatCard label="Low product stock" value={inventorySummary.lowStock} tone="brand" hint="At or below critical stock" icon={<AlertTriangle className="h-4 w-4" />} />
          </div>

          <DataTable
            rows={inventoryRows}
            columns={inventoryColumns}
            getRowId={(row) => row.itemId}
            searchPlaceholder="Search inventory items…"
            searchFields={(row) => [row.itemName]}
            exportFilename="inventory-balances"
            emptyTitle="No inventory items"
            emptyDescription="Inventory items appear after they are created for this outlet and department."
            mobileTitle={(row) => row.itemName}
            mobileSubtitle={(row) => `${formatQuantity(row.openingQty ?? 0, row.unit)} → ${formatQuantity(row.closingQty ?? row.currentQty, row.unit)}`}
            mobileMeta={(row) => <Badge tone={row.movements === 0 ? 'neutral' : row.reconciles ? 'success' : 'danger'}>{row.movements === 0 ? 'No movements' : row.reconciles ? 'Reconciles' : 'Mismatch'}</Badge>}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink-950">Movement types</h2>
              <p className="mt-0.5 text-xs text-ink-500">Quantity in and out by ledger movement type for the period.</p>
              <div className="mt-3">
                <MiniTable
                  headers={['Type', 'Entries', 'In', 'Out']}
                  rows={movementTypes.map((row) => [
                    titleCase(row.type),
                    row.count,
                    formatQuantity(row.inQty),
                    formatQuantity(row.outQty),
                  ])}
                  empty="No movements in this period."
                />
                <div className="mt-3">
                  <CsvExportButton
                    filename="inventory-movement-types"
                    rows={movementTypes}
                    columns={[
                      { key: 'type', header: 'Movement type', value: (row) => titleCase(row.type) },
                      { key: 'entries', header: 'Entries', value: (row) => row.count },
                      { key: 'in', header: 'In quantity', value: (row) => row.inQty },
                      { key: 'out', header: 'Out quantity', value: (row) => row.outQty },
                    ]}
                    title="Export inventory movement types"
                    description="Uses the selected report period."
                  />
                </div>
              </div>
            </section>

            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink-950">Finished-product stock</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                Current snapshot only. Product orders change stock without writing a movement ledger, so
                opening balances and product movement history cannot be reconstructed.
              </p>
              <div className="mt-3">
                <MiniTable
                  headers={['Product', 'Stock', 'Critical']}
                  rows={productStock.slice(0, 40).map((row) => [
                    <span key={row.productId} className="font-medium text-ink-900">{row.name}</span>,
                    <span key={`${row.productId}-stock`} className={row.low ? 'font-semibold text-brand-700' : ''}>{formatQuantity(row.stockQty, row.unit)}</span>,
                    row.criticalStock === null ? '—' : formatQuantity(row.criticalStock, row.unit),
                  ])}
                  empty="No stock-tracked products."
                />
                <div className="mt-3">
                  <CsvExportButton
                    filename="finished-product-stock"
                    rows={productStock}
                    columns={[
                      { key: 'product', header: 'Product', value: (row) => row.name },
                      { key: 'stock', header: 'Stock quantity', value: (row) => row.stockQty },
                      { key: 'unit', header: 'Unit', value: (row) => row.unit },
                      { key: 'critical', header: 'Critical stock', value: (row) => row.criticalStock ?? '' },
                      { key: 'low', header: 'At or below critical', value: (row) => (row.low ? 'Yes' : 'No') },
                    ]}
                    title="Export finished-product stock"
                    description="Current snapshot for the selected outlet and department. Product orders do not write a movement ledger."
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : activeTab === 'production' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Production tasks" value={productionSummary.tasks} icon={<ClipboardCheck className="h-4 w-4" />} />
            <StatCard label="Required" value={formatQuantity(productionSummary.required)} />
            <StatCard label="Completed" value={formatQuantity(productionSummary.completed)} tone="sage" />
            <StatCard label="Rejected" value={formatQuantity(productionSummary.rejected)} tone="brand" />
            <StatCard label="Overdue tasks" value={productionSummary.overdue} tone="gold" />
          </div>
          <DataTable
            rows={productionRows}
            columns={productionColumns}
            getRowId={(row) => `${row.departmentId}:${row.productId}`}
            searchPlaceholder="Search product…"
            searchFields={(row) => [row.productName]}
            exportFilename="production-summary"
            emptyTitle="No production tasks"
            emptyDescription="Tasks due in this period appear here once orders or bookings create them."
            mobileTitle={(row) => row.productName}
            mobileSubtitle={(row) => `${formatQuantity(row.completedQty, row.unit)} of ${formatQuantity(row.requiredQty, row.unit)}`}
            mobileMeta={(row) => row.overdueTasks > 0 ? <Badge tone="danger">{row.overdueTasks} overdue</Badge> : <Badge tone="neutral">{row.tasks} tasks</Badge>}
          />
          <p className="text-[11px] leading-relaxed text-ink-500">
            Production tasks are loaded from the most recent {MAX_TASKS} tasks and then filtered by due date.
            Completion is completed quantity divided by required quantity, not a financial measure.
          </p>
        </div>
      ) : activeTab === 'analysis' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Sales" value={formatINR(analysisSummary.salesPaise)} hint={`${analysisSummary.orders} orders and bookings`} icon={<IndianRupee className="h-4 w-4" />} />
            <StatCard label="Taxable sales" value={formatINR(analysisSummary.taxableSalesPaise)} hint="GST stripped when prices include tax" icon={<BadgeIndianRupee className="h-4 w-4" />} tone="sage" />
            <StatCard label="Taxable purchases" value={formatINR(analysisSummary.taxablePurchasePaise)} hint={`${analysisSummary.purchaseVouchers} posted vouchers`} icon={<ReceiptText className="h-4 w-4" />} tone="gold" />
            <StatCard
              label="Period margin"
              value={formatINR(analysisSummary.periodMarginPaise ?? 0)}
              hint={analysisSummary.periodMarginPercent === null ? 'No taxable sales' : `${analysisSummary.periodMarginPercent}% of taxable sales`}
              icon={<ChartNoAxesCombined className="h-4 w-4" />}
              tone="brand"
            />
          </div>
          <p className="rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-[11px] leading-relaxed text-ink-600">
            Period margin is taxable sales minus taxable purchases. It is not a cost-of-goods-sold margin:
            purchases received in this period may still be in stock, and stock sold may have been purchased earlier.
            Item margin is only shown when the same product has both sales and purchases in the period.
          </p>

          <DataTable
            rows={itemRows}
            columns={itemColumns}
            getRowId={(row) => row.key}
            searchPlaceholder="Search item…"
            searchFields={(row) => [row.name]}
            exportFilename="item-analysis"
            emptyTitle="No item activity"
            emptyDescription="Sales and posted purchase lines in this period appear here."
            mobileTitle={(row) => row.name}
            mobileSubtitle={(row) => `${formatINR(row.taxableSalesPaise)} sales`}
            mobileMeta={(row) => row.marginPercent === null ? <Badge tone="neutral">No purchase</Badge> : <Badge tone={row.marginPercent >= 0 ? 'success' : 'danger'}>{row.marginPercent}%</Badge>}
          />

          {canParties && (
            <section className="space-y-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-950">Party analysis</h2>
                <p className="text-xs text-ink-500">Billed, received and closing balance from the existing party statement logic.</p>
              </div>
              <DataTable
                rows={partyRows}
                columns={partyColumns}
                getRowId={(row) => row.customerId}
                searchPlaceholder="Search party…"
                searchFields={(row) => [row.name, row.phone]}
                exportFilename="party-analysis"
                emptyTitle="No party activity"
                emptyDescription="Customers with orders, bookings or payments in this period appear here."
                mobileTitle={(row) => row.name}
                mobileSubtitle={(row) => `${formatINR(row.billedPaise)} billed`}
                mobileMeta={(row) => <Badge tone={row.balancePaise > 0 ? 'warning' : 'success'}>{formatINR(row.balancePaise)}</Badge>}
              />
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Outward tax" value={formatINR(gst.outwardTaxPaise)} hint={`${gst.outwardDocuments} sales documents`} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Inward tax" value={formatINR(gst.inwardTaxPaise)} hint={`${gst.inwardDocuments} posted purchases`} icon={<ReceiptText className="h-4 w-4" />} tone="gold" />
            <StatCard label="ITC claimable" value={formatINR(gst.itcClaimablePaise)} hint={`CGST ${formatINR(gst.cgstPaise)} · SGST ${formatINR(gst.sgstPaise)} · IGST ${formatINR(gst.igstPaise)}`} icon={<BadgeIndianRupee className="h-4 w-4" />} tone="sage" />
            <StatCard
              label="Net working position"
              value={formatINR(gst.netWorkingPositionPaise)}
              hint="Outward tax minus claimable ITC"
              icon={<Scale className="h-4 w-4" />}
              tone="brand"
            />
          </div>

          <p className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-[11px] leading-relaxed text-gold-900">
            Outward tax is shown as one figure because orders and bookings do not store the customer's place of
            supply. Splitting it into CGST/SGST and IGST would require data that does not exist. Reverse-charge
            tax is included in inward tax and shown separately below.
          </p>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink-950">Purchase tax treatments</h2>
              <div className="mt-3">
                <MiniTable
                  headers={['Treatment', 'Vouchers', 'Taxable', 'Tax']}
                  rows={treatments.map((row) => [
                    GST_TREATMENT_LABELS[row.treatment],
                    row.documents,
                    formatINR(row.taxablePaise),
                    formatINR(row.taxPaise),
                  ])}
                  empty="No posted purchases in this period."
                />
                <div className="mt-3">
                  <CsvExportButton
                    filename="gst-purchase-treatments"
                    rows={treatments}
                    columns={[
                      { key: 'treatment', header: 'Tax treatment', value: (row) => GST_TREATMENT_LABELS[row.treatment] },
                      { key: 'documents', header: 'Vouchers', value: (row) => row.documents },
                      { key: 'taxable', header: 'Taxable (₹)', value: (row) => (row.taxablePaise / 100).toFixed(2) },
                      { key: 'tax', header: 'Tax (₹)', value: (row) => (row.taxPaise / 100).toFixed(2) },
                    ]}
                    title="Export purchase tax treatments"
                    description="Uses the selected report period. Values are working figures, not a filed GST return."
                  />
                </div>
              </div>
            </section>

            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink-950">Tax rates</h2>
              <div className="mt-3">
                <MiniTable
                  headers={['Rate', 'Lines', 'Taxable', 'Tax']}
                  rows={taxRates.map((row) => [
                    `${row.taxPercent}%`,
                    row.documents,
                    formatINR(row.taxablePaise),
                    formatINR(row.taxPaise),
                  ])}
                  empty="No posted purchase lines in this period."
                />
                <div className="mt-3">
                  <CsvExportButton
                    filename="gst-tax-rates"
                    rows={taxRates}
                    columns={[
                      { key: 'rate', header: 'Tax rate (%)', value: (row) => row.taxPercent },
                      { key: 'lines', header: 'Lines', value: (row) => row.documents },
                      { key: 'taxable', header: 'Taxable (₹)', value: (row) => (row.taxablePaise / 100).toFixed(2) },
                      { key: 'tax', header: 'Tax (₹)', value: (row) => (row.taxPaise / 100).toFixed(2) },
                    ]}
                    title="Export purchase tax rates"
                    description="Uses the selected report period. Values are working figures, not a filed GST return."
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-ink-950">Supplier tax summary</h2>
            <div className="mt-3">
              <MiniTable
                headers={['Supplier', 'Vouchers', 'Taxable', 'Tax', 'Payable']}
                rows={supplierTax.map((row) => [
                  row.supplierName,
                  row.documents,
                  formatINR(row.taxablePaise),
                  formatINR(row.taxPaise),
                  formatINR(row.payablePaise),
                ])}
                empty="No posted purchases in this period."
              />
              <div className="mt-3">
                <CsvExportButton
                  filename="gst-supplier-tax"
                  rows={supplierTax}
                  columns={[
                    { key: 'supplier', header: 'Supplier', value: (row) => row.supplierName },
                    { key: 'vouchers', header: 'Vouchers', value: (row) => row.documents },
                    { key: 'taxable', header: 'Taxable (₹)', value: (row) => (row.taxablePaise / 100).toFixed(2) },
                    { key: 'tax', header: 'Tax (₹)', value: (row) => (row.taxPaise / 100).toFixed(2) },
                    { key: 'payable', header: 'Payable (₹)', value: (row) => (row.payablePaise / 100).toFixed(2) },
                  ]}
                  title="Export supplier tax summary"
                  description="Uses the selected report period. Values are working figures, not a filed GST return."
                />
              </div>
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-ink-950">Purchase HSN summary</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
              Purchase lines carry the product HSN. Outward HSN is not available because order lines do not store it.
            </p>
            <div className="mt-3">
              <MiniTable
                headers={['HSN', 'Qty', 'Taxable', 'Tax']}
                rows={hsnRows.map((row) => [
                  row.hsn === 'Unspecified' ? <span key="hsn" className="text-ink-500">Unspecified</span> : row.hsn,
                  formatQuantity(row.quantity),
                  formatINR(row.taxablePaise),
                  formatINR(row.taxPaise),
                ])}
                empty="No posted purchase lines in this period."
              />
              <div className="mt-3">
                <CsvExportButton
                  filename="gst-purchase-hsn"
                  rows={hsnRows}
                  columns={[
                    { key: 'hsn', header: 'HSN / SAC', value: (row) => row.hsn },
                    { key: 'quantity', header: 'Quantity', value: (row) => row.quantity },
                    { key: 'taxable', header: 'Taxable (₹)', value: (row) => (row.taxablePaise / 100).toFixed(2) },
                    { key: 'tax', header: 'Tax (₹)', value: (row) => (row.taxPaise / 100).toFixed(2) },
                  ]}
                  title="Export purchase HSN summary"
                  description="Uses the selected report period. Outward HSN is unavailable because order lines do not store it."
                />
              </div>
            </div>
          </section>

          <section className="surface-card border-brand-200 p-4 sm:p-5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-950">Accounting prerequisites</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                  These reports are working documents. A trial balance and a GST return need the following
                  foundations, which this application does not yet have.
                </p>
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-700">
              {ACCOUNTING_PREREQUISITES.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="mt-4">
              <Button variant="outline" asChild>
                <a href="/admin/help?article=business-reports">Read the reports help</a>
              </Button>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">RCM tax {formatINR(gst.rcmTaxPaise)}</Badge>
            <Badge tone="neutral">CGST {formatINR(gst.cgstPaise)}</Badge>
            <Badge tone="neutral">SGST {formatINR(gst.sgstPaise)}</Badge>
            <Badge tone="neutral">IGST {formatINR(gst.igstPaise)}</Badge>
            <Badge tone="warning">Working position, not a filed return</Badge>
          </div>
        </div>
      )}
    </div>
  )
}
