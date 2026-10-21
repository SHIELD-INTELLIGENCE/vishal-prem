import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type {
  Booking,
  Order,
  OrderLine,
  ProductionEvent,
  ProductionTask,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { serverNow } from '../utils'
import { requireDepartmentScope, requireOutletScope, requirePermission } from './context'
import { OperationError } from './errors'
import type { ProductionOperationInput } from './validation'

const SYNC_PAGE_SIZE = 300
const SYNC_MAX_DOCUMENTS = 20_000
const BATCH_WRITE_LIMIT = 400

export interface ProductionSyncResult {
  created: number
  updated: number
  total: number
}

function taskIdFor(sourceType: 'order' | 'booking', sourceId: string, lineId: string): string {
  return `prod-${sourceType}-${sourceId}-${lineId}`
}

function dueForOrder(order: Order): string {
  return order.pickupAt || order.createdAt
}

function dueForBooking(booking: Booking): string {
  const parsed = new Date(`${booking.eventDate}T${booking.eventTime || '23:59'}:00`)
  return Number.isNaN(parsed.getTime()) ? booking.createdAt : parsed.toISOString()
}

function taskStatusForSource(status: string): ProductionTask['status'] {
  if (status === 'ready' || status === 'completed') return 'completed'
  if (status === 'preparing' || status === 'in_production') return 'in_progress'
  return 'pending'
}

function eventFor(
  task: ProductionTask,
  action: ProductionEvent['action'],
  actorName: string,
  now: string,
  note?: string,
  quantity?: number,
  eventId?: string,
): ProductionEvent {
  return {
    id: eventId ?? `${task.id}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: task.id,
    outletId: task.outletId,
    departmentId: task.departmentId,
    action,
    quantity,
    note,
    actorName,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Reads every document in an outlet-scoped collection. The loop is deliberately
 * paginated rather than silently capped: if the safety ceiling is reached, the
 * caller gets an actionable failure instead of an incomplete sync.
 */
async function readAllByOutlet<T extends { id: string }>(
  collectionName: string,
  outletId: string,
): Promise<Array<T & { id: string }>> {
  const db = getAdminDb()
  const rows: Array<T & { id: string }> = []
  let last: QueryDocumentSnapshot | undefined

  for (;;) {
    let page = db
      .collection(collectionName)
      .where('outletId', '==', outletId)
      .limit(SYNC_PAGE_SIZE)
    if (last) page = page.startAfter(last)
    const snapshot = await page.get()
    for (const item of snapshot.docs) {
      rows.push({ ...(item.data() as T), id: item.id })
    }
    if (snapshot.docs.length < SYNC_PAGE_SIZE) break
    last = snapshot.docs[snapshot.docs.length - 1]
    if (rows.length > SYNC_MAX_DOCUMENTS) {
      throw new OperationError(
        'failed-precondition',
        `Production sync found more than ${SYNC_MAX_DOCUMENTS} records for this outlet. Narrow the outlet scope before retrying; no incomplete sync was reported as complete.`,
      )
    }
  }

  return rows
}

/**
 * Creates or refreshes production tasks from open order and booking lines.
 * Existing task history is never deleted; completed work stays completed and
 * removed or cancelled source lines are cancelled with a recorded event.
 */
export async function syncProductionForActor(
  profile: UserProfile,
  outletId: string,
): Promise<ProductionSyncResult> {
  requirePermission(profile, 'productionManage')
  requireOutletScope(profile, outletId)

  const db = getAdminDb()
  const [orders, bookings, existingTasks] = await Promise.all([
    readAllByOutlet<Order>('orders', outletId),
    readAllByOutlet<Booking>('bookings', outletId),
    readAllByOutlet<ProductionTask>('productionTasks', outletId),
  ])

  const sourceByKey = new Map<string, Order | Booking>()
  const lineByKey = new Map<string, OrderLine>()
  for (const order of orders) {
    sourceByKey.set(`order:${order.id}`, order)
    for (const line of order.lines ?? []) {
      lineByKey.set(`order:${order.id}:${line.id}`, {
        ...line,
        departmentId: line.departmentId || order.departmentId,
      })
    }
  }
  for (const booking of bookings) {
    sourceByKey.set(`booking:${booking.id}`, booking)
    for (const line of booking.lines ?? []) {
      lineByKey.set(`booking:${booking.id}:${line.id}`, line)
    }
  }

  type Candidate = {
    sourceType: 'order' | 'booking'
    sourceId: string
    sourceNumber: string
    lineId: string
    outletId: string
    departmentId: string
    productId: string
    productName: string
    unit: string
    requiredQty: number
    dueAt: string
    sourceStatus: string
  }

  const candidatesById = new Map<string, Candidate>()
  for (const order of orders) {
    if (!['confirmed', 'preparing', 'ready'].includes(order.status)) continue
    if (!order.departmentId) continue
    for (const line of order.lines ?? []) {
      const candidate: Candidate = {
        sourceType: 'order',
        sourceId: order.id,
        sourceNumber: order.orderNumber,
        lineId: line.id,
        outletId: order.outletId,
        departmentId: line.departmentId || order.departmentId,
        productId: line.productId,
        productName: line.name,
        unit: line.unit,
        requiredQty: line.quantity,
        dueAt: dueForOrder(order),
        sourceStatus: order.status,
      }
      candidatesById.set(taskIdFor(candidate.sourceType, candidate.sourceId, candidate.lineId), candidate)
    }
  }
  for (const booking of bookings) {
    if (!['confirmed', 'in_production', 'ready'].includes(booking.status)) continue
    for (const line of booking.lines ?? []) {
      if (!line.departmentId) continue
      const candidate: Candidate = {
        sourceType: 'booking',
        sourceId: booking.id,
        sourceNumber: booking.bookingNumber,
        lineId: line.id,
        outletId: booking.outletId,
        departmentId: line.departmentId,
        productId: line.productId,
        productName: line.name,
        unit: line.unit,
        requiredQty: line.quantity,
        dueAt: dueForBooking(booking),
        sourceStatus: booking.status,
      }
      candidatesById.set(taskIdFor(candidate.sourceType, candidate.sourceId, candidate.lineId), candidate)
    }
  }

  const candidates = [...candidatesById.values()].filter((candidate) => {
    try {
      requireDepartmentScope(profile, candidate.departmentId)
      return true
    } catch {
      return false
    }
  })
  const existingById = new Map(existingTasks.map((task) => [task.id, task]))

  const now = serverNow()
  const actorName = profile.displayName || profile.email || profile.uid
  let batch = db.batch()
  let writes = 0
  let created = 0
  let updated = 0

  async function flushIfNeeded(): Promise<void> {
    if (writes < BATCH_WRITE_LIMIT) return
    await batch.commit()
    batch = db.batch()
    writes = 0
  }

  // Reconcile every existing scoped task, including tasks whose source line
  // was removed or whose source was cancelled/completed after the last sync.
  for (const task of existingTasks) {
    try {
      requireDepartmentScope(profile, task.departmentId)
    } catch {
      continue
    }
    if (task.status === 'cancelled') continue

    const source = sourceByKey.get(`${task.sourceType}:${task.sourceId}`)
    const line = lineByKey.get(`${task.sourceType}:${task.sourceId}:${task.lineId}`)
    if (!source || !line || source.status === 'cancelled') {
      if (task.status === 'completed') continue
      const note = !source
        ? 'Source document no longer exists; task cancelled by production sync.'
        : !line
          ? 'Source line was removed; task cancelled by production sync.'
          : 'Source was cancelled; task cancelled by production sync.'
      const cancelled = { ...task, status: 'cancelled' as const }
      batch.update(db.collection('productionTasks').doc(task.id), {
        status: 'cancelled',
        notes: task.notes || note,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      batch.set(
        db.collection('productionEvents').doc(`${task.id}-sync-cancelled`),
        eventFor(cancelled, 'cancelled', actorName, now, note, undefined, `${task.id}-sync-cancelled`),
      )
      writes += 2
      updated += 1
      await flushIfNeeded()
      continue
    }

    const status = taskStatusForSource(source.status)
    const dueAt = task.sourceType === 'order'
      ? dueForOrder(source as Order)
      : dueForBooking(source as Booking)
    const next: Partial<ProductionTask> = {
      requiredQty: line.quantity,
      dueAt,
      updatedAt: now,
      updatedBy: profile.uid,
    }
    let completedNow = false
    if (status === 'completed' && task.status !== 'completed') {
      next.status = 'completed'
      next.completedQty = Math.max(task.completedQty, line.quantity)
      next.completedAt = now
      next.qualityStatus = task.qualityStatus === 'pending' ? 'passed' : task.qualityStatus
      completedNow = true
    } else if (status === 'in_progress' && task.status === 'pending') {
      next.status = 'in_progress'
      next.startedAt = task.startedAt ?? now
    }

    batch.update(db.collection('productionTasks').doc(task.id), next)
    writes += 1
    if (completedNow) {
      batch.set(
        db.collection('productionEvents').doc(`${task.id}-sync-completed`),
        eventFor(
          { ...task, ...next, status: 'completed' },
          'completed',
          actorName,
          now,
          'Source marked ready or completed during production sync.',
          line.quantity,
          `${task.id}-sync-completed`,
        ),
      )
      writes += 1
    }
    updated += 1
    await flushIfNeeded()
  }

  for (const candidate of candidates) {
    const taskId = taskIdFor(candidate.sourceType, candidate.sourceId, candidate.lineId)
    if (existingById.has(taskId)) continue
    const status = taskStatusForSource(candidate.sourceStatus)
    const task: ProductionTask = {
      id: taskId,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      sourceNumber: candidate.sourceNumber,
      lineId: candidate.lineId,
      outletId: candidate.outletId,
      departmentId: candidate.departmentId,
      productId: candidate.productId,
      productName: candidate.productName,
      unit: candidate.unit,
      requiredQty: candidate.requiredQty,
      completedQty: status === 'completed' ? candidate.requiredQty : 0,
      rejectedQty: 0,
      reworkQty: 0,
      dueAt: candidate.dueAt,
      status,
      qualityStatus: status === 'completed' ? 'passed' : 'pending',
      priority: new Date(candidate.dueAt).getTime() - Date.now() <= 86_400_000 ? 'urgent' : 'normal',
      startedAt: status === 'in_progress' || status === 'completed' ? now : undefined,
      completedAt: status === 'completed' ? now : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: profile.uid,
      updatedBy: profile.uid,
    }
    batch.set(db.collection('productionTasks').doc(taskId), task)
    batch.set(
      db.collection('productionEvents').doc(`${taskId}-created`),
      eventFor(task, 'created', actorName, now, undefined, undefined, `${taskId}-created`),
    )
    writes += 2
    created += 1
    await flushIfNeeded()
  }

  if (writes > 0) await batch.commit()
  return { created, updated, total: candidates.length }
}

async function requireTask(profile: UserProfile, taskId: string): Promise<ProductionTask> {
  const snapshot = await getAdminDb().collection('productionTasks').doc(taskId).get()
  if (!snapshot.exists) throw new OperationError('not-found', 'This production task no longer exists.')
  const task = { ...(snapshot.data() as ProductionTask), id: snapshot.id }
  requireOutletScope(profile, task.outletId)
  requireDepartmentScope(profile, task.departmentId)
  return task
}

async function runTaskTransaction(
  taskId: string,
  update: (task: ProductionTask, now: string) => {
    patch: Partial<ProductionTask>
    event: ProductionEvent
  },
): Promise<ProductionTask> {
  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const ref = db.collection('productionTasks').doc(taskId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new OperationError('not-found', 'This production task no longer exists.')
    const task = { ...(snapshot.data() as ProductionTask), id: snapshot.id }
    if (task.status === 'cancelled') {
      throw new OperationError('failed-precondition', 'This production task is cancelled.')
    }
    const now = serverNow()
    const { patch, event } = update(task, now)
    const next = { ...task, ...patch }
    transaction.update(ref, patch)
    transaction.set(db.collection('productionEvents').doc(event.id), event)
    return next
  })
}

export async function productionOperationForActor(
  profile: UserProfile,
  input: ProductionOperationInput,
): Promise<ProductionSyncResult | ProductionTask> {
  if (input.action === 'sync') return syncProductionForActor(profile, input.outletId)

  requirePermission(profile, 'productionManage')
  if (input.action === 'assign') {
    const task = await requireTask(profile, input.taskId)
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new OperationError('failed-precondition', 'Completed or cancelled work cannot be reassigned.')
    }
    const staffSnapshot = await getAdminDb().collection('users').doc(input.assignedTo).get()
    if (!staffSnapshot.exists) throw new OperationError('not-found', 'The selected staff profile does not exist.')
    const staff = staffSnapshot.data() as UserProfile
    if (staff.active !== true) throw new OperationError('failed-precondition', 'The selected staff member is inactive.')
    if (!staff.outletIds?.includes(task.outletId)) {
      throw new OperationError('failed-precondition', 'The selected staff member is not assigned to this outlet.')
    }
    if (!['super_admin', 'manager', 'accountant'].includes(staff.role) && !staff.departmentIds?.includes(task.departmentId)) {
      throw new OperationError('failed-precondition', 'The selected staff member is not assigned to this department.')
    }
    return runTaskTransaction(input.taskId, (live, now) => ({
      patch: {
        assignedTo: staff.uid,
        assignedToName: staff.displayName || staff.email,
        updatedAt: now,
        updatedBy: profile.uid,
      },
      event: eventFor(live, 'assigned', profile.displayName || profile.email, now, staff.displayName || staff.email),
    }))
  }

  if (input.action === 'start') {
    return runTaskTransaction(input.taskId, (live, now) => {
      if (live.status === 'completed') throw new OperationError('failed-precondition', 'This task is already completed.')
      return {
        patch: { status: 'in_progress', startedAt: live.startedAt ?? now, updatedAt: now, updatedBy: profile.uid },
        event: eventFor(live, 'started', profile.displayName || profile.email, now),
      }
    })
  }

  if (input.action === 'progress') {
    return runTaskTransaction(input.taskId, (live, now) => {
      const completed = live.completedQty + input.completedDelta
      const rejected = live.rejectedQty + (input.rejectedDelta ?? 0)
      const rework = live.reworkQty + (input.reworkDelta ?? 0)
      if (completed > live.requiredQty) {
        throw new OperationError('failed-precondition', `Only ${Math.max(0, live.requiredQty - live.completedQty)} ${live.unit} remain to complete.`)
      }
      if (rejected > live.requiredQty) {
        throw new OperationError('failed-precondition', 'Rejected quantity exceeds the required quantity.')
      }
      if (rework > rejected) {
        throw new OperationError('failed-precondition', 'Rework quantity cannot exceed rejected quantity.')
      }
      const done = completed >= live.requiredQty
      return {
        patch: {
          completedQty: completed,
          rejectedQty: rejected,
          reworkQty: rework,
          status: done ? 'completed' : 'in_progress',
          qualityStatus: done && live.qualityStatus === 'pending' ? 'passed' : live.qualityStatus,
          startedAt: live.startedAt ?? now,
          completedAt: done ? now : live.completedAt,
          notes: input.note?.trim() || live.notes || '',
          updatedAt: now,
          updatedBy: profile.uid,
        },
        event: eventFor(live, done ? 'completed' : 'progress', profile.displayName || profile.email, now, input.note, input.completedDelta),
      }
    })
  }

  if (input.action === 'quality') {
    return runTaskTransaction(input.taskId, (live, now) => ({
      patch: { qualityStatus: input.qualityStatus, updatedAt: now, updatedBy: profile.uid },
      event: eventFor(live, 'quality', profile.displayName || profile.email, now, `${input.qualityStatus}${input.note ? `: ${input.note}` : ''}`),
    }))
  }

  return runTaskTransaction(input.taskId, (live, now) => ({
    patch: { status: 'cancelled', updatedAt: now, updatedBy: profile.uid, notes: input.reason },
    event: eventFor(live, 'cancelled', profile.displayName || profile.email, now, input.reason),
  }))
}
