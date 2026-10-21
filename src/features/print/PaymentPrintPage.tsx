import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { useDocumentData } from '@/data/hooks'
import type { Booking, Customer, Order, Payment } from '@/types/models'
import { formatDateTime, formatINR, titleCase } from '@/lib/format'
import {
  PrintFooter,
  PrintHeader,
  PrintLoading,
  PrintMeta,
  PrintSheet,
  PrintToolbar,
  PrintUnavailable,
} from './PrintChrome'

export function PaymentPrintPage() {
  const { id = '' } = useParams()
  const { business, outlets, departments, selectedOutlet } = useWorkspace()
  const paymentState = useDocumentData<Payment>(`payments/${id}`, [id], Boolean(id))
  const payment = paymentState.data
  const outlet = outlets.find((item) => item.id === payment?.outletId) ?? selectedOutlet
  const orderState = useDocumentData<Order>(
    payment?.orderId ? `orders/${payment.orderId}` : null,
    [payment?.orderId],
    Boolean(payment?.orderId),
  )
  const bookingState = useDocumentData<Booking>(
    payment?.bookingId ? `bookings/${payment.bookingId}` : null,
    [payment?.bookingId],
    Boolean(payment?.bookingId),
  )
  const customerState = useDocumentData<Customer>(
    payment?.customerId ? `customers/${payment.customerId}` : null,
    [payment?.customerId],
    Boolean(payment?.customerId),
  )
  const customer = customerState.data
  const isRefund = payment?.type === 'refund'

  useEffect(() => {
    if (!payment) return
    document.title = `${payment.receiptNumber} · ${isRefund ? 'Refund receipt' : 'Payment receipt'}`
    return () => {
      document.title = 'Vishal Prem — Management'
    }
  }, [payment, isRefund])

  if (paymentState.loading) return <PrintLoading />
  if (paymentState.error || !payment || !outlet) {
    return (
      <PrintUnavailable
        title="Payment not available"
        message={paymentState.error ?? 'This payment record does not exist or your profile does not have access to its outlet.'}
        backTo="/admin/payments"
      />
    )
  }

  const backTo = payment.orderId ? `/admin/orders/${payment.orderId}` : payment.bookingId ? `/admin/bookings/${payment.bookingId}` : '/admin/payments'
  const againstLabel = payment.orderId
    ? orderState.data?.orderNumber ?? payment.orderId
    : payment.bookingId
      ? bookingState.data?.bookingNumber ?? payment.bookingId
      : 'Standalone receipt'
  const departmentNames = payment.departmentIds
    .map((departmentId) => departments.find((department) => department.id === departmentId)?.name ?? 'Department')
    .join(', ')
  const width = business?.printer.receiptWidth ?? '80mm'
  const compact = width === '80mm'

  function handlePrint() {
    window.print()
  }

  return (
    <div>
      <PrintToolbar
        title={`${isRefund ? 'Refund receipt' : 'Payment receipt'} · ${payment.receiptNumber}`}
        subtitle={`${outlet.name} · ${formatDateTime(payment.receivedAt)}`}
        backTo={backTo}
        onPrint={handlePrint}
        printLabel="Print receipt"
      />

      <PrintSheet width={width} title={`Payment receipt ${payment.receiptNumber}`}>
        <PrintHeader
          business={business}
          outlet={outlet}
          compact={compact}
          documentLabel={isRefund ? 'Refund Receipt' : 'Payment Receipt'}
        />

        <PrintMeta
          columns={compact ? 1 : 2}
          items={[
            { label: 'Receipt', value: payment.receiptNumber },
            { label: 'Date', value: formatDateTime(payment.receivedAt) },
            { label: isRefund ? 'Refunded to' : 'Received from', value: payment.customerName || 'Walk-in customer' },
            { label: 'Mode', value: titleCase(payment.mode) },
            ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : []),
            { label: 'Against', value: againstLabel },
            ...(customer?.gstin ? [{ label: 'Customer GSTIN', value: customer.gstin }] : []),
            { label: 'Recorded', value: formatDateTime(payment.createdAt) },
          ]}
        />

        <div className="mt-4 border-y-2 border-ink-900 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-500">{isRefund ? 'Amount refunded' : 'Amount received'}</p>
              <p className="mt-0.5 text-[10px] text-ink-500">{titleCase(payment.mode)}</p>
            </div>
            <p className="font-display text-2xl font-semibold tabular-nums">{formatINR(payment.amountPaise)}</p>
          </div>
        </div>

        <div className="mt-2 space-y-1 text-[11px]">
          <div className="flex justify-between gap-3">
            <span className="text-ink-500">Payment type</span>
            <span className="font-medium">{isRefund ? 'Refund' : 'Payment'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-500">Against</span>
            <span className="font-medium">{againstLabel}</span>
          </div>
          {payment.orderId && orderState.data && (
            <div className="flex justify-between gap-3">
              <span className="text-ink-500">Order total</span>
              <span className="font-medium">{formatINR(orderState.data.totalPaise)}</span>
            </div>
          )}
          {payment.bookingId && bookingState.data && (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Booking total</span>
                <span className="font-medium">{formatINR(bookingState.data.totalPaise)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-500">Event date</span>
                <span className="font-medium">{formatDateTime(`${bookingState.data.eventDate}T${bookingState.data.eventTime}:00`)}</span>
              </div>
            </>
          )}
          {departmentNames && (
            <div className="flex justify-between gap-3">
              <span className="text-ink-500">Departments</span>
              <span className="text-right font-medium">{departmentNames}</span>
            </div>
          )}
        </div>

        {payment.notes && (
          <p className="mt-3 border-t border-dashed border-ink-200 pt-2 text-[10.5px] text-ink-600">
            <span className="font-semibold">Note:</span> {payment.notes}
          </p>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-ink-500">
          {isRefund
            ? 'This receipt records money returned to the customer. It does not by itself cancel an order or booking; the linked record must be updated separately.'
            : 'Received with thanks. Please retain this receipt for your records.'}
        </p>

        <PrintFooter business={business} note={isRefund ? 'Refund receipt generated from the saved payment record.' : 'Payment receipt generated from the saved payment record.'} />
      </PrintSheet>
    </div>
  )
}
