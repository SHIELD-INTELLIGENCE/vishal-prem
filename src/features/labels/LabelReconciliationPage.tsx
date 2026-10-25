import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { endOfDay, format, parseISO, startOfDay, subDays } from 'date-fns'
import { AlertTriangle, CheckCircle2, Printer, RotateCcw, ScanBarcode } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { useCollectionData } from '@/data/hooks'
import { labelEventsInRangeQuery, labelJobsQuery } from '@/data/labels'
import { buildLabelDashboard, type LabelDashboardRow } from '@/lib/labels'
import type { LabelEvent, LabelPrintJob } from '@/types/models'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { CsvExportButton } from '@/components/ui/CsvExportButton'
import { StatCard } from '@/components/ui/StatCard'
import { SelectField, TextField } from '@/components/ui/Field'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { todayInput } from '@/lib/format'

type RangeKey = '7d' | '30d' | '90d' | 'custom'

const MAX_JOBS = 1000
const MAX_EVENTS = 2000

function rangeLabel(row: LabelDashboardRow): string {
  return row.applicationRate === null ? '—' : `${row.applicationRate}%`
}

function BreakdownTable({ rows, empty }: { rows: LabelDashboardRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-sm text-ink-500">{empty}</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="min-w-full text-sm">
        <thead className="bg-ivory-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 text-right font-semibold">Printed</th>
            <th className="px-3 py-2 text-right font-semibold">Applied</th>
            <th className="px-3 py-2 text-right font-semibold">Damaged</th>
            <th className="px-3 py-2 text-right font-semibold">Returned</th>
            <th className="px-3 py-2 text-right font-semibold">Unaccounted</th>
            <th className="px-3 py-2 text-right font-semibold">Applied %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="max-w-52 truncate px-3 py-2 font-medium text-ink-900">{row.name}</td>
              <td className="px-3 py-2 text-right">{row.printed}</td>
              <td className="px-3 py-2 text-right text-sage-700">{row.applied}</td>
              <td className="px-3 py-2 text-right">{row.damaged}</td>
              <td className="px-3 py-2 text-right">{row.returned}</td>
              <td className={`px-3 py-2 text-right font-semibold ${row.unaccounted > 0 ? 'text-brand-700' : 'text-ink-500'}`}>{row.unaccounted}</td>
              <td className="px-3 py-2 text-right text-ink-600">{rangeLabel(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LabelReconciliationPage() {
  const { profile } = useAuth()
  const { selectedOutletId } = useWorkspace()
  const outletId = selectedOutletId ?? ''
  const [range, setRange] = useState<RangeKey>('30d')
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(todayInput())
  const [jobType, setJobType] = useState<'all' | 'item' | 'account'>('all')
  const [status, setStatus] = useState<'all' | 'open' | 'reconciled' | 'discrepancy'>('all')

  const { from, to } = useMemo(() => {
    if (range === 'custom') {
      return {
        from: startOfDay(parseISO(customFrom)).toISOString(),
        to: endOfDay(parseISO(customTo)).toISOString(),
      }
    }
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    return {
      from: startOfDay(subDays(new Date(), days - 1)).toISOString(),
      to: endOfDay(new Date()).toISOString(),
    }
  }, [range, customFrom, customTo])

  const jobs = useCollectionData<LabelPrintJob>(
    () => (profile && outletId ? labelJobsQuery(outletId, profile, MAX_JOBS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const events = useCollectionData<LabelEvent>(
    () => (profile && outletId ? labelEventsInRangeQuery(outletId, profile, from, to, MAX_EVENTS) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(','), from, to],
    Boolean(profile && outletId),
  )

  const dashboard = useMemo(
    () =>
      buildLabelDashboard({
        jobs: jobs.rows,
        events: events.rows,
        filters: { from, to, jobType, reconciliationStatus: status },
      }),
    [jobs.rows, events.rows, from, to, jobType, status],
  )

  const loading = jobs.loading || events.loading
  const capped = jobs.rows.length >= MAX_JOBS || events.rows.length >= MAX_EVENTS

  const breakdownColumns = [
    { key: 'name', header: 'Product or account', value: (row: LabelDashboardRow) => row.name },
    { key: 'printed', header: 'Printed', value: (row: LabelDashboardRow) => row.printed },
    { key: 'applied', header: 'Applied', value: (row: LabelDashboardRow) => row.applied },
    { key: 'damaged', header: 'Damaged', value: (row: LabelDashboardRow) => row.damaged },
    { key: 'returned', header: 'Returned unused', value: (row: LabelDashboardRow) => row.returned },
    { key: 'unaccounted', header: 'Unaccounted', value: (row: LabelDashboardRow) => row.unaccounted },
    { key: 'applicationRate', header: 'Applied percent', value: (row: LabelDashboardRow) => row.applicationRate ?? '' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Printing & labels"
        title="Label reconciliation"
        description="Printed labels, physical application, damage, returns and unresolved discrepancies. Figures come from persisted print jobs and the append-only label ledger."
        help="label-accountability"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/labels/usage">Label jobs</Link>
            </Button>
            <CsvExportButton
              filename={`label-reconciliation-${format(parseISO(from), 'yyyy-MM-dd')}-to-${format(parseISO(to), 'yyyy-MM-dd')}`}
              rows={dashboard.byProduct}
              columns={breakdownColumns}
              title="Export label reconciliation"
              description="Uses the selected period and filters. Choose the columns to include and their order."
            />
          </div>
        }
      />

      <section className="surface-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SelectField
            label="Period"
            value={range}
            onChange={(event) => setRange(event.target.value as RangeKey)}
            options={[
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
              { value: 'custom', label: 'Custom range' },
            ]}
          />
          {range === 'custom' ? (
            <>
              <TextField label="From" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              <TextField label="To" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </>
          ) : (
            <div className="hidden sm:block" />
          )}
          <SelectField
            label="Label type"
            value={jobType}
            onChange={(event) => setJobType(event.target.value as typeof jobType)}
            options={[
              { value: 'all', label: 'All labels' },
              { value: 'item', label: 'Item & barcode' },
              { value: 'account', label: 'Account' },
            ]}
          />
          <SelectField
            label="Reconciliation"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'open', label: 'Open' },
              { value: 'reconciled', label: 'Reconciled' },
              { value: 'discrepancy', label: 'Discrepancy' },
            ]}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          Jobs are filtered by the date the print job was created. Operator activity is filtered by
          the time the ledger event was recorded.
        </p>
        {capped && (
          <p className="mt-2 text-[11px] font-medium text-gold-800">
            Showing a bounded window of {MAX_JOBS.toLocaleString('en-IN')} jobs and {MAX_EVENTS.toLocaleString('en-IN')} events. Narrow the period for a complete view.
          </p>
        )}
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Confirmed printed" value={dashboard.printed} hint={`${dashboard.jobs} print jobs`} icon={<ScanBarcode className="h-4 w-4" />} />
          <StatCard label="Applied to goods" value={dashboard.applied} tone="sage" hint={dashboard.applicationRate === null ? 'No confirmed output' : `${dashboard.applicationRate}% of printed`} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Unaccounted" value={dashboard.unaccounted} tone="brand" hint={`${dashboard.discrepancyJobs} closed with a discrepancy`} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Reprinted" value={dashboard.reprintQty} tone="gold" hint={`${dashboard.openJobs} jobs still open`} icon={<Printer className="h-4 w-4" />} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface-card p-4 sm:p-5">
          <SectionHeading title="Printed vs applied" description="Daily ledger activity for the selected period." />
          {dashboard.trend.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No label activity" description="No print or usage events fall inside this period." />
            </div>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efebe5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#857463' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => format(parseISO(String(value)), 'dd MMM')}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#a2917f' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ChartTooltip contentStyle={{ borderRadius: 12, border: '1px solid #ddd6cc', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="printed" name="Printed" fill="#C8102E" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="applied" name="Applied" fill="#4f7a5b" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="surface-card p-4 sm:p-5">
          <SectionHeading title="Discrepancy summary" description="Unaccounted labels are never auto-classified." />
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">Reconciled jobs</dt>
              <dd className="font-semibold text-sage-700">{dashboard.reconciledJobs}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">Open jobs</dt>
              <dd className="font-semibold text-ink-900">{dashboard.openJobs}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">Closed with discrepancy</dt>
              <dd className="font-semibold text-brand-700">{dashboard.discrepancyJobs}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">Damaged</dt>
              <dd className="font-semibold text-ink-900">{dashboard.damaged}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-500">Returned unused</dt>
              <dd className="font-semibold text-ink-900">{dashboard.returned}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-ivory-100 px-3 py-2 text-[11px] leading-relaxed text-ink-600">
            A job with unresolved labels stays open until an authorised operator records usage,
            corrects a quantity with a reason, or closes it as an explicit discrepancy.
          </p>
          <Button className="mt-3 w-full" variant="outline" asChild leftIcon={<RotateCcw className="h-4 w-4" />}>
            <Link to="/admin/labels/usage">Open label jobs</Link>
          </Button>
        </section>
      </div>

      <section className="surface-card p-4 sm:p-5">
        <SectionHeading
          title="Product and account breakdown"
          description="Highest unaccounted quantities first."
          actions={
            <CsvExportButton
              filename={`label-product-breakdown-${format(parseISO(from), 'yyyy-MM-dd')}-to-${format(parseISO(to), 'yyyy-MM-dd')}`}
              rows={dashboard.byProduct}
              columns={breakdownColumns}
              title="Export product and account breakdown"
              description="Uses the selected period and filters."
            />
          }
        />
        <div className="mt-4">
          <BreakdownTable rows={dashboard.byProduct} empty="No label lines in this period." />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="surface-card p-4 sm:p-5">
          <SectionHeading
            title="Print operators"
            description="Confirmed output by the operator who created the job."
            actions={
              <CsvExportButton
                filename={`label-operators-${format(parseISO(from), 'yyyy-MM-dd')}-to-${format(parseISO(to), 'yyyy-MM-dd')}`}
                rows={dashboard.byOperator}
                columns={breakdownColumns}
                title="Export print operator breakdown"
                description="Uses the selected period and filters."
              />
            }
          />
          <div className="mt-4">
            <BreakdownTable rows={dashboard.byOperator} empty="No print operators in this period." />
          </div>
        </section>
        <section className="surface-card p-4 sm:p-5">
          <SectionHeading
            title="Usage recorders"
            description="Applied, damaged and returned quantities by the operator who recorded them."
            actions={
              <CsvExportButton
                filename={`label-usage-operators-${format(parseISO(from), 'yyyy-MM-dd')}-to-${format(parseISO(to), 'yyyy-MM-dd')}`}
                rows={dashboard.byUsageOperator}
                columns={breakdownColumns}
                title="Export usage recorder breakdown"
                description="Uses the selected period and filters."
              />
            }
          />
          <div className="mt-4">
            <BreakdownTable rows={dashboard.byUsageOperator} empty="No usage recorded in this period." />
          </div>
        </section>
      </div>
    </div>
  )
}
