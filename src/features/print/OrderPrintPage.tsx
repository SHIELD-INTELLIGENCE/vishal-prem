import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useDocumentData } from '@/data/hooks'
import { recordOrderPrint } from '@/data/orders'
import type { Customer, Order, PrintDocType } from '@/types/models'
import { formatDate, formatDateTime, formatINR, formatQuantity } from '@/lib/format'
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

const DOC_TYPES: PrintDocType[] = ['receipt', 'kitchen', 'packing', 'invoice']

function isPrintDoc(value: string | undefined): value is PrintDocType {
  return Boolean(value && (DOC_TYPES as string[]).includes(value))
}

const TITLES: Record<PrintDocType, string> = {
  receipt: 'Receipt',
  kitchen: 'Kitchen ticket',
  packing: 'Packing slip',
  invoice: 'Tax invoice',
}

export function OrderPrintPage() {
  const { id = '', doc } = useParams()
  const { profile } = useAuth()
  const { business, outlets, departments } = useWorkspace()
  const orderState = useDocumentData<Order>(`orders/${id}`, [id], Boolean(id))
  const order = orderState.data
  const outlet = outlets.find((item) => item.id === order?.outletId) ?? null
  const customerState = useDocumentData<Customer>(
    order?.customerId ? `customers/${order.customerId}` : null,
    [order?.customerId],
    Boolean(order?.customerId),
  )
  const customer = customerState.data
  const docType: PrintDocType | null = isPrintDoc(doc) ? doc : null

  useEffect(() => {
    if (!order || !docType) return
    document.title = `${order.orderNumber} · ${TITLES[docType]}`
    return () => {
      document.title = 'Vishal Prem — Management'
    }
  }, [order, docType])

  if (!docType) {
    return <PrintUnavailable title="Unknown document" message="That print document type does not exist." backTo={`/admin/orders/${id}`} />
  }
  if (orderState.loading) return <PrintLoading />
  if (orderState.error || !order || !outlet) {
    return (
      <PrintUnavailable
        title="Order not available"
        message={orderState.error ?? 'This order does not exist or your profile does not have access to its outlet.'}
        backTo="/admin/orders"
      />
    )
  }

  const department = departmentLabel(departments, order.departmentId)
  const width: '80mm' | 'a5' | 'a4' =
    docType === 'kitchen' ? '80mm' : docType === 'receipt' ? (business?.printer.receiptWidth ?? '80mm') : docType === 'packing' ? 'a5' : 'a4'
  const compact = width === '80mm'
  const taxLabel = order.pricesIncludeTax ? 'GST (included)' : 'GST'
  const taxableValue = order.pricesIncludeTax
    ? Math.max(0, order.totalPaise - order.taxPaise)
    : Math.max(0, order.subtotalPaise - order.discountPaise)
  const invoiceReference = `${business?.invoicePrefix ?? 'VP'}/${outlet.code}/${order.orderNumber}`

  function handlePrint() {
    if (!profile || !order || !docType) return
    window.print()
    if (!hasPermission(profile, 'ordersManage')) return
    void recordOrderPrint({ orderId: order.id, docType, profile }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not record the print event.')
    })
  }

  const totalsRows = [
    { label: 'Subtotal', value: formatINR(order.subtotalPaise) },
    ...(order.lineDiscountPaise > 0 ? [{ label: 'Line discounts', value: `− ${formatINR(order.lineDiscountPaise)}` }] : []),
    ...(order.orderDiscountPaise > 0 ? [{ label: 'Order discount', value: `− ${formatINR(order.orderDiscountPaise)}` }] : []),
    ...(order.taxPaise > 0 ? [{ label: taxLabel, value: formatINR(order.taxPaise) }] : []),
  ]

  return (
    <div>
      <PrintToolbar
        title={`${TITLES[docType]} · ${order.orderNumber}`}
        subtitle={`${outlet.name} · ${formatDateTime(order.createdAt)}`}
        backTo={`/admin/orders/${order.id}`}
        onPrint={handlePrint}
        printLabel={`Print ${TITLES[docType].toLowerCase()}`}
      />

      <PrintSheet width={width} title={`${TITLES[docType]} ${order.orderNumber}`}>
        <PrintHeader
          business={business}
          outlet={outlet}
          compact={compact}
          documentLabel={docType === 'invoice' ? 'Tax Invoice' : docType === 'kitchen' ? 'Kitchen Ticket' : docType === 'packing' ? 'Packing Slip' : 'Receipt'}
        />

        {docType === 'receipt' && (
          <>
            <PrintMeta
              columns={compact ? 1 : 2}
              items={[
                { label: 'Order', value: order.orderNumber },
                { label: 'Date', value: formatDateTime(order.createdAt) },
                { label: 'Customer', value: order.customerName || 'Walk-in customer' },
                { label: 'Phone', value: order.customerPhone || '—' },
                { label: 'Type', value: order.orderType.replace('_', ' ') },
                { label: 'Payment', value: order.paymentStatus },
              ]}
            />
            <PrintLines lines={order.lines} showPrices />
            <PrintTotals
              compact={compact}
              rows={totalsRows}
              total={{ label: order.pricesIncludeTax ? 'Total (incl. GST)' : 'Total', value: formatINR(order.totalPaise) }}
            />
            <div className="mt-2 border-t border-ink-200 pt-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-ink-500">Paid</span><span className="font-medium">{formatINR(order.paidPaise)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Balance</span><span className="font-semibold">{formatINR(order.balancePaise)}</span></div>
            </div>
            {business?.upiId && <p className="mt-2 text-[10px] text-ink-500">UPI: <span className="font-semibold text-ink-800">{business.upiId}</span></p>}
            {order.notes && <p className="mt-2 border-t border-dashed border-ink-200 pt-1.5 text-[10px] text-ink-600">Note: {order.notes}</p>}
            <PrintFooter business={business} note="Thank you for your order." />
          </>
        )}

        {docType === 'kitchen' && (
          <>
            <PrintMeta
              columns={1}
              items={[
                { label: 'Order', value: order.orderNumber },
                { label: 'Placed', value: formatDateTime(order.createdAt) },
                { label: 'Department', value: department },
                { label: 'Type', value: order.orderType.replace('_', ' ') },
                ...(order.pickupAt ? [{ label: 'Pickup', value: formatDateTime(order.pickupAt) }] : []),
                { label: 'Status', value: order.status },
              ]}
            />
            <PrintLines lines={order.lines} showPrices={false} />
            {order.notes && (
              <div className="mt-3 border-2 border-dashed border-ink-400 p-2 text-[10.5px]">
                <p className="font-bold uppercase tracking-wide">Instructions</p>
                <p className="mt-0.5">{order.notes}</p>
              </div>
            )}
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-600">Prepare · check · hand over</p>
            <PrintFooter business={business} note="Kitchen copy — no prices printed." />
          </>
        )}

        {docType === 'packing' && (
          <>
            <PrintMeta
              items={[
                { label: 'Order', value: order.orderNumber },
                { label: 'Date', value: formatDateTime(order.createdAt) },
                { label: 'Customer', value: order.customerName || 'Walk-in customer' },
                { label: 'Phone', value: order.customerPhone || '—' },
                { label: 'Fulfilment', value: order.orderType.replace('_', ' ') },
                { label: 'Items', value: `${order.lines.length} lines` },
              ]}
            />
            <table className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr className="border-y border-ink-300">
                  <th className="w-6 py-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">✓</th>
                  <th className="py-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Item</th>
                  <th className="w-24 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id} className="border-b border-dashed border-ink-200">
                    <td className="py-2 align-top"><span className="inline-block h-3.5 w-3.5 border border-ink-400" /></td>
                    <td className="py-2">
                      <p className="font-semibold">{line.printName || line.name}</p>
                      {line.notes && <p className="text-[10px] italic text-ink-500">{line.notes}</p>}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatQuantity(line.quantity, line.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.notes && (
              <div className="mt-3 rounded border border-ink-300 p-2 text-[10.5px]">
                <p className="font-bold uppercase tracking-wide">Order note</p>
                <p className="mt-0.5">{order.notes}</p>
              </div>
            )}
            <PrintFooter business={business} note="Check each line against this slip before handover." />
          </>
        )}

        {docType === 'invoice' && (
          <>
            <PrintMeta
              columns={3}
              items={[
                { label: 'Invoice ref', value: invoiceReference },
                { label: 'Order', value: order.orderNumber },
                { label: 'Date', value: formatDate(order.createdAt) },
                { label: 'Customer', value: order.customerName || 'Walk-in customer' },
                { label: 'Phone', value: order.customerPhone || '—' },
                { label: 'Place of supply', value: business?.state ?? outlet.address },
                ...(customer?.gstin ? [{ label: 'Customer GSTIN', value: customer.gstin }] : []),
                ...(customer?.addresses?.[0]
                  ? [{
                      label: 'Billing address',
                      value: [customer.addresses[0].line1, customer.addresses[0].line2, customer.addresses[0].city, customer.addresses[0].state, customer.addresses[0].pin]
                        .filter(Boolean)
                        .join(', '),
                    }]
                  : []),
                { label: 'Payment', value: order.paymentStatus },
              ]}
            />
            <PrintLines lines={order.lines} showPrices showTax />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mt-4 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Tax summary</p>
                <TaxBreakdown lines={order.lines} orderDiscountPaise={order.orderDiscountPaise} pricesIncludeTax={order.pricesIncludeTax} />
              </div>
              <div>
                <PrintTotals
                  rows={[
                    { label: 'Subtotal', value: formatINR(order.subtotalPaise) },
                    ...(order.discountPaise > 0 ? [{ label: 'Total discount', value: `− ${formatINR(order.discountPaise)}` }] : []),
                    { label: 'Taxable value', value: formatINR(taxableValue) },
                    ...(order.taxPaise > 0 ? [{ label: taxLabel, value: formatINR(order.taxPaise) }] : []),
                  ]}
                  total={{ label: order.pricesIncludeTax ? 'Invoice total (incl. GST)' : 'Invoice total', value: formatINR(order.totalPaise) }}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-1.5 text-[11px]">
              <span className="text-ink-500">Paid</span>
              <span className="font-medium">{formatINR(order.paidPaise)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-500">Balance due</span>
              <span className="font-semibold">{formatINR(order.balancePaise)}</span>
            </div>
            {order.notes && <p className="mt-2 text-[10px] text-ink-600">Note: {order.notes}</p>}
            <PrintFooter business={business} note="Computer-generated invoice from the saved order record." />
          </>
        )}
      </PrintSheet>
    </div>
  )
}
