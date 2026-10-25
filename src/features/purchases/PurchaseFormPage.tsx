import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { canAccessDepartment } from '@/auth/permissions'
import { useCollectionData, useDocumentData } from '@/data/hooks'
import { useProductCatalogue } from '@/data/productCatalogue'
import { customersQuery } from '@/data/queries'
import { inventoryItemsQuery } from '@/data/operationsQueries'
import { postPurchase } from '@/data/purchases'
import { productEligibility, productStockState } from '@/lib/productCatalogue'
import {
  computePurchaseLine,
  deriveSupplyType,
  GST_TREATMENT_LABELS,
  isTaxableTreatment,
  PURCHASE_TAX_TREATMENTS,
  purchaseTotals,
  SUPPLY_TYPE_LABELS,
} from '@/lib/gst'
import { uniqueId } from '@/lib/utils'
import type {
  Business,
  Customer,
  GstSupplyType,
  InventoryItem,
  PurchaseTaxTreatment,
} from '@/types/models'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CheckboxField, SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/States'
import { formatINR, parseRupeeInput } from '@/lib/format'

interface DraftLine {
  key: string
  itemType: 'inventory' | 'product'
  itemId: string
  quantity: string
  rate: string
  discount: string
  tax: string
  taxInclusive: boolean
}

function blankLine(): DraftLine {
  return {
    key: uniqueId(),
    itemType: 'inventory',
    itemId: '',
    quantity: '1',
    rate: '',
    discount: '0',
    tax: '',
    taxInclusive: false,
  }
}

export function PurchaseFormPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const navigate = useNavigate()
  const outletId = selectedOutletId ?? ''

  const allowedDepartments = useMemo(
    () => departments.filter((department) => canAccessDepartment(profile, department.id) && department.active !== false),
    [departments, profile],
  )

  const [departmentId, setDepartmentId] = useState('')
  const activeDepartmentId = departmentId || allowedDepartments[0]?.id || ''
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [receivedAt, setReceivedAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [taxTreatment, setTaxTreatment] = useState<PurchaseTaxTreatment>('regular')
  const [supplyType, setSupplyType] = useState<GstSupplyType>('intra_state')
  const [itcClaimable, setItcClaimable] = useState(true)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [saving, setSaving] = useState(false)
  const [requestId] = useState(() => uniqueId())

  const business = useDocumentData<Business>('business/main')

  const customers = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, 500) : null),
    [outletId],
    Boolean(outletId),
  )
  const inventoryItems = useCollectionData<InventoryItem>(
    () => (profile && outletId ? inventoryItemsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const products = useProductCatalogue(profile, outletId)

  const suppliers = useMemo(
    () => customers.rows.filter((customer) => customer.accountGroup === 'supplier' && customer.active),
    [customers.rows],
  )
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null

  const itemOptions = useMemo(
    () => ({
      inventory: inventoryItems.rows.filter(
        (item) => item.active && item.departmentId === activeDepartmentId,
      ),
      // Finished products are shown across departments so a product is never
      // silently missing. Selecting one from another department switches the
      // voucher department before a line is entered.
      products: products.rows.filter((product) => product.active),
    }),
    [inventoryItems.rows, products.rows, activeDepartmentId],
  )

  const computed = useMemo(
    () =>
      lines.map((line) =>
        computePurchaseLine({
          quantity: Number(line.quantity) || 0,
          ratePaise: parseRupeeInput(line.rate) ?? 0,
          discountPercent: Number(line.discount) || 0,
          taxPercent: Number(line.tax) || 0,
          taxInclusive: line.taxInclusive,
          treatment: taxTreatment,
          supplyType,
        }),
      ),
    [lines, taxTreatment, supplyType],
  )

  const totals = useMemo(() => purchaseTotals(computed), [computed])
  const taxable = isTaxableTreatment(taxTreatment)

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function chooseSupplier(id: string) {
    setSupplierId(id)
    const supplier = suppliers.find((candidate) => candidate.id === id)
    setSupplyType(deriveSupplyType(business.data?.state, supplier?.state, supplyType))
  }

  function chooseItem(line: DraftLine, itemId: string) {
    if (!itemId) {
      updateLine(line.key, { itemId: '' })
      return
    }
    if (line.itemType === 'product') {
      const product = products.rows.find((candidate) => candidate.id === itemId)
      if (!product) {
        updateLine(line.key, { itemId: '' })
        return
      }
      const eligibility = productEligibility(product, 'purchase')
      if (!eligibility.selectable) {
        toast.error(`${product.name}: ${eligibility.reason ?? 'This product cannot be purchased.'}`)
        updateLine(line.key, { itemId: '' })
        return
      }
      if (product.departmentId !== activeDepartmentId) {
        const hasOtherLines = lines.some((candidate) => candidate.key !== line.key && candidate.itemId)
        if (hasOtherLines) {
          const department = departments.find((candidate) => candidate.id === product.departmentId)?.name ?? 'another department'
          toast.error(`${product.name} belongs to ${department}. Post a separate voucher for that department.`)
          updateLine(line.key, { itemId: '' })
          return
        }
        setDepartmentId(product.departmentId)
        const department = departments.find((candidate) => candidate.id === product.departmentId)?.name ?? 'the product department'
        toast.info(`Voucher department switched to ${department} for ${product.name}.`)
      }
      updateLine(line.key, {
        itemId,
        rate: product.purchasePricePaise ? (product.purchasePricePaise / 100).toFixed(2) : line.rate,
        tax: product.taxPercent !== undefined ? String(product.taxPercent) : line.tax,
      })
      return
    }
    updateLine(line.key, { itemId })
  }

  function changeDepartment(id: string) {
    setDepartmentId(id)
    setLines([blankLine()])
  }

  async function submit() {
    if (!profile || !outletId) return
    if (!activeDepartmentId) {
      toast.error('Choose a department for this purchase.')
      return
    }
    if (taxTreatment !== 'stock_transfer' && !supplierId) {
      toast.error('Choose a supplier, or use stock transfer.')
      return
    }
    if (!invoiceNumber.trim()) {
      toast.error('Enter the supplier invoice number.')
      return
    }
    const prepared = lines.filter((line) => line.itemId && Number(line.quantity) > 0)
    if (prepared.length === 0) {
      toast.error('Add at least one item with a quantity.')
      return
    }
    if (prepared.some((line) => !line.rate.trim())) {
      toast.error('Enter a rate for every item.')
      return
    }

    setSaving(true)
    try {
      const result = await postPurchase({
        requestId,
        outletId,
        departmentId: activeDepartmentId,
        supplierId: taxTreatment === 'stock_transfer' ? undefined : supplierId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(`${invoiceDate}T00:00:00`).toISOString(),
        receivedAt: new Date(receivedAt).toISOString(),
        taxTreatment,
        supplyType,
        itcClaimable: taxable ? itcClaimable : false,
        notes: notes.trim() || undefined,
        lines: prepared.map((line) => ({
          itemType: line.itemType,
          itemId: line.itemId,
          quantity: Number(line.quantity),
          ratePaise: parseRupeeInput(line.rate) ?? 0,
          discountPercent: Number(line.discount) || 0,
          taxPercent: taxable ? Number(line.tax) || 0 : 0,
          taxInclusive: line.taxInclusive,
        })),
      })
      toast.success(`Purchase ${result.purchaseNumber} posted. Stock and supplier balance updated.`)
      navigate('/admin/purchases')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The purchase could not be posted.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Purchases & GST"
        title="New purchase voucher"
        description="Record the supplier invoice, tax treatment and stock receipt. The backend recalculates every amount from the persisted item, supplier and business records."
        help="purchases-gst"
        actions={
          <Button variant="ghost" asChild leftIcon={<ArrowLeft className="h-4 w-4" />}>
            <Link to="/admin/purchases">Back to purchases</Link>
          </Button>
        }
      />

      <section className="surface-card p-4 sm:p-5">
        <SectionHeading title="Voucher details" description="One department per voucher, matching stock ownership." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Department"
            required
            value={activeDepartmentId}
            onChange={(event) => changeDepartment(event.target.value)}
            placeholder="Choose a department"
            options={allowedDepartments.map((department) => ({ value: department.id, label: department.name }))}
          />
          <SelectField
            label="Tax treatment"
            required
            value={taxTreatment}
            onChange={(event) => {
              const next = event.target.value as PurchaseTaxTreatment
              setTaxTreatment(next)
              if (!isTaxableTreatment(next)) setItcClaimable(false)
            }}
            options={PURCHASE_TAX_TREATMENTS.map((treatment) => ({
              value: treatment,
              label: GST_TREATMENT_LABELS[treatment],
            }))}
          />
          <SelectField
            label="Supply type"
            value={supplyType}
            onChange={(event) => setSupplyType(event.target.value as GstSupplyType)}
            hint={
              business.data?.state && selectedSupplier?.state
                ? `Business ${business.data.state} · supplier ${selectedSupplier.state}`
                : 'Choose the place of supply. Unknown states cannot be inferred.'
            }
            options={[
              { value: 'intra_state', label: SUPPLY_TYPE_LABELS.intra_state },
              { value: 'inter_state', label: SUPPLY_TYPE_LABELS.inter_state },
            ]}
          />
          <SelectField
            label="Supplier"
            required={taxTreatment !== 'stock_transfer'}
            value={supplierId}
            onChange={(event) => chooseSupplier(event.target.value)}
            disabled={taxTreatment === 'stock_transfer'}
            placeholder={taxTreatment === 'stock_transfer' ? 'Not applicable for stock transfer' : 'Choose a supplier'}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.gstin ? `${supplier.name} · ${supplier.gstin}` : supplier.name,
            }))}
            hint={selectedSupplier?.state ? `Supplier state: ${selectedSupplier.state}` : undefined}
          />
          <TextField
            label="Supplier invoice number"
            required
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            placeholder="INV-2026-001"
          />
          <TextField
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
          />
          <TextField
            label="Goods received at"
            type="datetime-local"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
          />
          <div className="flex items-end">
            <CheckboxField
              label="Input tax credit claimable"
              checked={itcClaimable && taxable}
              disabled={!taxable}
              onChange={(event) => setItcClaimable(event.target.checked)}
            />
          </div>
        </div>
        <TextareaField
          className="mt-3"
          label="Notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Vehicle, GRN, quality notes…"
        />
        {taxTreatment === 'reverse_charge' && (
          <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-[11px] leading-relaxed text-gold-900">
            Reverse charge: the supplier charges no tax. Tax is calculated for the voucher but is
            excluded from the amount payable to the supplier; it is the business's own liability.
          </p>
        )}
        {taxTreatment === 'stock_transfer' && (
          <p className="mt-2 rounded-lg bg-ivory-100 px-3 py-2 text-[11px] leading-relaxed text-ink-600">
            Stock transfer: no supplier and no payable. The voucher records the goods value and
            increases stock. Supplier balances are not affected.
          </p>
        )}
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Items" description="Each line can have its own rate, discount, tax rate and inclusive/exclusive pricing." />
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            Add line
          </Button>
        </div>

        {!activeDepartmentId ? (
          <div className="mt-4">
            <EmptyState title="Choose a department" description="Inventory and products are loaded for the selected department." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {lines.map((line, index) => {
              const result = computed[index]
              const options = line.itemType === 'inventory'
                ? itemOptions.inventory.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.currentQty} ${item.unit}`,
                  }))
                : itemOptions.products.map((product) => {
                    const eligibility = productEligibility(product, 'purchase')
                    const stock = productStockState(product)
                    const department = departments.find((item) => item.id === product.departmentId)?.name
                    return {
                      value: product.id,
                      disabled: !eligibility.selectable,
                      label: [
                        product.name,
                        `${stock.qty ?? 0} ${product.unit}`,
                        department,
                        product.departmentId !== activeDepartmentId ? '(switch department)' : null,
                        eligibility.reason,
                      ].filter(Boolean).join(' · '),
                    }
                  })
              return (
                <div key={line.key} className="rounded-xl border border-ink-200 p-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
                    <SelectField
                      label="Item type"
                      containerClassName="xl:col-span-2"
                      value={line.itemType}
                      onChange={(event) =>
                        updateLine(line.key, {
                          itemType: event.target.value as 'inventory' | 'product',
                          itemId: '',
                        })
                      }
                      options={[
                        { value: 'inventory', label: 'Inventory / raw material' },
                        { value: 'product', label: 'Finished product' },
                      ]}
                    />
                    <SelectField
                      label={`Item ${index + 1}`}
                      containerClassName="xl:col-span-4"
                      value={line.itemId}
                      onChange={(event) => chooseItem(line, event.target.value)}
                      placeholder={options.length === 0 ? 'No eligible items in this department' : 'Choose an item'}
                      options={options}
                    />
                    <TextField
                      label="Quantity"
                      containerClassName="xl:col-span-1"
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                    <TextField
                      label="Rate"
                      containerClassName="xl:col-span-1"
                      inputMode="decimal"
                      value={line.rate}
                      onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                      placeholder="0.00"
                    />
                    <TextField
                      label="Discount %"
                      containerClassName="xl:col-span-1"
                      type="number"
                      min={0}
                      max={100}
                      value={line.discount}
                      onChange={(event) => updateLine(line.key, { discount: event.target.value })}
                    />
                    <TextField
                      label="Tax %"
                      containerClassName="xl:col-span-1"
                      type="number"
                      min={0}
                      max={100}
                      value={line.tax}
                      disabled={!taxable}
                      onChange={(event) => updateLine(line.key, { tax: event.target.value })}
                    />
                    <div className="flex items-end gap-2 xl:col-span-2">
                      <CheckboxField
                        label="Rate includes tax"
                        checked={line.taxInclusive}
                        disabled={!taxable}
                        onChange={(event) => updateLine(line.key, { taxInclusive: event.target.checked })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove line"
                        onClick={() => setLines((current) => (current.length === 1 ? [blankLine()] : current.filter((candidate) => candidate.key !== line.key)))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
                    <span>Taxable {formatINR(result.taxablePaise)}</span>
                    <span>Tax {formatINR(result.taxPaise)}</span>
                    <span className="font-semibold text-ink-700">Line total {formatINR(result.totalPaise)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-card p-4 sm:p-5">
          <SectionHeading title="How the totals are built" />
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-ink-600">
            <li>Quantity × rate, less discount, gives the line value.</li>
            <li>
              {taxable
                ? 'Tax is applied at the line rate. Inclusive rates are split back into taxable value and tax.'
                : 'This treatment carries no supplier tax, so every line is recorded at taxable value.'}
            </li>
            <li>
              {supplyType === 'inter_state'
                ? 'Inter-state supply is recorded as IGST.'
                : 'Intra-state supply is split into CGST and SGST, with any rounding paise assigned to SGST.'}
            </li>
            <li>Exempt, nil-rated, zero-rated and stock-transfer vouchers are stored as entered and reported separately.</li>
          </ul>
        </div>

        <aside className="surface-card p-4 sm:p-5">
          <SectionHeading title="Voucher total" />
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-500">Subtotal</dt><dd>{formatINR(totals.subtotalPaise)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">Discount</dt><dd>−{formatINR(totals.discountPaise)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">Taxable value</dt><dd>{formatINR(totals.taxablePaise)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">CGST</dt><dd>{formatINR(totals.cgstPaise)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">SGST</dt><dd>{formatINR(totals.sgstPaise)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">IGST</dt><dd>{formatINR(totals.igstPaise)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-ink-200 pt-1.5 font-semibold"><dt>Voucher total</dt><dd>{formatINR(totals.totalPaise)}</dd></div>
            <div className="flex justify-between gap-4 font-semibold text-brand-700"><dt>Payable to supplier</dt><dd>{formatINR(totals.payablePaise)}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="neutral">{selectedOutlet?.name ?? 'Outlet'}</Badge>
            <Badge tone={taxable ? 'success' : 'warning'}>{GST_TREATMENT_LABELS[taxTreatment]}</Badge>
          </div>
          <Button
            className="mt-4 w-full"
            loading={saving}
            disabled={!activeDepartmentId || lines.every((line) => !line.itemId)}
            leftIcon={<Save className="h-4 w-4" />}
            onClick={submit}
          >
            Post purchase voucher
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Posting increases inventory or product stock, records the supplier payable and cannot be
            edited afterwards. Use cancellation to reverse a posted voucher.
          </p>
        </aside>
      </div>
    </div>
  )
}
