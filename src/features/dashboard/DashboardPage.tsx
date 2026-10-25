import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday, parseISO, subDays } from 'date-fns'
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
import {
  AlertTriangle,
  ArrowRight,
  CalendarHeart,
  ClipboardList,
  IndianRupee,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { useAuth } from '@/auth/AuthProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { useProductCatalogue } from '@/data/productCatalogue'
import {
  bookingsQuery,
  customersQuery,
  ordersQuery,
  paymentsQuery,
  usersQuery,
} from '@/data/queries'
import type { Booking, Customer, Order, OrderStatus, Payment, UserProfile } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { GettingStarted } from './GettingStarted'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { formatDate, formatINR, formatRelative, formatTime, todayInput } from '@/lib/format'
import { ORDER_STATUS_LABELS } from '@/lib/calculations'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, business, outlets, departments, loading: workspaceLoading } = useWorkspace()
  const outletId = selectedOutletId ?? ''

  const orders = useCollectionData<Order>(
    () => (profile && outletId ? ordersQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const bookings = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsQuery(outletId, profile, 300) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsQuery(outletId, profile, 300) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const products = useProductCatalogue(profile, outletId)
  const customers = useCollectionData<Customer>(
    () => (profile && outletId && hasPermission(profile, 'customersView') ? customersQuery(outletId, 1) : null),
    [outletId, profile?.uid, profile?.role],
    Boolean(profile && outletId && hasPermission(profile, 'customersView')),
  )
  const staff = useCollectionData<UserProfile>(
    () => (profile && hasPermission(profile, 'usersManage') ? usersQuery(3) : null),
    [profile?.uid, profile?.role],
    Boolean(profile && hasPermission(profile, 'usersManage')),
  )

  const metrics = useMemo(() => {
    const activeOrders = orders.rows.filter((order) => order.status !== 'cancelled')
    const activeBookings = bookings.rows.filter((booking) => booking.status !== 'cancelled')
    const todaysOrders = activeOrders.filter((order) => isToday(parseISO(order.createdAt)))
    const todaysBookings = activeBookings.filter((booking) => isToday(parseISO(booking.createdAt)))
    const monthStart = format(new Date(), 'yyyy-MM')
    const monthlyOrders = activeOrders.filter((order) => order.createdAt.startsWith(monthStart))
    const monthlyBookings = activeBookings.filter((booking) => booking.createdAt.startsWith(monthStart))
    const todaySales = todaysOrders.reduce((sum, order) => sum + order.totalPaise, 0)
      + todaysBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)
    const monthSales = monthlyOrders.reduce((sum, order) => sum + order.totalPaise, 0)
      + monthlyBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)
    const openOrders = activeOrders.filter((order) =>
      ['confirmed', 'preparing', 'ready'].includes(order.status),
    )
    const todaysPayments = payments.rows
      .filter((payment) => isToday(parseISO(payment.receivedAt)))
      .reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise), 0)
    const outstanding = [...activeOrders, ...activeBookings]
      .reduce((sum, doc) => sum + Math.max(0, doc.balancePaise), 0)
    const upcoming = bookings.rows
      .filter((booking) => !['completed', 'cancelled'].includes(booking.status))
      .filter((booking) => booking.eventDate >= todayInput())
      .slice(0, 5)

    const week = Array.from({ length: 7 }).map((_, index) => {
      const day = subDays(new Date(), 6 - index)
      const key = format(day, 'yyyy-MM-dd')
      const dayOrders = activeOrders.filter((order) => order.createdAt.slice(0, 10) === key)
      const dayBookings = activeBookings.filter((booking) => booking.createdAt.slice(0, 10) === key)
      return {
        day: format(day, 'EEE'),
        date: format(day, 'dd MMM'),
        sales: Math.round(
          (dayOrders.reduce((sum, order) => sum + order.totalPaise, 0)
            + dayBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)) / 100,
        ),
        orders: dayOrders.length + dayBookings.length,
      }
    })

    const deptShare = new Map<string, number>()
    for (const order of monthlyOrders) {
      deptShare.set(order.departmentId, (deptShare.get(order.departmentId) ?? 0) + order.totalPaise)
    }
    for (const booking of monthlyBookings) {
      const lineBase = booking.lines.reduce((sum, line) => {
        const base = line.quantity * line.unitPricePaise
        return sum + base - Math.round(base * line.discountPercent / 100)
      }, 0)
      for (const line of booking.lines) {
        const share = lineBase > 0
          ? Math.round(booking.totalPaise * ((line.quantity * line.unitPricePaise * (1 - line.discountPercent / 100)) / lineBase))
          : Math.round(booking.totalPaise / Math.max(1, booking.departmentIds.length))
        deptShare.set(line.departmentId, (deptShare.get(line.departmentId) ?? 0) + share)
      }
    }
    const departmentData = Array.from(deptShare.entries())
      .map(([departmentId, value]) => ({
        name: departments.find((department) => department.id === departmentId)?.name ?? 'Department',
        value: Math.round(value / 100),
        color: departments.find((department) => department.id === departmentId)?.color ?? '#C8102E',
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)

    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>()
    for (const order of activeOrders) {
      for (const line of order.lines) {
        const existing = productMap.get(line.productId) ?? { name: line.name, quantity: 0, revenue: 0 }
        existing.quantity += line.quantity
        existing.revenue += Math.round(line.quantity * line.unitPricePaise)
        productMap.set(line.productId, existing)
      }
    }
    for (const booking of activeBookings) {
      const lineBase = booking.lines.reduce((sum, line) => {
        const base = line.quantity * line.unitPricePaise
        return sum + base - Math.round(base * line.discountPercent / 100)
      }, 0)
      for (const line of booking.lines) {
        const existing = productMap.get(line.productId) ?? { name: line.name, quantity: 0, revenue: 0 }
        existing.quantity += line.quantity
        existing.revenue += lineBase > 0
          ? Math.round(booking.totalPaise * ((line.quantity * line.unitPricePaise * (1 - line.discountPercent / 100)) / lineBase))
          : 0
        productMap.set(line.productId, existing)
      }
    }
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    const lowStock = products.rows
      .filter((product) => product.trackStock && typeof product.stockQty === 'number' && typeof product.criticalStock === 'number')
      .filter((product) => (product.stockQty ?? 0) <= (product.criticalStock ?? 0))
      .sort((a, b) => (a.stockQty ?? 0) - (b.stockQty ?? 0))
      .slice(0, 6)

    const queue = [...openOrders]
      .sort((a, b) => {
        const order = ['ready', 'preparing', 'confirmed']
        return order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt)
      })
      .slice(0, 6)
    const oldestOpen = [...openOrders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]

    return {
      todaySales,
      monthSales,
      ordersToday: todaysOrders.length + todaysBookings.length,
      openOrders,
      oldestOpen,
      todaysPayments,
      outstanding,
      upcoming,
      week,
      departmentData,
      topProducts,
      lowStock,
      queue,
      monthOrders: monthlyOrders.length + monthlyBookings.length,
    }
  }, [orders.rows, bookings.rows, payments.rows, products.rows, departments])

  const loading =
    workspaceLoading ||
    orders.loading ||
    bookings.loading ||
    payments.loading ||
    products.loading ||
    customers.loading ||
    staff.loading
  const error = orders.error || bookings.error || payments.error || products.error
  const retry = () => {
    orders.reload()
    bookings.reload()
    payments.reload()
    products.reload()
    customers.reload()
    staff.reload()
  }

  if (!selectedOutletId) {
    return (
      <EmptyState title="No outlet assigned" description="A Super Admin must assign your staff profile to at least one outlet." />
    )
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={business?.name ?? 'Vishal Prem'}
        title={`${greeting}, ${profile?.displayName.split(' ')[0] ?? 'there'}`}
        description={`${selectedOutlet?.name ?? 'Outlet'} · operational snapshot for ${formatDate(new Date())}.`}
        actions={
          <>
            {hasPermission(profile, 'bookingsManage') && (
              <Button variant="outline" asChild leftIcon={<CalendarHeart className="h-4 w-4" />}>
                <Link to="/admin/bookings/new">New booking</Link>
              </Button>
            )}
            {hasPermission(profile, 'ordersManage') && (
              <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
                <Link to="/admin/orders/new">New order</Link>
              </Button>
            )}
          </>
        }
      />

      {profile?.role === 'super_admin' && (
        <GettingStarted
          business={business}
          outlets={outlets}
          departments={departments}
          productCount={products.rows.length}
          customerCount={customers.rows.length}
          orderCount={orders.rows.length}
          bookingCount={bookings.rows.length}
          paymentCount={payments.rows.length}
          staffCount={staff.rows.filter((user) => user.uid !== profile.uid).length}
          canManageStaff={hasPermission(profile, 'usersManage')}
          loading={loading}
        />
      )}

      {error && <div className="surface-card"><ErrorState message={error} onRetry={retry} help="troubleshooting" /></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sales booked today"
          value={formatINR(metrics.todaySales, { compact: true })}
          hint={`${metrics.ordersToday} order${metrics.ordersToday === 1 ? '' : 's'} or booking${metrics.ordersToday === 1 ? '' : 's'} today`}
          icon={<IndianRupee className="h-4 w-4" />}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label="This month"
          value={formatINR(metrics.monthSales, { compact: true })}
          hint={`${metrics.monthOrders} order${metrics.monthOrders === 1 ? '' : 's'} or booking${metrics.monthOrders === 1 ? '' : 's'} this month`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="gold"
          loading={loading}
        />
        <StatCard
          label="Open orders"
          value={metrics.openOrders.length}
          hint={metrics.oldestOpen ? `Oldest: ${metrics.oldestOpen.orderNumber}` : 'Queue is clear'}
          icon={<ClipboardList className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="Outstanding"
          value={formatINR(metrics.outstanding, { compact: true })}
          hint="Loaded order and booking balances"
          icon={<WalletCards className="h-4 w-4" />}
          tone="sage"
          loading={loading}
        />
      </div>
      <p className="text-xs text-ink-500">
        Stat cards use the latest loaded records for this outlet. Open Reports for date-bounded totals and exports.
      </p>

      {products.rows.length === 0 && !products.loading && (
        <div className="surface-card border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Build the catalogue first</h2>
                <p className="mt-0.5 text-sm text-ink-600">Orders need products. Add the real menu with prices, units and department assignment.</p>
              </div>
            </div>
            {hasPermission(profile, 'productsManage') && (
              <Button asChild size="sm" className="shrink-0">
                <Link to="/admin/products/new">Add first product</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Last seven days</h2>
              <p className="text-xs text-ink-500">Order and booking value recorded per day (₹), cancellations excluded.</p>
            </div>
            <Badge tone="brand">Live</Badge>
          </div>
          {loading ? (
            <Skeleton className="h-[230px] w-full" />
          ) : metrics.week.every((day) => day.sales === 0) ? (
            <EmptyState compact icon={<ShoppingBag className="h-5 w-5" />} title="No sales in this period" description="Create an order or booking to see it here." />
          ) : (
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.week} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efebe5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#857463' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#a2917f' }} axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
                  <ChartTooltip
                    formatter={(value) => [`₹${Number(value ?? 0).toLocaleString('en-IN')}`, 'Sales']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                    contentStyle={{ borderRadius: 12, border: '1px solid #ddd6cc', fontSize: 12, boxShadow: '0 8px 24px -16px rgba(46,39,33,.3)' }}
                  />
                  <Bar dataKey="sales" fill="#C8102E" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="surface-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Upcoming bookings</h2>
              <p className="text-xs text-ink-500">Next five events for this outlet.</p>
            </div>
            {hasPermission(profile, 'bookingsView') && (
              <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                <Link to="/admin/bookings">All</Link>
              </Button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>
          ) : metrics.upcoming.length === 0 ? (
            <EmptyState compact icon={<CalendarHeart className="h-5 w-5" />} title="No upcoming bookings" description="Party and catering bookings will appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {metrics.upcoming.map((booking) => (
                <li key={booking.id}>
                  <Link to={`/admin/bookings/${booking.id}`} className="group flex items-center gap-3 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-ivory-100 text-ink-700">
                      <span className="text-[9px] font-bold uppercase leading-none">{format(parseISO(booking.eventDate), 'MMM')}</span>
                      <span className="text-sm font-bold leading-tight">{format(parseISO(booking.eventDate), 'dd')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold group-hover:text-brand-700">{booking.customerName}</p>
                      <p className="truncate text-[11px] text-ink-500 capitalize">{booking.eventType} · {booking.eventTime}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold">{formatINR(booking.totalPaise, { compact: true })}</p>
                      <StatusBadge status={booking.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Today&apos;s queue</h2>
              <p className="text-xs text-ink-500">Preparation status is separate from payment status.</p>
            </div>
            {hasPermission(profile, 'ordersView') && (
              <Button asChild size="sm" variant="outline" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                <Link to="/admin/orders">Open orders</Link>
              </Button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div>
          ) : metrics.queue.length === 0 ? (
            <EmptyState compact icon={<ReceiptText className="h-5 w-5" />} title="Queue is clear" description="Confirmed, preparing and ready orders will be listed here." />
          ) : (
            <div className="divide-y divide-ink-100">
              {metrics.queue.map((order) => (
                <Link key={order.id} to={`/admin/orders/${order.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold group-hover:text-brand-700">{order.orderNumber}</p>
                    <p className="truncate text-[11px] text-ink-500">{order.customerName} · {order.lines.length} item{order.lines.length === 1 ? '' : 's'} · {formatRelative(order.createdAt)}</p>
                  </div>
                  <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status as OrderStatus]} />
                  <StatusBadge status={order.paymentStatus} />
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(order.totalPaise)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Low stock</h2>
            <p className="text-xs text-ink-500">Tracked items at or below their critical level.</p>
            {loading ? (
              <div className="mt-3 space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div>
            ) : metrics.lowStock.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-sage-50 px-3 py-2.5 text-xs text-sage-800">
                <ShoppingBag className="h-4 w-4" /> No low-stock items flagged.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {metrics.lowStock.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-2 rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink-800">{product.name}</p>
                      <p className="text-[10px] text-ink-500">
                        {product.stockQty ?? 0} {product.unit} left · critical {product.criticalStock ?? 0}
                      </p>
                    </div>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold-700" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Collected today</h2>
            <p className="text-xs text-ink-500">Cash and UPI receipts, net of refunds.</p>
            <p className="mt-3 font-display text-2xl font-semibold">{formatINR(metrics.todaysPayments)}</p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sage-500" /> Cash</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold-500" /> UPI</span>
              <span className="ml-auto">{payments.rows.filter((payment) => isToday(parseISO(payment.receivedAt))).length} receipts</span>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card p-4 sm:p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Department mix</h2>
          <p className="text-xs text-ink-500">Booked value this month. Scoped to your permitted departments.</p>
          {metrics.departmentData.length === 0 ? (
            <EmptyState compact title="No department sales yet" />
          ) : (
            <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
              <div className="h-[180px] w-full max-w-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.departmentData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                      {metrics.departmentData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <ChartTooltip formatter={(value) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #ddd6cc' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2">
                {metrics.departmentData.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                    <span className="flex-1 truncate text-ink-600">{entry.name}</span>
                    <span className="font-semibold tabular-nums">₹{entry.value.toLocaleString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="surface-card p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">Top products</h2>
          <p className="text-xs text-ink-500">By booked line value across orders and party bookings.</p>
          {metrics.topProducts.length === 0 ? (
            <EmptyState compact title="No product sales yet" />
          ) : (
            <ol className="mt-3 space-y-3">
              {metrics.topProducts.map((product, index) => (
                <li key={product.name} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ivory-100 text-[11px] font-bold text-ink-500">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{product.name}</p>
                    <p className="text-[10px] text-ink-500">{product.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} units</p>
                  </div>
                  <span className={cn('text-xs font-semibold tabular-nums', index === 0 && 'text-brand-700')}>{formatINR(product.revenue, { compact: true })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="pb-2 text-center text-[10px] text-ink-400">
        Dashboard reflects Firestore data for {selectedOutlet?.name}. Averages, GST filings and BUSY synchronisation are not implied.
        {payments.rows.length > 0 && ` Last payment: ${formatTime(payments.rows[0].receivedAt)}.`}
      </p>
    </div>
  )
}
