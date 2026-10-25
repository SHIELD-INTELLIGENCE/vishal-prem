import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { hasPermission } from '@/auth/permissions'
import { useDocumentData } from '@/data/hooks'
import { confirmLabelPrint } from '@/data/labels'
import type { LabelPrintJob } from '@/types/models'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { TextareaField } from '@/components/ui/Field'
import { formatDateTime } from '@/lib/format'
import { LabelSheet } from './LabelSheet'

export function LabelPrintPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const job = useDocumentData<LabelPrintJob>(id ? `labelPrintJobs/${id}` : null, [id])

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [initialised, setInitialised] = useState(false)

  useEffect(() => {
    if (!job.data || initialised) return
    setQuantities(
      Object.fromEntries(job.data.lines.map((line) => [line.lineId, line.requestedQty])),
    )
    setInitialised(true)
  }, [job.data, initialised])

  const lines = useMemo(
    () =>
      (job.data?.lines ?? []).map((line) => ({
        ...line,
        quantity: quantities[line.lineId] ?? 0,
      })),
    [job.data, quantities],
  )

  const confirmable = job.data?.status === 'requested'
  const totalToConfirm = lines.reduce((sum, line) => sum + line.quantity, 0)
  const canManage = hasPermission(profile, 'labelsManage')

  async function confirm() {
    if (!job.data) return
    if (totalToConfirm <= 0) {
      toast.error('Enter the quantity that was actually printed.')
      return
    }
    setSaving(true)
    try {
      await confirmLabelPrint({
        jobId: job.data.id,
        lines: lines.map((line) => ({ lineId: line.lineId, quantity: line.quantity })),
        note: note.trim() || undefined,
      })
      toast.success('Printed quantity confirmed. Record application, damage and returns when labels are used.')
      setInitialised(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The printed quantity could not be confirmed.')
    } finally {
      setSaving(false)
    }
  }

  if (job.loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (job.error || !job.data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState
          title="Print job not available"
          description={job.error ?? 'This print job does not exist or is outside your scope.'}
          action={
            <Button asChild variant="outline">
              <Link to="/admin/labels/items">Back to labels</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const data = job.data

  return (
    <div className="print-root min-h-dvh bg-ivory-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root { background: #fff !important; padding: 0 !important; }
          .label-sheet { gap: 2mm !important; }
          .label-cell { break-inside: avoid; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>

      <div className="no-print border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" asChild leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
            <Link to="/admin/labels/usage">Label jobs</Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{data.jobNumber}</p>
            <p className="text-[11px] text-ink-500">
              {data.jobType === 'item' ? 'Item & barcode labels' : 'Account labels'} · {data.template.widthMm} × {data.template.heightMm} mm · {data.template.columns} columns
            </p>
          </div>
          <Badge tone={data.status === 'requested' ? 'warning' : data.status === 'closed' ? 'neutral' : 'success'}>
            {data.status === 'requested' ? 'Awaiting print confirmation' : data.status === 'closed' ? 'Closed' : 'Printed'}
          </Badge>
          {confirmable && (
            <>
              <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print labels
              </Button>
              {canManage && (
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('confirm-print')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Confirm printed quantity
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 print:p-0">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm print:border-0 print:shadow-none">
          <LabelSheet
            template={data.template}
            lines={lines.map((line) => ({
              lineId: line.lineId,
              name: line.name,
              sku: line.sku,
              barcodeValue: line.barcodeValue,
              unit: line.unit,
              netQuantity: line.netQuantity,
              pricePaise: line.pricePaise,
              mrpPaise: line.mrpPaise,
              batchNumber: line.batchNumber,
              manufacturedAt: line.manufacturedAt,
              expiryAt: line.expiryAt,
              addressLine: line.addressLine,
              phone: line.phone,
              quantity: confirmable ? line.quantity : data.status === 'requested' ? line.requestedQty : line.printedQty,
            }))}
          />
        </div>

        {confirmable ? (
          <section id="confirm-print" className="no-print mt-5 scroll-mt-24 rounded-xl border border-gold-200 bg-gold-50/50 p-4 sm:p-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Confirm what actually printed</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  The browser print dialog is not proof of output. Enter the number of labels that
                  physically came out of the printer. You can confirm less than requested (for
                  example after a paper jam); anything above the requested quantity is refused
                  and must be recorded as a reprint.
                </p>
              </div>
            </div>

            <div className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
              {data.lines.map((line) => (
                <div key={line.lineId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{line.name}</p>
                    <p className="truncate text-[11px] text-ink-500">{line.sku}</p>
                  </div>
                  <span className="text-[11px] text-ink-500">Requested {line.requestedQty}</span>
                  <input
                    type="number"
                    min={0}
                    max={line.requestedQty}
                    value={quantities[line.lineId] ?? 0}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.lineId]: Math.max(0, Math.min(line.requestedQty, Math.floor(Number(event.target.value) || 0))),
                      }))
                    }
                    className="field-input h-9 w-24 text-sm"
                    aria-label={`Confirmed printed quantity for ${line.name}`}
                  />
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextareaField
                label="Note (optional)"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything the next shift should know about this print run."
              />
              <Button
                loading={saving}
                disabled={!canManage || totalToConfirm <= 0}
                onClick={confirm}
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                Confirm {totalToConfirm} printed
              </Button>
            </div>
          </section>
        ) : (
          <section className="no-print mt-5 rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink-900">Output confirmed</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {data.printedQty} labels were confirmed printed
              {data.confirmedAt ? ` on ${formatDateTime(data.confirmedAt)}` : ''}.
              Printing this page again would not be audited. Use <Link className="font-semibold text-brand-700 hover:underline" to="/admin/labels/usage">Label usage</Link> to
              record a reprint with a reason, then record applied, damaged and unused-returned labels.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/admin/labels/usage">Record label usage</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/labels/reconciliation">Reconciliation dashboard</Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
