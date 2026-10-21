import {
  calculateOrder,
  derivePaymentStatus,
  resolveOrderDiscount,
  stockConsumption,
} from '../../../src/lib/calculations'
import { buildBookingPayment } from '../../../src/lib/paymentOperations'
import {
  bookingEditSchema,
  type BookingEditValues,
  type BookingFormValues,
} from '../../../src/lib/validation'
import type {
  Booking,
  BookingRevision,
  BookingStatus,
  Business,
  Customer,
  DiscountType,
  OrderLine,
  Outlet,
  Product,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { makeBookingNumber, makeReceiptNumber, serverNow } from '../utils'
import { requireDepartmentScope, requireOutletScope, requirePermission } from './context'
import { OperationError } from './errors'

const EDITABLE_STATUSES: BookingStatus[] = ['enquiry', 'confirmed', 'in_production']

export interface CreateBookingResult {
  id: string
  bookingNumber: string
}

/**
 * Trusted booking creation. Outlet, customer, products, tax mode and prices
 * are read server-side; the optional advance is written in the same
 * transaction with a normal receipt number.
 */
export async function createBookingForActor(
  profile: UserProfile,
  input: { requestId: string; values: BookingFormValues },
): Promise<CreateBookingResult> {
  requirePermission(profile, 'bookingsManage')
  requirePermission(profile, 'customersView')
  const values = input.values
  requireOutletScope(profile, values.outletId)
  for (const departmentId of values.departmentIds) requireDepartmentScope(profile, departmentId)
  if (values.advanceAmount > 0) requirePermission(profile, 'paymentsManage')

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const bookingRef = db.collection('bookings').doc(input.requestId)
    const existing = await transaction.get(bookingRef)
    if (existing.exists) {
      const booking = existing.data() as Booking
      if (booking.createdBy !== profile.uid) {
        throw new OperationError('already-exists', 'That request identifier is already in use.')
      }
      return { id: existing.id, bookingNumber: booking.bookingNumber }
    }

    const outletRef = db.collection('outlets').doc(values.outletId)
    const businessRef = db.collection('business').doc('main')
    const customerRef = db.collection('customers').doc(values.customerId)
    const productIds = Array.from(new Set(values.lines.map((line) => line.productId)))
    const productRefs = productIds.map((productId) => db.collection('products').doc(productId))
    const snapshots = await transaction.getAll(
      outletRef,
      businessRef,
      customerRef,
      ...productRefs,
    )
    const [outletSnapshot, businessSnapshot, customerSnapshot, ...productSnapshots] = snapshots
    if (!outletSnapshot.exists) throw new OperationError('failed-precondition', 'The selected outlet no longer exists.')
    if (!businessSnapshot.exists) throw new OperationError('failed-precondition', 'Business settings are not configured.')
    if (!customerSnapshot.exists) throw new OperationError('failed-precondition', 'The selected customer no longer exists.')
    const outlet = { ...(outletSnapshot.data() as Outlet), id: outletSnapshot.id }
    if (!outlet.active) throw new OperationError('failed-precondition', 'The selected outlet is inactive.')
    const business = businessSnapshot.data() as Business
    const customer = { ...(customerSnapshot.data() as Customer), id: customerSnapshot.id }
    if (!customer.active) throw new OperationError('failed-precondition', 'The selected customer is inactive.')
    if (!customer.outletIds?.includes(outlet.id)) {
      throw new OperationError('failed-precondition', 'The selected customer is not available at this outlet.')
    }
    if (typeof outlet.code !== 'string' || !outlet.code.trim()) {
      throw new OperationError('failed-precondition', 'The selected outlet has no code.')
    }

    const productMap = new Map<string, Product>()
    for (const snapshot of productSnapshots) {
      if (snapshot.exists) productMap.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
    }

    const lines: OrderLine[] = values.lines.map((line, index) => {
      const product = productMap.get(line.productId)
      if (!product) throw new OperationError('failed-precondition', 'A selected product no longer exists. Refresh and try again.')
      if (!product.active) throw new OperationError('failed-precondition', `${product.name} is inactive.`)
      if (!values.departmentIds.includes(product.departmentId)) {
        throw new OperationError('failed-precondition', `${product.name} does not belong to a selected department.`)
      }
      if (!product.outletIds?.includes(outlet.id)) {
        throw new OperationError('failed-precondition', `${product.name} is not sold at this outlet.`)
      }
      requireDepartmentScope(profile, product.departmentId)
      const unitPricePaise = Math.round(line.unitPrice * 100)
      if (unitPricePaise <= 0) throw new OperationError('invalid-argument', `Enter a valid price for ${product.name}.`)
      if (product.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
        throw new OperationError('failed-precondition', `${product.name} cannot be sold below ₹${(product.minSalePricePaise / 100).toFixed(2)}.`)
      }
      assertStock(product, line.quantity)
      return {
        id: `${input.requestId}-line-${index + 1}`,
        productId: product.id,
        name: product.name,
        printName: product.printName || product.name,
        departmentId: product.departmentId,
        pricingMode: product.pricingMode,
        quantity: line.quantity,
        unit: unitForProduct(product),
        unitPricePaise,
        discountPercent: line.discountPercent,
        taxPercent: product.taxPercent,
        notes: line.notes?.trim() || '',
      }
    })

    assertAggregateStock(lines, productMap)
    const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
      const base = Math.round(line.quantity * line.unitPricePaise)
      return sum + base - Math.round((base * line.discountPercent) / 100)
    }, 0)
    const orderDiscountPaise = resolveOrderDiscount(
      subtotalAfterLineDiscount,
      values.discountType,
      values.discountType === 'amount' ? Math.round(values.discountValue * 100) : values.discountValue,
    )
    const pricesIncludeTax = Boolean(business.pricesIncludeTax)
    const totals = calculateOrder(lines, orderDiscountPaise, pricesIncludeTax)
    const advancePaise = Math.round(values.advanceAmount * 100)
    if (advancePaise > totals.totalPaise) {
      throw new OperationError('failed-precondition', 'The advance cannot be greater than the booking total.')
    }

    // Request identifiers are shared with payment document IDs. Read the
    // payment slot inside the same transaction and reject a collision before
    // any booking or payment write can happen. This prevents a booking retry
    // from overwriting an unrelated order's advance receipt.
    if (advancePaise > 0) {
      const paymentRef = db.collection('payments').doc(`advance-${input.requestId}`)
      const existingPayment = await transaction.get(paymentRef)
      if (existingPayment.exists) {
        throw new OperationError(
          'already-exists',
          'That request identifier is already in use by another payment.',
        )
      }
    }

    const now = serverNow()
    const bookingNumber = makeBookingNumber(outlet.code)
    const booking: Booking = {
      id: input.requestId,
      bookingNumber,
      outletId: outlet.id,
      departmentIds: [...values.departmentIds],
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      eventType: values.eventType,
      eventDate: values.eventDate,
      eventTime: values.eventTime,
      bookingDate: now,
      fulfillment: values.fulfillment,
      deliveryAddress: values.deliveryAddress?.trim() || '',
      status: 'confirmed',
      paymentStatus: derivePaymentStatus(totals.totalPaise, advancePaise),
      lines,
      subtotalPaise: totals.subtotalPaise,
      lineDiscountPaise: totals.lineDiscountPaise,
      orderDiscountPaise: totals.orderDiscountPaise,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      paidPaise: advancePaise,
      balancePaise: totals.totalPaise - advancePaise,
      pricesIncludeTax,
      discountType: values.discountType,
      discountValue: values.discountValue,
      revision: 1,
      instructions: values.instructions?.trim() || '',
      preparationStatus: 'pending',
      packingStatus: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy: profile.uid,
      updatedBy: profile.uid,
    }
    transaction.set(bookingRef, booking)

    if (advancePaise > 0) {
      const payment = buildBookingPayment({
        booking,
        outlet,
        profile,
        paymentId: `advance-${input.requestId}`,
        receiptNumber: makeReceiptNumber(outlet.code),
        amountPaise: advancePaise,
        type: 'payment',
        mode: values.paymentMode,
        reference: values.paymentReference,
        receivedAt: now,
        notes: `Advance for ${bookingNumber}`,
        now,
      })
      transaction.set(db.collection('payments').doc(payment.id), payment)
    }

    return { id: booking.id, bookingNumber }
  })
}

export interface UpdateBookingResult {
  bookingId: string
  revision: number
  totalPaise: number
  balancePaise: number
}

function unitForProduct(product: Product): string {
  if (product.pricingMode === 'cake_lb') return 'lb'
  if (product.pricingMode === 'per_kg') return 'kg'
  if (product.pricingMode === 'per_box') return 'box'
  return product.unit
}

function resolveDiscount(live: Booking, values: BookingEditValues): { type: DiscountType; value: number } {
  if (values.discountType !== undefined && values.discountValue !== undefined) {
    return { type: values.discountType, value: values.discountValue }
  }
  if (live.discountType !== undefined && typeof live.discountValue === 'number' && Number.isFinite(live.discountValue)) {
    return { type: live.discountType, value: live.discountValue }
  }
  return {
    type: 'amount',
    value: Number.isFinite(live.orderDiscountPaise) ? live.orderDiscountPaise / 100 : 0,
  }
}

function assertStock(product: Product, quantity: number): void {
  if (!product.trackStock) return
  const consumption = stockConsumption(quantity, product.conversionFactor)
  if (consumption > (product.stockQty ?? 0)) {
    throw new OperationError('failed-precondition', `${product.name} has only ${product.stockQty ?? 0} ${product.unit} in stock.`)
  }
}

/** Aggregate demand so two lines of the same product cannot overdraw stock. */
function assertAggregateStock(lines: OrderLine[], products: Map<string, Product>): void {
  const demand = new Map<string, number>()
  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product?.trackStock) continue
    demand.set(
      product.id,
      (demand.get(product.id) ?? 0) + stockConsumption(line.quantity, product.conversionFactor),
    )
  }
  for (const [productId, required] of demand) {
    const product = products.get(productId)
    if (!product) continue
    if (required > (product.stockQty ?? 0)) {
      throw new OperationError('failed-precondition', `${product.name} has only ${product.stockQty ?? 0} ${product.unit} in stock.`)
    }
  }
}

/**
 * Trusted booking edit. The server reads live products, customer scope and the
 * current booking, then writes the revised lines, totals and an append-only
 * revision snapshot. Paid money, receipts and posted stock are never touched.
 */
export async function updateBookingForActor(
  profile: UserProfile,
  input: { bookingId: string; expectedRevision: number; values: BookingEditValues },
): Promise<UpdateBookingResult> {
  requirePermission(profile, 'bookingsManage')
  const parsed = bookingEditSchema.safeParse(input.values)
  if (!parsed.success) {
    throw new OperationError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the booking details.')
  }
  const values = parsed.data
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new OperationError('invalid-argument', 'Reload the booking before editing it.')
  }

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const bookingRef = db.collection('bookings').doc(input.bookingId)
    const bookingSnapshot = await transaction.get(bookingRef)
    if (!bookingSnapshot.exists) throw new OperationError('not-found', 'This booking no longer exists.')
    const live = { ...(bookingSnapshot.data() as Booking), id: bookingSnapshot.id }
    requireOutletScope(profile, live.outletId)
    if (!Array.isArray(live.departmentIds) || !Array.isArray(live.lines)) {
      throw new OperationError('failed-precondition', 'This booking has unreadable department or line data. No changes were made.')
    }

    // An edit rewrites the whole line set. Require scope over every existing
    // department and every existing line department, not just one of them.
    // This blocks a department-scoped actor from dropping or repricing lines
    // that belong to another department.
    const existingDepartments = new Set<string>(live.departmentIds)
    for (const line of live.lines) {
      if (typeof line.departmentId !== 'string' || !line.departmentId) {
        throw new OperationError('failed-precondition', 'This booking has a line without a department. Reconcile it before editing.')
      }
      existingDepartments.add(line.departmentId)
    }
    for (const departmentId of existingDepartments) requireDepartmentScope(profile, departmentId)
    for (const departmentId of values.departmentIds) requireDepartmentScope(profile, departmentId)
    if (!EDITABLE_STATUSES.includes(live.status)) {
      throw new OperationError('failed-precondition', `A booking in ${live.status} cannot be edited.`)
    }
    if ((live.revision ?? 0) !== input.expectedRevision) {
      throw new OperationError('failed-precondition', 'This booking changed while you were working. Refresh and try again.')
    }
    if (live.status === 'in_production' && !values.editReason?.trim()) {
      throw new OperationError('failed-precondition', 'Enter a reason for editing a booking that is in production.')
    }
    if (typeof live.paidPaise !== 'number' || !Number.isFinite(live.paidPaise) || live.paidPaise < 0) {
      throw new OperationError('failed-precondition', 'This booking has an invalid paid amount. No changes were made.')
    }
    if (typeof live.pricesIncludeTax !== 'boolean') {
      throw new OperationError('failed-precondition', 'This booking has no valid tax mode. No changes were made.')
    }
    if (!Array.isArray(live.lines)) {
      throw new OperationError('failed-precondition', 'This booking has no readable lines. No changes were made.')
    }

    const oldLines = new Map((live.lines ?? []).map((line) => [line.id, line]))
    for (const line of values.lines) {
      if (line.id && !oldLines.has(line.id)) {
        throw new OperationError('failed-precondition', 'One of the booking lines changed while you were working. Refresh and try again.')
      }
    }

    const customerChanged = values.customerId !== live.customerId
    if (customerChanged && live.paidPaise > 0) {
      throw new OperationError('failed-precondition', 'This booking already has payments recorded. Refund the paid amount before changing the customer.')
    }
    if (customerChanged) requirePermission(profile, 'customersView')

    const customerRef = customerChanged ? db.collection('customers').doc(values.customerId) : null
    const productIds = Array.from(new Set(values.lines.map((line) => line.productId)))
    const productRefs = productIds.map((productId) => db.collection('products').doc(productId))
    const reads = [
      ...(customerRef ? [customerRef] : []),
      ...productRefs,
    ]
    const snapshots = reads.length > 0 ? await transaction.getAll(...reads) : []
    let customer: Customer | null = null
    let offset = 0
    if (customerRef) {
      const snapshot = snapshots[0]
      if (!snapshot.exists) throw new OperationError('failed-precondition', 'The selected customer no longer exists.')
      customer = { ...(snapshot.data() as Customer), id: snapshot.id }
      if (!customer.active) throw new OperationError('failed-precondition', 'The selected customer is inactive.')
      if (!customer.outletIds?.includes(live.outletId)) {
        throw new OperationError('failed-precondition', 'The selected customer is not available at this booking outlet.')
      }
      offset = 1
    }
    const productMap = new Map<string, Product>()
    for (let index = 0; index < productRefs.length; index += 1) {
      const snapshot = snapshots[index + offset]
      if (snapshot.exists) productMap.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
    }

    const lines: OrderLine[] = values.lines.map((line) => {
      const old = line.id ? oldLines.get(line.id) : undefined
      const product = productMap.get(line.productId)
      const unitPricePaise = Math.round(line.unitPrice * 100)
      if (unitPricePaise <= 0) {
        throw new OperationError('invalid-argument', `Enter a valid price for ${product?.name ?? old?.name ?? 'this line'}.`)
      }

      if (old && old.productId === line.productId) {
        if (product?.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
          throw new OperationError('failed-precondition', `${product.name} cannot be sold below ₹${(product.minSalePricePaise / 100).toFixed(2)}.`)
        }
        if (line.quantity > old.quantity) {
          if (!product) throw new OperationError('failed-precondition', `Cannot check stock for ${old.name} because its product record no longer exists.`)
          if (!product.active) throw new OperationError('failed-precondition', `Cannot increase ${old.name} because the product is inactive.`)
          assertStock(product, line.quantity)
        }
        return {
          id: old.id,
          productId: old.productId,
          name: old.name,
          printName: old.printName,
          departmentId: old.departmentId,
          pricingMode: old.pricingMode,
          quantity: line.quantity,
          unit: old.unit,
          unitPricePaise,
          discountPercent: line.discountPercent,
          taxPercent: old.taxPercent,
          notes: line.notes?.trim() || '',
        }
      }

      if (!product) throw new OperationError('failed-precondition', 'A selected product no longer exists. Refresh and try again.')
      if (!product.active) throw new OperationError('failed-precondition', `${product.name} is inactive.`)
      if (!product.outletIds?.includes(live.outletId)) {
        throw new OperationError('failed-precondition', `${product.name} is not sold at this outlet.`)
      }
      if (!values.departmentIds.includes(product.departmentId)) {
        throw new OperationError('failed-precondition', `${product.name} does not belong to a selected department.`)
      }
      requireDepartmentScope(profile, product.departmentId)
      if (product.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
        throw new OperationError('failed-precondition', `${product.name} cannot be sold below ₹${(product.minSalePricePaise / 100).toFixed(2)}.`)
      }
      assertStock(product, line.quantity)
      return {
        id: line.id ?? `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.id,
        name: product.name,
        printName: product.printName || product.name,
        departmentId: product.departmentId,
        pricingMode: product.pricingMode,
        quantity: line.quantity,
        unit: unitForProduct(product),
        unitPricePaise,
        discountPercent: line.discountPercent,
        taxPercent: product.taxPercent,
        notes: line.notes?.trim() || '',
      }
    })

    for (const line of lines) {
      if (!values.departmentIds.includes(line.departmentId)) {
        throw new OperationError('failed-precondition', `The line for ${line.name} belongs to a department that is no longer selected.`)
      }
    }

    assertAggregateStock(lines, productMap)
    const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
      const base = Math.round(line.quantity * line.unitPricePaise)
      return sum + base - Math.round((base * line.discountPercent) / 100)
    }, 0)
    const discount = resolveDiscount(live, values)
    const orderDiscountPaise = resolveOrderDiscount(
      subtotalAfterLineDiscount,
      discount.type,
      discount.type === 'amount' ? Math.round(discount.value * 100) : discount.value,
    )
    const totals = calculateOrder(lines, orderDiscountPaise, live.pricesIncludeTax)
    if (totals.totalPaise < live.paidPaise) {
      throw new OperationError('failed-precondition', `The new total is below the ₹${(live.paidPaise / 100).toFixed(2)} already paid. Refund the difference separately first.`)
    }

    const now = serverNow()
    const revision = (live.revision ?? 0) + 1
    const actorName = profile.displayName?.trim() || profile.email || profile.uid
    transaction.update(bookingRef, {
      customerId: customer?.id ?? live.customerId,
      customerName: customer?.name ?? live.customerName,
      customerPhone: customer?.phone ?? live.customerPhone,
      eventType: values.eventType,
      eventDate: values.eventDate,
      eventTime: values.eventTime,
      fulfillment: values.fulfillment,
      deliveryAddress: values.deliveryAddress?.trim() || '',
      departmentIds: values.departmentIds,
      instructions: values.instructions?.trim() || '',
      lines,
      subtotalPaise: totals.subtotalPaise,
      lineDiscountPaise: totals.lineDiscountPaise,
      orderDiscountPaise: totals.orderDiscountPaise,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      balancePaise: totals.totalPaise - live.paidPaise,
      paymentStatus: derivePaymentStatus(totals.totalPaise, live.paidPaise),
      discountType: discount.type,
      discountValue: discount.value,
      revision,
      lastEditReason: values.editReason?.trim() || '',
      updatedAt: now,
      updatedBy: profile.uid,
    })

    const revisionDoc: BookingRevision = {
      id: `${live.id}-r${revision}`,
      bookingId: live.id,
      outletId: live.outletId,
      departmentIds: [...values.departmentIds],
      revision,
      reason: values.editReason?.trim() || '',
      beforeTotalPaise: live.totalPaise,
      afterTotalPaise: totals.totalPaise,
      paidPaise: live.paidPaise,
      actorName,
      createdAt: now,
      updatedAt: now,
      createdBy: profile.uid,
      updatedBy: profile.uid,
    }
    transaction.set(db.collection('bookingRevisions').doc(revisionDoc.id), revisionDoc)

    return {
      bookingId: live.id,
      revision,
      totalPaise: totals.totalPaise,
      balancePaise: totals.totalPaise - live.paidPaise,
    }
  })
}
