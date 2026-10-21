import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, isPast, isToday, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Clock3,
  History,
  Play,
  RefreshCw,
  UserRoundCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { productionEventsQuery, productionTasksQuery } from '@/data/operationsQueries'
import {
  assignProductionTask,
  cancelProductionTask,
  recordProductionProgress,
  recordProductionQuality,
  startProductionTask,
  syncProduction,
} from '@/data/production'
import { loadStaffDirectory, type DirectoryEntry } from '@/data/directory'
import type { ProductionEvent, ProductionTask } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { formatDateTime, formatQuantity, formatRelative, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'

const OPEN_STATUSES = ['pending', 'in_progress'] as const
type StatusFilter = 'open' | 'all' | 'pending' | 'in_progress' | 'completed'

function remaining(task: ProductionTask): number {
  return Math.max(0, task.requiredQty - task.completedQty)
}

function isOverdue(task: ProductionTask): boolean {
  return OPEN_STATUSES.includes(task.status as (typeof OPEN_STATUSES)[number]) && isPast(parseISO(task.dueAt))
}

export function ProductionPage() {
  const { profile } = useAuth()
  const { selectedOutlet, departments } = useWorkspace()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [selected, setSelected] = useState<ProductionTask | null>(null)
  const [syncing, setSyncing] = useState(false)

  const outletId = selectedOutlet?.id ?? ''
  const tasksState = useCollectionData<ProductionTask>(
    () => (profile && outletId ? productionTasksQuery(outletId, profile, 600) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const eventsState = useCollectionData<ProductionEvent>(
    () =>
      selected && outletId
        ? productionEventsQuery(selected.id, outletId, selected.departmentId, profile!, 80)
        : null,
    [selected?.id, selected?.departmentId, outletId, profile?.uid, profile?.role],
    Boolean(selected && outletId && profile),
  )

  const filtered = useMemo(() => {
    return tasksState.rows.filter((task) => {
      if (departmentFilter !== 'all' && task.departmentId !== departmentFilter) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return OPEN_STATUSES.includes(task.status as (typeof OPEN_STATUSES)[number])
      return task.status === statusFilter
    })
  }, [tasksState.rows, departmentFilter, statusFilter])

  const stats = useMemo(() => {
    const open = tasksState.rows.filter((task) => OPEN_STATUSES.includes(task.status as (typeof OPEN_STATUSES)[number]))
    return {
      open: open.length,
      dueToday: open.filter((task) => isToday(parseISO(task.dueAt))).length,
      overdue: open.filter(isOverdue).length,
      completed: tasksState.rows.filter((task) => task.status === 'completed').length,
    }
  }, [tasksState.rows])

  async function handleSync() {
    if (!outletId) return
    setSyncing(true)
    try {
      const result = await syncProduction(outletId)
      toast.success(`Production queue refreshed: ${result.created} new, ${result.updated} updated.`)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setSyncing(false)
    }
  }

  const columns: DataColumn<ProductionTask>[] = [
    {
      key: 'product',
      header: 'Product',
      accessor: (task) => task.productName,
      render: (task) => (
        <div>
          <p className="font-semibold text-ink-900">{task.productName}</p>
          <p className="text-[11px] text-ink-500">{titleCase(task.sourceType)} · {task.sourceNumber}</p>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'department',
      header: 'Department',
      accessor: (task) => departments.find((department) => department.id === task.departmentId)?.name ?? '—',
      hideBelow: 'md',
    },
    {
      key: 'remaining',
      header: 'Remaining',
      accessor: (task) => remaining(task),
      render: (task) => (
        <span className={remaining(task) > 0 ? 'font-semibold' : 'text-sage-700'}>
          {formatQuantity(remaining(task), task.unit)} / {formatQuantity(task.requiredQty, task.unit)}
        </span>
      ),
      align: 'right',
    },
    {
      key: 'due',
      header: 'Due',
      accessor: (task) => task.dueAt,
      render: (task) => (
        <div className={isOverdue(task) ? 'text-brand-700' : undefined}>
          <p className="font-medium">{formatDateTime(task.dueAt)}</p>
          <p className="text-[11px] text-ink-500">{formatRelative(task.dueAt)}</p>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (task) => task.status,
      render: (task) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={task.status} />
          {isOverdue(task) && <Badge tone="danger">Overdue</Badge>}
        </div>
      ),
    },
    {
      key: 'assignee',
      header: 'Assigned',
      accessor: (task) => task.assignedToName ?? 'Unassigned',
      hideBelow: 'lg',
    },
  ]

  if (!hasPermission(profile, 'productionView')) {
    return <ErrorState title="Production is not available" message="Your role does not include View production." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={selectedOutlet?.name}
        title="Production queue"
        description="Department work linked to real order and booking lines. Quantities, assignments and quality decisions are recorded in an append-only history."
        help="production"
        actions={
          <>
            <Button variant="outline" onClick={handleSync} loading={syncing} leftIcon={<RefreshCw className="h-4 w-4" />}>
              Refresh from orders
            </Button>
            {hasPermission(profile, 'productionManage') && (
              <Button asChild variant="outline" leftIcon={<ChefHat className="h-4 w-4" />}>
                <Link to="/admin/departments">Department workspaces</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open work" value={stats.open} hint="Pending and in progress" icon={<ChefHat className="h-4 w-4" />} loading={tasksState.loading} />
        <StatCard label="Due today" value={stats.dueToday} hint="Needs attention today" tone="gold" icon={<Clock3 className="h-4 w-4" />} loading={tasksState.loading} />
        <StatCard label="Overdue" value={stats.overdue} hint="Past the promised time" tone="brand" icon={<AlertTriangle className="h-4 w-4" />} loading={tasksState.loading} />
        <StatCard label="Completed" value={stats.completed} hint="In the loaded queue" tone="sage" icon={<CheckCircle2 className="h-4 w-4" />} loading={tasksState.loading} />
      </div>

      {tasksState.error ? (
        <ErrorState message={tasksState.error} onRetry={tasksState.reload} help="production" />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(task) => task.id}
          loading={tasksState.loading}
          searchable
          searchPlaceholder="Search product, source or assignee…"
          searchFields={(task) => [task.productName, task.sourceNumber, task.assignedToName, task.notes]}
          exportFilename={`production-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          onRowClick={(task) => setSelected(task)}
          emptyTitle={statusFilter === 'open' ? 'No open production work' : 'No production tasks'}
          emptyDescription="Refresh from orders and bookings to create tasks for confirmed lines. Completed history is never deleted."
          emptyAction={<Button onClick={handleSync} loading={syncing} leftIcon={<RefreshCw className="h-4 w-4" />}>Refresh queue</Button>}
          toolbar={
            <>
              <SelectField
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                options={[
                  { value: 'open', label: 'Open work' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'all', label: 'All statuses' },
                ]}
                containerClassName="w-36"
              />
              <SelectField
                aria-label="Filter by department"
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                options={[
                  { value: 'all', label: 'All departments' },
                  ...departments.filter((department) => department.active).map((department) => ({ value: department.id, label: department.name })),
                ]}
                containerClassName="w-44"
              />
            </>
          }
          mobileTitle={(task) => task.productName}
          mobileSubtitle={(task) => `${task.sourceNumber} · ${formatDateTime(task.dueAt)}`}
          mobileMeta={(task) => <StatusBadge status={task.status} />}
          rowActions={(task) => (
            <Button size="sm" variant="outline" onClick={() => setSelected(task)} leftIcon={<UserRoundCheck className="h-3.5 w-3.5" />}>
              Update
            </Button>
          )}
          caption="Production tasks are linked to source order or booking lines. Cancelled source lines do not erase completed work."
        />
      )}

      <ProductionTaskDialog
        task={selected}
        events={eventsState.rows}
        eventsLoading={eventsState.loading}
        departments={departments}
        onClose={() => setSelected(null)}
        onSaved={() => setSelected(null)}
      />
    </div>
  )
}

function ProductionTaskDialog({
  task,
  events,
  eventsLoading,
  departments,
  onClose,
  onSaved,
}: {
  task: ProductionTask | null
  events: ProductionEvent[]
  eventsLoading: boolean
  departments: Array<{ id: string; name: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<DirectoryEntry[]>([])
  const [assignee, setAssignee] = useState('')
  const [completed, setCompleted] = useState('')
  const [rejected, setRejected] = useState('')
  const [rework, setRework] = useState('')
  const [note, setNote] = useState('')
  const [quality, setQuality] = useState<'pending' | 'passed' | 'rejected' | 'rework'>('pending')
  const [cancelReason, setCancelReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!task) return
    setAssignee(task.assignedTo ?? '')
    setCompleted(String(remaining(task) || ''))
    setRejected('')
    setRework('')
    setNote('')
    setQuality(task.qualityStatus)
    setCancelReason('')
    loadStaffDirectory(task.outletId, task.departmentId)
      .then(setStaff)
      .catch(() => setStaff([]))
    // Reset the form only when a different task is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  if (!task) return null
  const canManage = hasPermission(profile, 'productionManage')
  const open = task.status === 'pending' || task.status === 'in_progress'
  const departmentName = departments.find((department) => department.id === task.departmentId)?.name ?? task.departmentId

  async function run(action: string, operation: () => Promise<unknown>, success: string) {
    setBusy(action)
    try {
      await operation()
      toast.success(success)
      onSaved()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(openState) => { if (!openState) onClose() }}
      title={task.productName}
      description={`${task.sourceNumber} · ${departmentName} · ${formatQuantity(task.requiredQty, task.unit)} required`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canManage && task.status === 'pending' && (
            <Button onClick={() => run('start', () => startProductionTask(task.id), 'Production started')} loading={busy === 'start'} leftIcon={<Play className="h-4 w-4" />}>
              Start work
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-ivory-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Required</p>
            <p className="mt-1 font-display text-lg font-semibold">{formatQuantity(task.requiredQty, task.unit)}</p>
          </div>
          <div className="rounded-xl bg-ivory-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Completed</p>
            <p className="mt-1 font-display text-lg font-semibold text-sage-700">{formatQuantity(task.completedQty, task.unit)}</p>
          </div>
          <div className="rounded-xl bg-ivory-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Remaining</p>
            <p className="mt-1 font-display text-lg font-semibold text-brand-700">{formatQuantity(remaining(task), task.unit)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <Badge tone={task.qualityStatus === 'rejected' ? 'danger' : task.qualityStatus === 'passed' ? 'success' : 'neutral'}>
            Quality: {titleCase(task.qualityStatus)}
          </Badge>
          <Badge tone={task.priority === 'urgent' ? 'warning' : 'neutral'}>{titleCase(task.priority)} priority</Badge>
          <span className="text-xs text-ink-500">Due {formatDateTime(task.dueAt)}</span>
        </div>

        {canManage && open && (
          <>
            <section className="rounded-xl border border-ink-200 p-4">
              <h3 className="text-sm font-semibold text-ink-900">Assign</h3>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <SelectField
                  label="Staff member"
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  options={staff.map((member) => ({ value: member.uid, label: `${member.displayName} · ${titleCase(member.role)}` }))}
                  placeholder="Unassigned"
                  containerClassName="flex-1"
                />
                <Button
                  variant="outline"
                  disabled={!assignee}
                  loading={busy === 'assign'}
                  onClick={() => run('assign', () => assignProductionTask(task.id, assignee), 'Task assigned')}
                >
                  Save assignment
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-ink-200 p-4">
              <h3 className="text-sm font-semibold text-ink-900">Record completion</h3>
              <p className="mt-1 text-xs text-ink-500">Partial quantities can be added as each batch finishes. Rejected quantity never counts as completed.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextField label={`Completed now (${task.unit})`} type="number" min="0" step="0.001" max={remaining(task)} value={completed} onChange={(event) => setCompleted(event.target.value)} />
                <TextField label={`Rejected (${task.unit})`} type="number" min="0" step="0.001" value={rejected} onChange={(event) => setRejected(event.target.value)} />
                <TextField label={`Rework (${task.unit})`} type="number" min="0" step="0.001" value={rework} onChange={(event) => setRework(event.target.value)} />
              </div>
              <TextareaField label="Note" containerClassName="mt-3" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
              <Button
                className="mt-3"
                loading={busy === 'progress'}
                onClick={() => run(
                  'progress',
                  () => recordProductionProgress(task.id, Number(completed), {
                    rejectedDelta: Number(rejected) || 0,
                    reworkDelta: Number(rework) || 0,
                    note: note || undefined,
                  }),
                  'Production progress recorded',
                )}
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                Record progress
              </Button>
            </section>

            <section className="rounded-xl border border-ink-200 p-4">
              <h3 className="text-sm font-semibold text-ink-900">Quality decision</h3>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <SelectField
                  label="Quality status"
                  value={quality}
                  onChange={(event) => setQuality(event.target.value as typeof quality)}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'passed', label: 'Passed' },
                    { value: 'rejected', label: 'Rejected' },
                    { value: 'rework', label: 'Rework' },
                  ]}
                  containerClassName="flex-1"
                />
                <Button
                  variant="outline"
                  loading={busy === 'quality'}
                  onClick={() => run('quality', () => recordProductionQuality(task.id, quality, note || undefined), 'Quality decision saved')}
                >
                  Save quality
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <h3 className="text-sm font-semibold text-brand-900">Cancel this task</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <TextField label="Reason" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} containerClassName="flex-1" />
                <Button
                  variant="danger"
                  disabled={!cancelReason.trim()}
                  loading={busy === 'cancel'}
                  onClick={() => run('cancel', () => cancelProductionTask(task.id, cancelReason), 'Task cancelled')}
                >
                  Cancel task
                </Button>
              </div>
            </section>
          </>
        )}

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900"><History className="h-4 w-4" /> History</h3>
          {eventsLoading ? (
            <p className="mt-2 text-xs text-ink-500">Loading history…</p>
          ) : events.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">No history entries yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3 rounded-lg bg-ivory-50 px-3 py-2 text-xs">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="font-medium text-ink-800">{titleCase(event.action)} by {event.actorName}{event.quantity ? ` · ${formatQuantity(event.quantity, task.unit)}` : ''}</p>
                    {event.note && <p className="mt-0.5 text-ink-500">{event.note}</p>}
                    <p className="mt-0.5 text-[10px] text-ink-400">{formatDateTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  )
}
