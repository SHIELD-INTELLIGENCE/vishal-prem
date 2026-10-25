import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  History,
  Printer,
  RotateCcw,
  ScanBarcode,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import {
  adjustLabelUsage,
  closeLabelJob,
  labelEventLabel,
  labelEventsQuery,
  labelJobsQuery,
  newRequestId,
  recordLabelUsage,
  reopenLabelJob,
  reprintLabels,
} from '@/data/labels'
import { labelTotals, reconcileLabelLine } from '@/lib/labels'
import type { LabelEvent, LabelPrintJob, LabelUsageCategory } from '@/types/models'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { StatCard } from '@/components/ui/StatCard'
import { formatDateTime } from '@/lib/format'

const MAX_JOBS = 400

function reconciliationTone(job: LabelPrintJob): 'neutral' | 'success' | 'warning' | 'danger' {
  if (job.reconciliationStatus === 'reconciled') return 'success'
  if (job.reconciliationStatus === 'discrepancy') return 'danger'
  return 'warning'
}

function statusLabel(job: LabelPrintJob): string {
  if (job.status === 'requested') return 'Awaiting confirmation'
  if (job.status === 'closed') return job.reconciliationStatus === 'reconciled' ? 'Closed · reconciled' : 'Closed · discrepancy'
  return 'Printed · open'
}

const CATEGORY_LABELS: Record<LabelUsageCategory, string> = {
  applied: 'Applied',
  damaged: 'Damaged',
  returned: 'Returned unused',
}

function categoryQty(line: LabelPrintJob['lines'][number], category: LabelUsageCategory): number {
  if (category === 'applied') return line.appliedQty
  if (category === 'damaged') return line.damagedQty
  return line.returnedQty
}

export function LabelsPage() {
  const { profile } = useAuth()
  const { selectedOutletId } = useWorkspace()
  const outletId = selectedOutletId ?? ''
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'usage' | 'reprint' | 'adjust' | 'close' | 'reopen' | null>(null)
  const [usageLineId, setUsageLineId] = useState('')
  const [usageAction, setUsageAction] = useState<'apply' | 'damage' | 'return_unused'>('apply')
  const [usageQty, setUsageQty] = useState('1')
  const [usageNote, setUsageNote] = useState('')
  const [reprintQty, setReprintQty] = useState<Record<string, number>>({})
  const [reprintReason, setReprintReason] = useState('')
  const [adjustCategory, setAdjustCategory] = useState<LabelUsageCategory>('applied')
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId())

  const jobs = useCollectionData<LabelPrintJob>(
    () => (profile && outletId ? labelJobsQuery(outletId, profile, MAX_JOBS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const selectedJob = useMemo(
    () => jobs.rows.find((job) => job.id === selectedJobId) ?? null,
    [jobs.rows, selectedJobId],
  )

  const adjustLine = useMemo(
    () => selectedJob?.lines.find((line) => line.lineId === usageLineId) ?? null,
    [selectedJob, usageLineId],
  )

  const events = useCollectionData<LabelEvent>(
    () => (selectedJob && profile ? labelEventsQuery(selectedJob, profile, 120) : null),
    [selectedJob?.id, selectedJob?.outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(selectedJob && profile),
  )

  const rows = useMemo(
    () =>
      jobs.rows.filter((job) => {
        if (statusFilter !== 'all' && job.status !== statusFilter) return false
        if (typeFilter !== 'all' && job.jobType !== typeFilter) return false
        return true
      }),
    [jobs.rows, statusFilter, typeFilter],
  )

  const summary = useMemo(() => {
    const totals = rows.reduce(
      (acc, job) => {
        const jobTotals = labelTotals(job.lines)
        acc.printed += jobTotals.printed
        acc.applied += jobTotals.applied
        acc.unaccounted += jobTotals.unaccounted
        return acc
      },
      { printed: 0, applied: 0, unaccounted: 0 },
    )
    return {
      ...totals,
      open: rows.filter((job) => job.reconciliationStatus === 'open').length,
      discrepancy: rows.filter((job) => job.reconciliationStatus === 'discrepancy').length,
    }
  }, [rows])

  const canManage = hasPermission(profile, 'labelsManage')
  const canReconcile = hasPermission(profile, 'labelsReconcile')

  const adjustCurrentQty = adjustLine ? categoryQty(adjustLine, adjustCategory) : 0
  const adjustDeltaNumber = Math.trunc(Number(adjustDelta) || 0)
  const adjustNextQty = adjustCurrentQty + adjustDeltaNumber
  const adjustAccountedAfter = adjustLine
    ? adjustLine.appliedQty + adjustLine.damagedQty + adjustLine.returnedQty + adjustDeltaNumber
    : 0
  const adjustNegativeError = Boolean(adjustLine && adjustDelta !== '' && adjustNextQty < 0)
  const adjustOverError = Boolean(
    adjustLine && adjustDelta !== '' && adjustAccountedAfter > adjustLine.printedQty,
  )
  const adjustInvalid =
    !adjustLine
    || adjustDeltaNumber === 0
    || adjustNegativeError
    || adjustOverError
    || adjustReason.trim().length === 0

  function openJob(job: LabelPrintJob) {
    setSelectedJobId(job.id)
    setUsageLineId('')
    setUsageQty('1')
    setUsageNote('')
    setUsageAction('apply')
    setDialog(null)
  }

  function closeDialog() {
    setSelectedJobId(null)
    setDialog(null)
  }

  function startUsage(lineId: string) {
    setUsageLineId(lineId)
    setUsageAction('apply')
    setUsageQty('1')
    setUsageNote('')
    setRequestId(newRequestId())
    setDialog('usage')
  }

  async function submitUsage() {
    if (!selectedJob || !usageLineId) return
    const quantity = Math.floor(Number(usageQty) || 0)
    if (quantity <= 0) {
      toast.error('Enter a quantity greater than zero.')
      return
    }
    setSaving(true)
    try {
      await recordLabelUsage({
        requestId,
        jobId: selectedJob.id,
        lineId: usageLineId,
        usageAction,
        quantity,
        note: usageNote.trim() || undefined,
      })
      toast.success('Label usage recorded.')
      setRequestId(newRequestId())
      setDialog(null)
      setUsageLineId('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The usage entry could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  async function submitReprint() {
    if (!selectedJob) return
    const lines = Object.entries(reprintQty)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }))
    if (lines.length === 0) {
      toast.error('Enter the quantity that was reprinted.')
      return
    }
    setSaving(true)
    try {
      await reprintLabels({ jobId: selectedJob.id, lines, reason: reprintReason.trim() })
      toast.success('Reprint recorded as a new linked event.')
      setReprintQty({})
      setReprintReason('')
      setDialog(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The reprint could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  async function submitAdjustment() {
    if (!selectedJob || !usageLineId || !adjustLine) return
    const delta = adjustDeltaNumber
    if (delta === 0) {
      toast.error('Enter a non-zero correction.')
      return
    }
    if (adjustNextQty < 0) {
      toast.error(
        `${CATEGORY_LABELS[adjustCategory]} currently has ${adjustCurrentQty}. A correction of ${delta} would make it negative.`,
      )
      return
    }
    if (adjustAccountedAfter > adjustLine.printedQty) {
      toast.error(
        `Only ${adjustLine.printedQty} labels were confirmed printed; this correction would account for ${adjustAccountedAfter}.`,
      )
      return
    }
    if (!adjustReason.trim()) {
      toast.error('Enter a reason for the correction.')
      return
    }
    setSaving(true)
    try {
      await adjustLabelUsage({
        jobId: selectedJob.id,
        lineId: usageLineId,
        category: adjustCategory,
        delta,
        reason: adjustReason.trim(),
      })
      toast.success('Correction recorded as an audit event.')
      setAdjustDelta('')
      setAdjustReason('')
      setDialog(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The correction could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  async function submitClose() {
    if (!selectedJob) return
    setSaving(true)
    try {
      await closeLabelJob({ jobId: selectedJob.id, note: closeNote.trim() || undefined })
      toast.success('Print job closed.')
      setCloseNote('')
      setDialog(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The job could not be closed.')
    } finally {
      setSaving(false)
    }
  }

  async function submitReopen() {
    if (!selectedJob) return
    setSaving(true)
    try {
      await reopenLabelJob({ jobId: selectedJob.id, reason: reopenReason.trim() })
      toast.success('Print job reopened with a recorded reason.')
      setReopenReason('')
      setDialog(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The job could not be reopened.')
    } finally {
      setSaving(false)
    }
  }

  const columns: DataColumn<LabelPrintJob>[] = [
    {
      key: 'job',
      header: 'Print job',
      accessor: (job) => job.jobNumber,
      sortable: true,
      render: (job) => (
        <div>
          <p className="font-semibold text-ink-900">{job.jobNumber}</p>
          <p className="text-[11px] text-ink-500">
            {job.jobType === 'item' ? 'Item & barcode' : 'Account'} · {formatDateTime(job.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'printed',
      header: 'Printed',
      accessor: (job) => job.printedQty,
      sortable: true,
      align: 'right',
      render: (job) => (
        <div className="text-right">
          <p className="font-semibold text-ink-900">{job.printedQty}</p>
          <p className="text-[11px] text-ink-500">requested {job.requestedQty}</p>
        </div>
      ),
    },
    {
      key: 'applied',
      header: 'Applied',
      accessor: (job) => job.appliedQty,
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (job) => <span className="font-medium text-sage-700">{job.appliedQty}</span>,
    },
    {
      key: 'unaccounted',
      header: 'Unaccounted',
      accessor: (job) => job.unaccountedQty,
      sortable: true,
      align: 'right',
      render: (job) => (
        <span className={job.unaccountedQty > 0 ? 'font-semibold text-brand-700' : 'text-ink-500'}>
          {job.unaccountedQty}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (job) => job.status,
      render: (job) => (
        <div className="flex flex-col gap-1">
          <Badge tone={reconciliationTone(job)}>{statusLabel(job)}</Badge>
          {job.reprintQty > 0 && <span className="text-[11px] text-ink-500">+{job.reprintQty} reprinted</span>}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Printing & labels"
        title="Label usage & reconciliation"
        description="Record every printed label as applied, damaged or returned unused. Unaccounted labels stay visible until someone investigates them."
        help="label-accountability"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/labels/reconciliation">Reconciliation dashboard</Link>
            </Button>
            {canManage && (
              <Button asChild leftIcon={<Printer className="h-4 w-4" />}>
                <Link to="/admin/labels/items">New label job</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Printed labels" value={summary.printed} icon={<ScanBarcode className="h-4 w-4" />} loading={jobs.loading} />
        <StatCard label="Applied" value={summary.applied} icon={<CheckCircle2 className="h-4 w-4" />} tone="sage" loading={jobs.loading} />
        <StatCard label="Unaccounted" value={summary.unaccounted} icon={<AlertTriangle className="h-4 w-4" />} tone="brand" loading={jobs.loading} hint={`${summary.discrepancy} closed with a discrepancy`} />
        <StatCard label="Open jobs" value={summary.open} icon={<ClipboardCheck className="h-4 w-4" />} tone="gold" loading={jobs.loading} />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(job) => job.id}
        loading={jobs.loading}
        error={jobs.error}
        onRetry={jobs.reload}
        searchPlaceholder="Search by job number…"
        searchFields={(job) => [job.jobNumber, job.printedByName, job.lines.map((line) => line.name).join(' ')]}
        emptyTitle="No label print jobs"
        emptyDescription="Create an item or account label job, then confirm what physically printed."
        exportFilename="label-jobs"
        exportDate={(job) => job.confirmedAt ?? job.createdAt}
        onRowClick={openJob}
        rowActions={(job) => (
          <Button size="sm" variant="outline" onClick={() => openJob(job)}>
            Manage
          </Button>
        )}
        mobileTitle={(job) => job.jobNumber}
        mobileSubtitle={(job) => `${job.printedQty} printed · ${job.unaccountedQty} unaccounted`}
        mobileMeta={(job) => <Badge tone={reconciliationTone(job)}>{statusLabel(job)}</Badge>}
        toolbar={
          <>
            <select className="field-input h-9 w-auto text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="requested">Awaiting confirmation</option>
              <option value="printed">Printed · open</option>
              <option value="closed">Closed</option>
            </select>
            <select className="field-input h-9 w-auto text-xs" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by label type">
              <option value="all">All label types</option>
              <option value="item">Item & barcode</option>
              <option value="account">Account</option>
            </select>
          </>
        }
      />

      <Dialog
        open={Boolean(selectedJob) && dialog === null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        title={selectedJob ? selectedJob.jobNumber : 'Label job'}
        description={
          selectedJob
            ? `${selectedJob.jobType === 'item' ? 'Item & barcode labels' : 'Account labels'} · ${statusLabel(selectedJob)}`
            : undefined
        }
        size="xl"
      >
        {selectedJob && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Printed</p>
                <p className="mt-1 text-xl font-semibold text-ink-900">{selectedJob.printedQty}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Applied</p>
                <p className="mt-1 text-xl font-semibold text-sage-700">{selectedJob.appliedQty}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Damaged / returned</p>
                <p className="mt-1 text-xl font-semibold text-ink-900">{selectedJob.damagedQty} / {selectedJob.returnedQty}</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Unaccounted</p>
                <p className={`mt-1 text-xl font-semibold ${selectedJob.unaccountedQty > 0 ? 'text-brand-700' : 'text-ink-900'}`}>{selectedJob.unaccountedQty}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="min-w-full text-sm">
                <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item / account</th>
                    <th className="px-3 py-2 text-right font-semibold">Printed</th>
                    <th className="px-3 py-2 text-right font-semibold">Applied</th>
                    <th className="px-3 py-2 text-right font-semibold">Damaged</th>
                    <th className="px-3 py-2 text-right font-semibold">Returned</th>
                    <th className="px-3 py-2 text-right font-semibold">Unaccounted</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {selectedJob.lines.map((line) => {
                    const row = reconcileLabelLine(line)
                    return (
                      <tr key={line.lineId}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink-900">{line.name}</p>
                          <p className="text-[11px] text-ink-500">{line.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{row.printed}</td>
                        <td className="px-3 py-2 text-right text-sage-700">{row.applied}</td>
                        <td className="px-3 py-2 text-right">{row.damaged}</td>
                        <td className="px-3 py-2 text-right">{row.returned}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${row.unaccounted > 0 ? 'text-brand-700' : 'text-ink-500'}`}>{row.unaccounted}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {canManage && selectedJob.status === 'printed' && row.available > 0 && (
                              <Button size="sm" variant="outline" onClick={() => startUsage(line.lineId)}>
                                Record
                              </Button>
                            )}
                            {canReconcile && selectedJob.status !== 'closed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setUsageLineId(line.lineId)
                                  setAdjustCategory('applied')
                                  setAdjustDelta('')
                                  setAdjustReason('')
                                  setDialog('adjust')
                                }}
                              >
                                Correct
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {selectedJob.status === 'requested' && (
              <p className="rounded-lg border border-gold-200 bg-gold-50/60 px-3 py-2 text-xs leading-relaxed text-ink-700">
                This job is awaiting print confirmation. Open <span className="font-semibold">Print &amp; confirm</span>,
                print the labels, then enter the number that physically came out.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {canManage && selectedJob.status === 'printed' && (
                <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => {
                  setReprintQty({})
                  setReprintReason('')
                  setDialog('reprint')
                }}>
                  Record reprint
                </Button>
              )}
              {canReconcile && selectedJob.status !== 'closed' && selectedJob.printedQty > 0 && (
                <Button variant="secondary" leftIcon={<Ban className="h-4 w-4" />} onClick={() => {
                  setCloseNote('')
                  setDialog('close')
                }}>
                  Close job
                </Button>
              )}
              {canReconcile && selectedJob.status === 'closed' && (
                <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => {
                  setReopenReason('')
                  setDialog('reopen')
                }}>
                  Reopen job
                </Button>
              )}
              {selectedJob.status === 'requested' && canManage ? (
                <Button asChild leftIcon={<Printer className="h-4 w-4" />}>
                  <Link to={`/admin/print/labels/${selectedJob.id}`}>Print & confirm</Link>
                </Button>
              ) : (
                <Button variant="ghost" asChild>
                  <Link to={`/admin/print/labels/${selectedJob.id}`}>Print sheet</Link>
                </Button>
              )}
            </div>

            <section>
              <SectionHeading title="Audit trail" description="Every print, reprint, usage entry, correction and close is retained." />
              <div className="mt-3 max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
                {events.loading ? (
                  <p className="px-3 py-4 text-sm text-ink-500">Loading events…</p>
                ) : events.rows.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-ink-500">No events recorded yet.</p>
                ) : (
                  events.rows.map((event) => (
                    <div key={event.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5 text-sm">
                      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-800">{labelEventLabel(event)}</p>
                        <p className="text-[11px] text-ink-500">
                          {formatDateTime(event.occurredAt)} · {event.actorName}
                          {event.lines.length > 0
                            ? ` · ${event.lines.reduce((sum, line) => sum + line.quantity, 0)} labels`
                            : event.quantity !== undefined ? ` · ${event.quantity > 0 ? '+' : ''}${event.quantity}` : ''}
                        </p>
                        {(event.reason || event.note) && (
                          <p className="mt-0.5 text-[11px] text-ink-600">{event.reason || event.note}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </Dialog>

      <Dialog
        open={dialog === 'usage'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Record label usage"
        description={selectedJob?.lines.find((line) => line.lineId === usageLineId)?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitUsage}>Record usage</Button>
          </>
        }
      >
        <div className="space-y-3">
          <SelectField
            label="What happened to these labels?"
            value={usageAction}
            onChange={(event) => setUsageAction(event.target.value as 'apply' | 'damage' | 'return_unused')}
            options={[
              { value: 'apply', label: 'Applied to products / packaging' },
              { value: 'damage', label: 'Damaged and destroyed' },
              { value: 'return_unused', label: 'Returned unused to storage' },
            ]}
          />
          <TextField
            label="Quantity"
            type="number"
            min={1}
            max={500}
            value={usageQty}
            onChange={(event) => setUsageQty(event.target.value)}
          />
          <TextareaField
            label="Note (optional)"
            rows={2}
            value={usageNote}
            onChange={(event) => setUsageNote(event.target.value)}
            placeholder="Which counter, batch or reason."
          />
          <p className="text-xs leading-relaxed text-ink-500">
            <SlidersHorizontal className="mr-1 inline h-3 w-3" aria-hidden />
            Applying more labels than were confirmed printed is refused. Nothing is reclassified automatically.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'reprint'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Record a reprint"
        description="Reprints are separate linked print events, never a silent increase of the original confirmation."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitReprint}>Record reprint</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            {selectedJob?.lines.map((line) => (
              <div key={line.lineId} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{line.name}</p>
                  <p className="text-[11px] text-ink-500">Printed {line.printedQty}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={reprintQty[line.lineId] ?? 0}
                  onChange={(event) =>
                    setReprintQty((current) => ({
                      ...current,
                      [line.lineId]: Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0))),
                    }))
                  }
                  className="field-input h-9 w-24 text-sm"
                  aria-label={`Reprint quantity for ${line.name}`}
                />
              </div>
            ))}
          </div>
          <TextareaField
            label="Reason"
            required
            rows={2}
            value={reprintReason}
            onChange={(event) => setReprintReason(event.target.value)}
            placeholder="Paper jam, damaged labels, additional packs…"
          />
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'adjust'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Correct recorded quantities"
        description="Corrections append a signed audit event. Earlier entries are never edited or deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitAdjustment} disabled={adjustInvalid}>Record correction</Button>
          </>
        }
      >
        <div className="space-y-3">
          {adjustLine && (
            <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3">
              <p className="text-sm font-semibold text-ink-900">{adjustLine.name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-ink-500">Printed</p>
                  <p className="mt-0.5 font-semibold text-ink-900">{adjustLine.printedQty}</p>
                </div>
                <div>
                  <p className="text-ink-500">Applied</p>
                  <p className="mt-0.5 font-semibold text-sage-700">{adjustLine.appliedQty}</p>
                </div>
                <div>
                  <p className="text-ink-500">Damaged</p>
                  <p className="mt-0.5 font-semibold text-ink-900">{adjustLine.damagedQty}</p>
                </div>
                <div>
                  <p className="text-ink-500">Returned</p>
                  <p className="mt-0.5 font-semibold text-ink-900">{adjustLine.returnedQty}</p>
                </div>
              </div>
            </div>
          )}
          <SelectField
            label="Quantity being corrected"
            value={adjustCategory}
            onChange={(event) => setAdjustCategory(event.target.value as LabelUsageCategory)}
            options={[
              { value: 'applied', label: CATEGORY_LABELS.applied },
              { value: 'damaged', label: CATEGORY_LABELS.damaged },
              { value: 'returned', label: CATEGORY_LABELS.returned },
            ]}
          />
          <TextField
            label="Signed correction"
            hint={
              adjustCurrentQty > 0
                ? `Use + to add and − to remove. ${CATEGORY_LABELS[adjustCategory]} currently has ${adjustCurrentQty}.`
                : `Use + to add. ${CATEGORY_LABELS[adjustCategory]} is currently 0, so a negative correction is not allowed.`
            }
            error={
              adjustNegativeError
                ? `${CATEGORY_LABELS[adjustCategory]} is currently ${adjustCurrentQty}. A correction of ${adjustDeltaNumber} would make it negative.`
                : adjustOverError
                  ? `Only ${adjustLine?.printedQty ?? 0} labels were confirmed printed; this correction would account for ${adjustAccountedAfter}.`
                  : undefined
            }
            type="number"
            min={-500}
            max={500}
            step={1}
            value={adjustDelta}
            onChange={(event) => setAdjustDelta(event.target.value)}
          />
          <TextareaField
            label="Reason"
            hint="Required. This reason is stored on the audit event."
            required
            rows={2}
            value={adjustReason}
            onChange={(event) => setAdjustReason(event.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'close'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Close print job"
        description={
          selectedJob && selectedJob.unaccountedQty > 0
            ? `${selectedJob.unaccountedQty} labels are still unaccounted. Closing records a discrepancy and requires an explanation.`
            : 'All printed labels are accounted for. Closing marks the job reconciled.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitClose}>Close job</Button>
          </>
        }
      >
        <TextareaField
          label={selectedJob && selectedJob.unaccountedQty > 0 ? 'Discrepancy note' : 'Close note (optional)'}
          required={Boolean(selectedJob && selectedJob.unaccountedQty > 0)}
          rows={3}
          value={closeNote}
          onChange={(event) => setCloseNote(event.target.value)}
          placeholder="What was investigated, who was asked, and why the remaining labels cannot be accounted for."
        />
      </Dialog>

      <Dialog
        open={dialog === 'reopen'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Reopen print job"
        description="Reopening restores the job to an open state and resets reconciliation until it is closed again."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button loading={saving} onClick={submitReopen}>Reopen job</Button>
          </>
        }
      >
        <TextareaField
          label="Reason"
          required
          rows={3}
          value={reopenReason}
          onChange={(event) => setReopenReason(event.target.value)}
        />
      </Dialog>
    </div>
  )
}
