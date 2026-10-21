import { useMemo, useState } from 'react'
import { endOfDay, format, startOfDay } from 'date-fns'
import {
  ArrowRightLeft,
  BookOpenCheck,
  Download,
  FileSpreadsheet,
  Info,
  ShieldAlert,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { ordersInRangeQuery, paymentsInRangeQuery } from '@/data/queries'
import type { Order, Payment } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { formatDate, formatINR, todayInput } from '@/lib/format'
import { downloadCsv, type CsvColumn } from '@/lib/csv'

const ORDER_COLUMNS: CsvColumn<Order>[] = [
  { header: 'Order number', value: (row) => row.orderNumber },
  { header: 'Created at', value: (row) => row.createdAt },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Phone', value: (row) => row.customerPhone ?? '' },
  { header: 'Status', value: (row) => row.status },
  { header: 'Payment status', value: (row) => row.paymentStatus },
  { header: 'Channel', value: (row) => row.channel },
  { header: 'Order type', value: (row) => row.orderType },
  { header: 'Subtotal (INR)', value: (row) => (row.subtotalPaise / 100).toFixed(2) },
  { header: 'Discount (INR)', value: (row) => (row.discountPaise / 100).toFixed(2) },
  { header: 'Tax (INR)', value: (row) => (row.taxPaise / 100).toFixed(2) },
  { header: 'Total (INR)', value: (row) => (row.totalPaise / 100).toFixed(2) },
  { header: 'Paid (INR)', value: (row) => (row.paidPaise / 100).toFixed(2) },
  { header: 'Balance (INR)', value: (row) => (row.balancePaise / 100).toFixed(2) },
  { header: 'Notes', value: (row) => row.notes ?? '' },
]

const PAYMENT_COLUMNS: CsvColumn<Payment>[] = [
  { header: 'Receipt number', value: (row) => row.receiptNumber },
  { header: 'Received at', value: (row) => row.receivedAt },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Type', value: (row) => row.type },
  { header: 'Mode', value: (row) => row.mode },
  { header: 'Amount (INR)', value: (row) => (row.amountPaise / 100).toFixed(2) },
  { header: 'Reference', value: (row) => row.reference ?? '' },
  { header: 'Order ID', value: (row) => row.orderId ?? '' },
  { header: 'Booking ID', value: (row) => row.bookingId ?? '' },
  { header: 'Notes', value: (row) => row.notes ?? '' },
]

export function BusyPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const [from, setFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
  const [to, setTo] = useState(todayInput())

  const startIso = startOfDay(new Date(`${from}T00:00:00`)).toISOString()
  const endIso = endOfDay(new Date(`${to}T00:00:00`)).toISOString()
  const outletId = selectedOutletId ?? ''
  const canExport = hasPermission(profile, 'busyView')

  const orders = useCollectionData<Order>(
    () => (profile && outletId && canExport ? ordersInRangeQuery(outletId, profile, startIso, endIso, 2000) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), startIso, endIso, canExport],
    Boolean(profile && outletId && canExport),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && outletId && canExport ? paymentsInRangeQuery(outletId, profile, startIso, endIso, 2000) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), startIso, endIso, canExport],
    Boolean(profile && outletId && canExport),
  )

  const summary = useMemo(() => {
    const activeOrders = orders.rows.filter((order) => order.status !== 'cancelled')
    const received = payments.rows.reduce(
      (sum, payment) => sum + (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise),
      0,
    )
    return {
      orders: activeOrders.length,
      sales: activeOrders.reduce((sum, order) => sum + order.totalPaise, 0),
      tax: activeOrders.reduce((sum, order) => sum + order.taxPaise, 0),
      received,
      refunds: payments.rows
        .filter((payment) => payment.type === 'refund')
        .reduce((sum, payment) => sum + payment.amountPaise, 0),
    }
  }, [orders.rows, payments.rows])

  function exportOrders() {
    if (orders.rows.length === 0) {
      toast.error('There are no order records in this date range to export.')
      return
    }
    downloadCsv(`vishal-prem-orders-${selectedOutlet?.code ?? 'outlet'}-${from}-to-${to}`, orders.rows, ORDER_COLUMNS)
    toast.success(`Exported ${orders.rows.length} order records`)
  }

  function exportPayments() {
    if (payments.rows.length === 0) {
      toast.error('There are no payment records in this date range to export.')
      return
    }
    downloadCsv(`vishal-prem-payments-${selectedOutlet?.code ?? 'outlet'}-${from}-to-${to}`, payments.rows, PAYMENT_COLUMNS)
    toast.success(`Exported ${payments.rows.length} payment records`)
  }

  if (!canExport) {
    return <ErrorState title="You cannot open accounting export" message="Your role does not include the accounting export permission." />
  }
  if (!outletId || !selectedOutlet) {
    return <EmptyState title="No outlet selected" description="Choose an outlet in the top bar before preparing an accounting export." />
  }
  if (orders.error || payments.error) {
    return (
      <ErrorState
        title="Could not load export data"
        message={orders.error ?? payments.error ?? undefined}
        onRetry={() => {
          orders.reload()
          payments.reload()
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounting"
        title="Accounting export"
        description="Download dated CSV files of sales orders and payments, ready for your accountant to import or reconcile."
        help="accounting-export"
        actions={<Badge tone="neutral">CSV export</Badge>}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Orders in range', value: String(summary.orders), hint: 'Excludes cancelled orders' },
          { label: 'Sales value', value: formatINR(summary.sales, { compact: true }), hint: 'Tax-inclusive totals' },
          { label: 'Tax recorded', value: formatINR(summary.tax, { compact: true }), hint: 'GST component only' },
          { label: 'Net receipts', value: formatINR(summary.received, { compact: true }), hint: `Refunds ${formatINR(summary.refunds, { compact: true })}` },
        ].map((item) => (
          <div key={item.label} className="surface-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{item.label}</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight">{item.value}</p>
            <p className="mt-0.5 text-[11px] text-ink-500">{item.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface-card overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-4 sm:px-5">
            <h2 className="font-display text-lg font-semibold">Accounting handoff</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
              Download the records for {selectedOutlet.name}, then import or key them into the accounting system.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">From</span>
                <input
                  type="date"
                  className="field-input"
                  value={from}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">To</span>
                <input
                  type="date"
                  className="field-input"
                  value={to}
                  min={from}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div className="rounded-xl border border-ink-200 p-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold">Sales orders</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                One row per order with totals, tax, payment status and notes. Cancelled orders are included so the accountant can see reversals.
              </p>
              <p className="mt-2 text-[11px] text-ink-400">
                {orders.loading ? 'Loading…' : `${orders.rows.length} records loaded`}
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={exportOrders}
                disabled={orders.loading}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Export orders CSV
              </Button>
            </div>

            <div className="rounded-xl border border-ink-200 p-4">
              <div className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-sage-600" />
                <h3 className="text-sm font-semibold">Payments and refunds</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                One row per receipt, with mode, reference and the linked order or booking. Refunds are exported as their own rows.
              </p>
              <p className="mt-2 text-[11px] text-ink-400">
                {payments.loading ? 'Loading…' : `${payments.rows.length} records loaded`}
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={exportPayments}
                disabled={payments.loading}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Export payments CSV
              </Button>
            </div>
          </div>

          {(orders.loading || payments.loading) && (
            <div className="border-t border-ink-100 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="surface-card p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-4.5 w-4.5 text-gold-700" />
              <h2 className="font-display text-lg font-semibold">How the handoff works</h2>
            </div>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-600">
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> The export is a manual handoff: download the files, then enter them in the accounting system.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> No masters, ledgers or stock are written automatically.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> The accountant remains responsible for mapping and reconciliation.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /> Files are generated locally in the browser and are not stored anywhere else.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-gold-200 bg-gold-50 p-4 text-xs leading-relaxed text-gold-900">
            <p className="flex items-center gap-1.5 font-bold"><ShieldAlert className="h-3.5 w-3.5" /> Export warnings</p>
            <ul className="mt-2 space-y-1.5">
              <li>• CSV cells are protected against spreadsheet formula injection.</li>
              <li>• The date range is inclusive of both selected days.</li>
              <li>• Department-scoped staff only export records from their own departments.</li>
              <li>• Reconcile refunds against receipts before closing a day.</li>
            </ul>
          </section>
        </aside>
      </div>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ArrowRightLeft className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Records included in the boundary</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
              Orders and payments are exported for {selectedOutlet.name}. Party bookings appear through their payments and can be opened individually for a quotation or invoice.
              Departments available here: {departments.filter((department) => department.outletIds.includes(outletId)).map((department) => department.name).join(', ') || 'none assigned'}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Counter orders', 'Payments', 'Refunds', 'Party booking advances'].map((item) => (
                <Badge key={item} tone="neutral">{item}</Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Export prepared for {formatDate(new Date())}. Files are generated locally in your browser.
      </p>
    </div>
  )
}
