import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { useDocumentData } from '@/data/hooks'
import type { Booking, Customer, OrderLine } from '@/types/models'
import { formatDate, formatINR, formatQuantity, titleCase } from '@/lib/format'
import {
  PrintFooter,
  PrintHeader,
  PrintLines,
  PrintLoading,
  PrintMeta,
  PrintSheet,
  PrintToolbar,
  PrintTotals,
  PrintUnavailable,
  TaxBreakdown,
  departmentLabel,
} from './PrintChrome'

type BookingDoc = 'quotation' | 'confirmation' | 'kitchen' | 'invoice'
const DOC_TYPES: BookingDoc[] = ['quotation', 'confirmation', 'kitchen', 'invoice']

function isBookingDoc(value: string | undefined): value is BookingDoc {
  return Boolean(value && (DOC_TYPES as string[]).includes(value))
}

const TITLES: Record<BookingDoc, string> = {
  quotation: 'Quotation',
  confirmation: 'Booking confirmation',
  kitchen: 'Operations slip',
  invoice: 'Tax invoice',
}

export function BookingPrintPage() {
  const { id = '', doc } = useParams()
  const { business, outlets, departments } = useWorkspace()
  const bookingState = useDocumentData<Booking>(`bookings/${id}`, [id], Boolean(id))
  const booking = bookingState.data
  const outlet = outlets.find((item) => item.id === booking?.outletId) ?? null
  const customerState = useDocumentData<Customer>(
    booking?.customerId ? `customers/${booking.customerId}` : null,
    [booking?.customerId],
    Boolean(booking?.customerId),
  )
  const customer = customerState.data
  const docType: BookingDoc | null = isBookingDoc(doc) ? doc : null

  useEffect(() => {
    if (!booking || !docType) return
    document.title = `${booking.bookingNumber} · ${TITLES[docType]}`
    return () => {
      document.title = 'Vishal Prem — Management'
    }
  }, [booking, docType])

  if (!docType) {
    return <PrintUnavailable title="Unknown document" message="That booking print document does not exist." backTo={`/admin/bookings/${id}`} />
  }
  if (bookingState.loading) return <PrintLoading />
  if (bookingState.error || !booking || !outlet) {
    return (
      <PrintUnavailable
        title="Booking not available"
        message={bookingState.error ?? 'This booking does not exist or your profile does not have access to its outlet.'}
        backTo="/admin/bookings"
      />
    )
  }

  const eventDate = formatDate(booking.eventDate)
  const invoiceReference = `${business?.invoicePrefix ?? 'VP'}/${outlet.code}/${booking.bookingNumber}`
  const taxLabel = booking.pricesIncludeTax ? 'GST (included)' : 'GST'
  const taxableValue = booking.pricesIncludeTax
    ? Math.max(0, booking.totalPaise - booking.taxPaise)
    : Math.max(0, booking.subtotalPaise - booking.discountPaise)
  const departmentNames = booking.departmentIds.map((departmentId) => departmentLabel(departments, departmentId)).join(', ')
  const groupedLines = (() => {
    const groups = new Map<string, OrderLine[]>()
    for (const line of booking.lines) {
      const current = groups.get(line.departmentId) ?? []
      current.push(line)
      groups.set(line.departmentId, current)
    }
    return Array.from(groups.entries())
  })()
  const amountRows = [
    { label: 'Subtotal', value: formatINR(booking.subtotalPaise) },
    ...(booking.lineDiscountPaise > 0 ? [{ label: 'Line discounts', value: `− ${formatINR(booking.lineDiscountPaise)}` }] : []),
    ...(booking.orderDiscountPaise > 0 ? [{ label: 'Order discount', value: `− ${formatINR(booking.orderDiscountPaise)}` }] : []),
    ...(booking.taxPaise > 0 ? [{ label: taxLabel, value: formatINR(booking.taxPaise) }] : []),
  ]

  function handlePrint() {
    window.print()
  }

  return (
    <div>
      <PrintToolbar
        title={`${TITLES[docType]} · ${booking.bookingNumber}`}
        subtitle={`${outlet.name} · ${eventDate} at ${booking.eventTime}`}
        backTo={`/admin/bookings/${booking.id}`}
        onPrint={handlePrint}
        printLabel={`Print ${TITLES[docType].toLowerCase()}`}
      />

      <PrintSheet width="a4" title={`${TITLES[docType]} ${booking.bookingNumber}`}>
        <PrintHeader
          business={business}
          outlet={outlet}
          documentLabel={
            docType === 'invoice'
              ? 'Tax Invoice'
              : docType === 'kitchen'
                ? 'Operations Slip'
                : docType === 'confirmation'
                  ? 'Booking Confirmation'
                  : 'Quotation'
          }
        />

        {docType === 'quotation' && (
          <>
            <PrintMeta
              columns={3}
              items={[
                { label: 'Quotation', value: booking.bookingNumber },
                { label: 'Prepared', value: formatDate(booking.createdAt) },
                { label: 'Status', value: titleCase(booking.status) },
                { label: 'Customer', value: booking.customerName },
                { label: 'Phone', value: booking.customerPhone || '—' },
                { label: 'Event', value: `${titleCase(booking.eventType)} · ${eventDate} · ${booking.eventTime}` },
                { label: 'Collection', value: titleCase(booking.fulfillment) },
                { label: 'Departments', value: departmentNames || '—' },
                ...(customer?.gstin ? [{ label: 'GSTIN', value: customer.gstin }] : []),
              ]}
            />
            {booking.fulfillment === 'delivery' && booking.deliveryAddress && (
              <p className="mt-2 text-[11px] text-ink-700"><span className="font-semibold">Delivery address:</span> {booking.deliveryAddress}</p>
            )}
            <PrintLines lines={booking.lines} showPrices showTax />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mt-4 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Tax summary</p>
                <TaxBreakdown lines={booking.lines} orderDiscountPaise={booking.orderDiscountPaise} pricesIncludeTax={booking.pricesIncludeTax} />
              </div>
              <PrintTotals
                rows={amountRows}
                total={{ label: booking.pricesIncludeTax ? 'Quotation total (incl. GST)' : 'Quotation total', value: formatINR(booking.totalPaise) }}
              />
            </div>
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-1.5 text-[11px]">
              <span className="text-ink-500">Advance recorded</span>
              <span className="font-medium">{formatINR(booking.paidPaise)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-500">Balance after advance</span>
              <span className="font-semibold">{formatINR(booking.balancePaise)}</span>
            </div>
            {booking.instructions && <p className="mt-3 text-[10.5px] text-ink-600"><span className="font-semibold">Instructions:</span> {booking.instructions}</p>}
            <div className="mt-4 rounded border border-ink-300 p-2 text-[10px] leading-relaxed text-ink-600">
              <p className="font-bold uppercase tracking-wide">Quotation terms</p>
              <p className="mt-1">This is a quotation, not a tax invoice. The booking is confirmed only after the agreed advance is recorded. Prices and availability are subject to confirmation at the time of booking.</p>
            </div>
            <PrintFooter business={business} note="Quotation generated from the saved booking record." />
          </>
        )}

        {docType === 'confirmation' && (
          <>
            <PrintMeta
              columns={3}
              items={[
                { label: 'Booking', value: booking.bookingNumber },
                { label: 'Confirmed', value: formatDate(booking.createdAt) },
                { label: 'Status', value: titleCase(booking.status) },
                { label: 'Customer', value: booking.customerName },
                { label: 'Phone', value: booking.customerPhone || '—' },
                { label: 'Event', value: `${titleCase(booking.eventType)} · ${eventDate} · ${booking.eventTime}` },
                { label: 'Collection', value: titleCase(booking.fulfillment) },
                { label: 'Departments', value: departmentNames || '—' },
                { label: 'Payment', value: titleCase(booking.paymentStatus) },
              ]}
            />
            {booking.fulfillment === 'delivery' && booking.deliveryAddress && (
              <p className="mt-2 text-[11px] text-ink-700"><span className="font-semibold">Delivery address:</span> {booking.deliveryAddress}</p>
            )}
            <PrintLines lines={booking.lines} showPrices />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border border-ink-300 p-3 text-[11px]">
                <p className="text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Advance and balance</p>
                <div className="mt-1.5 flex justify-between"><span>Total</span><span className="font-semibold">{formatINR(booking.totalPaise)}</span></div>
                <div className="flex justify-between"><span>Advance recorded</span><span className="font-semibold">{formatINR(booking.paidPaise)}</span></div>
                <div className="mt-1 flex justify-between border-t border-ink-300 pt-1"><span>Balance due</span><span className="font-bold">{formatINR(booking.balancePaise)}</span></div>
              </div>
              <div className="rounded border border-dashed border-ink-400 p-3 text-[10.5px]">
                <p className="font-bold uppercase tracking-wide">Instructions</p>
                <p className="mt-1">{booking.instructions || 'No special instructions recorded.'}</p>
              </div>
            </div>
            <PrintFooter business={business} note="Bring this confirmation or quote the booking number at collection." />
          </>
        )}

        {docType === 'kitchen' && (
          <>
            <PrintMeta
              columns={3}
              items={[
                { label: 'Booking', value: booking.bookingNumber },
                { label: 'Event date', value: eventDate },
                { label: 'Event time', value: booking.eventTime },
                { label: 'Customer', value: booking.customerName },
                { label: 'Collection', value: titleCase(booking.fulfillment) },
                { label: 'Status', value: titleCase(booking.status) },
                { label: 'Preparation', value: titleCase(booking.preparationStatus) },
                { label: 'Packing', value: titleCase(booking.packingStatus) },
                { label: 'Departments', value: departmentNames || '—' },
              ]}
            />
            {booking.fulfillment === 'delivery' && booking.deliveryAddress && (
              <p className="mt-2 rounded border border-ink-300 p-2 text-[11px]"><span className="font-semibold">Deliver to:</span> {booking.deliveryAddress}</p>
            )}
            <div className="mt-3 space-y-4">
              {groupedLines.map(([departmentId, lines]) => (
                <section key={departmentId} className="break-inside-avoid">
                  <h3 className="border-b border-ink-900 pb-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                    {departmentLabel(departments, departmentId)}
                  </h3>
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-ink-200">
                        <th className="w-6 py-1 text-[9px] font-bold uppercase text-ink-500">✓</th>
                        <th className="py-1 text-[9px] font-bold uppercase text-ink-500">Item</th>
                        <th className="w-24 py-1 text-right text-[9px] font-bold uppercase text-ink-500">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id} className="border-b border-dashed border-ink-200">
                          <td className="py-1.5 align-top"><span className="inline-block h-3.5 w-3.5 border border-ink-400" /></td>
                          <td className="py-1.5">
                            <p className="font-semibold">{line.printName || line.name}</p>
                            {line.notes && <p className="text-[10px] italic text-ink-500">{line.notes}</p>}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{formatQuantity(line.quantity, line.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
            <div className="mt-3 rounded border border-dashed border-ink-400 p-2 text-[10.5px]">
              <p className="font-bold uppercase tracking-wide">Event instructions</p>
              <p className="mt-1">{booking.instructions || 'No special instructions recorded.'}</p>
            </div>
            <PrintFooter business={business} note="Operations copy — no prices printed. Initial each completed department." />
          </>
        )}

        {docType === 'invoice' && (
          <>
            <PrintMeta
              columns={3}
              items={[
                { label: 'Invoice ref', value: invoiceReference },
                { label: 'Booking', value: booking.bookingNumber },
                { label: 'Invoice date', value: formatDate(new Date()) },
                { label: 'Customer', value: booking.customerName },
                { label: 'Phone', value: booking.customerPhone || '—' },
                { label: 'Event', value: `${titleCase(booking.eventType)} · ${eventDate}` },
                ...(customer?.gstin ? [{ label: 'Customer GSTIN', value: customer.gstin }] : []),
                ...(customer?.addresses?.[0]
                  ? [{
                      label: 'Billing address',
                      value: [customer.addresses[0].line1, customer.addresses[0].line2, customer.addresses[0].city, customer.addresses[0].state, customer.addresses[0].pin]
                        .filter(Boolean)
                        .join(', '),
                    }]
                  : []),
                { label: 'Place of supply', value: business?.state ?? outlet.address },
              ]}
            />
            <PrintLines lines={booking.lines} showPrices showTax />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mt-4 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Tax summary</p>
                <TaxBreakdown lines={booking.lines} orderDiscountPaise={booking.orderDiscountPaise} pricesIncludeTax={booking.pricesIncludeTax} />
              </div>
              <PrintTotals
                rows={[
                  { label: 'Subtotal', value: formatINR(booking.subtotalPaise) },
                  ...(booking.discountPaise > 0 ? [{ label: 'Total discount', value: `− ${formatINR(booking.discountPaise)}` }] : []),
                  { label: 'Taxable value', value: formatINR(taxableValue) },
                  ...(booking.taxPaise > 0 ? [{ label: taxLabel, value: formatINR(booking.taxPaise) }] : []),
                ]}
                total={{ label: booking.pricesIncludeTax ? 'Invoice total (incl. GST)' : 'Invoice total', value: formatINR(booking.totalPaise) }}
              />
            </div>
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-1.5 text-[11px]">
              <span className="text-ink-500">Advances and payments</span>
              <span className="font-medium">{formatINR(booking.paidPaise)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-500">Balance due</span>
              <span className="font-semibold">{formatINR(booking.balancePaise)}</span>
            </div>
            <PrintFooter business={business} note="Computer-generated invoice from the saved booking record." />
          </>
        )}
      </PrintSheet>
    </div>
  )
}
