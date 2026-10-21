import { applyBookingPayment, applyOrderPayment, buildBookingPayment, buildOrderPayment } from '../../../src/lib/paymentOperations'
import type {
  Booking,
  Customer,
  Delivery,
  DeliveryEvent,
  DeliveryLine,
  DeliveryStatus,
  Order,
  Outlet,
  Payment,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { makeDeliveryNumber, makeReceiptNumber, serverNow } from '../utils'
import { requireDepartmentScope, requireOutletScope, requirePermission } from './context'
import { OperationError } from './errors'
import type { DeliveryOperationInput } from './validation'

export interface DeliveryOperationResult {
  deliveryId?: string
  paymentId?: string
  receiptNumber?: string
  status?: DeliveryStatus
}

function deliveryIdFor(sourceType: 'order' | 'booking', sourceId: string): string {
  return `del-${sourceType}-${sourceId}`
}

function eventFor(
  delivery: Delivery,
  action: DeliveryEvent['action'],
  actorName: string,
  now: string,
  note?: string,
): DeliveryEvent {
  return {
    id: `${delivery.id}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deliveryId: delivery.id,
    outletId: delivery.outletId,
    departmentIds: delivery.departmentIds,
    action,
    note,
    actorName,
    createdAt: now,
    updatedAt: now,
  }
}

async function customerAddress(customerId: string | undefined): Promise<string> {
  if (!customerId) return ''
  const snapshot = await getAdminDb().collection('customers').doc(customerId).get()
  if (!snapshot.exists) return ''
  const customer = snapshot.data() as Customer
  const address = customer.addresses?.find((item) => item.label === 'shipping') ?? customer.addresses?.[0]
  if (!address) return ''
  return [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', ')
}

function linesFromOrder(order: Order): DeliveryLine[] {
  return (order.lines ?? []).map((line) => ({
    lineId: line.id,
    productId: line.productId,
    name: line.name,
    unit: line.unit,
    expectedQty: line.quantity,
    deliveredQty: 0,
    returnedQty: 0,
    damagedQty: 0,
  }))
}

function linesFromBooking(booking: Booking): DeliveryLine[] {
  return (booking.lines ?? []).map((line) => ({
    lineId: line.id,
    productId: line.productId,
    name: line.name,
    unit: line.unit,
    expectedQty: line.quantity,
    deliveredQty: 0,
    returnedQty: 0,
    damagedQty: 0,
  }))
}

async function requireDelivery(profile: UserProfile, deliveryId: string): Promise<Delivery> {
  const snapshot = await getAdminDb().collection('deliveries').doc(deliveryId).get()
  if (!snapshot.exists) throw new OperationError('not-found', 'This delivery no longer exists.')
  const delivery = { ...(snapshot.data() as Delivery), id: snapshot.id }
  requireOutletScope(profile, delivery.outletId)
  if (!delivery.departmentIds.some((departmentId) => {
    try {
      requireDepartmentScope(profile, departmentId)
      return true
    } catch {
      return false
    }
  })) {
    throw new OperationError('permission-denied', 'This delivery department is not assigned to you.')
  }
  return delivery
}

export async function deliveryOperationForActor(
  profile: UserProfile,
  input: DeliveryOperationInput,
): Promise<DeliveryOperationResult> {
  requirePermission(profile, 'deliveryManage')
  const db = getAdminDb()
  const now = serverNow()
  const actorName = profile.displayName?.trim() || profile.email || profile.uid

  if (input.action === 'create') {
    const sourceRef = db.collection(input.sourceType === 'order' ? 'orders' : 'bookings').doc(input.sourceId)
    const snapshot = await sourceRef.get()
    if (!snapshot.exists) throw new OperationError('not-found', 'The source order or booking no longer exists.')
    const source = { ...(snapshot.data() as Order | Booking), id: snapshot.id }
    const outletId = (source as Order | Booking).outletId
    requireOutletScope(profile, outletId)

    let delivery: Delivery
    if (input.sourceType === 'order') {
      const order = source as Order
      if (order.orderType !== 'delivery') {
        throw new OperationError('failed-precondition', 'Only delivery orders need a delivery record.')
      }
      if (!['confirmed', 'preparing', 'ready'].includes(order.status)) {
        throw new OperationError('failed-precondition', 'Only confirmed or in-progress delivery orders can be dispatched.')
      }
      requireDepartmentScope(profile, order.departmentId)
      const address = await customerAddress(order.customerId)
      delivery = {
        id: deliveryIdFor('order', order.id),
        deliveryNumber: makeDeliveryNumber('OUT'),
        sourceType: 'order',
        sourceId: order.id,
        sourceNumber: order.orderNumber,
        outletId: order.outletId,
        departmentIds: [order.departmentId],
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address,
        scheduledAt: order.pickupAt || order.createdAt,
        status: 'pending',
        lines: linesFromOrder(order),
        collectedPaise: 0,
        notes: order.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
    } else {
      const booking = source as Booking
      if (booking.fulfillment !== 'delivery') {
        throw new OperationError('failed-precondition', 'Only delivery bookings need a delivery record.')
      }
      if (!['confirmed', 'in_production', 'ready'].includes(booking.status)) {
        throw new OperationError('failed-precondition', 'Only confirmed or in-progress delivery bookings can be dispatched.')
      }
      if (!booking.departmentIds.some((departmentId) => {
        try {
          requireDepartmentScope(profile, departmentId)
          return true
        } catch {
          return false
        }
      })) {
        throw new OperationError('permission-denied', 'This booking department is not assigned to you.')
      }
      delivery = {
        id: deliveryIdFor('booking', booking.id),
        deliveryNumber: makeDeliveryNumber('OUT'),
        sourceType: 'booking',
        sourceId: booking.id,
        sourceNumber: booking.bookingNumber,
        outletId: booking.outletId,
        departmentIds: [...booking.departmentIds],
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        address: booking.deliveryAddress || '',
        scheduledAt: new Date(`${booking.eventDate}T${booking.eventTime || '23:59'}:00`).toISOString(),
        status: 'pending',
        lines: linesFromBooking(booking),
        collectedPaise: 0,
        notes: booking.instructions,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
    }

    return db.runTransaction(async (transaction) => {
      const ref = db.collection('deliveries').doc(delivery.id)
      const existing = await transaction.get(ref)
      if (existing.exists) return { deliveryId: existing.id, status: (existing.data() as Delivery).status }
      const outletSnapshot = await transaction.get(db.collection('outlets').doc(delivery.outletId))
      if (!outletSnapshot.exists) throw new OperationError('failed-precondition', 'The delivery outlet no longer exists.')
      const outlet = outletSnapshot.data() as Outlet
      delivery.deliveryNumber = makeDeliveryNumber(outlet.code || 'OUT')
      transaction.set(ref, delivery)
      transaction.set(db.collection('deliveryEvents').doc(), eventFor(delivery, 'created', actorName, now))
      return { deliveryId: delivery.id, status: delivery.status }
    })
  }

  if (input.action === 'assign') {
    const delivery = await requireDelivery(profile, input.deliveryId)
    if (['delivered', 'partially_delivered', 'returned', 'failed'].includes(delivery.status)) {
      throw new OperationError('failed-precondition', 'Completed deliveries cannot be reassigned.')
    }
    const staffSnapshot = await db.collection('users').doc(input.assignedTo).get()
    if (!staffSnapshot.exists) throw new OperationError('not-found', 'The selected staff profile does not exist.')
    const staff = staffSnapshot.data() as UserProfile
    if (staff.active !== true) throw new OperationError('failed-precondition', 'The selected staff member is inactive.')
    if (!staff.outletIds?.includes(delivery.outletId)) {
      throw new OperationError('failed-precondition', 'The selected staff member is not assigned to this outlet.')
    }
    return db.runTransaction(async (transaction) => {
      const ref = db.collection('deliveries').doc(delivery.id)
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists) throw new OperationError('not-found', 'This delivery no longer exists.')
      const live = snapshot.data() as Delivery
      transaction.update(ref, {
        assignedTo: staff.uid,
        assignedToName: staff.displayName || staff.email,
        status: live.status === 'pending' ? 'assigned' : live.status,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      transaction.set(db.collection('deliveryEvents').doc(), eventFor(delivery, 'assigned', actorName, now, staff.displayName || staff.email))
      return { deliveryId: delivery.id, status: live.status === 'pending' ? 'assigned' : live.status }
    })
  }

  if (input.action === 'dispatch') {
    const delivery = await requireDelivery(profile, input.deliveryId)
    if (!delivery.assignedTo) throw new OperationError('failed-precondition', 'Assign a delivery person before dispatch.')
    if (['delivered', 'partially_delivered', 'returned', 'failed', 'dispatched'].includes(delivery.status)) {
      throw new OperationError('failed-precondition', 'This delivery cannot be dispatched again.')
    }
    return db.runTransaction(async (transaction) => {
      const ref = db.collection('deliveries').doc(delivery.id)
      transaction.update(ref, {
        status: 'dispatched',
        dispatchedAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      transaction.set(db.collection('deliveryEvents').doc(), eventFor(delivery, 'dispatched', actorName, now))
      return { deliveryId: delivery.id, status: 'dispatched' as const }
    })
  }

  if (input.action === 'complete') {
    const delivery = await requireDelivery(profile, input.deliveryId)
    if (['delivered', 'partially_delivered', 'returned', 'failed'].includes(delivery.status)) {
      throw new OperationError('failed-precondition', 'This delivery is already closed.')
    }
    const provided = new Map(input.lines.map((line) => [line.lineId, line]))
    for (const line of input.lines) {
      if (!delivery.lines.some((item) => item.lineId === line.lineId)) {
        throw new OperationError('invalid-argument', `Unknown delivery line ${line.lineId}.`)
      }
    }
    const lines = delivery.lines.map((line) => {
      const values = provided.get(line.lineId)
      if (!values) return line
      if (values.deliveredQty + values.returnedQty + values.damagedQty > line.expectedQty) {
        throw new OperationError('failed-precondition', `Quantities for ${line.name} exceed the expected quantity.`)
      }
      return {
        ...line,
        deliveredQty: values.deliveredQty,
        returnedQty: values.returnedQty,
        damagedQty: values.damagedQty,
      }
    })
    const deliveredTotal = lines.reduce((sum, line) => sum + line.deliveredQty, 0)
    const returnedTotal = lines.reduce((sum, line) => sum + line.returnedQty, 0)
    if (input.status === 'delivered' && lines.some((line) => line.deliveredQty !== line.expectedQty)) {
      throw new OperationError('failed-precondition', 'A delivered status requires every expected quantity to be delivered.')
    }
    if (input.status === 'failed' && deliveredTotal > 0) {
      throw new OperationError('failed-precondition', 'Failed delivery cannot record delivered quantities.')
    }
    if (input.status === 'returned' && returnedTotal === 0) {
      throw new OperationError('failed-precondition', 'Record the returned quantity before marking a delivery returned.')
    }
    if (input.status === 'partially_delivered' && (deliveredTotal === 0 || lines.every((line) => line.deliveredQty === line.expectedQty))) {
      throw new OperationError('failed-precondition', 'Partially delivered must have some, but not all, quantity delivered.')
    }
    const reconciliationPending = input.status !== 'delivered'
      || lines.some((line) => line.returnedQty > 0 || line.damagedQty > 0)
    return db.runTransaction(async (transaction) => {
      const ref = db.collection('deliveries').doc(delivery.id)
      transaction.update(ref, {
        lines,
        status: input.status,
        completedAt: now,
        failureReason: input.status === 'failed' || input.status === 'returned' ? input.note?.trim() || '' : '',
        notes: input.note?.trim() || delivery.notes || '',
        reconciliationStatus: reconciliationPending ? 'pending' : 'not_required',
        reconciliationNote: reconciliationPending
          ? 'Stock and source-sale reconciliation is pending a business policy decision. No stock or paid totals were changed.'
          : '',
        updatedAt: now,
        updatedBy: profile.uid,
      })
      transaction.set(db.collection('deliveryEvents').doc(), eventFor(delivery, 'completed', actorName, now, `${input.status}${input.note ? `: ${input.note}` : ''}`))
      return { deliveryId: delivery.id, status: input.status }
    })
  }

  // collect
  requirePermission(profile, 'paymentsManage')
  const delivery = await requireDelivery(profile, input.deliveryId)
  if (['failed', 'returned'].includes(delivery.status)) {
    throw new OperationError('failed-precondition', 'Cash cannot be collected against a failed or returned delivery.')
  }
  const sourceRef = db.collection(delivery.sourceType === 'order' ? 'orders' : 'bookings').doc(delivery.sourceId)
  const paymentRef = db.collection('payments').doc(input.requestId)
  const outletRef = db.collection('outlets').doc(delivery.outletId)
  return db.runTransaction(async (transaction) => {
    const deliveryRef = db.collection('deliveries').doc(delivery.id)
    const [deliverySnapshot, sourceSnapshot, paymentSnapshot, outletSnapshot] = await transaction.getAll(
      deliveryRef,
      sourceRef,
      paymentRef,
      outletRef,
    )
    if (paymentSnapshot.exists) {
      const existing = paymentSnapshot.data() as Payment
      if (existing.deliveryId === delivery.id && existing.amountPaise === input.amountPaise) {
        return {
          deliveryId: delivery.id,
          paymentId: paymentSnapshot.id,
          receiptNumber: existing.receiptNumber,
          status: (deliverySnapshot.data() as Delivery).status,
        }
      }
      throw new OperationError('already-exists', 'That request identifier is already in use by another payment.')
    }
    if (!deliverySnapshot.exists || !sourceSnapshot.exists || !outletSnapshot.exists) {
      throw new OperationError('failed-precondition', 'The delivery source or outlet no longer exists.')
    }
    const live = { ...(deliverySnapshot.data() as Delivery), id: deliverySnapshot.id }
    const outlet = { ...(outletSnapshot.data() as Outlet), id: outletSnapshot.id }
    const nowIso = serverNow()
    let patch
    let payment
    if (live.sourceType === 'order') {
      const order = { ...(sourceSnapshot.data() as Order), id: sourceSnapshot.id }
      patch = applyOrderPayment(order, input.amountPaise, 'payment')
      payment = buildOrderPayment({
        order,
        outlet,
        profile,
        paymentId: paymentRef.id,
        receiptNumber: makeReceiptNumber(outlet.code),
        amountPaise: input.amountPaise,
        type: 'payment',
        mode: input.mode,
        reference: input.reference,
        receivedAt: nowIso,
        notes: input.notes || `Collected on delivery ${live.deliveryNumber}`,
        now: nowIso,
        deliveryId: live.id,
      })
      transaction.update(sourceRef, { ...patch, updatedAt: nowIso, updatedBy: profile.uid })
    } else {
      const booking = { ...(sourceSnapshot.data() as Booking), id: sourceSnapshot.id }
      patch = applyBookingPayment(booking, input.amountPaise, 'payment')
      payment = buildBookingPayment({
        booking,
        outlet,
        profile,
        paymentId: paymentRef.id,
        receiptNumber: makeReceiptNumber(outlet.code),
        amountPaise: input.amountPaise,
        type: 'payment',
        mode: input.mode,
        reference: input.reference,
        receivedAt: nowIso,
        notes: input.notes || `Collected on delivery ${live.deliveryNumber}`,
        now: nowIso,
        deliveryId: live.id,
      })
      transaction.update(sourceRef, { ...patch, updatedAt: nowIso, updatedBy: profile.uid })
    }
    transaction.set(paymentRef, payment)
    transaction.update(deliveryRef, {
      collectedPaise: live.collectedPaise + input.amountPaise,
      paymentId: paymentRef.id,
      updatedAt: nowIso,
      updatedBy: profile.uid,
    })
    transaction.set(db.collection('deliveryEvents').doc(), eventFor(live, 'collected', actorName, nowIso, `${input.amountPaise / 100} collected`))
    return {
      deliveryId: live.id,
      paymentId: paymentRef.id,
      receiptNumber: payment.receiptNumber,
      status: live.status,
    }
  })
}
