import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarHeart,
  Check,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  Edit3,
  PackageCheck,
  Printer,
  ReceiptText,
  Truck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData, useDocumentData } from '@/data/hooks'
import { bookingRevisionsQuery, paymentsQuery } from '@/data/queries'
import { updateBookingFulfilment, updateBookingOperations, updateBookingStatus } from '@/data/bookings'
import type { Booking, BookingRevision, BookingStatus, Customer, Payment } from '@/types/models'
import { BOOKING_STATUS_FLOW, calculateLine } from '@/lib/calculations'
import { formatDate, formatDateTime, formatINR, formatQuantity, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SelectField, TextareaField } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { PaymentDialog } from '@/components/PaymentDialog'
import { Tabs } from '@/components/ui/Tabs'

const FORWARD_LABEL: Partial<Record<BookingStatus, string>> = {
  enquiry: 'Confirm booking',
  confirmed: 'Start production',
  in_production: 'Mark ready',
  ready: 'Complete booking',
}

/** Mirrors the trusted edit operation. A ready booking is deliberately locked. */
const EDITABLE_BOOKING_STATUSES: BookingStatus[] = ['enquiry', 'confirmed', 'in_production']

export function BookingDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const { outlets, departments } = useWorkspace()
  const bookingState = useDocumentData<Booking>(`bookings/${id}`, [id], Boolean(id))
  const booking = bookingState.data
  const outlet = outlets.find((item) => item.id === booking?.outletId) ?? null
  const customerState = useDocumentData<Customer>(
    booking?.customerId ? `customers/${booking.customerId}` : null,
    [booking?.customerId],
    Boolean(booking?.customerId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && booking ? paymentsQuery(booking.outletId, profile, 300) : null),
    [profile?.uid, booking?.outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && booking),
  )
  const bookingPayments = useMemo(
    () => payments.rows.filter((payment) => payment.bookingId === booking?.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [payments.rows, booking?.id],
  )
  const revisions = useCollectionData<BookingRevision>(
    () => (profile && booking
      ? bookingRevisionsQuery(booking.id, booking.outletId, profile, 50)
      : null),
    [profile?.uid, profile?.role, profile?.departmentIds.join(','), booking?.id, booking?.outletId],
    Boolean(profile && booking),
  )

  const [tab, setTab] = useState('overview')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [preparationStatus, setPreparationStatus] = useState<Booking['preparationStatus']>('pending')
  const [packingStatus, setPackingStatus] = useState<Booking['packingStatus']>('pending')
  const [instructions, setInstructions] = useState('')
  const [opsBusy, setOpsBusy] = useState(false)
  const [fulfillment, setFulfillment] = useState<Booking['fulfillment']>('pickup')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [fulfilBusy, setFulfilBusy] = useState(false)

  useEffect(() => {
    if (!booking) return
    setPreparationStatus(booking.preparationStatus)
    setPackingStatus(booking.packingStatus)
    setInstructions(booking.instructions ?? '')
    setFulfillment(booking.fulfillment)
    setDeliveryAddress(booking.deliveryAddress ?? '')
  }, [booking])

  if (bookingState.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }
  if (bookingState.error || !booking) {
    return <ErrorState title="Booking not available" message={bookingState.error ?? 'This booking does not exist or you do not have access to it.'} onRetry={bookingState.reload} />
  }
  if (!outlet) {
    return <ErrorState title="Outlet unavailable" message="This booking belongs to an outlet that is not assigned to you." />
  }

  const nextStatus = BOOKING_STATUS_FLOW[booking.status][0]
  const canManage = hasPermission(profile, 'bookingsManage')
  const canCancel = canManage && booking.status !== 'cancelled' && booking.status !== 'completed'
  const canPay = hasPermission(profile, 'paymentsManage') && booking.status !== 'cancelled'

  async function advance() {
    if (!nextStatus || !profile) return
    try {
      setStatusBusy(true)
      await updateBookingStatus({ booking: booking!, status: nextStatus, profile })
      toast.success(`Booking moved to ${nextStatus.replace(/_/g, ' ')}`)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setStatusBusy(false)
    }
  }

  async function cancelBooking() {
    if (!profile) return
    try {
      await updateBookingStatus({ booking: booking!, status: 'cancelled', profile, reason: cancelReason })
      toast.success('Booking cancelled')
      setCancelOpen(false)
      setCancelReason('')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    }
  }

  async function saveOperations() {
    if (!profile) return
    try {
      setOpsBusy(true)
      await updateBookingOperations({
        bookingId: booking!.id,
        preparationStatus,
        packingStatus,
        instructions,
        profile,
      })
      toast.success('Preparation and packing status updated')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setOpsBusy(false)
    }
  }

  async function saveFulfilment() {
    if (!profile) return
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) {
      toast.error('Add a delivery address, or switch to pickup.')
      return
    }
    try {
      setFulfilBusy(true)
      await updateBookingFulfilment({ bookingId: booking!.id, fulfillment, deliveryAddress })
      toast.success('Fulfilment details updated')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setFulfilBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
        <Link to="/admin/bookings">Back to bookings</Link>
      </Button>

      <PageHeader
        eyebrow={`${outlet.name} · ${titleCase(booking.eventType)}`}
        title={booking.bookingNumber}
        description={`${booking.customerName} · Event ${formatDate(booking.eventDate)} at ${booking.eventTime} · Booked ${formatDateTime(booking.bookingDate)}`}
        help="booking-edits"
        actions={
          <>
            <Button variant="outline" size="sm" asChild leftIcon={<Printer className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/booking/${booking.id}/confirmation`} target="_blank">Confirmation</Link>
            </Button>
            <Button variant="outline" size="sm" asChild leftIcon={<ReceiptText className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/booking/${booking.id}/quotation`} target="_blank">Quotation</Link>
            </Button>
            <Button variant="outline" size="sm" asChild leftIcon={<ChefHat className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/booking/${booking.id}/kitchen`} target="_blank">Ops slip</Link>
            </Button>
            {canManage && EDITABLE_BOOKING_STATUSES.includes(booking.status) && (
              <Button variant="outline" size="sm" asChild leftIcon={<Edit3 className="h-3.5 w-3.5" />}>
                <Link to={`/admin/bookings/${booking.id}/edit`}>Edit booking</Link>
              </Button>
            )}
            {canPay && (
              <Button size="sm" onClick={() => setPaymentOpen(true)} leftIcon={<CircleDollarSign className="h-3.5 w-3.5" />}>
                Record payment
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={booking.status} />
        <StatusBadge status={booking.paymentStatus} />
        <Badge tone="info">{titleCase(booking.eventType)}</Badge>
        <Badge tone={booking.fulfillment === 'delivery' ? 'warning' : 'neutral'}>{booking.fulfillment}</Badge>
        <Badge tone="neutral">Prep: {titleCase(booking.preparationStatus)}</Badge>
        <Badge tone="neutral">Packing: {titleCase(booking.packingStatus)}</Badge>
        {booking.balancePaise > 0 && <Badge tone="danger">{formatINR(booking.balancePaise)} due</Badge>}
      </div>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Booking lifecycle</h2>
            <p className="text-xs text-ink-500">Preparation, packing, payment and event status are tracked independently.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && nextStatus && (
              <Button size="sm" onClick={() => void advance()} loading={statusBusy} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                {FORWARD_LABEL[booking.status]}
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} leftIcon={<Ban className="h-3.5 w-3.5" />}>
                Cancel booking
              </Button>
            )}
          </div>
        </div>
        {booking.status === 'cancelled' ? (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <p className="font-semibold">Booking cancelled {booking.cancelledAt ? formatDateTime(booking.cancelledAt) : ''}</p>
            <p className="mt-0.5 text-xs">{booking.cancellationReason || 'No reason recorded.'}</p>
            {booking.paidPaise > 0 && <p className="mt-1 text-xs font-medium">{formatINR(booking.paidPaise)} is still recorded as paid. Use Record payment → Refund to reverse it.</p>}
          </div>
        ) : (
          <ol className="mt-5 grid gap-3 sm:grid-cols-4">
            {([
              { key: 'confirmed', label: 'Confirmed', icon: ClipboardCheck },
              { key: 'in_production', label: 'In production', icon: ChefHat },
              { key: 'ready', label: 'Ready', icon: PackageCheck },
              { key: 'completed', label: 'Completed', icon: Check },
            ] as const).map((step, index) => {
              const order = ['enquiry', 'confirmed', 'in_production', 'ready', 'completed']
              const currentIndex = order.indexOf(booking.status)
              const stepIndex = order.indexOf(step.key)
              const complete = currentIndex >= stepIndex
              return (
                <li key={step.key}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${complete ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400'}`}>
                      <step.icon className="h-4 w-4" />
                    </span>
                    <span className={`text-xs font-semibold ${complete ? 'text-ink-800' : 'text-ink-400'}`}>{step.label}</span>
                  </div>
                  <div className={`mt-2 h-1 rounded-full ${complete ? 'bg-brand-600' : 'bg-ink-100'}`} />
                  {index === 0 && <span className="sr-only">Lifecycle start</span>}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview', icon: <CalendarHeart className="h-4 w-4" /> },
          { id: 'operations', label: 'Preparation & packing', icon: <ChefHat className="h-4 w-4" /> },
          { id: 'payments', label: 'Payments', badge: bookingPayments.length > 0 ? <Badge tone="neutral">{bookingPayments.length}</Badge> : undefined },
          { id: 'history', label: 'Edit history', badge: revisions.rows.length > 0 ? <Badge tone="neutral">{revisions.rows.length}</Badge> : undefined },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="surface-card overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Booking items</h2>
                <p className="text-xs text-ink-500">{booking.lines.length} line{booking.lines.length === 1 ? '' : 's'} · prices in INR</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {booking.departmentIds.map((id) => <Badge key={id} tone="neutral">{departments.find((item) => item.id === id)?.name ?? 'Department'}</Badge>)}
              </div>
            </div>
            <div className="table-shell">
              <table className="table-base">
                <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Discount</th><th className="text-right">Line total</th></tr></thead>
                <tbody>
                  {booking.lines.map((line) => {
                    const totals = calculateLine(line, booking.pricesIncludeTax)
                    return (
                      <tr key={line.id}>
                        <td>
                          <p className="font-medium text-ink-800">{line.name}</p>
                          {line.notes && <p className="text-[11px] text-ink-500">{line.notes}</p>}
                          <p className="text-[10px] text-ink-400">{departments.find((item) => item.id === line.departmentId)?.name}</p>
                        </td>
                        <td className="text-right text-xs">{formatQuantity(line.quantity, line.unit)}</td>
                        <td className="text-right text-xs tabular-nums">{formatINR(line.unitPricePaise)}</td>
                        <td className="text-right text-xs tabular-nums">{line.discountPercent ? `${line.discountPercent}%` : '—'}</td>
                        <td className="text-right text-sm font-semibold tabular-nums">{formatINR(totals.totalPaise)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-ink-100 bg-ivory-50/60 px-4 py-4 sm:px-5">
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{formatINR(booking.subtotalPaise)}</dd></div>
                {booking.discountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Discounts</dt><dd className="tabular-nums">− {formatINR(booking.discountPaise)}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink-500">Tax estimate</dt><dd className="tabular-nums">{formatINR(booking.taxPaise)}</dd></div>
                <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(booking.totalPaise)}</dd></div>
                <div className="flex justify-between text-sage-700"><dt>Paid</dt><dd className="tabular-nums">{formatINR(booking.paidPaise)}</dd></div>
                <div className="flex justify-between font-semibold text-brand-700"><dt>Balance</dt><dd className="tabular-nums">{formatINR(booking.balancePaise)}</dd></div>
              </dl>
            </div>
          </section>

          <div className="space-y-4">
            <section className="surface-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Customer</h2>
                {hasPermission(profile, 'customersView') && (
                  <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}><Link to={`/admin/customers/${booking.customerId}`}>Account</Link></Button>
                )}
              </div>
              <div className="mt-3 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ivory-100 text-ink-500"><UserRound className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold">{booking.customerName}</p>
                  <p className="text-xs text-ink-500">{booking.customerPhone || 'No phone number'}</p>
                  {customerState.data && <p className="mt-1 text-[11px] text-ink-500">{titleCase(customerState.data.accountGroup)} · {customerState.data.email || 'No email'}</p>}
                </div>
              </div>
              <dl className="mt-4 space-y-2 border-t border-ink-100 pt-3 text-xs">
                <div className="flex justify-between"><dt className="text-ink-500">Event</dt><dd className="capitalize">{booking.eventType}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Date</dt><dd>{formatDate(booking.eventDate)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Time</dt><dd>{booking.eventTime}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Fulfilment</dt><dd className="capitalize">{booking.fulfillment}</dd></div>
              </dl>
              {booking.deliveryAddress && <p className="mt-3 rounded-lg bg-ivory-50 px-3 py-2 text-xs text-ink-600">{booking.deliveryAddress}</p>}
            </section>

            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold">Instructions</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{booking.instructions || 'No booking instructions.'}</p>
            </section>

            <section className="surface-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold">Fulfilment</h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                The collection method and the delivery address are saved on the server. If this booking already has
                a delivery that has not been dispatched, the delivery is kept in step with the new address.
              </p>
              <div className="mt-3 space-y-3">
                <SelectField
                  label="Method"
                  value={fulfillment}
                  onChange={(event) => setFulfillment(event.target.value as Booking['fulfillment'])}
                  options={[{ value: 'pickup', label: 'Pickup' }, { value: 'delivery', label: 'Delivery' }]}
                  disabled={!canManage}
                />
                {fulfillment === 'delivery' && (
                  <TextareaField label="Delivery address" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} disabled={!canManage} />
                )}
                {canManage && <Button size="sm" onClick={() => void saveFulfilment()} loading={fulfilBusy} leftIcon={<Truck className="h-3.5 w-3.5" />}>Save fulfilment</Button>}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'operations' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="surface-card p-4 sm:p-5 lg:col-span-2">
            <h2 className="font-display text-lg font-semibold">Preparation and packing</h2>
            <p className="text-xs text-ink-500">Update the kitchen and packing state without changing the booking status.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Preparation"
                value={preparationStatus}
                onChange={(event) => setPreparationStatus(event.target.value as Booking['preparationStatus'])}
                options={[{ value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }]}
                disabled={!canManage}
              />
              <SelectField
                label="Packing"
                value={packingStatus}
                onChange={(event) => setPackingStatus(event.target.value as Booking['packingStatus'])}
                options={[{ value: 'pending', label: 'Pending' }, { value: 'packed', label: 'Packed' }, { value: 'handed_over', label: 'Handed over' }]}
                disabled={!canManage}
              />
              <TextareaField
                label="Instructions for staff"
                containerClassName="sm:col-span-2"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={1000}
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <Button className="mt-4" onClick={() => void saveOperations()} loading={opsBusy}>Save operations</Button>
            )}
          </section>

          <aside className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Print trail</h2>
            <p className="text-xs text-ink-500">Print previews open in a new tab. Check the first copy on your printer.</p>
            <div className="mt-3 space-y-2">
              {[
                { label: 'Quotation', to: `/admin/print/booking/${booking.id}/quotation` },
                { label: 'Confirmation', to: `/admin/print/booking/${booking.id}/confirmation` },
                { label: 'Kitchen / packing slip', to: `/admin/print/booking/${booking.id}/kitchen` },
                { label: 'Invoice', to: `/admin/print/booking/${booking.id}/invoice` },
              ].map((item) => (
                <Button key={item.to} asChild variant="outline" size="sm" className="w-full justify-between">
                  <Link to={item.to} target="_blank">{item.label} <Printer className="h-3.5 w-3.5" /></Link>
                </Button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {tab === 'payments' && (
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Payments & refunds</h2>
              <p className="text-xs text-ink-500">Separate receipt records linked to this booking.</p>
            </div>
            {canPay && <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)} leftIcon={<ReceiptText className="h-3.5 w-3.5" />}>Add payment</Button>}
          </div>
          {payments.loading ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : bookingPayments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">No payments recorded for this booking.</p>
          ) : (
            <div className="table-shell">
              <table className="table-base">
                <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th>Type</th><th className="text-right">Amount</th><th /></tr></thead>
                <tbody>
                  {bookingPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="font-medium">{payment.receiptNumber}</td>
                      <td className="text-xs">{formatDateTime(payment.receivedAt)}</td>
                      <td className="text-xs capitalize">{payment.mode.replace('_', ' ')}</td>
                      <td><StatusBadge status={payment.type} label={payment.type === 'refund' ? 'Refund' : 'Payment'} /></td>
                      <td className={`text-right text-sm font-semibold tabular-nums ${payment.type === 'refund' ? 'text-brand-700' : 'text-sage-700'}`}>
                        {payment.type === 'refund' ? '−' : ''}{formatINR(payment.amountPaise)}
                      </td>
                      <td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/admin/print/payment/${payment.id}`} target="_blank">Receipt</Link></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {profile && (
        <PaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          target={{ kind: 'booking', booking }}
          onRecorded={() => payments.reload()}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this booking?"
        description="The cancellation is recorded with your staff ID. Payment records are retained; refund separately if money was taken."
        confirmLabel="Cancel booking"
        destructive
        onConfirm={cancelBooking}
      >
        <TextareaField label="Cancellation reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Why is this booking being cancelled?" />
        {booking.paidPaise > 0 && (
          <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            {formatINR(booking.paidPaise)} is recorded as paid. Record a refund after cancelling.
          </p>
        )}
      </ConfirmDialog>
      {tab === 'history' && (
        <section className="surface-card overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <h2 className="font-display text-lg font-semibold">Edit history</h2>
            <p className="text-xs text-ink-500">Server-recorded revisions. Paid amounts and posted payments are never rewritten.</p>
          </div>
          {revisions.loading ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : revisions.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">No priced edits have been recorded for this booking.</p>
          ) : (
            <div className="table-shell">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-ink-200 text-left text-[10px] font-bold uppercase tracking-wider text-ink-500">
                  <tr><th className="px-4 py-2">Revision</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2 text-right">Before</th><th className="px-4 py-2 text-right">After</th><th className="px-4 py-2">By</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {revisions.rows.map((revision) => (
                    <tr key={revision.id}>
                      <td className="px-4 py-2 font-semibold">#{revision.revision}</td>
                      <td className="px-4 py-2 text-ink-600">{formatDateTime(revision.createdAt)}</td>
                      <td className="px-4 py-2 text-ink-600">{revision.reason || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatINR(revision.beforeTotalPaise)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatINR(revision.afterTotalPaise)}</td>
                      <td className="px-4 py-2">{revision.actorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {revisions.error && <p className="px-5 py-3 text-xs text-brand-700">{revisions.error}</p>}
        </section>
      )}

    </div>
  )
}
