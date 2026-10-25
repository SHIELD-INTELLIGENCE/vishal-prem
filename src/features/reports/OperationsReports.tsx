import { useMemo, useState, type ReactNode } from 'react'
import { format, isWithinInterval, parseISO } from 'date-fns'
import { AlertTriangle, ClipboardCheck, IndianRupee, PackageSearch, Truck, WalletCards } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { customersQuery } from '@/data/queries'
import {
  cashSessionsQuery,
  deliveriesQuery,
  expensesQuery,
  inventoryMovementsQuery,
  productionTasksQuery,
} from '@/data/operationsQueries'
import { buildPartyStatement } from '@/lib/partyLedger'
import type {
  Booking,
  CashSession,
  Customer,
  Delivery,
  Expense,
  InventoryMovement,
  Order,
  Payment,
  ProductionTask,
} from '@/types/models'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { formatDate, formatDateTime, formatINR, formatQuantity, titleCase } from '@/lib/format'

const MAX_PRODUCTION = 600
const MAX_MOVEMENTS = 1500
const MAX_DELIVERIES = 500
const MAX_EXPENSES = 500
const MAX_SESSIONS = 200
const MAX_CUSTOMERS = 500

export function OperationsReports({
  from,
  to,
  orders,
  bookings,
  payments,
}: {
  from: string
  to: string
  orders: Order[]
  bookings: Booking[]
  payments: Payment[]
}) {
  const { profile } = useAuth()
  const { selectedOutlet } = useWorkspace()
  const [tab, setTab] = useState('production')
  const outletId = selectedOutlet?.id ?? ''
  const canProduction = hasPermission(profile, 'productionView')
  const canInventory = hasPermission(profile, 'inventoryView')
  const canDelivery = hasPermission(profile, 'deliveryView')
  const canFinance = hasPermission(profile, 'financeView')
  const canParties = hasPermission(profile, 'customersView') && hasPermission(profile, 'financeView')

  const productionState = useCollectionData<ProductionTask>(
    () => (profile && outletId && canProduction ? productionTasksQuery(outletId, profile, MAX_PRODUCTION) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId && canProduction),
  )
  const movementsState = useCollectionData<InventoryMovement>(
    () => (profile && outletId && canInventory ? inventoryMovementsQuery(outletId, profile, MAX_MOVEMENTS) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId && canInventory),
  )
  const deliveriesState = useCollectionData<Delivery>(
    () => (profile && outletId && canDelivery ? deliveriesQuery(outletId, profile, MAX_DELIVERIES) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId && canDelivery),
  )
  const expensesState = useCollectionData<Expense>(
    () => (outletId && canFinance ? expensesQuery(outletId, MAX_EXPENSES) : null),
    [outletId],
    Boolean(outletId && canFinance),
  )
  const sessionsState = useCollectionData<CashSession>(
    () => (outletId && canFinance ? cashSessionsQuery(outletId, MAX_SESSIONS) : null),
    [outletId],
    Boolean(outletId && canFinance),
  )
  const customersState = useCollectionData<Customer>(
    () => (outletId && canParties ? customersQuery(outletId, MAX_CUSTOMERS) : null),
    [outletId],
    Boolean(outletId && canParties),
  )

  const inRange = (value: string) => isWithinInterval(parseISO(value), { start: parseISO(from), end: parseISO(to) })
  const production = productionState.rows.filter((task) => inRange(task.dueAt))
  const movements = movementsState.rows.filter((movement) => inRange(movement.occurredAt))
  const deliveries = deliveriesState.rows.filter((delivery) => inRange(delivery.scheduledAt))
  const expenses = expensesState.rows.filter((expense) => inRange(expense.paidAt))
  const sessions = sessionsState.rows.filter((session) => inRange(session.openedAt))

  const parties = useMemo(() => {
    return customersState.rows
      .map((customer) => ({
        customer,
        statement: buildPartyStatement(customer, orders, bookings, payments),
      }))
      .filter((item) => item.statement.entries.length > 0)
      .sort((a, b) => b.statement.closingBalancePaise - a.statement.closingBalancePaise)
  }, [customersState.rows, orders, bookings, payments])

  const productionColumns: DataColumn<ProductionTask>[] = [
    { key: 'product', header: 'Product', accessor: (task) => task.productName, render: (task) => <span className="font-semibold">{task.productName}</span>, sortable: true },
    { key: 'source', header: 'Source', accessor: (task) => task.sourceNumber, hideBelow: 'md' },
    { key: 'required', header: 'Required', accessor: (task) => task.requiredQty, render: (task) => formatQuantity(task.requiredQty, task.unit), align: 'right' },
    { key: 'completed', header: 'Completed', accessor: (task) => task.completedQty, render: (task) => formatQuantity(task.completedQty, task.unit), align: 'right' },
    { key: 'rejected', header: 'Rejected', accessor: (task) => task.rejectedQty, render: (task) => formatQuantity(task.rejectedQty, task.unit), align: 'right', hideBelow: 'lg' },
    { key: 'due', header: 'Due', accessor: (task) => task.dueAt, render: (task) => formatDateTime(task.dueAt), sortable: true },
    { key: 'status', header: 'Status', accessor: (task) => task.status, render: (task) => <StatusBadge status={task.status} /> },
    { key: 'quality', header: 'Quality', accessor: (task) => task.qualityStatus, render: (task) => <Badge tone={task.qualityStatus === 'rejected' ? 'danger' : task.qualityStatus === 'passed' ? 'success' : 'neutral'}>{titleCase(task.qualityStatus)}</Badge>, hideBelow: 'md' },
  ]

  const movementColumns: DataColumn<InventoryMovement>[] = [
    { key: 'date', header: 'Date', accessor: (movement) => movement.occurredAt, render: (movement) => formatDateTime(movement.occurredAt), sortable: true },
    { key: 'item', header: 'Item', accessor: (movement) => movement.itemName, render: (movement) => <span className="font-semibold">{movement.itemName}</span> },
    { key: 'type', header: 'Type', accessor: (movement) => titleCase(movement.type), hideBelow: 'md' },
    { key: 'quantity', header: 'Quantity', accessor: (movement) => movement.quantity, render: (movement) => `${movement.quantity > 0 ? '+' : ''}${formatQuantity(movement.quantity, movement.unit)}`, align: 'right', sortable: true },
    { key: 'balance', header: 'Balance', accessor: (movement) => movement.balanceAfter, render: (movement) => formatQuantity(movement.balanceAfter, movement.unit), align: 'right', hideBelow: 'lg' },
    { key: 'reason', header: 'Reason', accessor: (movement) => movement.reason, hideBelow: 'xl' },
    { key: 'actor', header: 'Staff', accessor: (movement) => movement.actorName, hideBelow: 'lg' },
  ]

  const deliveryColumns: DataColumn<Delivery>[] = [
    { key: 'number', header: 'Delivery', accessor: (delivery) => delivery.deliveryNumber, render: (delivery) => <div><p className="font-semibold">{delivery.deliveryNumber}</p><p className="text-[11px] text-ink-500">{delivery.customerName}</p></div>, sortable: true },
    { key: 'scheduled', header: 'Scheduled', accessor: (delivery) => delivery.scheduledAt, render: (delivery) => formatDateTime(delivery.scheduledAt), sortable: true },
    { key: 'assignee', header: 'Assignee', accessor: (delivery) => delivery.assignedToName ?? 'Unassigned', hideBelow: 'md' },
    { key: 'delivered', header: 'Delivered qty', accessor: (delivery) => delivery.lines.reduce((sum, line) => sum + line.deliveredQty, 0), align: 'right', hideBelow: 'lg' },
    { key: 'returned', header: 'Returned', accessor: (delivery) => delivery.lines.reduce((sum, line) => sum + line.returnedQty, 0), align: 'right', hideBelow: 'lg' },
    { key: 'collected', header: 'Collected', accessor: (delivery) => delivery.collectedPaise, render: (delivery) => formatINR(delivery.collectedPaise), align: 'right' },
    { key: 'status', header: 'Status', accessor: (delivery) => delivery.status, render: (delivery) => <StatusBadge status={delivery.status} /> },
  ]

  const expenseColumns: DataColumn<Expense>[] = [
    { key: 'number', header: 'Expense', accessor: (expense) => expense.expenseNumber, sortable: true },
    { key: 'date', header: 'Paid', accessor: (expense) => expense.paidAt, render: (expense) => formatDate(expense.paidAt), sortable: true },
    { key: 'head', header: 'Head', accessor: (expense) => titleCase(expense.head) },
    { key: 'amount', header: 'Amount', accessor: (expense) => expense.amountPaise, render: (expense) => formatINR(expense.amountPaise), align: 'right', sortable: true },
    { key: 'status', header: 'Status', accessor: (expense) => expense.status, render: (expense) => <Badge tone={expense.status === 'posted' ? 'success' : 'neutral'}>{titleCase(expense.status)}</Badge> },
  ]

  const sessionColumns: DataColumn<CashSession>[] = [
    { key: 'number', header: 'Session', accessor: (session) => session.sessionNumber, sortable: true },
    { key: 'opened', header: 'Opened', accessor: (session) => session.openedAt, render: (session) => formatDateTime(session.openedAt), sortable: true },
    { key: 'staff', header: 'Staff', accessor: (session) => session.openedByName, hideBelow: 'md' },
    { key: 'expected', header: 'Expected', accessor: (session) => session.expectedCashPaise ?? 0, render: (session) => session.expectedCashPaise === undefined ? '—' : formatINR(session.expectedCashPaise), align: 'right' },
    { key: 'variance', header: 'Variance', accessor: (session) => session.variancePaise ?? 0, render: (session) => session.variancePaise === undefined ? '—' : formatINR(session.variancePaise), align: 'right' },
    { key: 'status', header: 'Status', accessor: (session) => session.status, render: (session) => <StatusBadge status={session.status} /> },
  ]

  const partyColumns: DataColumn<(typeof parties)[number]>[] = [
    { key: 'party', header: 'Party', accessor: (row) => row.customer.name, render: (row) => <div><p className="font-semibold">{row.customer.name}</p><p className="text-[11px] text-ink-500">{row.customer.phone || row.customer.accountGroup}</p></div>, sortable: true },
    { key: 'billed', header: 'Billed', accessor: (row) => row.statement.billedPaise, render: (row) => formatINR(row.statement.billedPaise), align: 'right', hideBelow: 'md' },
    { key: 'received', header: 'Received', accessor: (row) => row.statement.receivedPaise, render: (row) => formatINR(row.statement.receivedPaise), align: 'right', hideBelow: 'md' },
    { key: 'balance', header: 'Balance', accessor: (row) => row.statement.closingBalancePaise, render: (row) => <span className={row.statement.closingBalancePaise > 0 ? 'font-semibold text-brand-700' : 'font-semibold text-sage-700'}>{formatINR(row.statement.closingBalancePaise)}</span>, align: 'right', sortable: true },
  ]

  const tabs = [
    canProduction ? { id: 'production', label: 'Production', icon: <ClipboardCheck className="h-4 w-4" /> } : null,
    canInventory ? { id: 'inventory', label: 'Inventory', icon: <PackageSearch className="h-4 w-4" /> } : null,
    canDelivery ? { id: 'deliveries', label: 'Deliveries', icon: <Truck className="h-4 w-4" /> } : null,
    canFinance ? { id: 'finance', label: 'Finance', icon: <WalletCards className="h-4 w-4" /> } : null,
    canParties ? { id: 'parties', label: 'Party activity', icon: <IndianRupee className="h-4 w-4" /> } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; icon: ReactNode }>

  if (tabs.length === 0) return null
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id

  const capped: string[] = []
  if (productionState.rows.length >= MAX_PRODUCTION) capped.push('production')
  if (movementsState.rows.length >= MAX_MOVEMENTS) capped.push('inventory movements')
  if (deliveriesState.rows.length >= MAX_DELIVERIES) capped.push('deliveries')
  if (expensesState.rows.length >= MAX_EXPENSES) capped.push('expenses')
  if (customersState.rows.length >= MAX_CUSTOMERS) capped.push('party accounts')

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-950">Operational reports</h2>
          <p className="mt-0.5 text-xs text-ink-500">Filtered to the selected period. Each table exports the full filtered result, not just the visible page.</p>
        </div>
        {capped.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Some data is capped: {capped.join(', ')}. Narrow the date range or open the workflow page for the complete register.
          </p>
        )}
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setTab} ariaLabel="Operational reports" />

      {activeTab === 'production' && (
        <DataTable
          rows={production}
          columns={productionColumns}
          getRowId={(task) => task.id}
          loading={productionState.loading}
          searchPlaceholder="Search product, source or status…"
          searchFields={(task) => [task.productName, task.sourceNumber, task.status, task.qualityStatus]}
          exportFilename={`production-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
          exportDate={(task) => task.dueAt}
          exportInitialFrom={from}
          exportInitialTo={to}
          initialSort={{ key: 'due', direction: 'asc' }}
          emptyTitle="No production work in this period"
          emptyDescription="Production tasks due in the selected date range appear here."
          mobileTitle={(task) => task.productName}
          mobileSubtitle={(task) => `${task.sourceNumber} · ${formatDateTime(task.dueAt)}`}
          mobileMeta={(task) => <StatusBadge status={task.status} />}
        />
      )}

      {activeTab === 'inventory' && (
        <DataTable
          rows={movements}
          columns={movementColumns}
          getRowId={(movement) => movement.id}
          loading={movementsState.loading}
          searchPlaceholder="Search item, reason or staff…"
          searchFields={(movement) => [movement.itemName, movement.reason, movement.type, movement.actorName]}
          exportFilename={`inventory-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
          exportDate={(movement) => movement.occurredAt}
          exportInitialFrom={from}
          exportInitialTo={to}
          initialSort={{ key: 'date', direction: 'desc' }}
          emptyTitle="No inventory movements in this period"
          emptyDescription="Purchases, issues, wastage, transfers and counts appear here."
          mobileTitle={(movement) => movement.itemName}
          mobileSubtitle={(movement) => `${titleCase(movement.type)} · ${formatDateTime(movement.occurredAt)}`}
          mobileMeta={(movement) => <span className={movement.quantity >= 0 ? 'text-sage-700' : 'text-brand-700'}>{formatQuantity(movement.quantity, movement.unit)}</span>}
        />
      )}

      {activeTab === 'deliveries' && (
        <DataTable
          rows={deliveries}
          columns={deliveryColumns}
          getRowId={(delivery) => delivery.id}
          loading={deliveriesState.loading}
          searchPlaceholder="Search delivery, customer or staff…"
          searchFields={(delivery) => [delivery.deliveryNumber, delivery.customerName, delivery.assignedToName, delivery.status]}
          exportFilename={`delivery-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
          exportDate={(delivery) => delivery.scheduledAt}
          exportInitialFrom={from}
          exportInitialTo={to}
          initialSort={{ key: 'scheduled', direction: 'asc' }}
          emptyTitle="No deliveries in this period"
          emptyDescription="Deliveries scheduled in the selected range appear here."
          mobileTitle={(delivery) => delivery.deliveryNumber}
          mobileSubtitle={(delivery) => `${delivery.customerName} · ${formatDateTime(delivery.scheduledAt)}`}
          mobileMeta={(delivery) => <StatusBadge status={delivery.status} />}
        />
      )}

      {activeTab === 'finance' && (
        <div className="space-y-4">
          <DataTable
            rows={expenses}
            columns={expenseColumns}
            getRowId={(expense) => expense.id}
            loading={expensesState.loading}
            searchPlaceholder="Search expense or head…"
            searchFields={(expense) => [expense.expenseNumber, expense.head, expense.notes]}
            exportFilename={`expense-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
            exportDate={(expense) => expense.paidAt}
            exportInitialFrom={from}
            exportInitialTo={to}
            emptyTitle="No expenses in this period"
            emptyDescription="Posted and voided expenses paid in the range appear here."
            mobileTitle={(expense) => expense.expenseNumber}
            mobileSubtitle={(expense) => `${titleCase(expense.head)} · ${formatINR(expense.amountPaise)}`}
            mobileMeta={(expense) => <Badge tone={expense.status === 'posted' ? 'success' : 'neutral'}>{titleCase(expense.status)}</Badge>}
          />
          <DataTable
            rows={sessions}
            columns={sessionColumns}
            getRowId={(session) => session.id}
            loading={sessionsState.loading}
            searchPlaceholder="Search session or staff…"
            searchFields={(session) => [session.sessionNumber, session.openedByName, session.handedOverTo]}
            exportFilename={`cash-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
            exportDate={(session) => session.openedAt}
            exportInitialFrom={from}
            exportInitialTo={to}
            emptyTitle="No cash sessions in this period"
            emptyDescription="Open and closed cash sessions appear here with expected cash and variance."
            mobileTitle={(session) => session.sessionNumber}
            mobileSubtitle={(session) => `${session.openedByName} · ${formatDateTime(session.openedAt)}`}
            mobileMeta={(session) => <StatusBadge status={session.status} />}
          />
        </div>
      )}

      {activeTab === 'parties' && (
        <DataTable
          rows={parties}
          columns={partyColumns}
          getRowId={(row) => row.customer.id}
          loading={customersState.loading}
          searchPlaceholder="Search party or phone…"
          searchFields={(row) => [row.customer.name, row.customer.phone, row.customer.accountGroup]}
          exportFilename={`party-report-${format(parseISO(from), 'yyyyMMdd')}-${format(parseISO(to), 'yyyyMMdd')}.csv`}
          initialSort={{ key: 'balance', direction: 'desc' }}
          emptyTitle="No party activity in this period"
          emptyDescription="Parties with orders, bookings, receipts, refunds or an opening balance in this period appear here. Open Finance for the current outstanding list."
          mobileTitle={(row) => row.customer.name}
          mobileSubtitle={(row) => `${formatINR(row.statement.closingBalancePaise)} balance`}
        />
      )}
    </section>
  )
}
