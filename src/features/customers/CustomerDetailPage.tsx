import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarHeart,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData, useDocumentData } from '@/data/hooks'
import { bookingsQuery, ordersQuery, paymentsQuery } from '@/data/queries'
import type { Booking, Customer, Order, Payment } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatDate, formatDateTime, formatINR, titleCase } from '@/lib/format'
import { BOOKING_STATUS_LABELS, ORDER_STATUS_LABELS } from '@/lib/calculations'
import { customerBalanceLabel } from '@/data/customers'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const { outlets, departments } = useWorkspace()
  const customerState = useDocumentData<Customer>(`customers/${id}`, [id], Boolean(id))
  const customer = customerState.data
  const outletId = customer?.outletIds[0] ?? ''

  const orders = useCollectionData<Order>(
    () => (profile && outletId ? ordersQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const bookings = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const customerOrders = useMemo(
    () => orders.rows.filter((order) => order.customerId === customer?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders.rows, customer?.id],
  )
  const customerBookings = useMemo(
    () => bookings.rows.filter((booking) => booking.customerId === customer?.id).sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    [bookings.rows, customer?.id],
  )
  const customerPayments = useMemo(
    () => payments.rows.filter((payment) => payment.customerId === customer?.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [payments.rows, customer?.id],
  )

  const summary = useMemo(() => {
    const activeOrders = customerOrders.filter((order) => order.status !== 'cancelled')
    const activeBookings = customerBookings.filter((booking) => booking.status !== 'cancelled')
    return {
      orderValue: activeOrders.reduce((sum, order) => sum + order.totalPaise, 0),
      bookingValue: activeBookings.reduce((sum, booking) => sum + booking.totalPaise, 0),
      outstanding: [...activeOrders, ...activeBookings].reduce((sum, doc) => sum + Math.max(0, doc.balancePaise), 0),
      received: customerPayments.reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise), 0),
    }
  }, [customerOrders, customerBookings, customerPayments])

  if (customerState.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      </div>
    )
  }
  if (customerState.error || !customer) {
    return <ErrorState title="Customer not available" message={customerState.error ?? 'This account does not exist or you do not have access to it.'} onRetry={customerState.reload} />
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to="/admin/customers">Back to customers</Link>
      </Button>

      <PageHeader
        eyebrow={`${titleCase(customer.accountGroup)} · ${customer.type === 'business' ? 'Business account' : 'Individual'}`}
        title={customer.name}
        description={`${customer.phone || 'No phone'}${customer.email ? ` · ${customer.email}` : ''} · Added ${formatDate(customer.createdAt)}`}
        actions={
          <>
            {hasPermission(profile, 'customersManage') && (
              <Button asChild variant="outline" size="sm" leftIcon={<Edit3 className="h-3.5 w-3.5" />}>
                <Link to={`/admin/customers/${customer.id}/edit`}>Edit account</Link>
              </Button>
            )}
            {hasPermission(profile, 'bookingsManage') && customer.active && (
              <Button asChild size="sm" leftIcon={<CalendarHeart className="h-3.5 w-3.5" />}>
                <Link to={`/admin/bookings/new?customerId=${customer.id}`}>New booking</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge>
        <Badge tone="neutral">{titleCase(customer.accountGroup)}</Badge>
        {customer.gstin && <Badge tone="info">GSTIN {customer.gstin}</Badge>}
        {customer.pan && <Badge tone="neutral">PAN {customer.pan}</Badge>}
        {customer.active === false && <Badge tone="warning">Inactive</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Order value', value: formatINR(summary.orderValue, { compact: true }) },
          { label: 'Booking value', value: formatINR(summary.bookingValue, { compact: true }) },
          { label: 'Received (net)', value: formatINR(summary.received, { compact: true }) },
          { label: 'Outstanding', value: formatINR(summary.outstanding, { compact: true }) },
        ].map((item) => (
          <div key={item.label} className="surface-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">{item.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${item.label === 'Outstanding' && summary.outstanding > 0 ? 'text-brand-700' : 'text-ink-900'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><UserRound className="h-4 w-4 text-brand-600" /> Contact</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /><div><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Phone</dt><dd>{customer.phone || '—'}{customer.altPhone ? ` / ${customer.altPhone}` : ''}</dd></div></div>
              <div className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /><div><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Email</dt><dd className="break-all">{customer.email || '—'}</dd></div></div>
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /><div><dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">State / PIN</dt><dd>{[customer.state, customer.pin].filter(Boolean).join(' · ') || '—'}</dd></div></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {customer.outletIds.map((id) => {
                const outlet = outlets.find((item) => item.id === id)
                return outlet ? <Badge key={id} tone="neutral">{outlet.name}</Badge> : null
              })}
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Addresses</h2>
            {customer.addresses.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">No address on file.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {customer.addresses.map((address) => (
                  <li key={address.id} className="rounded-xl border border-ink-200 p-3 text-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700">{address.label}</p>
                    <p className="mt-1 text-ink-700">{[address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Opening balance</h2>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${customer.openingBalancePaise < 0 ? 'text-brand-700' : 'text-ink-900'}`}>{formatINR(customer.openingBalancePaise)}</p>
            <p className="text-xs text-ink-500">{customerBalanceLabel(customer.openingBalancePaise)}</p>
            {customer.creditLimitPaise !== undefined && <p className="mt-2 text-xs text-ink-500">Credit limit: {formatINR(customer.creditLimitPaise)}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">The opening balance is informational and is not auto-settled by new payments or orders.</p>
          </section>

          {customer.notes && (
            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold">Internal notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{customer.notes}</p>
            </section>
          )}

          <section className="surface-card p-4">
            <p className="flex gap-2 text-[11px] leading-relaxed text-ink-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Only business-relevant data is stored. Do not add Aadhaar, payment credentials or personal documents to this record.</p>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Recent orders</h2>
                <p className="text-xs text-ink-500">Counter and phone orders linked to this account.</p>
              </div>
              {hasPermission(profile, 'ordersManage') && (
                <Button asChild size="sm" variant="outline" leftIcon={<ReceiptText className="h-3.5 w-3.5" />}><Link to="/admin/orders/new">New order</Link></Button>
              )}
            </div>
            {orders.loading ? (
              <div className="p-4"><Skeleton className="h-20 w-full" /></div>
            ) : customerOrders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No orders for this account yet.</p>
            ) : (
              <div className="table-shell">
                <table className="table-base">
                  <thead><tr><th>Order</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Balance</th><th /></tr></thead>
                  <tbody>
                    {customerOrders.slice(0, 12).map((order) => (
                      <tr key={order.id}>
                        <td className="font-medium">{order.orderNumber}<p className="text-[10px] text-ink-500">{departments.find((item) => item.id === order.departmentId)?.name}</p></td>
                        <td className="text-xs">{formatDateTime(order.createdAt)}</td>
                        <td><StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} /></td>
                        <td className="text-right text-sm font-semibold tabular-nums">{formatINR(order.totalPaise)}</td>
                        <td className="text-right text-xs tabular-nums">{formatINR(order.balancePaise)}</td>
                        <td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/admin/orders/${order.id}`}><ArrowRight className="h-3.5 w-3.5" /></Link></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Party bookings</h2>
                <p className="text-xs text-ink-500">Upcoming and past events for this account.</p>
              </div>
              {hasPermission(profile, 'bookingsManage') && customer.active && (
                <Button asChild size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />}><Link to={`/admin/bookings/new?customerId=${customer.id}`}>New booking</Link></Button>
              )}
            </div>
            {bookings.loading ? (
              <div className="p-4"><Skeleton className="h-20 w-full" /></div>
            ) : customerBookings.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No bookings for this account yet.</p>
            ) : (
              <div className="table-shell">
                <table className="table-base">
                  <thead><tr><th>Booking</th><th>Event</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Balance</th><th /></tr></thead>
                  <tbody>
                    {customerBookings.slice(0, 12).map((booking) => (
                      <tr key={booking.id}>
                        <td className="font-medium">{booking.bookingNumber}<p className="text-[10px] capitalize text-ink-500">{booking.eventType}</p></td>
                        <td className="text-xs">{formatDate(booking.eventDate)}<p className="text-[10px] text-ink-500">{booking.eventTime}</p></td>
                        <td><StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status]} /></td>
                        <td className="text-right text-sm font-semibold tabular-nums">{formatINR(booking.totalPaise)}</td>
                        <td className="text-right text-xs tabular-nums">{formatINR(booking.balancePaise)}</td>
                        <td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/admin/bookings/${booking.id}`}><ArrowRight className="h-3.5 w-3.5" /></Link></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <h2 className="font-display text-lg font-semibold">Payment history</h2>
              <p className="text-xs text-ink-500">Receipts and refunds linked to this account.</p>
            </div>
            {payments.loading ? (
              <div className="p-4"><Skeleton className="h-16 w-full" /></div>
            ) : customerPayments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500">No payments recorded for this account.</p>
            ) : (
              <div className="table-shell">
                <table className="table-base">
                  <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="text-right">Amount</th><th /></tr></thead>
                  <tbody>
                    {customerPayments.slice(0, 12).map((payment) => (
                      <tr key={payment.id}>
                        <td className="font-medium">{payment.receiptNumber}<p className="text-[10px] text-ink-500">{payment.type === 'refund' ? 'Refund' : 'Payment'}</p></td>
                        <td className="text-xs">{formatDateTime(payment.receivedAt)}</td>
                        <td className="text-xs capitalize">{payment.mode.replace('_', ' ')}</td>
                        <td className={`text-right text-sm font-semibold tabular-nums ${payment.type === 'refund' ? 'text-brand-700' : 'text-sage-700'}`}>{payment.type === 'refund' ? '−' : ''}{formatINR(payment.amountPaise)}</td>
                        <td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/admin/print/payment/${payment.id}`} target="_blank">Receipt</Link></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
