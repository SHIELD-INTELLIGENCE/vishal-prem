import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isToday, parseISO, startOfDay, subDays } from 'date-fns'
import { ArrowRight, Download, ReceiptText, SearchX, WalletCards } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { paymentsQuery } from '@/data/queries'
import type { Payment } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatDateShort, formatDateTime, formatINR, formatTime } from '@/lib/format'

type DateFilter = 'today' | '7d' | '30d' | 'all'

export function PaymentsPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet } = useWorkspace()
  const [mode, setMode] = useState('all')
  const [type, setType] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d')

  const outletId = selectedOutletId ?? ''
  const payments = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const rows = useMemo(() => {
    return payments.rows.filter((payment) => {
      if (mode !== 'all' && payment.mode !== mode) return false
      if (type !== 'all' && payment.type !== type) return false
      if (dateFilter !== 'all') {
        const received = parseISO(payment.receivedAt)
        if (dateFilter === 'today' && !isToday(received)) return false
        if (dateFilter === '7d' && isAfter(startOfDay(subDays(new Date(), 6)), received)) return false
        if (dateFilter === '30d' && isAfter(startOfDay(subDays(new Date(), 29)), received)) return false
      }
      return true
    })
  }, [payments.rows, mode, type, dateFilter])

  const summary = useMemo(() => {
    const received = rows.filter((payment) => payment.type === 'payment')
    const refunds = rows.filter((payment) => payment.type === 'refund')
    const cash = received.filter((payment) => payment.mode === 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0)
    const digital = received.filter((payment) => payment.mode !== 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0)
    const refunded = refunds.reduce((sum, payment) => sum + payment.amountPaise, 0)
    return {
      net: cash + digital - refunded,
      cash,
      digital,
      refunded,
      count: rows.length,
    }
  }, [rows])

  const columns: DataColumn<Payment>[] = [
    {
      key: 'receipt',
      header: 'Receipt',
      accessor: (payment) => payment.receiptNumber,
      sortable: true,
      render: (payment) => (
        <div>
          <p className="font-semibold text-ink-900">{payment.receiptNumber}</p>
          <p className="text-[11px] capitalize text-ink-500">{payment.type === 'refund' ? 'Refund' : 'Payment'} · {payment.mode.replace('_', ' ')}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Received',
      accessor: (payment) => payment.receivedAt,
      sortable: true,
      render: (payment) => (
        <div>
          <p className="text-xs font-medium text-ink-800">{formatDateShort(payment.receivedAt)}</p>
          <p className="text-[11px] text-ink-500">{formatTime(payment.receivedAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      accessor: (payment) => payment.customerName,
      sortable: true,
      render: (payment) => <span className="text-sm text-ink-700">{payment.customerName || 'Walk-in'}</span>,
    },
    {
      key: 'against',
      header: 'Against',
      accessor: (payment) => payment.orderId ?? payment.bookingId ?? '',
      hideBelow: 'lg',
      render: (payment) => (
        <div className="text-xs">
          {payment.orderId && <Link to={`/admin/orders/${payment.orderId}`} className="font-medium text-brand-700 hover:underline">Order</Link>}
          {payment.bookingId && <Link to={`/admin/bookings/${payment.bookingId}`} className="font-medium text-brand-700 hover:underline">Booking</Link>}
          {!payment.orderId && !payment.bookingId && <span className="text-ink-400">Unlinked</span>}
          {payment.reference && <p className="truncate text-[10px] text-ink-400">{payment.reference}</p>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (payment) => payment.type,
      render: (payment) => <StatusBadge status={payment.type} label={payment.type === 'refund' ? 'Refund' : 'Payment'} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      accessor: (payment) => (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise),
      sortable: true,
      align: 'right',
      csvValue: (payment) => ((payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise) / 100).toFixed(2),
      render: (payment) => (
        <span className={`text-sm font-semibold tabular-nums ${payment.type === 'refund' ? 'text-brand-700' : 'text-sage-700'}`}>
          {payment.type === 'refund' ? '−' : ''}{formatINR(payment.amountPaise)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (payment) => (
        <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link to={`/admin/print/payment/${payment.id}`} target="_blank">Receipt</Link>
        </Button>
      ),
    },
  ]

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing payments." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Payments & refunds"
        description={`Cash, UPI, card and bank records for ${selectedOutlet?.name ?? 'this outlet'}. Payments are recorded against an order or booking.`}
        help="payments"
        actions={
          hasPermission(profile, 'ordersView') ? (
            <Button asChild variant="outline" leftIcon={<ReceiptText className="h-4 w-4" />}><Link to="/admin/orders">Open orders</Link></Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Net received', value: formatINR(summary.net, { compact: true }) },
          { label: 'Cash', value: formatINR(summary.cash, { compact: true }) },
          { label: 'Digital', value: formatINR(summary.digital, { compact: true }) },
          { label: 'Refunded', value: formatINR(summary.refunded, { compact: true }), danger: summary.refunded > 0 },
        ].map((item) => (
          <div key={item.label} className="surface-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">{item.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${item.danger ? 'text-brand-700' : 'text-ink-900'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(payment) => payment.id}
        loading={payments.loading}
        error={payments.error}
        onRetry={payments.reload}
        searchPlaceholder="Search receipt, customer, reference or note…"
        searchFields={(payment) => [payment.receiptNumber, payment.customerName, payment.reference, payment.notes, payment.mode]}
        exportFilename={`payments-${selectedOutlet?.code ?? 'outlet'}-${format(new Date(), 'yyyyMMdd')}.csv`}
        emptyTitle="No payments in this period"
        emptyDescription="Payments and advances recorded from orders and bookings appear here with printable receipts."
        emptyHelp="payments"
        emptyAction={<Badge tone="neutral">{summary.count} records</Badge>}
        mobileTitle={(payment) => payment.receiptNumber}
        mobileSubtitle={(payment) => `${payment.customerName || 'Walk-in'} · ${formatINR(payment.amountPaise)}`}
        mobileMeta={(payment) => (
          <>
            <StatusBadge status={payment.type} label={payment.type === 'refund' ? 'Refund' : 'Payment'} />
            <span className="capitalize">{payment.mode.replace('_', ' ')}</span>
            <span>{formatDateTime(payment.receivedAt)}</span>
          </>
        )}
        rowActions={(payment) => (
          <Button asChild size="sm" variant="ghost" aria-label={`Open receipt ${payment.receiptNumber}`}><Link to={`/admin/print/payment/${payment.id}`} target="_blank"><ArrowRight className="h-4 w-4" /></Link></Button>
        )}
        toolbar={
          <>
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Date range">
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All dates</option>
            </select>
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Payment mode">
              <option value="all">All modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
            <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Record type">
              <option value="all">Payments & refunds</option>
              <option value="payment">Payments only</option>
              <option value="refund">Refunds only</option>
            </select>
            {(mode !== 'all' || type !== 'all' || dateFilter !== '30d') && (
              <Button size="sm" variant="ghost" onClick={() => { setMode('all'); setType('all'); setDateFilter('30d') }} leftIcon={<SearchX className="h-3.5 w-3.5" />}>Reset</Button>
            )}
          </>
        }
        initialSort={{ key: 'date', direction: 'desc' }}
      />

      <div className="flex flex-col gap-2 text-[11px] text-ink-400 sm:flex-row sm:justify-between">
        <p className="flex items-center gap-1.5"><WalletCards className="h-3 w-3" /> New payments are recorded from an order or booking so balances stay consistent.</p>
        <p className="flex items-center gap-1.5"><Download className="h-3 w-3" /> CSV exports contain the filtered, sorted records visible in this table.</p>
      </div>
    </div>
  )
}
