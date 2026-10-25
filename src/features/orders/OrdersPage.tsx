import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, isAfter, isToday, parseISO, startOfDay, subDays } from 'date-fns'
import { ArrowRight, Download, Plus, ReceiptText, SearchX } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { ordersQuery } from '@/data/queries'
import type { Order } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatDateShort, formatINR, formatTime } from '@/lib/format'
import { ORDER_STATUS_LABELS } from '@/lib/calculations'

type DateFilter = 'today' | '7d' | '30d' | 'all'

export function OrdersPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [payment, setPayment] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d')
  const [department, setDepartment] = useState('all')

  const outletId = selectedOutletId ?? ''
  const orders = useCollectionData<Order>(
    () => (profile && outletId ? ordersQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const rows = useMemo(() => {
    return orders.rows.filter((order) => {
      if (status !== 'all' && order.status !== status) return false
      if (payment !== 'all' && order.paymentStatus !== payment) return false
      if (department !== 'all' && order.departmentId !== department) return false
      if (dateFilter !== 'all') {
        const created = parseISO(order.createdAt)
        if (dateFilter === 'today' && !isToday(created)) return false
        if (dateFilter === '7d' && isAfter(startOfDay(subDays(new Date(), 6)), created)) return false
        if (dateFilter === '30d' && isAfter(startOfDay(subDays(new Date(), 29)), created)) return false
      }
      return true
    })
  }, [orders.rows, status, payment, department, dateFilter])

  const summary = useMemo(() => {
    const active = rows.filter((order) => order.status !== 'cancelled')
    return {
      count: rows.length,
      value: active.reduce((sum, order) => sum + order.totalPaise, 0),
      unpaid: rows.filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled').length,
      active: rows.filter((order) => ['confirmed', 'preparing', 'ready'].includes(order.status)).length,
    }
  }, [rows])

  const columns: DataColumn<Order>[] = [
    {
      key: 'order',
      header: 'Order',
      accessor: (order) => order.orderNumber,
      sortable: true,
      render: (order) => (
        <div>
          <p className="font-semibold text-ink-900">{order.orderNumber}</p>
          <p className="text-[11px] text-ink-500">{formatDateShort(order.createdAt)} · {formatTime(order.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      accessor: (order) => order.customerName,
      sortable: true,
      render: (order) => (
        <div>
          <p className="font-medium text-ink-800">{order.customerName}</p>
          <p className="text-[11px] text-ink-500">{order.customerPhone || 'No phone'}</p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      accessor: (order) => departments.find((item) => item.id === order.departmentId)?.name ?? '—',
      hideBelow: 'lg',
      render: (order) => (
        <span className="text-xs text-ink-600">{departments.find((item) => item.id === order.departmentId)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      accessor: (order) => order.lines.length,
      align: 'center',
      hideBelow: 'md',
      render: (order) => <span className="text-xs text-ink-600">{order.lines.length} line{order.lines.length === 1 ? '' : 's'}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      accessor: (order) => order.totalPaise,
      sortable: true,
      align: 'right',
      csvValue: (order) => (order.totalPaise / 100).toFixed(2),
      render: (order) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatINR(order.totalPaise)}</p>
          {order.balancePaise > 0 && <p className="text-[10px] text-brand-700">{formatINR(order.balancePaise)} due</p>}
        </div>
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      accessor: (order) => order.paymentStatus,
      hideBelow: 'md',
      render: (order) => <StatusBadge status={order.paymentStatus} />,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (order) => order.status,
      sortable: true,
      render: (order) => <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />,
    },
    {
      key: 'actions',
      header: '',
      render: (order) => (
        <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link to={`/admin/orders/${order.id}`}>View</Link>
        </Button>
      ),
    },
  ]

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing orders." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description={`Counter and phone orders for ${selectedOutlet?.name ?? 'this outlet'}. Payment status is tracked separately from preparation.`}
        help="orders"
        actions={
          hasPermission(profile, 'ordersManage') ? (
            <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
              <Link to="/admin/orders/new">New order</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Records shown', value: summary.count.toString() },
          { label: 'Booked value', value: formatINR(summary.value, { compact: true }) },
          { label: 'Open queue', value: summary.active.toString() },
          { label: 'Not fully paid', value: summary.unpaid.toString() },
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
        getRowId={(order) => order.id}
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.reload}
        searchPlaceholder="Search order number, customer or phone…"
        searchFields={(order) => [order.orderNumber, order.customerName, order.customerPhone, order.notes, ...order.lines.map((line) => line.name)]}
        exportFilename={`orders-${selectedOutlet?.code ?? 'outlet'}-${format(new Date(), 'yyyyMMdd')}.csv`}
        exportDate={(order) => order.createdAt}
        emptyTitle="No orders yet"
        emptyDescription="Counter orders will appear here after the first sale. Use New order to enter one."
        emptyHelp="orders"
        emptyAction={
          hasPermission(profile, 'ordersManage') ? (
            <Button asChild size="sm" leftIcon={<ReceiptText className="h-4 w-4" />}><Link to="/admin/orders/new">Create an order</Link></Button>
          ) : undefined
        }
        onRowClick={(order) => navigate(`/admin/orders/${order.id}`)}
        mobileTitle={(order) => order.orderNumber}
        mobileSubtitle={(order) => `${order.customerName} · ${formatINR(order.totalPaise)}`}
        mobileMeta={(order) => (
          <>
            <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
            <StatusBadge status={order.paymentStatus} />
            <span>{formatDateShort(order.createdAt)}</span>
          </>
        )}
        rowActions={(order) => (
          <Button asChild size="sm" variant="ghost" aria-label={`View ${order.orderNumber}`}><Link to={`/admin/orders/${order.id}`}><ArrowRight className="h-4 w-4" /></Link></Button>
        )}
        toolbar={
          <>
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Date range">
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All dates</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Preparation status">
              <option value="all">All statuses</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={payment} onChange={(event) => setPayment(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Payment status">
              <option value="all">All payments</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
            </select>
            {departments.length > 1 && (
              <select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Department">
                <option value="all">All departments</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            {(status !== 'all' || payment !== 'all' || dateFilter !== '30d' || department !== 'all') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setStatus('all'); setPayment('all'); setDateFilter('30d'); setDepartment('all') }}
                leftIcon={<SearchX className="h-3.5 w-3.5" />}
              >
                Reset
              </Button>
            )}
          </>
        }
        initialSort={{ key: 'order', direction: 'desc' }}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <Download className="h-3 w-3" /> CSV exports contain the filtered, sorted records visible in this table.
      </p>
    </div>
  )
}
