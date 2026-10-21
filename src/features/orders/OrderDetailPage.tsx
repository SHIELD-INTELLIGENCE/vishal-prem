import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  Edit3,
  PackageCheck,
  Printer,
  ReceiptText,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData, useDocumentData } from '@/data/hooks'
import { paymentsQuery } from '@/data/queries'
import { cancelOrderSecure, updateOrderNotes, updateOrderStatus } from '@/data/orders'
import type { Customer, Order, OrderStatus, Payment } from '@/types/models'
import { calculateLine, ORDER_STATUS_FLOW } from '@/lib/calculations'
import { formatDateShort, formatDateTime, formatINR, formatQuantity, formatTime } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextareaField } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { PaymentDialog } from '@/components/PaymentDialog'

const FORWARD_LABEL: Partial<Record<OrderStatus, string>> = {
  draft: 'Confirm order',
  confirmed: 'Start preparing',
  preparing: 'Mark ready',
  ready: 'Complete order',
}

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const { outlets, departments } = useWorkspace()
  const orderState = useDocumentData<Order>(`orders/${id}`, [id], Boolean(id))
  const order = orderState.data
  const outlet = outlets.find((item) => item.id === order?.outletId) ?? null
  const department = departments.find((item) => item.id === order?.departmentId) ?? null
  const customerState = useDocumentData<Customer>(
    order?.customerId ? `customers/${order.customerId}` : null,
    [order?.customerId],
    Boolean(order?.customerId),
  )
  const payments = useCollectionData<Payment>(
    () => (profile && order ? paymentsQuery(order.outletId, profile, 300) : null),
    [profile?.uid, order?.outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && order),
  )
  const orderPayments = useMemo(
    () => payments.rows.filter((payment) => payment.orderId === order?.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [payments.rows, order?.id],
  )

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesBusy, setNotesBusy] = useState(false)

  if (orderState.loading) {
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
  if (orderState.error || !order) {
    return <ErrorState title="Order not available" message={orderState.error ?? 'This order does not exist or you do not have access to it.'} onRetry={orderState.reload} />
  }
  if (!outlet) {
    return <ErrorState title="Outlet unavailable" message="This order belongs to an outlet that is not assigned to you." />
  }

  const nextStatus = ORDER_STATUS_FLOW[order.status][0]
  const canCancel = order.status !== 'cancelled' && order.status !== 'completed' && hasPermission(profile, 'ordersCancel')
  const canManage = hasPermission(profile, 'ordersManage')
  const canPay = hasPermission(profile, 'paymentsManage') && order.status !== 'cancelled'
  const steps: Array<{ key: OrderStatus; label: string; icon: typeof Check }> = [
    { key: 'confirmed', label: 'Confirmed', icon: ClipboardCheck },
    { key: 'preparing', label: 'Preparing', icon: ChefHat },
    { key: 'ready', label: 'Ready', icon: PackageCheck },
    { key: 'completed', label: 'Completed', icon: Check },
  ]
  const currentIndex = steps.findIndex((step) => step.key === order.status)

  async function advance() {
    if (!nextStatus || !profile) return
    try {
      setStatusBusy(true)
      await updateOrderStatus({ order: order!, status: nextStatus, profile })
      toast.success(`Order moved to ${nextStatus}`)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setStatusBusy(false)
    }
  }

  async function cancelOrder() {
    if (!profile) return
    try {
      await cancelOrderSecure({
        orderId: order!.id,
        expectedStatus: order!.status,
        reason: cancelReason,
      })
      toast.success('Order cancelled')
      setCancelOpen(false)
      setCancelReason('')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    }
  }

  async function saveNotes() {
    if (!profile) return
    try {
      setNotesBusy(true)
      await updateOrderNotes(order!.id, notes, profile)
      toast.success('Order notes updated')
      setNotesOpen(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setNotesBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-ink-500">
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
          <Link to="/admin/orders">Back to orders</Link>
        </Button>
      </div>

      <PageHeader
        eyebrow={`${outlet.name} · ${department?.name ?? 'Department'}`}
        title={order.orderNumber}
        description={`${order.customerName} · ${formatDateTime(order.createdAt)} · ${order.channel === 'phone' ? 'Phone order' : 'Counter order'}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild leftIcon={<Printer className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/order/${order.id}/receipt`} target="_blank">Receipt</Link>
            </Button>
            <Button variant="outline" size="sm" asChild leftIcon={<ChefHat className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/order/${order.id}/kitchen`} target="_blank">Kitchen</Link>
            </Button>
            <Button variant="outline" size="sm" asChild leftIcon={<ShoppingBag className="h-3.5 w-3.5" />}>
              <Link to={`/admin/print/order/${order.id}/packing`} target="_blank">Packing</Link>
            </Button>
            {canPay && (
              <Button size="sm" onClick={() => setPaymentOpen(true)} leftIcon={<CircleDollarSign className="h-3.5 w-3.5" />}>
                Record payment
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <StatusBadge status={order.paymentStatus} />
        <Badge tone="neutral">{order.orderType.replace('_', ' ')}</Badge>
        {order.pickupAt && <Badge tone="info">Pickup {formatDateTime(order.pickupAt)}</Badge>}
        {order.balancePaise > 0 && <Badge tone="danger">{formatINR(order.balancePaise)} due</Badge>}
      </div>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Order timeline</h2>
            <p className="text-xs text-ink-500">Preparation is independent of payment. Print actions are recorded separately.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && nextStatus && (
              <Button size="sm" onClick={() => void advance()} loading={statusBusy} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                {FORWARD_LABEL[order.status]}
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} leftIcon={<Ban className="h-3.5 w-3.5" />}>
                Cancel
              </Button>
            )}
          </div>
        </div>
        {order.status === 'cancelled' ? (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <p className="font-semibold">Order cancelled {order.cancelledAt ? formatDateTime(order.cancelledAt) : ''}</p>
            <p className="mt-0.5 text-xs">{order.cancelReason || 'No reason recorded.'}</p>
            {order.paidPaise > 0 && <p className="mt-1 text-xs font-medium">A payment of {formatINR(order.paidPaise)} is still recorded. Refund it separately from this screen.</p>}
          </div>
        ) : (
          <ol className="mt-5 grid gap-3 sm:grid-cols-4">
            {steps.map((step, index) => {
              const complete = currentIndex >= index
              const current = currentIndex === index
              return (
                <li key={step.key} className="relative">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${complete ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400'}`}>
                      <step.icon className="h-4 w-4" />
                    </span>
                    <span className={`text-xs font-semibold ${current ? 'text-brand-700' : complete ? 'text-ink-800' : 'text-ink-400'}`}>{step.label}</span>
                  </div>
                  <div className={`mt-2 h-1 rounded-full ${complete ? 'bg-brand-600' : 'bg-ink-100'}`} />
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Items</h2>
              <p className="text-xs text-ink-500">{order.lines.length} line{order.lines.length === 1 ? '' : 's'} · prices in INR</p>
            </div>
            <Badge tone="neutral">{department?.name}</Badge>
          </div>
          <div className="table-shell">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Discount</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const totals = calculateLine(line, order.pricesIncludeTax)
                  return (
                    <tr key={line.id}>
                      <td>
                        <p className="font-medium text-ink-800">{line.name}</p>
                        {line.notes && <p className="text-[11px] text-ink-500">{line.notes}</p>}
                      </td>
                      <td className="text-right text-xs">{formatQuantity(line.quantity, line.unit)}</td>
                      <td className="text-right text-xs tabular-nums">{formatINR(line.unitPricePaise)}</td>
                      <td className="text-right text-xs tabular-nums">{line.discountPercent ? `${line.discountPercent}%` : '—'}</td>
                      <td className="text-right text-xs tabular-nums">{line.taxPercent ? `${line.taxPercent}%` : '—'}</td>
                      <td className="text-right text-sm font-semibold tabular-nums">{formatINR(totals.totalPaise)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 bg-ivory-50/60 px-4 py-4 sm:px-5">
            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{formatINR(order.subtotalPaise)}</dd></div>
              {order.discountPaise > 0 && <div className="flex justify-between text-sage-700"><dt>Discounts</dt><dd className="tabular-nums">− {formatINR(order.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-500">Tax estimate</dt><dd className="tabular-nums">{formatINR(order.taxPaise)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatINR(order.totalPaise)}</dd></div>
              <div className="flex justify-between text-sage-700"><dt>Paid</dt><dd className="tabular-nums">{formatINR(order.paidPaise)}</dd></div>
              <div className="flex justify-between font-semibold text-brand-700"><dt>Balance</dt><dd className="tabular-nums">{formatINR(order.balancePaise)}</dd></div>
            </dl>
            <p className="mt-3 text-[10px] text-ink-400">Tax is calculated from product rates and is an operational estimate, not a GST return.</p>
          </div>
        </section>

        <div className="space-y-4">
          <section className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Customer</h2>
              {order.customerId && hasPermission(profile, 'customersView') && (
                <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  <Link to={`/admin/customers/${order.customerId}`}>Account</Link>
                </Button>
              )}
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ivory-100 text-ink-500"><UserRound className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="font-semibold">{order.customerName}</p>
                <p className="text-xs text-ink-500">{order.customerPhone || 'No phone number'}</p>
                {customerState.data && (
                  <p className="mt-1 text-[11px] text-ink-500">{customerState.data.accountGroup.replace('_', ' ')} · {customerState.data.email || 'No email'}</p>
                )}
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-ink-100 pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-ink-500">Order type</dt><dd className="capitalize">{order.orderType.replace('_', ' ')}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Channel</dt><dd className="capitalize">{order.channel}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Created</dt><dd>{formatDateShort(order.createdAt)} {formatTime(order.createdAt)}</dd></div>
              {order.pickupAt && <div className="flex justify-between"><dt className="text-ink-500">Pickup</dt><dd>{formatDateTime(order.pickupAt)}</dd></div>}
            </dl>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Notes</h2>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => { setNotes(order.notes ?? ''); setNotesOpen(true) }} leftIcon={<Edit3 className="h-3.5 w-3.5" />}>
                  Edit
                </Button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{order.notes || 'No order notes.'}</p>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Print trail</h2>
            <p className="text-xs text-ink-500">Browser print events recorded for this order.</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-ivory-50 px-2.5 py-2"><dt className="text-ink-500">Receipt</dt><dd className="font-semibold">{order.printCounts?.receipt ?? 0}</dd></div>
              <div className="rounded-lg bg-ivory-50 px-2.5 py-2"><dt className="text-ink-500">Kitchen</dt><dd className="font-semibold">{order.printCounts?.kitchen ?? 0}</dd></div>
              <div className="rounded-lg bg-ivory-50 px-2.5 py-2"><dt className="text-ink-500">Packing</dt><dd className="font-semibold">{order.printCounts?.packing ?? 0}</dd></div>
              <div className="rounded-lg bg-ivory-50 px-2.5 py-2"><dt className="text-ink-500">Invoice</dt><dd className="font-semibold">{order.printCounts?.invoice ?? 0}</dd></div>
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-400">A print event is not proof of a physical print. Verify printer connectivity separately.</p>
          </section>
        </div>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Payments</h2>
            <p className="text-xs text-ink-500">Separate receipt records linked to this order.</p>
          </div>
          {canPay && (
            <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)} leftIcon={<ReceiptText className="h-3.5 w-3.5" />}>
              Add payment
            </Button>
          )}
        </div>
        {payments.loading ? (
          <div className="p-4"><Skeleton className="h-16 w-full" /></div>
        ) : orderPayments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No payments recorded for this order.</p>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th>Type</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {orderPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-medium">{payment.receiptNumber}</td>
                    <td className="text-xs">{formatDateTime(payment.receivedAt)}</td>
                    <td className="capitalize text-xs">{payment.mode.replace('_', ' ')}</td>
                    <td><StatusBadge status={payment.type} label={payment.type === 'refund' ? 'Refund' : 'Payment'} /></td>
                    <td className={`text-right text-sm font-semibold tabular-nums ${payment.type === 'refund' ? 'text-brand-700' : 'text-sage-700'}`}>
                      {payment.type === 'refund' ? '−' : ''}{formatINR(payment.amountPaise)}
                    </td>
                    <td className="text-right">
                      <Button asChild size="sm" variant="ghost"><Link to={`/admin/print/payment/${payment.id}`} target="_blank">Receipt</Link></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {profile && (
        <PaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          target={{ kind: 'order', order }}
          onRecorded={() => payments.reload()}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="Cancellation is recorded with your staff ID. Payment and refund records are not deleted."
        confirmLabel="Cancel order"
        destructive
        onConfirm={cancelOrder}
      >
        <TextareaField
          label="Cancellation reason"
          placeholder="Why is this order being cancelled?"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
        {order.paidPaise > 0 && (
          <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            This order has {formatINR(order.paidPaise)} recorded as paid. Record a refund separately after cancelling.
          </p>
        )}
      </ConfirmDialog>

      <Dialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        title="Edit order notes"
        description="Visible to permitted staff on the order and print slips where configured."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setNotesOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveNotes()} loading={notesBusy}>Save notes</Button>
          </>
        }
      >
        <TextareaField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} />
      </Dialog>
    </div>
  )
}
