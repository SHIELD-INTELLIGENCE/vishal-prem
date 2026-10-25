import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AlertTriangle,
  BadgeIndianRupee,
  Ban,
  BookOpen,
  Plus,
  ReceiptText,
  Truck,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasOutletWideDepartmentScope, hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { customersQuery } from '@/data/queries'
import {
  cancelPurchase,
  purchasesQuery,
  recordSupplierPayment,
  supplierPaymentsQuery,
  voidSupplierPayment,
} from '@/data/purchases'
import { buildSupplierLedger, GST_TREATMENT_LABELS, SUPPLY_TYPE_LABELS } from '@/lib/gst'
import { uniqueId } from '@/lib/utils'
import type { Customer, PaymentMode, Purchase, SupplierPayment } from '@/types/models'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CsvExportButton } from '@/components/ui/CsvExportButton'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/States'
import { formatDateShort, formatDateTime, formatINR, parseRupeeInput } from '@/lib/format'

const MAX_PURCHASES = 500
const MAX_PAYMENTS = 500
const MAX_CUSTOMERS = 500

export function PurchasesPage() {
  const { profile } = useAuth()
  const { selectedOutletId } = useWorkspace()
  const outletId = selectedOutletId ?? ''
  const [tab, setTab] = useState<'vouchers' | 'suppliers'>('vouchers')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [ledgerSupplier, setLedgerSupplier] = useState<Customer | null>(null)
  const [paymentSupplier, setPaymentSupplier] = useState<Customer | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [paymentNotes, setPaymentNotes] = useState('')
  const [voidTarget, setVoidTarget] = useState<SupplierPayment | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestId, setRequestId] = useState(uniqueId())

  const outletWide = hasOutletWideDepartmentScope(profile)
  const canManage = hasPermission(profile, 'purchasesManage')
  const canFinance = hasPermission(profile, 'financeManage')

  const purchases = useCollectionData<Purchase>(
    () => (profile && outletId ? purchasesQuery(outletId, profile, MAX_PURCHASES) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const payments = useCollectionData<SupplierPayment>(
    () => (outletWide && outletId ? supplierPaymentsQuery(outletId, MAX_PAYMENTS) : null),
    [outletId, outletWide],
    Boolean(outletWide && outletId),
  )

  const customers = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, MAX_CUSTOMERS) : null),
    [outletId],
    Boolean(outletId),
  )

  const suppliers = useMemo(
    () => customers.rows.filter((customer) => customer.accountGroup === 'supplier' && customer.active),
    [customers.rows],
  )

  const rows = useMemo(
    () => purchases.rows.filter((purchase) => statusFilter === 'all' || purchase.status === statusFilter),
    [purchases.rows, statusFilter],
  )

  const summary = useMemo(() => {
    const posted = rows.filter((purchase) => purchase.status === 'posted')
    return {
      payable: posted.reduce((sum, purchase) => sum + purchase.payablePaise, 0),
      tax: posted.reduce((sum, purchase) => sum + purchase.taxPaise, 0),
      rcm: posted.reduce((sum, purchase) => sum + purchase.rcmTaxPaise, 0),
      count: posted.length,
    }
  }, [rows])

  const ledgers = useMemo(
    () =>
      suppliers
        .map((supplier) =>
          buildSupplierLedger({
            supplierId: supplier.id,
            supplierName: supplier.name,
            openingBalancePaise: supplier.openingBalancePaise,
            purchases: purchases.rows,
            payments: payments.rows,
          }),
        )
        .sort((a, b) => b.outstandingPaise - a.outstandingPaise),
    [suppliers, purchases.rows, payments.rows],
  )

  const outstandingTotal = ledgers.reduce((sum, ledger) => sum + Math.max(0, ledger.outstandingPaise), 0)
  const activeLedger = ledgerSupplier ? ledgers.find((ledger) => ledger.supplierId === ledgerSupplier.id) ?? null : null

  async function submitCancel() {
    if (!cancelTarget) return
    setSaving(true)
    try {
      await cancelPurchase({ purchaseId: cancelTarget.id, reason: cancelReason.trim() })
      toast.success('Purchase cancelled and stock reversed.')
      setCancelTarget(null)
      setCancelReason('')
      setSelectedPurchase(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The purchase could not be cancelled.')
    } finally {
      setSaving(false)
    }
  }

  async function submitPayment() {
    if (!paymentSupplier) return
    const amountPaise = parseRupeeInput(paymentAmount)
    if (!amountPaise || amountPaise <= 0) {
      toast.error('Enter a valid payment amount.')
      return
    }
    setSaving(true)
    try {
      const result = await recordSupplierPayment({
        requestId,
        supplierId: paymentSupplier.id,
        outletId,
        amountPaise,
        mode: paymentMode,
        reference: paymentReference.trim() || undefined,
        paidAt: new Date(paymentDate).toISOString(),
        notes: paymentNotes.trim() || undefined,
      })
      toast.success(`Supplier payment ${result.paymentNumber} recorded.`)
      setRequestId(uniqueId())
      setPaymentSupplier(null)
      setPaymentAmount('')
      setPaymentReference('')
      setPaymentNotes('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The supplier payment could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  async function submitVoid() {
    if (!voidTarget) return
    setSaving(true)
    try {
      await voidSupplierPayment({ paymentId: voidTarget.id, reason: voidReason.trim() })
      toast.success('Supplier payment voided. The original record is retained.')
      setVoidTarget(null)
      setVoidReason('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The payment could not be voided.')
    } finally {
      setSaving(false)
    }
  }

  const purchaseColumns: DataColumn<Purchase>[] = [
    {
      key: 'number',
      header: 'Voucher',
      accessor: (purchase) => purchase.purchaseNumber,
      sortable: true,
      render: (purchase) => (
        <div>
          <p className="font-semibold text-ink-900">{purchase.purchaseNumber}</p>
          <p className="text-[11px] text-ink-500">{purchase.supplierName} · invoice {purchase.invoiceNumber}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Received',
      accessor: (purchase) => purchase.receivedAt,
      sortable: true,
      render: (purchase) => (
        <div>
          <p className="text-xs font-medium text-ink-800">{formatDateShort(purchase.receivedAt)}</p>
          <p className="text-[11px] text-ink-500">{GST_TREATMENT_LABELS[purchase.taxTreatment]}</p>
        </div>
      ),
    },
    {
      key: 'taxable',
      header: 'Taxable',
      accessor: (purchase) => purchase.taxablePaise,
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (purchase) => formatINR(purchase.taxablePaise),
    },
    {
      key: 'tax',
      header: 'Tax',
      accessor: (purchase) => purchase.taxPaise,
      sortable: true,
      align: 'right',
      hideBelow: 'lg',
      render: (purchase) => (
        <div className="text-right">
          <p>{formatINR(purchase.taxPaise)}</p>
          <p className="text-[10px] text-ink-500">
            {purchase.igstPaise > 0 ? 'IGST' : purchase.taxPaise > 0 ? 'CGST + SGST' : 'No tax'}
          </p>
        </div>
      ),
    },
    {
      key: 'payable',
      header: 'Payable',
      accessor: (purchase) => purchase.payablePaise,
      sortable: true,
      align: 'right',
      render: (purchase) => <span className="font-semibold text-ink-900">{formatINR(purchase.payablePaise)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (purchase) => purchase.status,
      render: (purchase) => (
        <Badge tone={purchase.status === 'posted' ? 'success' : 'neutral'}>
          {purchase.status === 'posted' ? 'Posted' : 'Cancelled'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Purchases & GST"
        title="Purchase vouchers"
        description="Post supplier invoices with per-line tax treatment, mixed rates and stock receipts. Totals and stock are calculated by the trusted backend."
        help="purchases-gst"
        actions={
          canManage ? (
            <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
              <Link to="/admin/purchases/new">New purchase</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Payable" value={formatINR(summary.payable)} hint={`${summary.count} posted vouchers`} icon={<ReceiptText className="h-4 w-4" />} loading={purchases.loading} />
        <StatCard label="Input tax" value={formatINR(summary.tax)} hint="Tax recorded on posted vouchers" icon={<BadgeIndianRupee className="h-4 w-4" />} tone="gold" loading={purchases.loading} />
        <StatCard label="Reverse charge" value={formatINR(summary.rcm)} hint="Buyer liability, not paid to supplier" icon={<AlertTriangle className="h-4 w-4" />} tone="brand" loading={purchases.loading} />
        <StatCard label="Supplier outstanding" value={formatINR(outstandingTotal)} hint={outletWide ? `${ledgers.filter((ledger) => ledger.outstandingPaise > 0).length} suppliers` : 'Outlet-wide roles only'} icon={<WalletCards className="h-4 w-4" />} tone="sage" loading={purchases.loading} />
      </div>

      <Tabs
        tabs={[
          { id: 'vouchers', label: 'Vouchers', icon: <ReceiptText className="h-4 w-4" /> },
          ...(outletWide ? [{ id: 'suppliers', label: 'Suppliers', icon: <Truck className="h-4 w-4" /> }] : []),
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'vouchers' | 'suppliers')}
      />

      {tab === 'vouchers' ? (
        <DataTable
          rows={rows}
          columns={purchaseColumns}
          getRowId={(purchase) => purchase.id}
          loading={purchases.loading}
          error={purchases.error}
          onRetry={purchases.reload}
          searchPlaceholder="Search voucher, supplier or invoice…"
          searchFields={(purchase) => [purchase.purchaseNumber, purchase.supplierName, purchase.invoiceNumber]}
          emptyTitle="No purchase vouchers"
          emptyDescription="Post a supplier invoice to record tax, stock and supplier balances."
          exportFilename="purchase-vouchers"
          exportDate={(purchase) => purchase.receivedAt}
          onRowClick={(purchase) => setSelectedPurchase(purchase)}
          rowActions={(purchase) => (
            <Button size="sm" variant="outline" onClick={() => setSelectedPurchase(purchase)}>
              View
            </Button>
          )}
          mobileTitle={(purchase) => purchase.purchaseNumber}
          mobileSubtitle={(purchase) => `${purchase.supplierName} · ${formatINR(purchase.payablePaise)}`}
          mobileMeta={(purchase) => <Badge tone={purchase.status === 'posted' ? 'success' : 'neutral'}>{purchase.status}</Badge>}
          toolbar={
            <select className="field-input h-9 w-auto text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          }
        />
      ) : (
        <section className="surface-card p-4 sm:p-5">
          <SectionHeading
            title="Supplier outstanding"
            description="Opening payable plus posted purchases minus posted supplier payments. Cancelled vouchers and voided payments are excluded."
            actions={
              <CsvExportButton
                filename="supplier-outstanding"
                rows={ledgers}
                columns={[
                  { key: 'supplier', header: 'Supplier', value: (row) => row.supplierName },
                  { key: 'opening', header: 'Opening (₹)', value: (row) => (row.openingPaise / 100).toFixed(2) },
                  { key: 'purchased', header: 'Purchased (₹)', value: (row) => (row.purchasedPaise / 100).toFixed(2) },
                  { key: 'paid', header: 'Paid (₹)', value: (row) => (row.paidPaise / 100).toFixed(2) },
                  { key: 'outstanding', header: 'Outstanding (₹)', value: (row) => (row.outstandingPaise / 100).toFixed(2) },
                ]}
                title="Export supplier outstanding"
                description="Opening payable plus posted purchases minus posted supplier payments. Values are working figures."
              />
            }
          />
          {ledgers.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No supplier accounts" description="Create a customer account with the supplier group, then post purchases against it." />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200">
              <table className="min-w-full text-sm">
                <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Supplier</th>
                    <th className="px-3 py-2 text-right font-semibold">Opening</th>
                    <th className="px-3 py-2 text-right font-semibold">Purchased</th>
                    <th className="px-3 py-2 text-right font-semibold">Paid</th>
                    <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {ledgers.map((ledger) => (
                    <tr key={ledger.supplierId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-900">{ledger.supplierName}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{formatINR(ledger.openingPaise)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(ledger.purchasedPaise)}</td>
                      <td className="px-3 py-2 text-right text-sage-700">{formatINR(ledger.paidPaise)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${ledger.outstandingPaise > 0 ? 'text-brand-700' : 'text-ink-900'}`}>
                        {formatINR(ledger.outstandingPaise)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<BookOpen className="h-3.5 w-3.5" />}
                            onClick={() => setLedgerSupplier(suppliers.find((supplier) => supplier.id === ledger.supplierId) ?? null)}
                          >
                            Ledger
                          </Button>
                          {canFinance && (
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={() => {
                                setPaymentSupplier(suppliers.find((supplier) => supplier.id === ledger.supplierId) ?? null)
                                setPaymentAmount('')
                              }}
                            >
                              Pay
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!outletWide && (
            <p className="mt-3 text-[11px] text-ink-500">
              Supplier payments are visible to outlet-wide managers and accountants only.
            </p>
          )}
        </section>
      )}

      <Dialog
        open={Boolean(selectedPurchase)}
        onOpenChange={(open) => !open && setSelectedPurchase(null)}
        title={selectedPurchase?.purchaseNumber ?? 'Purchase'}
        description={selectedPurchase ? `${selectedPurchase.supplierName} · invoice ${selectedPurchase.invoiceNumber}` : undefined}
        size="xl"
        footer={
          selectedPurchase?.status === 'posted' && canManage ? (
            <Button
              variant="danger"
              leftIcon={<Ban className="h-4 w-4" />}
              onClick={() => {
                setCancelTarget(selectedPurchase)
                setCancelReason('')
              }}
            >
              Cancel voucher
            </Button>
          ) : undefined
        }
      >
        {selectedPurchase && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Treatment</p>
                <p className="mt-1 text-sm font-medium text-ink-900">{GST_TREATMENT_LABELS[selectedPurchase.taxTreatment]}</p>
                <p className="text-[11px] text-ink-500">{SUPPLY_TYPE_LABELS[selectedPurchase.supplyType]}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Invoice date</p>
                <p className="mt-1 text-sm font-medium text-ink-900">{formatDateShort(selectedPurchase.invoiceDate)}</p>
                <p className="text-[11px] text-ink-500">Received {formatDateShort(selectedPurchase.receivedAt)}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">ITC</p>
                <p className="mt-1 text-sm font-medium text-ink-900">{selectedPurchase.itcClaimable ? 'Claimable' : 'Not claimed'}</p>
                <p className="text-[11px] text-ink-500">{selectedPurchase.reverseCharge ? 'Reverse charge' : 'Supplier invoice'}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Posted by</p>
                <p className="mt-1 text-sm font-medium text-ink-900">{selectedPurchase.actorName}</p>
                <p className="text-[11px] text-ink-500">{formatDateTime(selectedPurchase.createdAt)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="min-w-full text-sm">
                <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold">Disc</th>
                    <th className="px-3 py-2 text-right font-semibold">Taxable</th>
                    <th className="px-3 py-2 text-right font-semibold">Tax</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {selectedPurchase.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-900">{line.name}</p>
                        <p className="text-[11px] text-ink-500">
                          {line.itemType === 'inventory' ? 'Inventory' : 'Product'} · {line.unit}
                          {line.hsn ? ` · HSN ${line.hsn}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatINR(line.ratePaise)}</td>
                      <td className="px-3 py-2 text-right">{line.discountPercent}%</td>
                      <td className="px-3 py-2 text-right">{formatINR(line.taxablePaise)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatINR(line.taxPaise)}
                        <span className="ml-1 text-[10px] text-ink-500">{line.taxPercent}%</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatINR(line.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Subtotal</dt><dd>{formatINR(selectedPurchase.subtotalPaise)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Discount</dt><dd>−{formatINR(selectedPurchase.discountPaise)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Taxable value</dt><dd>{formatINR(selectedPurchase.taxablePaise)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">CGST</dt><dd>{formatINR(selectedPurchase.cgstPaise)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">SGST</dt><dd>{formatINR(selectedPurchase.sgstPaise)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">IGST</dt><dd>{formatINR(selectedPurchase.igstPaise)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-ink-200 pt-1.5 font-semibold"><dt>Voucher total</dt><dd>{formatINR(selectedPurchase.totalPaise)}</dd></div>
              <div className="flex justify-between gap-4 font-semibold text-brand-700"><dt>Payable to supplier</dt><dd>{formatINR(selectedPurchase.payablePaise)}</dd></div>
              {selectedPurchase.rcmTaxPaise > 0 && (
                <div className="flex justify-between gap-4 text-[12px] text-gold-800"><dt>Reverse-charge tax (buyer liability)</dt><dd>{formatINR(selectedPurchase.rcmTaxPaise)}</dd></div>
              )}
            </dl>

            {selectedPurchase.status === 'cancelled' && (
              <div className="rounded-lg border border-ink-200 bg-ivory-50 p-3 text-sm text-ink-700">
                <p className="font-semibold">Cancelled {selectedPurchase.cancelledAt ? formatDateTime(selectedPurchase.cancelledAt) : ''}</p>
                <p className="mt-1 text-xs">{selectedPurchase.cancelReason}</p>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel purchase voucher"
        description="Cancelling reverses the stock receipt. It is refused if the stock has already been issued and the balance would go negative."
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep voucher</Button>
            <Button variant="danger" loading={saving} onClick={submitCancel}>Cancel voucher</Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          rows={3}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Dialog>

      <Dialog
        open={Boolean(ledgerSupplier)}
        onOpenChange={(open) => !open && setLedgerSupplier(null)}
        title={ledgerSupplier?.name ?? 'Supplier ledger'}
        description={activeLedger ? `Outstanding ${formatINR(activeLedger.outstandingPaise)}` : undefined}
        size="lg"
        footer={
          canFinance && ledgerSupplier ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setPaymentSupplier(ledgerSupplier)
                setPaymentAmount('')
                setLedgerSupplier(null)
              }}
            >
              Record payment
            </Button>
          ) : undefined
        }
      >
        {activeLedger && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <CsvExportButton
                filename={`supplier-ledger-${activeLedger.supplierId}`}
                rows={activeLedger.entries}
                columns={[
                  { key: 'date', header: 'Date', value: (entry) => entry.date || '' },
                  { key: 'reference', header: 'Reference', value: (entry) => entry.reference },
                  { key: 'type', header: 'Entry type', value: (entry) => entry.type },
                  { key: 'debit', header: 'Debit (₹)', value: (entry) => (entry.debitPaise / 100).toFixed(2) },
                  { key: 'credit', header: 'Credit (₹)', value: (entry) => (entry.creditPaise / 100).toFixed(2) },
                  { key: 'balance', header: 'Balance (₹)', value: (entry) => (entry.balancePaise / 100).toFixed(2) },
                ]}
                title="Export supplier ledger"
                description="The current supplier statement. Opening balance rows have no date, so this export is not date-filtered."
              />
            </div>
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="min-w-full text-sm">
                <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Reference</th>
                    <th className="px-3 py-2 text-right font-semibold">Debit</th>
                    <th className="px-3 py-2 text-right font-semibold">Credit</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {activeLedger.entries.map((entry) => {
                    const payment = entry.type === 'payment' ? payments.rows.find((item) => item.id === entry.id) : undefined
                    return (
                      <tr key={`${entry.type}-${entry.id}`}>
                        <td className="px-3 py-2 text-xs">{entry.date ? formatDateShort(entry.date) : '—'}</td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium text-ink-800">{entry.reference}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-ink-400">{entry.type}</span>
                            {payment?.status === 'posted' && canFinance && (
                              <button
                                type="button"
                                className="text-[10px] font-semibold text-brand-700 hover:underline"
                                onClick={() => {
                                  setVoidTarget(payment)
                                  setVoidReason('')
                                }}
                              >
                                Void
                              </button>
                            )}
                            {payment?.status === 'void' && <span className="text-[10px] text-ink-400">Voided</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{entry.debitPaise ? formatINR(entry.debitPaise) : '—'}</td>
                        <td className="px-3 py-2 text-right">{entry.creditPaise ? formatINR(entry.creditPaise) : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatINR(entry.balancePaise)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-500">
              Supplier payments are recorded in a separate money-out ledger. They do not affect
              customer cash sessions. Opening balance is treated as an opening payable.
            </p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(paymentSupplier)}
        onOpenChange={(open) => !open && setPaymentSupplier(null)}
        title="Record supplier payment"
        description={paymentSupplier?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentSupplier(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitPayment}>Record payment</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Amount"
            required
            inputMode="decimal"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            placeholder="0.00"
          />
          <SelectField
            label="Mode"
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI' },
              { value: 'card', label: 'Card' },
              { value: 'bank_transfer', label: 'Bank transfer' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <TextField
            label="Paid at"
            type="datetime-local"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
          <TextField
            label="Reference"
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
            placeholder="UTR, cheque number…"
          />
          <TextareaField
            label="Notes"
            rows={2}
            containerClassName="sm:col-span-2"
            value={paymentNotes}
            onChange={(event) => setPaymentNotes(event.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(voidTarget)}
        onOpenChange={(open) => !open && setVoidTarget(null)}
        title="Void supplier payment"
        description="The payment stays in history with a void marker. It no longer reduces the supplier balance."
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={saving} onClick={submitVoid}>Void payment</Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          rows={3}
          value={voidReason}
          onChange={(event) => setVoidReason(event.target.value)}
        />
      </Dialog>
    </div>
  )
}
