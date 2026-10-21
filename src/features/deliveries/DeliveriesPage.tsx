import { useEffect, useMemo, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'
import {
  BadgeIndianRupee,
  CheckCircle2,
  MapPin,
  PackageCheck,
  Plus,
  Send,
  Truck,
  UserRoundCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { bookingsQuery, ordersQuery } from '@/data/queries'
import { deliveryEventsQuery, deliveriesQuery } from '@/data/operationsQueries'
import {
  assignDelivery,
  collectDeliveryPayment,
  completeDelivery,
  createDelivery,
  dispatchDelivery,
} from '@/data/delivery'
import { loadStaffDirectory, type DirectoryEntry } from '@/data/directory'
import type { Booking, Delivery, DeliveryEvent, DeliveryStatus, Order } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { formatDateTime, formatINR, formatQuantity, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { uniqueId } from '@/lib/utils'

const OPEN_STATUSES: DeliveryStatus[] = ['pending', 'assigned', 'dispatched']

export function DeliveriesPage() {
  const { profile } = useAuth()
  const { selectedOutlet } = useWorkspace()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [statusFilter, setStatusFilter] = useState('open')

  const outletId = selectedOutlet?.id ?? ''
  const deliveriesState = useCollectionData<Delivery>(
    () => (profile && outletId ? deliveriesQuery(outletId, profile, 500) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const ordersState = useCollectionData<Order>(
    () => (profile && outletId ? ordersQuery(outletId, profile, 400) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const bookingsState = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsQuery(outletId, profile, 400) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const eventsState = useCollectionData<DeliveryEvent>(
    () => selected && outletId ? deliveryEventsQuery(selected.id, outletId, profile!, 80) : null,
    [selected?.id, outletId, profile?.uid, profile?.role],
    Boolean(selected && outletId && profile),
  )

  const rows = useMemo(
    () => deliveriesState.rows.filter((delivery) => {
      if (statusFilter === 'open') return OPEN_STATUSES.includes(delivery.status)
      if (statusFilter === 'all') return true
      return delivery.status === statusFilter
    }),
    [deliveriesState.rows, statusFilter],
  )

  const stats = useMemo(() => {
    const open = deliveriesState.rows.filter((delivery) => OPEN_STATUSES.includes(delivery.status))
    return {
      open: open.length,
      dispatched: deliveriesState.rows.filter((delivery) => delivery.status === 'dispatched').length,
      completedToday: deliveriesState.rows.filter((delivery) => delivery.completedAt && isToday(parseISO(delivery.completedAt)) && ['delivered', 'partially_delivered'].includes(delivery.status)).length,
      collectedToday: deliveriesState.rows.filter((delivery) => delivery.completedAt && isToday(parseISO(delivery.completedAt))).reduce((sum, delivery) => sum + delivery.collectedPaise, 0),
    }
  }, [deliveriesState.rows])

  const existingSources = useMemo(
    () => new Set(deliveriesState.rows.map((delivery) => `${delivery.sourceType}:${delivery.sourceId}`)),
    [deliveriesState.rows],
  )
  const eligible = useMemo(() => {
    const orders = ordersState.rows
      .filter((order) => order.orderType === 'delivery' && ['confirmed', 'preparing', 'ready'].includes(order.status))
      .filter((order) => !existingSources.has(`order:${order.id}`))
      .map((order) => ({
        key: `order:${order.id}`,
        sourceType: 'order' as const,
        sourceId: order.id,
        number: order.orderNumber,
        customer: order.customerName,
        balance: order.balancePaise,
        when: order.pickupAt || order.createdAt,
      }))
    const bookings = bookingsState.rows
      .filter((booking) => booking.fulfillment === 'delivery' && ['confirmed', 'in_production', 'ready'].includes(booking.status))
      .filter((booking) => !existingSources.has(`booking:${booking.id}`))
      .map((booking) => ({
        key: `booking:${booking.id}`,
        sourceType: 'booking' as const,
        sourceId: booking.id,
        number: booking.bookingNumber,
        customer: booking.customerName,
        balance: booking.balancePaise,
        when: `${booking.eventDate}T${booking.eventTime}`,
      }))
    return [...orders, ...bookings].sort((a, b) => a.when.localeCompare(b.when))
  }, [ordersState.rows, bookingsState.rows, existingSources])

  const sourceFor = (delivery: Delivery) =>
    delivery.sourceType === 'order'
      ? ordersState.rows.find((order) => order.id === delivery.sourceId)
      : bookingsState.rows.find((booking) => booking.id === delivery.sourceId)

  const columns: DataColumn<Delivery>[] = [
    {
      key: 'number',
      header: 'Delivery',
      accessor: (delivery) => delivery.deliveryNumber,
      render: (delivery) => (
        <div>
          <p className="font-semibold text-ink-900">{delivery.deliveryNumber}</p>
          <p className="text-[11px] text-ink-500">{delivery.sourceNumber} · {delivery.customerName}</p>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'scheduled',
      header: 'Scheduled',
      accessor: (delivery) => delivery.scheduledAt,
      render: (delivery) => formatDateTime(delivery.scheduledAt),
      sortable: true,
    },
    {
      key: 'address',
      header: 'Address',
      accessor: (delivery) => delivery.address || '—',
      hideBelow: 'lg',
    },
    {
      key: 'assignee',
      header: 'Assignee',
      accessor: (delivery) => delivery.assignedToName ?? 'Unassigned',
      hideBelow: 'md',
    },
    {
      key: 'collected',
      header: 'Collected',
      accessor: (delivery) => delivery.collectedPaise,
      render: (delivery) => formatINR(delivery.collectedPaise),
      align: 'right',
      hideBelow: 'lg',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (delivery) => delivery.status,
      render: (delivery) => <StatusBadge status={delivery.status} />,
    },
  ]

  if (!hasPermission(profile, 'deliveryView')) {
    return <ErrorState title="Deliveries are not available" message="Your role does not include View deliveries." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={selectedOutlet?.name}
        title="Deliveries"
        description="Assign, dispatch and close delivery orders and party bookings with item quantities, timestamps, responsible staff and cash collection."
        help="deliveries"
        actions={hasPermission(profile, 'deliveryManage') ? <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Create delivery</Button> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open deliveries" value={stats.open} hint="Pending, assigned or dispatched" icon={<Truck className="h-4 w-4" />} loading={deliveriesState.loading} />
        <StatCard label="On the road" value={stats.dispatched} hint="Dispatched and awaiting close" tone="gold" icon={<Send className="h-4 w-4" />} loading={deliveriesState.loading} />
        <StatCard label="Completed today" value={stats.completedToday} hint="Delivered or partially delivered" tone="sage" icon={<CheckCircle2 className="h-4 w-4" />} loading={deliveriesState.loading} />
        <StatCard label="Cash collected today" value={formatINR(stats.collectedToday)} hint="Against closed deliveries" tone="brand" icon={<BadgeIndianRupee className="h-4 w-4" />} loading={deliveriesState.loading} />
      </div>

      {deliveriesState.error ? (
        <ErrorState message={deliveriesState.error} onRetry={deliveriesState.reload} help="deliveries" />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(delivery) => delivery.id}
          loading={deliveriesState.loading}
          searchPlaceholder="Search delivery, source, customer or address…"
          searchFields={(delivery) => [delivery.deliveryNumber, delivery.sourceNumber, delivery.customerName, delivery.customerPhone, delivery.address, delivery.assignedToName]}
          exportFilename={`deliveries-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle={statusFilter === 'open' ? 'No open deliveries' : 'No deliveries'}
          emptyDescription="Create a delivery from an eligible delivery order or booking. Delivery records are separate from the commercial sale and payment."
          emptyAction={hasPermission(profile, 'deliveryManage') ? <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Create delivery</Button> : undefined}
          toolbar={
            <SelectField
              aria-label="Filter delivery status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'pending', label: 'Pending' },
                { value: 'assigned', label: 'Assigned' },
                { value: 'dispatched', label: 'Dispatched' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'partially_delivered', label: 'Partially delivered' },
                { value: 'failed', label: 'Failed' },
                { value: 'returned', label: 'Returned' },
                { value: 'all', label: 'All statuses' },
              ]}
              containerClassName="w-44"
            />
          }
          mobileTitle={(delivery) => delivery.deliveryNumber}
          mobileSubtitle={(delivery) => `${delivery.customerName} · ${formatDateTime(delivery.scheduledAt)}`}
          mobileMeta={(delivery) => <StatusBadge status={delivery.status} />}
          rowActions={(delivery) => <Button size="sm" variant="outline" onClick={() => setSelected(delivery)}>Manage</Button>}
          caption="Completing a delivery does not automatically cancel or refund the sale. Returned, damaged or undelivered quantities are marked pending reconciliation; stock and paid totals are not changed. Cash collected here posts a normal receipt once only."
        />
      )}

      <CreateDeliveryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        eligible={eligible}
      />
      <ManageDeliveryDialog
        delivery={selected}
        events={eventsState.rows}
        eventsLoading={eventsState.loading}
        source={selected ? sourceFor(selected) : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

function CreateDeliveryDialog({
  open,
  onOpenChange,
  eligible,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eligible: Array<{ key: string; sourceType: 'order' | 'booking'; sourceId: string; number: string; customer: string; balance: number; when: string }>
}) {
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const source = eligible.find((item) => item.key === selected)

  async function submit() {
    if (!source) {
      toast.error('Choose an eligible order or booking.')
      return
    }
    setBusy(true)
    try {
      const result = await createDelivery(source.sourceType, source.sourceId)
      toast.success(`Delivery ${result.deliveryId ? 'created' : 'found'} for ${source.number}`)
      setSelected('')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create delivery"
      description="Only delivery orders and delivery bookings without an existing delivery record are listed."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy} leftIcon={<Truck className="h-4 w-4" />}>Create delivery</Button></>}
    >
      <div className="space-y-3">
        <SelectField
          label="Order or booking"
          required
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          options={eligible.map((item) => ({
            value: item.key,
            label: `${item.number} · ${item.customer} · ${formatINR(item.balance)} balance`,
          }))}
          placeholder={eligible.length ? 'Choose a source' : 'No eligible sources'}
        />
        {source && (
          <div className="rounded-xl bg-ivory-100 p-3 text-sm">
            <p className="font-semibold">{source.customer}</p>
            <p className="mt-1 text-xs text-ink-500">Scheduled {formatDateTime(source.when)} · Outstanding {formatINR(source.balance)}</p>
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-500">Delivery quantities are copied from the source lines. A later source edit does not silently rewrite delivery history; reconcile through the delivery record.</p>
      </div>
    </Dialog>
  )
}

function ManageDeliveryDialog({
  delivery,
  events,
  eventsLoading,
  source,
  onClose,
}: {
  delivery: Delivery | null
  events: DeliveryEvent[]
  eventsLoading: boolean
  source: Order | Booking | undefined
  onClose: () => void
}) {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<DirectoryEntry[]>([])
  const [assignee, setAssignee] = useState('')
  const [lines, setLines] = useState<Record<string, { deliveredQty: string; returnedQty: string; damagedQty: string }>>({})
  const [status, setStatus] = useState<'delivered' | 'partially_delivered' | 'failed' | 'returned'>('delivered')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'>('cash')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!delivery) return
    setAssignee(delivery.assignedTo ?? '')
    setLines(Object.fromEntries(delivery.lines.map((line) => [line.lineId, {
      deliveredQty: String(line.deliveredQty),
      returnedQty: String(line.returnedQty),
      damagedQty: String(line.damagedQty),
    }])))
    setStatus(delivery.status === 'failed' || delivery.status === 'returned' || delivery.status === 'partially_delivered' ? delivery.status : 'delivered')
    setNote('')
    setAmount(source && 'balancePaise' in source ? String(source.balancePaise / 100) : '')
    setReference('')
    loadStaffDirectory(delivery.outletId)
      .then(setStaff)
      .catch(() => setStaff([]))
    // Only reset the form when the delivery identity changes, not on every live snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.id, source])

  if (!delivery) return null
  const canManage = hasPermission(profile, 'deliveryManage')
  const canCollect = hasPermission(profile, 'paymentsManage')
  const open = OPEN_STATUSES.includes(delivery.status)
  const balance = source && 'balancePaise' in source ? source.balancePaise : null
  const reconciliationPending = delivery.reconciliationStatus === 'pending'
    || ['failed', 'returned', 'partially_delivered'].includes(delivery.status)

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key)
    try {
      await operation()
      toast.success(success)
      onClose()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(null)
    }
  }

  function updateLine(lineId: string, field: 'deliveredQty' | 'returnedQty' | 'damagedQty', value: string) {
    setLines((current) => ({ ...current, [lineId]: { ...current[lineId], [field]: value } }))
  }

  return (
    <Dialog
      open={Boolean(delivery)}
      onOpenChange={(openState) => { if (!openState) onClose() }}
      title={delivery.deliveryNumber}
      description={`${delivery.sourceNumber} · ${delivery.customerName} · ${delivery.address || 'No address recorded'}`}
      size="xl"
      footer={<><Button variant="outline" onClick={onClose}>Close</Button>{canManage && delivery.status === 'assigned' && <Button onClick={() => run('dispatch', () => dispatchDelivery(delivery.id), 'Delivery dispatched')} loading={busy === 'dispatch'} leftIcon={<Send className="h-4 w-4" />}>Dispatch</Button>}</>}
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Status</p><div className="mt-1"><StatusBadge status={delivery.status} /></div></div>
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Scheduled</p><p className="mt-1 text-sm font-semibold">{formatDateTime(delivery.scheduledAt)}</p></div>
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Collected</p><p className="mt-1 text-sm font-semibold">{formatINR(delivery.collectedPaise)}</p></div>
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Source balance</p><p className="mt-1 text-sm font-semibold">{balance === null ? '—' : formatINR(balance)}</p></div>
        </div>

        {reconciliationPending && (
          <div className="rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-ink-700" role="status">
            <p className="font-semibold">Reconciliation pending</p>
            <p className="mt-1 text-xs leading-relaxed">
              Returned, damaged or undelivered quantities are recorded on this delivery only. Stock and the source
              order or booking were not changed. Do not treat stock or balances as reconciled until the business
              decides the return, restock or write-off policy.
            </p>
          </div>
        )}

        {canManage && open && (
          <section className="rounded-xl border border-ink-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><UserRoundCheck className="h-4 w-4" /> Assign delivery staff</h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <SelectField label="Staff member" value={assignee} onChange={(event) => setAssignee(event.target.value)} options={staff.map((member) => ({ value: member.uid, label: `${member.displayName} · ${titleCase(member.role)}` }))} placeholder="Unassigned" containerClassName="flex-1" />
              <Button variant="outline" disabled={!assignee} loading={busy === 'assign'} onClick={() => run('assign', () => assignDelivery(delivery.id, assignee), 'Delivery assigned')}>Save assignment</Button>
            </div>
          </section>
        )}

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> Delivery lines</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-ink-200 text-left text-[10px] font-bold uppercase tracking-wider text-ink-500">
                <tr><th className="pb-2">Item</th><th className="pb-2 text-right">Expected</th><th className="pb-2">Delivered</th><th className="pb-2">Returned</th><th className="pb-2">Damaged</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {delivery.lines.map((line) => (
                  <tr key={line.lineId}>
                    <td className="py-2 pr-3 font-medium">{line.name}<span className="block text-[11px] text-ink-500">{formatQuantity(line.expectedQty, line.unit)}</span></td>
                    <td className="py-2 text-right tabular-nums">{formatQuantity(line.expectedQty, line.unit)}</td>
                    <td className="py-2"><input aria-label={`Delivered ${line.name}`} className="field-input h-9 w-24 text-right" type="number" min="0" step="0.001" max={line.expectedQty} value={lines[line.lineId]?.deliveredQty ?? '0'} onChange={(event) => updateLine(line.lineId, 'deliveredQty', event.target.value)} disabled={!canManage || !open} /></td>
                    <td className="py-2"><input aria-label={`Returned ${line.name}`} className="field-input h-9 w-24 text-right" type="number" min="0" step="0.001" value={lines[line.lineId]?.returnedQty ?? '0'} onChange={(event) => updateLine(line.lineId, 'returnedQty', event.target.value)} disabled={!canManage || !open} /></td>
                    <td className="py-2"><input aria-label={`Damaged ${line.name}`} className="field-input h-9 w-24 text-right" type="number" min="0" step="0.001" value={lines[line.lineId]?.damagedQty ?? '0'} onChange={(event) => updateLine(line.lineId, 'damagedQty', event.target.value)} disabled={!canManage || !open} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canManage && open && (
          <section className="rounded-xl border border-ink-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4" /> Close delivery</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectField label="Outcome" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} options={[{ value: 'delivered', label: 'Delivered in full' }, { value: 'partially_delivered', label: 'Partially delivered' }, { value: 'failed', label: 'Failed' }, { value: 'returned', label: 'Returned' }]} />
              <TextField label="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
            </div>
            <Button
              className="mt-3"
              loading={busy === 'complete'}
              onClick={() => run('complete', () => completeDelivery(
                delivery.id,
                status,
                delivery.lines.map((line) => ({
                  lineId: line.lineId,
                  deliveredQty: Number(lines[line.lineId]?.deliveredQty) || 0,
                  returnedQty: Number(lines[line.lineId]?.returnedQty) || 0,
                  damagedQty: Number(lines[line.lineId]?.damagedQty) || 0,
                })),
                note || undefined,
              ), 'Delivery closed')}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Save delivery outcome
            </Button>
          </section>
        )}

        {canManage && !canCollect && !['failed', 'returned'].includes(delivery.status) && (
          <p className="rounded-xl bg-gold-50 px-3 py-2 text-xs text-ink-600">
            Collecting payment requires the Record &amp; manage payments permission. The delivery itself can still be
            saved without collecting here.
          </p>
        )}

        {canManage && canCollect && !['failed', 'returned'].includes(delivery.status) && (
          <section className="rounded-xl border border-ink-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><BadgeIndianRupee className="h-4 w-4" /> Collect cash / payment</h3>
            <p className="mt-1 text-xs text-ink-500">Posts a normal receipt against {delivery.sourceNumber}. A retry with the same request is prevented by the server transaction.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField label="Amount (₹)" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <SelectField label="Mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'other', label: 'Other' }]} />
              <TextField label="Reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} containerClassName="sm:col-span-2" />
            </div>
            <Button
              className="mt-3"
              variant="secondary"
              loading={busy === 'collect'}
              disabled={!amount || Number(amount) <= 0}
              onClick={() => run('collect', () => collectDeliveryPayment(delivery.id, {
                requestId: uniqueId(),
                amountPaise: Math.round(Number(amount) * 100),
                mode,
                reference: reference || undefined,
                notes: note || undefined,
              }), 'Payment collected')}
            >
              Collect payment
            </Button>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold">History</h3>
          {eventsLoading ? <p className="mt-2 text-xs text-ink-500">Loading history…</p> : events.length === 0 ? <p className="mt-2 text-xs text-ink-500">No history yet.</p> : (
            <ol className="mt-2 space-y-1.5">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg bg-ivory-50 px-3 py-2 text-xs">
                  <span className="font-medium">{titleCase(event.action)}</span> · {event.actorName}
                  {event.note ? ` · ${event.note}` : ''}
                  <span className="block text-[10px] text-ink-400">{formatDateTime(event.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  )
}
