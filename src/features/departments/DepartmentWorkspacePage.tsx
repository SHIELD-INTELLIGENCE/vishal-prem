import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarHeart,
  ChefHat,
  ClipboardList,
  Package,
  Plus,
  ReceiptText,
  Sparkles,
  TimerReset,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, scopedDepartments } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import {
  departmentBookingsQuery,
  departmentOrdersQuery,
  departmentProductsQuery,
} from '@/data/queries'
import type { Booking, Order, Product } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { formatDate, formatINR, formatRelative, todayInput } from '@/lib/format'
import { ORDER_STATUS_LABELS } from '@/lib/calculations'
import { cn } from '@/lib/utils'

const OPEN_ORDER_STATUSES: Order['status'][] = ['confirmed', 'preparing', 'ready']

export function DepartmentWorkspacePage() {
  const { departmentId } = useParams<{ departmentId: string }>()
  const { profile } = useAuth()
  const {
    selectedOutletId,
    selectedOutlet,
    business,
    departments,
    loading: workspaceLoading,
  } = useWorkspace()

  const outletId = selectedOutletId ?? ''
  const accessibleDepartments = useMemo(
    () => scopedDepartments(profile, departments, selectedOutletId ?? undefined),
    [profile, departments, selectedOutletId],
  )
  const department = accessibleDepartments.find((item) => item.id === departmentId) ?? null

  const canViewProducts = hasPermission(profile, 'productsView')
  const canViewOrders = hasPermission(profile, 'ordersView')
  const canViewBookings = hasPermission(profile, 'bookingsView')
  const canManageOrders = hasPermission(profile, 'ordersManage')
  const canManageBookings = hasPermission(profile, 'bookingsManage')
  const canManageProducts = hasPermission(profile, 'productsManage')

  const products = useCollectionData<Product>(
    () => (outletId && department && canViewProducts ? departmentProductsQuery(outletId, department.id, 300) : null),
    [outletId, department?.id, canViewProducts],
    Boolean(outletId && department && canViewProducts),
  )
  const orders = useCollectionData<Order>(
    () => (outletId && department && canViewOrders ? departmentOrdersQuery(outletId, department.id, 300) : null),
    [outletId, department?.id, canViewOrders],
    Boolean(outletId && department && canViewOrders),
  )
  const bookings = useCollectionData<Booking>(
    () => (outletId && department && canViewBookings ? departmentBookingsQuery(outletId, department.id, 200) : null),
    [outletId, department?.id, canViewBookings],
    Boolean(outletId && department && canViewBookings),
  )

  const metrics = useMemo(() => {
    const activeOrders = orders.rows.filter((order) => order.status !== 'cancelled')
    const openOrders = activeOrders
      .filter((order) => OPEN_ORDER_STATUSES.includes(order.status))
      .sort((a, b) => {
        const rank: Order['status'][] = ['ready', 'preparing', 'confirmed']
        return rank.indexOf(a.status) - rank.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt)
      })
    const ready = activeOrders.filter((order) => order.status === 'ready')
    const todayKey = todayInput()
    const todaysOrders = activeOrders.filter((order) => order.createdAt.slice(0, 10) === todayKey)
    const upcoming = bookings.rows
      .filter((booking) => !['completed', 'cancelled'].includes(booking.status))
      .filter((booking) => booking.eventDate >= todayKey)
    const outstanding = [...activeOrders, ...bookings.rows.filter((booking) => booking.status !== 'cancelled')]
      .reduce((sum, entry) => sum + Math.max(0, entry.balancePaise ?? 0), 0)
    return { openOrders, ready, todaysOrders, upcoming, outstanding }
  }, [orders.rows, bookings.rows])

  const loading = workspaceLoading || products.loading || orders.loading || bookings.loading
  const error = products.error || orders.error || bookings.error
  const retry = () => {
    products.reload()
    orders.reload()
    bookings.reload()
  }

  if (workspaceLoading && !department) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!selectedOutletId) {
    return (
      <EmptyState
        title="No outlet assigned"
        description="A Super Admin must assign your staff profile to at least one outlet before department work can be opened."
        help="troubleshooting"
      />
    )
  }

  if (!department) {
    return (
      <EmptyState
        icon={<ChefHat className="h-5 w-5" />}
        title="Department not available"
        description="This department is not assigned to you for the selected outlet, or it is inactive. Switch outlet or ask a Super Admin to review your scope."
        action={<Button asChild variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}><Link to="/admin">Back to dashboard</Link></Button>}
        help="troubleshooting"
      />
    )
  }

  const hasAnyWork = products.rows.length > 0 || orders.rows.length > 0 || bookings.rows.length > 0
  const showGettingStarted = !loading && !hasAnyWork

  return (
    <div className="space-y-5">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: department.color }} aria-hidden />

      <PageHeader
        eyebrow={`${selectedOutlet?.name ?? 'Outlet'} · ${business?.name ?? 'Vishal Prem'}`}
        title={department.name}
        description={
          <>
            Department workspace for <span className="font-semibold text-ink-700">{department.name}</span>
            {department.description ? ` · ${department.description}` : ''} · Code {department.code}
          </>
        }
        help="departments"
        actions={
          <>
            {canManageOrders && (
              <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
                <Link to={`/admin/orders/new?department=${encodeURIComponent(department.id)}`}>New order</Link>
              </Button>
            )}
            {canManageBookings && (
              <Button asChild variant="outline" leftIcon={<CalendarHeart className="h-4 w-4" />}>
                <Link to="/admin/bookings/new">New booking</Link>
              </Button>
            )}
          </>
        }
      />

      {accessibleDepartments.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Switch department">
          {accessibleDepartments.map((item) => {
            const active = item.id === department.id
            return (
              <Link
                key={item.id}
                to={`/admin/departments/${item.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'border-brand-300 bg-brand-50 text-brand-800'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900',
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                {item.name}
              </Link>
            )
          })}
        </div>
      )}

      {error && <div className="surface-card"><ErrorState message={error} onRetry={retry} help="troubleshooting" /></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open orders"
          value={metrics.openOrders.length}
          hint={`${metrics.todaysOrders.length} placed today`}
          icon={<ClipboardList className="h-4 w-4" />}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label="Ready to hand over"
          value={metrics.ready.length}
          hint={metrics.ready.length ? 'Waiting at the counter' : 'Nothing pending'}
          icon={<TimerReset className="h-4 w-4" />}
          tone="gold"
          loading={loading}
        />
        <StatCard
          label="Department products"
          value={products.rows.length}
          hint={`${products.rows.filter((product) => product.active && product.available).length} available`}
          icon={<Package className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="Upcoming parties"
          value={metrics.upcoming.length}
          hint="Bookings for this department"
          icon={<CalendarHeart className="h-4 w-4" />}
          tone="sage"
          loading={loading}
        />
      </div>

      {showGettingStarted && (
        <section className="surface-card border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Start {department.name} work</h2>
              <p className="mt-0.5 text-sm text-ink-600">
                Nothing has been recorded for this department in {selectedOutlet?.name ?? 'this outlet'} yet. The steps below use real records only — no sample data is created.
              </p>
            </div>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            <li className="rounded-xl border border-ink-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">1 · Catalogue</p>
              <p className="mt-1 text-sm text-ink-700">Add products assigned to {department.name}.</p>
              {canManageProducts && (
                <Button asChild size="sm" variant="ghost" className="mt-2 px-0" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  <Link to="/admin/products/new">Add a product</Link>
                </Button>
              )}
            </li>
            <li className="rounded-xl border border-ink-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">2 · First order</p>
              <p className="mt-1 text-sm text-ink-700">Take an order and select {department.name}.</p>
              {canManageOrders && (
                <Button asChild size="sm" variant="ghost" className="mt-2 px-0" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  <Link to={`/admin/orders/new?department=${encodeURIComponent(department.id)}`}>New order</Link>
                </Button>
              )}
            </li>
            <li className="rounded-xl border border-ink-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">3 · Party work</p>
              <p className="mt-1 text-sm text-ink-700">Record a booking that includes this department.</p>
              {canManageBookings && (
                <Button asChild size="sm" variant="ghost" className="mt-2 px-0" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  <Link to="/admin/bookings/new">New booking</Link>
                </Button>
              )}
            </li>
          </ol>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {canViewOrders && (
          <section className="surface-card p-4 sm:p-5 lg:col-span-2">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Order queue</h2>
                <p className="text-xs text-ink-500">Confirmed, preparing and ready orders for {department.name} only.</p>
              </div>
              {hasPermission(profile, 'ordersView') && (
                <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  <Link to="/admin/orders">All orders</Link>
                </Button>
              )}
            </div>
            {orders.loading ? (
              <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div>
            ) : metrics.openOrders.length === 0 ? (
              <EmptyState
                compact
                icon={<ReceiptText className="h-5 w-5" />}
                title={`No open ${department.name} orders`}
                description="Confirmed, preparing and ready orders for this department will appear here."
                action={canManageOrders ? (
                  <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                    <Link to={`/admin/orders/new?department=${encodeURIComponent(department.id)}`}>Take an order</Link>
                  </Button>
                ) : undefined}
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {metrics.openOrders.slice(0, 8).map((order) => (
                  <li key={order.id}>
                    <Link to={`/admin/orders/${order.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold group-hover:text-brand-700">{order.orderNumber}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {order.customerName} · {order.lines.length} item{order.lines.length === 1 ? '' : 's'} · {formatRelative(order.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                      <StatusBadge status={order.paymentStatus} />
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(order.totalPaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canViewProducts && (
          <section className={cn('surface-card p-4 sm:p-5', !canViewOrders && 'lg:col-span-3')}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Department products</h2>
                <p className="text-xs text-ink-500">Catalogue items assigned to {department.name}.</p>
              </div>
              <Badge tone="neutral">{products.rows.length}</Badge>
            </div>
            {products.loading ? (
              <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div>
            ) : products.rows.length === 0 ? (
              <EmptyState
                compact
                icon={<Package className="h-5 w-5" />}
                title="No products yet"
                description={`No catalogue item is assigned to ${department.name}. Add real products with prices before taking orders.`}
                action={canManageProducts ? (
                  <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                    <Link to="/admin/products/new">Add product</Link>
                  </Button>
                ) : undefined}
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {products.rows.slice(0, 8).map((product) => (
                  <li key={product.id}>
                    <Link to={`/admin/products/${product.id}`} className="group flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold group-hover:text-brand-700">{product.name}</p>
                        <p className="truncate text-[11px] text-ink-500">{product.group} · {product.unit}</p>
                      </div>
                      <Badge tone={product.active && product.available ? 'success' : 'neutral'}>
                        {product.active && product.available ? 'Available' : 'Paused'}
                      </Badge>
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(product.salePricePaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {canViewBookings && (
        <section className="surface-card p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Upcoming party bookings</h2>
              <p className="text-xs text-ink-500">Bookings that include {department.name}, ordered by event date.</p>
            </div>
            {metrics.upcoming.length > 0 && (
              <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                <Link to="/admin/bookings">All bookings</Link>
              </Button>
            )}
          </div>
          {bookings.loading ? (
            <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div>
          ) : metrics.upcoming.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarHeart className="h-5 w-5" />}
              title="No upcoming bookings"
              description={`Party and catering bookings that include ${department.name} will appear here.`}
              action={canManageBookings ? (
                <Button asChild size="sm" leftIcon={<CalendarHeart className="h-3.5 w-3.5" />}>
                  <Link to="/admin/bookings/new">Add booking</Link>
                </Button>
              ) : undefined}
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {metrics.upcoming.slice(0, 6).map((booking) => {
                const [dayPart, monthPart] = formatDate(booking.eventDate).split(' ')
                return (
                  <li key={booking.id}>
                    <Link to={`/admin/bookings/${booking.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-ivory-100 text-ink-700">
                        <span className="text-[9px] font-bold uppercase leading-none">{monthPart ?? ''}</span>
                        <span className="text-sm font-bold leading-tight">{dayPart ?? ''}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold group-hover:text-brand-700">{booking.customerName}</p>
                        <p className="truncate text-[11px] text-ink-500 capitalize">
                          {booking.eventType} · {formatDate(booking.eventDate)} · {booking.eventTime}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                      <span className="text-right text-sm font-semibold tabular-nums">{formatINR(booking.totalPaise, { compact: true })}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <p className="pb-2 text-center text-[10px] text-ink-400">
        {department.name} data is filtered to {selectedOutlet?.name ?? 'the selected outlet'} and this department. Outstanding for this view: {formatINR(metrics.outstanding, { compact: true })}.
      </p>
    </div>
  )
}
