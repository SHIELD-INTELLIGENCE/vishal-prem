import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Printer, ScanBarcode, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { canAccessDepartment, hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { useProductCatalogue } from '@/data/productCatalogue'
import { customersQuery } from '@/data/queries'
import { createLabelJob, newRequestId, templateFromSetup } from '@/data/labels'
import { defaultLabelTemplate, LABEL_DIMENSION_LIMITS } from '@/lib/labels'
import {
  productBarcodeValue,
  productEligibility,
  productIdentity,
  productMatchesSearch,
  productStockState,
} from '@/lib/productCatalogue'
import type { Customer, LabelType, Product } from '@/types/models'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/States'
import {
  CheckboxField,
  SelectField,
  TextField,
} from '@/components/ui/Field'
import { formatINR } from '@/lib/format'
import { LabelSheet, type LabelPreviewLine } from './LabelSheet'

const PREVIEW_ITEMS = 2

interface LabelLineDetails {
  batchNumber?: string
  manufacturedAt?: string
  expiryAt?: string
  netQuantity?: string
}

export function LabelPrintSetupPage({ jobType }: { jobType: LabelType }) {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const navigate = useNavigate()

  const outletId = selectedOutletId ?? ''
  const canManage = hasPermission(profile, 'labelsManage')

  const allowedDepartments = useMemo(
    () => departments.filter((department) => canAccessDepartment(profile, department.id) && department.active !== false),
    [departments, profile],
  )

  const [departmentId, setDepartmentId] = useState('all')
  const selectedDepartmentId = departmentId === 'all' ? '' : departmentId

  const products = useProductCatalogue(
    profile,
    outletId,
    jobType === 'item',
  )
  const customers = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, 500) : null),
    [outletId],
    Boolean(outletId && jobType === 'account'),
  )

  const defaults = useMemo(() => defaultLabelTemplate(jobType), [jobType])
  const [template, setTemplate] = useState(() => defaults)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [details, setDetails] = useState<Record<string, LabelLineDetails>>({})
  const [saving, setSaving] = useState(false)
  const requestId = useRef(newRequestId())

  const candidates = useMemo(() => {
    if (jobType === 'item') {
      return products.rows
        .filter((product) =>
          productEligibility(product, 'label', { departmentId: selectedDepartmentId }).visible,
        )
        .filter((product) => productMatchesSearch(product, search))
    }
    const term = search.trim().toLowerCase()
    return customers.rows
      .filter((customer) => customer.active)
      .filter((customer) =>
        !term
        || customer.name.toLowerCase().includes(term)
        || customer.phone.includes(term)
        || (customer.gstin ?? '').toLowerCase().includes(term),
      )
  }, [jobType, products.rows, customers.rows, selectedDepartmentId, search])

  const selectedItems = useMemo(() => {
    const source: Array<Product | Customer> = jobType === 'item' ? products.rows : customers.rows
    return source.filter((item) => selected[item.id] !== undefined)
  }, [jobType, products.rows, customers.rows, selected])

  const selectedIds = Object.keys(selected)
  const requestedTotal = Object.values(selected).reduce((sum, value) => sum + value, 0)
  const loading = jobType === 'item' ? products.loading : customers.loading

  function previewLine(item: Product | Customer): LabelPreviewLine {
    if (jobType === 'item') {
      const product = item as Product
      const lineDetails = details[product.id]
      const sku = productIdentity(product)
      return {
        lineId: product.id,
        name: product.printName || product.name,
        sku,
        barcodeValue: productBarcodeValue(product, template.barcodeFormat),
        unit: product.unit,
        netQuantity: lineDetails?.netQuantity?.trim() || undefined,
        pricePaise: product.salePricePaise,
        mrpPaise: product.mrpPaise,
        batchNumber: lineDetails?.batchNumber?.trim() || undefined,
        manufacturedAt: lineDetails?.manufacturedAt || undefined,
        expiryAt: lineDetails?.expiryAt || undefined,
        quantity: 1,
      }
    }
    const customer = item as Customer
    const address = customer.addresses?.[0]
    return {
      lineId: customer.id,
      name: customer.name,
      sku: customer.phone || customer.id,
      barcodeValue: template.barcodeFormat === 'none' ? '' : customer.id,
      addressLine: address
        ? [address.line1, address.city, address.pin].filter(Boolean).join(', ')
        : undefined,
      phone: customer.phone,
      quantity: 1,
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = { ...current }
      if (next[id] !== undefined) {
        delete next[id]
        setDetails((existing) => {
          const copy = { ...existing }
          delete copy[id]
          return copy
        })
      } else next[id] = 1
      return next
    })
  }

  function updateDetail(id: string, patch: Partial<LabelLineDetails>) {
    setDetails((current) => ({
      ...current,
      [id]: { ...(current[id] ?? {}), ...patch },
    }))
  }

  function setQuantity(id: string, raw: string) {
    const value = Math.max(1, Math.min(500, Math.floor(Number(raw) || 1)))
    setSelected((current) => ({ ...current, [id]: value }))
  }

  async function submit() {
    if (!profile || !outletId) return
    if (selectedIds.length === 0) {
      toast.error('Select at least one product or account.')
      return
    }

    let jobDepartmentId = selectedDepartmentId
    const productLines = jobType === 'item'
      ? selectedIds
          .map((id) => products.rows.find((product) => product.id === id))
          .filter((product): product is Product => Boolean(product))
      : []

    if (jobType === 'item') {
      const departments = new Set(productLines.map((product) => product.departmentId))
      if (!jobDepartmentId) {
        if (departments.size !== 1) {
          toast.error('Choose one department, or select products from a single department.')
          return
        }
        jobDepartmentId = productLines[0]?.departmentId ?? ''
      }
      if (productLines.some((product) => product.departmentId !== jobDepartmentId)) {
        toast.error('One print job can contain products from one department only. Switch department or create a separate job.')
        return
      }

      const missing = productLines.filter((product) => {
        const line = details[product.id] ?? {}
        return (template.showBatch && product.batchTracking && !line.batchNumber?.trim())
          || (template.showExpiryDate && product.expiryTracking && !line.expiryAt)
      })
      if (missing.length > 0) {
        toast.error(`Add the required batch or expiry details for: ${missing.map((product) => product.name).join(', ')}.`)
        return
      }

      const invalidDates = productLines.filter((product) => {
        const line = details[product.id] ?? {}
        return Boolean(line.manufacturedAt && line.expiryAt && line.expiryAt < line.manufacturedAt)
      })
      if (invalidDates.length > 0) {
        toast.error(`Expiry cannot be before the manufacturing date: ${invalidDates.map((product) => product.name).join(', ')}.`)
        return
      }
    }

    setSaving(true)
    try {
      const result = await createLabelJob({
        requestId: requestId.current,
        jobType,
        outletId,
        departmentId: jobType === 'item' ? jobDepartmentId : undefined,
        template: templateFromSetup({
          jobType,
          outletId,
          departmentId: jobDepartmentId,
          templateName: template.name,
          widthMm: template.widthMm,
          heightMm: template.heightMm,
          marginMm: template.marginMm,
          columns: template.columns,
          showName: template.showName,
          showSku: template.showSku,
          showPrice: template.showPrice,
          showMrp: template.showMrp,
          showAddress: template.showAddress,
          showPhone: template.showPhone,
          showUnit: Boolean(template.showUnit),
          showBatch: Boolean(template.showBatch),
          showMfgDate: Boolean(template.showMfgDate),
          showExpiryDate: Boolean(template.showExpiryDate),
          barcodeFormat: template.barcodeFormat,
        }),
        lines: selectedIds.map((id) => ({
          refId: id,
          requestedQty: selected[id],
          ...(jobType === 'item' ? details[id] : {}),
        })),
      })
      requestId.current = newRequestId()
      toast.success(`Print job ${result.jobNumber} created. The print dialog does not confirm output — confirm the printed quantity on the next screen.`)
      navigate(`/admin/print/labels/${result.jobId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The print job could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Printing & labels"
        title={jobType === 'item' ? 'Item & barcode labels' : 'Account labels'}
        description={
          jobType === 'item'
            ? 'Request item labels for one department, confirm what physically printed, then record application, damage and returns.'
            : 'Print account labels for customers and parties. Accounts are outlet-wide, so no department is required.'
        }
        help="label-accountability"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/labels/usage">Label usage</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/labels/reconciliation">Reconciliation</Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Requested and confirmed quantities are separate. The browser print dialog is never
            treated as proof of physical output; this job stays unconfirmed until an operator
            enters what was actually printed.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <section className="surface-card p-4 sm:p-5">
            <SectionHeading
              title="Label layout"
              description="Dimensions are stored on the job so a later reprint uses the same layout."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <TextField
                label="Width (mm)"
                type="number"
                min={LABEL_DIMENSION_LIMITS.widthMm.min}
                max={LABEL_DIMENSION_LIMITS.widthMm.max}
                value={template.widthMm}
                onChange={(event) => setTemplate((current) => ({ ...current, widthMm: Number(event.target.value) || current.widthMm }))}
              />
              <TextField
                label="Height (mm)"
                type="number"
                min={LABEL_DIMENSION_LIMITS.heightMm.min}
                max={LABEL_DIMENSION_LIMITS.heightMm.max}
                value={template.heightMm}
                onChange={(event) => setTemplate((current) => ({ ...current, heightMm: Number(event.target.value) || current.heightMm }))}
              />
              <TextField
                label="Margin (mm)"
                type="number"
                min={LABEL_DIMENSION_LIMITS.marginMm.min}
                max={LABEL_DIMENSION_LIMITS.marginMm.max}
                value={template.marginMm}
                onChange={(event) => setTemplate((current) => ({ ...current, marginMm: Number(event.target.value) || 0 }))}
              />
              <TextField
                label="Columns on sheet"
                type="number"
                min={LABEL_DIMENSION_LIMITS.columns.min}
                max={LABEL_DIMENSION_LIMITS.columns.max}
                value={template.columns}
                onChange={(event) => setTemplate((current) => ({ ...current, columns: Math.min(4, Math.max(1, Number(event.target.value) || 1)) }))}
              />
              <SelectField
                label="Barcode"
                value={template.barcodeFormat}
                onChange={(event) => setTemplate((current) => ({ ...current, barcodeFormat: event.target.value as 'code128' | 'none' }))}
                options={[
                  { value: 'code128', label: 'Code 128B (checksummed)' },
                  { value: 'none', label: 'No barcode' },
                ]}
              />
              {jobType === 'item' && (
                <SelectField
                  label="Department"
                  value={departmentId}
                  onChange={(event) => {
                    setDepartmentId(event.target.value)
                    setSelected({})
                    setDetails({})
                  }}
                  options={[
                    { value: 'all', label: 'All departments (browse)' },
                    ...allowedDepartments.map((department) => ({
                      value: department.id,
                      label: department.name,
                    })),
                  ]}
                />
              )}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {jobType === 'item' ? (
                <>
                  <CheckboxField label="Show product name" checked={template.showName} onChange={(event) => setTemplate((current) => ({ ...current, showName: event.target.checked }))} />
                  <CheckboxField label="Show SKU / code" checked={template.showSku} onChange={(event) => setTemplate((current) => ({ ...current, showSku: event.target.checked }))} />
                  <CheckboxField label="Show selling price" checked={template.showPrice} onChange={(event) => setTemplate((current) => ({ ...current, showPrice: event.target.checked }))} />
                  <CheckboxField label="Show MRP" checked={template.showMrp} onChange={(event) => setTemplate((current) => ({ ...current, showMrp: event.target.checked }))} />
                  <CheckboxField label="Show weight / quantity" checked={template.showUnit} onChange={(event) => setTemplate((current) => ({ ...current, showUnit: event.target.checked }))} />
                  <CheckboxField label="Show batch / lot" checked={template.showBatch} onChange={(event) => setTemplate((current) => ({ ...current, showBatch: event.target.checked }))} />
                  <CheckboxField label="Show manufacturing date" checked={template.showMfgDate} onChange={(event) => setTemplate((current) => ({ ...current, showMfgDate: event.target.checked }))} />
                  <CheckboxField label="Show expiry / use-by date" checked={template.showExpiryDate} onChange={(event) => setTemplate((current) => ({ ...current, showExpiryDate: event.target.checked }))} />
                </>
              ) : (
                <>
                  <CheckboxField label="Show account name" checked={template.showName} onChange={(event) => setTemplate((current) => ({ ...current, showName: event.target.checked }))} />
                  <CheckboxField label="Show phone / account code" checked={template.showSku} onChange={(event) => setTemplate((current) => ({ ...current, showSku: event.target.checked }))} />
                  <CheckboxField label="Show address" checked={template.showAddress} onChange={(event) => setTemplate((current) => ({ ...current, showAddress: event.target.checked }))} />
                  <CheckboxField label="Show phone number" checked={template.showPhone} onChange={(event) => setTemplate((current) => ({ ...current, showPhone: event.target.checked }))} />
                </>
              )}
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <SectionHeading
              title={jobType === 'item' ? 'Choose products' : 'Choose accounts'}
              description="Only active records visible at this outlet are listed."
            />
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={jobType === 'item' ? 'Search by name or SKU' : 'Search by name, phone or GSTIN'}
                className="field-input pl-9"
                aria-label="Search records"
              />
            </div>

            {loading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No matching records"
                  description={
                    jobType === 'item'
                      ? 'No active product matches this department and search.'
                      : 'No active account matches this search.'
                  }
                />
              </div>
            ) : (
              <ul className="mt-4 max-h-96 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
                {candidates.map((item) => {
                  const isSelected = selected[item.id] !== undefined
                  const isProduct = jobType === 'item'
                  const product = item as Product
                  const customer = item as Customer
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink-300"
                        checked={isSelected}
                        onChange={() => toggle(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{item.name}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {isProduct
                            ? [
                                productIdentity(product),
                                `${formatINR(product.salePricePaise)} / ${product.unit}`,
                                allowedDepartments.find((department) => department.id === product.departmentId)?.name,
                                productStockState(product).label,
                              ].filter(Boolean).join(' · ')
                            : `${customer.phone}${customer.gstin ? ` · ${customer.gstin}` : ''}`}
                        </p>
                        {isProduct && !product.mrpPaise && template.showMrp && (
                          <p className="mt-0.5 text-[10px] font-medium text-gold-800">MRP is not set on this product.</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-medium text-ink-500" htmlFor={`qty-${item.id}`}>
                            Copies
                          </label>
                          <input
                            id={`qty-${item.id}`}
                            type="number"
                            min={1}
                            max={500}
                            value={selected[item.id]}
                            onChange={(event) => setQuantity(item.id, event.target.value)}
                            className="field-input h-8 w-20 text-xs"
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {jobType === 'item' && products.hasMore && (
              <div className="mt-3 flex justify-center">
                <Button size="sm" variant="outline" onClick={products.loadMore} loading={products.loading}>
                  Load more products ({products.loaded} loaded)
                </Button>
              </div>
            )}

            {jobType === 'item' && selectedItems.length > 0 && (
              <div className="mt-4 space-y-3 rounded-xl border border-ink-200 bg-ivory-50/60 p-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">Batch, date and pack details</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                    These values are stored on the print job and never inferred from stock or previous jobs.
                    Leave a field blank if the label does not show it.
                  </p>
                </div>
                {(selectedItems as Product[]).map((product) => {
                  const line = details[product.id] ?? {}
                  return (
                    <div key={product.id} className="rounded-lg border border-ink-200 bg-white p-3">
                      <p className="text-xs font-semibold text-ink-900">{product.name}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <TextField
                          label="Batch / lot number"
                          value={line.batchNumber ?? ''}
                          maxLength={60}
                          onChange={(event) => updateDetail(product.id, { batchNumber: event.target.value })}
                          hint={template.showBatch && product.batchTracking && !line.batchNumber?.trim() ? 'Required by this product and template.' : undefined}
                        />
                        <TextField
                          label="Weight / quantity on label"
                          value={line.netQuantity ?? ''}
                          maxLength={40}
                          placeholder={product.unit}
                          onChange={(event) => updateDetail(product.id, { netQuantity: event.target.value })}
                          hint="For example 500 g or 1 kg. Defaults to the selling unit."
                        />
                        <TextField
                          label="Manufacturing date"
                          type="date"
                          value={line.manufacturedAt ?? ''}
                          onChange={(event) => updateDetail(product.id, { manufacturedAt: event.target.value })}
                        />
                        <TextField
                          label="Expiry / use-by date"
                          type="date"
                          value={line.expiryAt ?? ''}
                          onChange={(event) => updateDetail(product.id, { expiryAt: event.target.value })}
                          hint={template.showExpiryDate && product.expiryTracking && !line.expiryAt ? 'Required by this product and template.' : undefined}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="surface-card p-4 sm:p-5">
            <SectionHeading title="Preview" description="First selected records, one copy each." />
            <div className="mt-3 overflow-x-auto rounded-lg bg-ivory-100 p-3">
              <LabelSheet
                template={template}
                lines={selectedItems.slice(0, PREVIEW_ITEMS).map((item) => ({
                  ...previewLine(item),
                  quantity: Math.min(2, selected[item.id] ?? 1),
                }))}
              />
            </div>
          </section>

          <section className="surface-card p-4 sm:p-5">
            <SectionHeading title="Print request" />
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Outlet</dt>
                <dd className="font-medium text-ink-900">{selectedOutlet?.name ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Records</dt>
                <dd className="font-medium text-ink-900">{selectedIds.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Requested labels</dt>
                <dd className="font-semibold text-ink-900">{requestedTotal}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={template.barcodeFormat === 'code128' ? 'success' : 'neutral'}>
                <ScanBarcode className="h-3 w-3" aria-hidden />
                {template.barcodeFormat === 'code128' ? 'Code 128B' : 'No barcode'}
              </Badge>
              <Badge tone="neutral">{template.widthMm} × {template.heightMm} mm</Badge>
            </div>
            <Button
              className="mt-4 w-full"
              leftIcon={<Printer className="h-4 w-4" />}
              loading={saving}
              disabled={!canManage || selectedIds.length === 0 || !outletId}
              onClick={submit}
            >
              Create job & open print sheet
            </Button>
            {!canManage && (
              <p className="mt-2 text-xs text-ink-500">
                Your role can view labels but cannot create print jobs.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              <CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden />
              After printing you must confirm the quantity that actually came out of the printer.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
