import { useMemo, useState } from 'react'
import { endOfDay, format, isWithinInterval, parseISO, startOfDay, subDays } from 'date-fns'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  IndianRupee,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { useCollectionData } from '@/data/hooks'
import { bookingsInRangeQuery, ordersInRangeQuery, paymentsInRangeQuery } from '@/data/queries'
import type { Booking, Order, Payment } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { formatDate, formatINR, todayInput } from '@/lib/format'
import { ORDER_STATUS_LABELS } from '@/lib/calculations'
import { downloadCsv } from '@/lib/csv'
import { OperationsReports } from './OperationsReports'

type RangeKey = '7d' | '30d' | '90d' | 'month' | 'custom'

export function ReportsPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const [range, setRange] = useState<RangeKey>('30d')
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [to, setTo] = useState(todayInput())

  const effectiveFrom = range === '7d' ? subDays(new Date(), 6) : range === '30d' ? subDays(new Date(), 29) : range === '90d' ? subDays(new Date(), 89) : range === 'month' ? startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) : startOfDay(parseISO(from))
  const effectiveTo = range === 'custom' ? endOfDay(parseISO(to)) : endOfDay(new Date())
  const startIso = effectiveFrom.toISOString()
  const endIso = effectiveTo.toISOString()
  const outletId = selectedOutletId ?? ''

  const orders = useCollectionData<Order>(
    () => (profile && outletId ? ordersInRangeQuery(outletId, profile, startIso, endIso, 2000) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), startIso, endIso],
    Boolean(profile && outletId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsInRangeQuery(outletId, profile, startIso, endIso, 2000) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), startIso, endIso],
    Boolean(profile && outletId),
  )
  const bookings = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsInRangeQuery(outletId, profile, startIso, endIso, 1000) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), startIso, endIso],
    Boolean(profile && outletId),
  )

  const metrics = useMemo(() => {
    const activeOrders = orders.rows.filter((order) => order.status !== 'cancelled')
    const activeBookings = bookings.rows.filter((booking) => booking.status !== 'cancelled')
    const sales = activeOrders.reduce((sum, order) => sum + order.totalPaise, 0)
      + activeBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)
    const tax = activeOrders.reduce((sum, order) => sum + order.taxPaise, 0)
      + activeBookings.reduce((sum, booking) => sum + booking.taxPaise, 0)
    const discounts = activeOrders.reduce((sum, order) => sum + order.discountPaise, 0)
      + activeBookings.reduce((sum, booking) => sum + booking.discountPaise, 0)
    const received = payments.rows.reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise), 0)
    const refunds = payments.rows.filter((payment) => payment.type === 'refund').reduce((sum, payment) => sum + payment.amountPaise, 0)
    const cash = payments.rows.filter((payment) => payment.type === 'payment' && payment.mode === 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0)
    const digital = payments.rows.filter((payment) => payment.type === 'payment' && payment.mode !== 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0)

    const days = []
    const cursor = new Date(effectiveFrom)
    while (cursor <= effectiveTo) {
      const key = format(cursor, 'yyyy-MM-dd')
      const dayOrders = activeOrders.filter((order) => order.createdAt.slice(0, 10) === key)
      const dayBookings = activeBookings.filter((booking) => booking.createdAt.slice(0, 10) === key)
      days.push({
        key,
        label: format(cursor, 'dd MMM'),
        sales: Math.round(
          (dayOrders.reduce((sum, order) => sum + order.totalPaise, 0)
            + dayBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)) / 100,
        ),
        orders: dayOrders.length + dayBookings.length,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    const departmentMap = new Map<string, { value: number; orders: number }>()
    for (const order of activeOrders) {
      const current = departmentMap.get(order.departmentId) ?? { value: 0, orders: 0 }
      departmentMap.set(order.departmentId, { value: current.value + order.totalPaise, orders: current.orders + 1 })
    }
    for (const booking of activeBookings) {
      const lineBase = booking.lines.reduce((sum, line) => {
        const base = line.quantity * line.unitPricePaise
        return sum + base - Math.round(base * line.discountPercent / 100)
      }, 0)
      for (const line of booking.lines) {
        const share = lineBase > 0
          ? Math.round(booking.totalPaise * ((line.quantity * line.unitPricePaise * (1 - line.discountPercent / 100)) / lineBase))
          : Math.round(booking.totalPaise / Math.max(1, booking.departmentIds.length))
        const current = departmentMap.get(line.departmentId) ?? { value: 0, orders: 0 }
        departmentMap.set(line.departmentId, { value: current.value + share, orders: current.orders + 1 })
      }
    }
    const departmentData = Array.from(departmentMap.entries())
      .map(([id, value]) => {
        const department = departments.find((item) => item.id === id)
        return {
          id,
          name: department?.name ?? 'Department',
          color: department?.color ?? '#C8102E',
          ...value,
        }
      })
      .sort((a, b) => b.value - a.value)

    const productMap = new Map<string, { name: string; quantity: number; revenue: number; unit: string }>()
    for (const order of activeOrders) {
      for (const line of order.lines) {
        const current = productMap.get(line.productId) ?? { name: line.name, quantity: 0, revenue: 0, unit: line.unit }
        productMap.set(line.productId, {
          ...current,
          quantity: current.quantity + line.quantity,
          revenue: current.revenue + Math.round(line.quantity * line.unitPricePaise * (1 - line.discountPercent / 100)),
        })
      }
    }
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

    const paymentModes = ['cash', 'upi', 'card', 'bank_transfer', 'other'].map((mode) => {
      const modePayments = payments.rows.filter((payment) => payment.type === 'payment' && payment.mode === mode)
      return { mode, value: modePayments.reduce((sum, payment) => sum + payment.amountPaise, 0), count: modePayments.length }
    }).filter((item) => item.count > 0)

    const statusCounts = (Object.keys(ORDER_STATUS_LABELS) as Array<keyof typeof ORDER_STATUS_LABELS>).map((status) => ({
      status,
      label: ORDER_STATUS_LABELS[status],
      count: orders.rows.filter((order) => order.status === status).length,
    }))

    const previousStart = subDays(effectiveFrom, Math.max(1, Math.round((effectiveTo.getTime() - effectiveFrom.getTime()) / 86_400_000) + 1))
    const previousOrders = activeOrders.filter((order) => {
      const created = parseISO(order.createdAt)
      return isWithinInterval(created, { start: previousStart, end: effectiveFrom })
    })
    const previousBookings = activeBookings.filter((booking) => {
      const created = parseISO(booking.createdAt)
      return isWithinInterval(created, { start: previousStart, end: effectiveFrom })
    })
    const previousSales = previousOrders.reduce((sum, order) => sum + order.totalPaise, 0)
      + previousBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)
    const change = previousSales > 0 ? ((sales - previousSales) / previousSales) * 100 : 0

    return {
      sales,
      tax,
      discounts,
      received,
      refunds,
      cash,
      digital,
      orderCount: activeOrders.length + activeBookings.length,
      average: activeOrders.length + activeBookings.length ? Math.round(sales / (activeOrders.length + activeBookings.length)) : 0,
      days,
      departmentData,
      topProducts,
      paymentModes,
      statusCounts,
      change,
    }
  }, [orders.rows, bookings.rows, payments.rows, departments, effectiveFrom, effectiveTo])

  function exportOrders() {
    downloadCsv(`orders-${selectedOutlet?.code ?? 'outlet'}-${format(effectiveFrom, 'yyyyMMdd')}-${format(effectiveTo, 'yyyyMMdd')}.csv`, orders.rows, [
      { header: 'Order number', value: (order) => order.orderNumber },
      { header: 'Created', value: (order) => order.createdAt },
      { header: 'Customer', value: (order) => order.customerName },
      { header: 'Phone', value: (order) => order.customerPhone },
      { header: 'Department', value: (order) => departments.find((item) => item.id === order.departmentId)?.name },
      { header: 'Status', value: (order) => order.status },
      { header: 'Payment status', value: (order) => order.paymentStatus },
      { header: 'Subtotal', value: (order) => (order.subtotalPaise / 100).toFixed(2) },
      { header: 'Discount', value: (order) => (order.discountPaise / 100).toFixed(2) },
      { header: 'Tax', value: (order) => (order.taxPaise / 100).toFixed(2) },
      { header: 'Total', value: (order) => (order.totalPaise / 100).toFixed(2) },
      { header: 'Paid', value: (order) => (order.paidPaise / 100).toFixed(2) },
      { header: 'Balance', value: (order) => (order.balancePaise / 100).toFixed(2) },
    ])
  }

  function exportBookings() {
    downloadCsv(`bookings-${selectedOutlet?.code ?? 'outlet'}-${format(effectiveFrom, 'yyyyMMdd')}-${format(effectiveTo, 'yyyyMMdd')}.csv`, bookings.rows, [
      { header: 'Booking number', value: (booking) => booking.bookingNumber },
      { header: 'Created', value: (booking) => booking.createdAt },
      { header: 'Customer', value: (booking) => booking.customerName },
      { header: 'Phone', value: (booking) => booking.customerPhone },
      { header: 'Event date', value: (booking) => booking.eventDate },
      { header: 'Event type', value: (booking) => booking.eventType },
      { header: 'Status', value: (booking) => booking.status },
      { header: 'Payment status', value: (booking) => booking.paymentStatus },
      { header: 'Total', value: (booking) => (booking.totalPaise / 100).toFixed(2) },
      { header: 'Paid', value: (booking) => (booking.paidPaise / 100).toFixed(2) },
      { header: 'Balance', value: (booking) => (booking.balancePaise / 100).toFixed(2) },
    ])
  }

  function exportPayments() {
    downloadCsv(`payments-${selectedOutlet?.code ?? 'outlet'}-${format(effectiveFrom, 'yyyyMMdd')}-${format(effectiveTo, 'yyyyMMdd')}.csv`, payments.rows, [
      { header: 'Receipt', value: (payment) => payment.receiptNumber },
      { header: 'Received at', value: (payment) => payment.receivedAt },
      { header: 'Customer', value: (payment) => payment.customerName },
      { header: 'Type', value: (payment) => payment.type },
      { header: 'Mode', value: (payment) => payment.mode },
      { header: 'Reference', value: (payment) => payment.reference },
      { header: 'Amount', value: (payment) => (payment.amountPaise / 100).toFixed(2) },
      { header: 'Order ID', value: (payment) => payment.orderId },
      { header: 'Booking ID', value: (payment) => payment.bookingId },
    ])
  }

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing reports." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Overview"
        title="Reports"
        description={`Operational and sales reporting for ${selectedOutlet?.name ?? 'this outlet'}. ${formatDate(effectiveFrom)} – ${formatDate(effectiveTo)}.`}
        help="reports"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportOrders} leftIcon={<Download className="h-3.5 w-3.5" />}>Orders CSV</Button>
            <Button variant="outline" size="sm" onClick={exportBookings} leftIcon={<Download className="h-3.5 w-3.5" />}>Bookings CSV</Button>
            <Button variant="outline" size="sm" onClick={exportPayments} leftIcon={<Download className="h-3.5 w-3.5" />}>Payments CSV</Button>
          </>
        }
      />

      <section className="surface-card p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: '7d', label: 'Last 7 days' },
              { key: '30d', label: 'Last 30 days' },
              { key: '90d', label: 'Last 90 days' },
              { key: 'month', label: 'This month' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${range === item.key ? 'bg-brand-600 text-white' : 'bg-ivory-100 text-ink-600 hover:bg-ivory-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-ink-600">From
                <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="field-input ml-1.5 h-9 w-40" />
              </label>
              <label className="text-xs font-medium text-ink-600">To
                <input type="date" value={to} min={from} max={todayInput()} onChange={(event) => setTo(event.target.value)} className="field-input ml-1.5 h-9 w-40" />
              </label>
            </div>
          )}
          <div className="lg:ml-auto">
            <Badge tone={metrics.change > 0 ? 'success' : metrics.change < 0 ? 'danger' : 'neutral'}>
              {metrics.change > 0 ? <ArrowUpRight className="h-3 w-3" /> : metrics.change < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
              {metrics.change > 0 ? '+' : ''}{metrics.change.toFixed(0)}% vs previous period
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Sales value', value: formatINR(metrics.sales), hint: `${metrics.orderCount} orders & bookings`, icon: <IndianRupee className="h-4 w-4" />, tone: 'brand' as const },
          { label: 'Average order', value: formatINR(metrics.average), hint: 'per active order or booking', icon: <TrendingUp className="h-4 w-4" />, tone: 'sage' as const },
          { label: 'Net received', value: formatINR(metrics.received), hint: `${formatINR(metrics.refunds, { compact: true })} refunded`, icon: <WalletCards className="h-4 w-4" />, tone: 'default' as const },
          { label: 'Tax estimate', value: formatINR(metrics.tax), hint: 'not a GST return', icon: <ReceiptText className="h-4 w-4" />, tone: 'gold' as const },
        ].map((item) => (
          <div key={item.label} className="surface-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">{item.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.tone === 'brand' ? 'bg-brand-50 text-brand-700' : item.tone === 'sage' ? 'bg-sage-50 text-sage-700' : item.tone === 'gold' ? 'bg-gold-50 text-gold-700' : 'bg-ivory-100 text-ink-600'}`}>{item.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink-950">{item.value}</p>
            <p className="mt-1 text-xs text-ink-500">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Daily sales</h2>
              <p className="text-xs text-ink-500">Active orders and bookings by creation date, net of cancellations.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-ink-300" />
          </div>
          {orders.loading ? (
            <Skeleton className="mt-4 h-[260px] w-full" />
          ) : metrics.days.every((day) => day.sales === 0) ? (
            <EmptyState compact title="No sales in this period" description="Orders in the selected date range will appear here." />
          ) : (
            <div className="mt-3 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.days} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efebe5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#857463' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#a2917f' }} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${Number(value ?? 0) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : value}`} />
                  <ChartTooltip formatter={(value) => [`₹${Number(value ?? 0).toLocaleString('en-IN')}`, 'Sales']} contentStyle={{ borderRadius: 12, border: '1px solid #ddd6cc', fontSize: 12 }} />
                  <Bar dataKey="sales" fill="#C8102E" radius={[5, 5, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="surface-card p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">Department mix</h2>
          <p className="text-xs text-ink-500">Share of sales value in this period, including party bookings.</p>
          {metrics.departmentData.length === 0 ? (
            <EmptyState compact title="No department sales" description="Sales by department appear once orders exist." />
          ) : (
            <>
              <div className="mx-auto mt-2 h-[185px] max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.departmentData.map((item) => ({ ...item, value: Math.round(item.value / 100) }))} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                      {metrics.departmentData.map((entry) => <Cell key={entry.id} fill={entry.color} />)}
                    </Pie>
                    <ChartTooltip formatter={(value) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`} contentStyle={{ borderRadius: 12, border: '1px solid #ddd6cc', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-1 space-y-1.5">
                {metrics.departmentData.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-600">{entry.name}</span>
                    <span className="font-semibold tabular-nums">{formatINR(entry.value, { compact: true })}</span>
                    <span className="text-ink-400">{entry.orders} ord.</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <div><h2 className="font-display text-lg font-semibold">Top products</h2><p className="text-xs text-ink-500">By line revenue, before order-level discount.</p></div>
            <Badge tone="neutral">Top 10</Badge>
          </div>
          {metrics.topProducts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">No product sales in this period.</p>
          ) : (
            <div className="table-shell">
              <table className="table-base">
                <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr></thead>
                <tbody>
                  {metrics.topProducts.map((product) => (
                    <tr key={product.name}><td className="font-medium">{product.name}</td><td className="text-right text-xs">{product.quantity.toLocaleString('en-IN')} {product.unit}</td><td className="text-right text-sm font-semibold tabular-nums">{formatINR(product.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="surface-card overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <h2 className="font-display text-lg font-semibold">Payment modes</h2>
            <p className="text-xs text-ink-500">Gross payments received, excluding refunds.</p>
          </div>
          {metrics.paymentModes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">No payments in this period.</p>
          ) : (
            <div className="table-shell">
              <table className="table-base">
                <thead><tr><th>Mode</th><th className="text-right">Records</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {metrics.paymentModes.map((item) => (
                    <tr key={item.mode}><td className="font-medium capitalize">{item.mode.replace('_', ' ')}</td><td className="text-right text-xs">{item.count}</td><td className="text-right text-sm font-semibold tabular-nums">{formatINR(item.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">Order status</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.statusCounts.map((item) => (
              <div key={item.status} className="rounded-lg bg-ivory-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{item.label}</p>
                <p className="text-lg font-semibold tabular-nums">{item.count}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="surface-card p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">Period totals</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Subtotal before discounts</dt><dd className="tabular-nums">{formatINR(metrics.sales + metrics.discounts)}</dd></div>
            <div className="flex justify-between text-sage-700"><dt>Discounts</dt><dd className="tabular-nums">− {formatINR(metrics.discounts)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Tax estimate</dt><dd className="tabular-nums">{formatINR(metrics.tax)}</dd></div>
            <div className="flex justify-between border-t border-ink-200 pt-2 font-bold"><dt>Sales value</dt><dd className="tabular-nums">{formatINR(metrics.sales)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Cash received</dt><dd className="tabular-nums">{formatINR(metrics.cash)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Digital received</dt><dd className="tabular-nums">{formatINR(metrics.digital)}</dd></div>
            <div className="flex justify-between text-brand-700"><dt>Refunds</dt><dd className="tabular-nums">− {formatINR(metrics.refunds)}</dd></div>
          </dl>
          <p className="mt-3 text-[10px] leading-relaxed text-ink-400">Tax is an operational estimate from product tax settings. It is not a filed GST return. Reports cover this outlet only and respect your department scope.</p>
        </section>
      </div>

      {(orders.rows.length >= 2000 || bookings.rows.length >= 1000 || payments.rows.length >= 2000) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-900">
          <span className="mt-0.5" aria-hidden>!</span>
          This period hit a report limit (2,000 orders/payments or 1,000 bookings). The totals and CSV exports include only the loaded records; narrow the date range for a complete result.
        </p>
      )}

      <OperationsReports
        from={startIso}
        to={endIso}
        orders={orders.rows}
        bookings={bookings.rows}
        payments={payments.rows}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400"><Download className="h-3 w-3" /> CSV exports respect the selected date range and your permission scope. Data is not written to the BUSY accounting system.</p>
    </div>
  )
}
