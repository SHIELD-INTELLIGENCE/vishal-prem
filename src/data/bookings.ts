import { collection, doc, runTransaction, updateDoc } from 'firebase/firestore'
import { canAccessDepartment, canAccessOutlet, hasPermission } from '@/auth/permissions'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import {
  calculateOrder,
  canTransitionBooking,
  derivePaymentStatus,
  resolveOrderDiscount,
  stockConsumption,
} from '@/lib/calculations'
import { makeBookingNumber, makeReceiptNumber, nowIso, uniqueId } from '@/lib/utils'
import { bookingEditSchema } from '@/lib/validation'
import { callTrustedOperation } from '@/lib/functions'
import type {
  Booking,
  BookingStatus,
  Customer,
  DiscountType,
  OrderLine,
  Outlet,
  Payment,
  Product,
  UserProfile,
} from '@/types/models'
import type { BookingEditValues, BookingFormValues } from '@/lib/validation'

export interface CreateBookingArgs {
  values: BookingFormValues
  outlet: Outlet
  customer: Customer
  pricesIncludeTax: boolean
  profile: UserProfile
  requestId: string
}

export async function createBookingSecure({
  values,
  requestId,
}: {
  values: BookingFormValues
  requestId: string
}): Promise<{ id: string; bookingNumber: string }> {
  return callTrustedOperation<
    { requestId: string; values: BookingFormValues },
    { id: string; bookingNumber: string }
  >('createBooking', { requestId, values })
}

export interface UpdateBookingDetailsSecureArgs {
  bookingId: string
  expectedRevision: number
  values: BookingEditValues
}

/** Trusted booking edit: prices, totals and revision are validated on the server. */
export async function updateBookingDetailsSecure({
  bookingId,
  expectedRevision,
  values,
}: UpdateBookingDetailsSecureArgs): Promise<{ revision: number; totalPaise: number; balancePaise: number }> {
  return callTrustedOperation<
    { bookingId: string; expectedRevision: number; values: BookingEditValues },
    { bookingId: string; revision: number; totalPaise: number; balancePaise: number }
  >('updateBooking', { bookingId, expectedRevision, values })
}

export interface UpdateBookingDetailsArgs {
  bookingId: string
  expectedRevision: number
  values: BookingEditValues
  profile: UserProfile
}

const EDITABLE_BOOKING_STATUSES: BookingStatus[] = ['enquiry', 'confirmed', 'in_production']

export async function createBooking({
  values,
  outlet,
  customer,
  pricesIncludeTax,
  profile,
  requestId,
}: CreateBookingArgs): Promise<{ id: string; bookingNumber: string }> {
  if (!db) throw new Error('Firestore is not available.')
  if (values.departmentIds.length === 0) throw new Error('Choose at least one department.')
  if (values.lines.length === 0) throw new Error('Add at least one product.')

  const now = nowIso()
  const bookingRef = doc(db, 'bookings', requestId)
  const paymentRef = doc(collection(db, 'payments'))
  let result = { id: requestId, bookingNumber: '' }

  try {
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(bookingRef)
      if (existing.exists()) {
        const data = existing.data() as Booking
        result = { id: existing.id, bookingNumber: data.bookingNumber }
        return
      }

      const productIds = Array.from(new Set(values.lines.map((line) => line.productId)))
      const snapshots = await Promise.all(
        productIds.map((productId) => transaction.get(doc(db!, 'products', productId))),
      )
      const productMap = new Map<string, Product>()
      for (const snapshot of snapshots) {
        if (snapshot.exists()) {
          productMap.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
        }
      }

      const lines: OrderLine[] = values.lines.map((line, index) => {
        const product = productMap.get(line.productId)
        if (!product) throw new Error('A selected product no longer exists. Refresh and try again.')
        if (!product.active) throw new Error(`${product.name} is inactive.`)
        if (!values.departmentIds.includes(product.departmentId)) {
          throw new Error(`${product.name} does not belong to a selected department.`)
        }
        if (!product.outletIds.includes(outlet.id)) {
          throw new Error(`${product.name} is not sold at this outlet.`)
        }
        const unitPricePaise = Math.round(line.unitPrice * 100)
        if (unitPricePaise <= 0) throw new Error(`Enter a valid price for ${product.name}.`)
        if (product.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
          throw new Error(
            `${product.name} cannot be sold below the minimum price of ₹${(product.minSalePricePaise / 100).toFixed(2)}.`,
          )
        }
        if (product.trackStock) {
          const consumption = stockConsumption(line.quantity, product.conversionFactor)
          if (consumption > (product.stockQty ?? 0)) {
            throw new Error(
              `${product.name} has only ${(product.stockQty ?? 0)} ${product.unit} in stock.`,
            )
          }
        }
        return {
          id: `${requestId}-line-${index + 1}`,
          productId: product.id,
          name: product.name,
          printName: product.printName || product.name,
          departmentId: product.departmentId,
          pricingMode: product.pricingMode,
          quantity: line.quantity,
          unit:
            product.pricingMode === 'cake_lb'
              ? 'lb'
              : product.pricingMode === 'per_kg'
                ? 'kg'
                : product.pricingMode === 'per_box'
                  ? 'box'
                  : product.unit,
          unitPricePaise,
          discountPercent: line.discountPercent,
          taxPercent: product.taxPercent,
          notes: line.notes?.trim() || '',
        }
      })

      const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
        const base = Math.round(line.quantity * line.unitPricePaise)
        return sum + base - Math.round((base * line.discountPercent) / 100)
      }, 0)
      const orderDiscountPaise = resolveOrderDiscount(
        subtotalAfterLineDiscount,
        values.discountType,
        values.discountType === 'amount' ? Math.round(values.discountValue * 100) : values.discountValue,
      )
      const totals = calculateOrder(lines, orderDiscountPaise, pricesIncludeTax)
      const advancePaise = Math.round(values.advanceAmount * 100)
      if (advancePaise > totals.totalPaise) {
        throw new Error('The advance cannot be greater than the booking total.')
      }
      const bookingNumber = makeBookingNumber(outlet.code)
      const booking: Booking = {
        id: requestId,
        bookingNumber,
        outletId: outlet.id,
        departmentIds: values.departmentIds,
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
        const payment: Payment = {
          id: paymentRef.id,
          receiptNumber: makeReceiptNumber(outlet.code),
          outletId: outlet.id,
          departmentIds: values.departmentIds,
          bookingId: bookingRef.id,
          customerId: customer.id,
          customerName: customer.name,
          amountPaise: advancePaise,
          type: 'payment',
          mode: values.paymentMode,
          reference: values.paymentReference?.trim() || '',
          receivedAt: now,
          notes: `Advance for ${bookingNumber}`,
          createdAt: now,
          updatedAt: now,
          createdBy: profile.uid,
        }
        transaction.set(paymentRef, payment)
      }

      result = { id: bookingRef.id, bookingNumber }
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }

  return result
}

function unitForProduct(product: Product): string {
  if (product.pricingMode === 'cake_lb') return 'lb'
  if (product.pricingMode === 'per_kg') return 'kg'
  if (product.pricingMode === 'per_box') return 'box'
  return product.unit
}

function resolveBookingDiscountForEdit(
  live: Booking,
  values: BookingEditValues,
): { type: DiscountType; value: number } {
  if (values.discountType !== undefined && values.discountValue !== undefined) {
    return { type: values.discountType, value: values.discountValue }
  }
  if (
    live.discountType !== undefined &&
    typeof live.discountValue === 'number' &&
    Number.isFinite(live.discountValue)
  ) {
    return { type: live.discountType, value: live.discountValue }
  }
  // Legacy bookings predate the raw discount fields. Their resolved amount is
  // the only reliable source, so convert it from paise back to rupees for the
  // form-level fixed-amount semantics.
  return {
    type: 'amount',
    value: Number.isFinite(live.orderDiscountPaise) ? live.orderDiscountPaise / 100 : 0,
  }
}

function assertProductStockForEdit(product: Product, quantity: number): void {
  if (!product.trackStock) return
  const consumption = stockConsumption(quantity, product.conversionFactor)
  if (consumption > (product.stockQty ?? 0)) {
    throw new Error(
      `${product.name} has only ${(product.stockQty ?? 0)} ${product.unit} in stock.`,
    )
  }
}

/**
 * Edits only the customer-facing details and lines of a booking.
 *
 * The transaction reads the live booking, any replacement customer, and every
 * product whose current catalogue data is required, then writes only editable
 * fields. It never writes products or payment documents. `revision` guards
 * against a stale form overwriting a concurrent edit or payment.
 */
export async function updateBookingDetails({
  bookingId,
  expectedRevision,
  values,
  profile,
}: UpdateBookingDetailsArgs): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  if (!bookingId) throw new Error('Choose a booking to edit.')
  if (!hasPermission(profile, 'bookingsManage')) {
    throw new Error('You do not have permission to edit bookings.')
  }
  const parsed = bookingEditSchema.safeParse(values)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Check the booking details and try again.')
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Reload the booking before editing it.')
  }
  const input = parsed.data
  const now = nowIso()

  try {
    await runTransaction(db, async (transaction) => {
      const bookingRef = doc(db!, 'bookings', bookingId)
      const snapshot = await transaction.get(bookingRef)
      if (!snapshot.exists()) throw new Error('This booking no longer exists.')
      const live = { ...(snapshot.data() as Booking), id: snapshot.id }

      if (!canAccessOutlet(profile, live.outletId)) {
        throw new Error('You do not have access to this booking outlet.')
      }
      if (
        !Array.isArray(live.departmentIds) ||
        !live.departmentIds.some((departmentId) => canAccessDepartment(profile, departmentId))
      ) {
        throw new Error('You do not have access to this booking department.')
      }
      if (!input.departmentIds.every((departmentId) => canAccessDepartment(profile, departmentId))) {
        throw new Error('One or more selected departments are outside your access scope.')
      }
      if (!EDITABLE_BOOKING_STATUSES.includes(live.status)) {
        throw new Error(`A booking in ${live.status} cannot be edited.`)
      }
      if ((live.revision ?? 0) !== expectedRevision) {
        throw new Error('This booking changed while you were working. Refresh and try again.')
      }
      if (live.status === 'in_production' && !input.editReason?.trim()) {
        throw new Error('Enter a reason for editing a booking that is in production.')
      }
      if (
        typeof live.paidPaise !== 'number' ||
        !Number.isFinite(live.paidPaise) ||
        live.paidPaise < 0
      ) {
        throw new Error('This booking has an invalid paid amount. No changes were made.')
      }
      if (typeof live.pricesIncludeTax !== 'boolean') {
        throw new Error('This booking has no valid tax mode. No changes were made.')
      }
      if (!Array.isArray(live.lines)) {
        throw new Error('This booking has no readable lines. No changes were made.')
      }

      const oldLinesById = new Map(live.lines.map((line) => [line.id, line]))
      const requiredProductIds = new Set<string>()
      for (const line of input.lines) {
        if (line.id) {
          const old = oldLinesById.get(line.id)
          if (!old) {
            throw new Error('One of the booking lines changed while you were working. Refresh and try again.')
          }
          if (old.productId !== line.productId || line.quantity > old.quantity) {
            requiredProductIds.add(line.productId)
          }
        } else {
          requiredProductIds.add(line.productId)
        }
      }

      const customerChanged = input.customerId !== live.customerId
      if (customerChanged && live.paidPaise > 0) {
        throw new Error(
          'This booking already has payments recorded. Refund the paid amount before changing the customer.',
        )
      }
      if (customerChanged && !hasPermission(profile, 'customersView')) {
        throw new Error('You do not have permission to look up a replacement customer.')
      }

      let replacementCustomer: Customer | null = null
      if (customerChanged) {
        const customerSnapshot = await transaction.get(doc(db!, 'customers', input.customerId))
        if (!customerSnapshot.exists()) throw new Error('The selected customer no longer exists.')
        const nextCustomer = { ...(customerSnapshot.data() as Customer), id: customerSnapshot.id }
        if (!nextCustomer.active) throw new Error('The selected customer is inactive.')
        if (!nextCustomer.outletIds?.includes(live.outletId)) {
          throw new Error('The selected customer is not available at this booking outlet.')
        }
        if (!nextCustomer.outletIds.some((outletId) => canAccessOutlet(profile, outletId))) {
          throw new Error('The selected customer is outside your outlet scope.')
        }
        replacementCustomer = nextCustomer
      }

      if (requiredProductIds.size > 0 && !hasPermission(profile, 'productsView')) {
        throw new Error('You do not have permission to view the products required for this edit.')
      }
      const productSnapshots = await Promise.all(
        Array.from(requiredProductIds, (productId) =>
          transaction.get(doc(db!, 'products', productId)),
        ),
      )
      const productMap = new Map<string, Product>()
      for (const productSnapshot of productSnapshots) {
        if (productSnapshot.exists()) {
          productMap.set(productSnapshot.id, {
            ...(productSnapshot.data() as Product),
            id: productSnapshot.id,
          })
        }
      }

      const lines: OrderLine[] = input.lines.map((line) => {
        const old = line.id ? oldLinesById.get(line.id) : undefined
        const product = productMap.get(line.productId)
        const unitPricePaise = Math.round(line.unitPrice * 100)
        if (unitPricePaise <= 0) {
          throw new Error(`Enter a valid price for ${product?.name ?? old?.name ?? 'this line'}.`)
        }

        if (old && old.productId === line.productId) {
          if (line.quantity > old.quantity) {
            if (!product) {
              throw new Error(
                `Cannot check stock for ${old.name} because its product record no longer exists.`,
              )
            }
            if (!product.active) {
              throw new Error(`Cannot increase ${old.name} because the product is inactive.`)
            }
            assertProductStockForEdit(product, line.quantity)
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

        if (!product) throw new Error('A selected product no longer exists. Refresh and try again.')
        if (!product.active) throw new Error(`${product.name} is inactive.`)
        if (!product.outletIds.includes(live.outletId)) {
          throw new Error(`${product.name} is not sold at this outlet.`)
        }
        if (!input.departmentIds.includes(product.departmentId)) {
          throw new Error(`${product.name} does not belong to a selected department.`)
        }
        if (!canAccessDepartment(profile, product.departmentId)) {
          throw new Error(`You do not have access to the department for ${product.name}.`)
        }
        if (product.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
          throw new Error(
            `${product.name} cannot be sold below the minimum price of ₹${(product.minSalePricePaise / 100).toFixed(2)}.`,
          )
        }
        assertProductStockForEdit(product, line.quantity)
        return {
          id: line.id ?? uniqueId(),
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
        if (!input.departmentIds.includes(line.departmentId)) {
          throw new Error(
            `The line for ${line.name} belongs to a department that is no longer selected. Remove the line or keep its department.`,
          )
        }
      }

      const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
        const base = Math.round(line.quantity * line.unitPricePaise)
        return sum + base - Math.round((base * line.discountPercent) / 100)
      }, 0)
      const discount = resolveBookingDiscountForEdit(live, input)
      const orderDiscountPaise = resolveOrderDiscount(
        subtotalAfterLineDiscount,
        discount.type,
        discount.type === 'amount' ? Math.round(discount.value * 100) : discount.value,
      )
      const totals = calculateOrder(lines, orderDiscountPaise, live.pricesIncludeTax)
      const paidPaise = live.paidPaise
      if (totals.totalPaise < paidPaise) {
        throw new Error(
          `The new total is ₹${(totals.totalPaise / 100).toFixed(2)}, which is below the ₹${(paidPaise / 100).toFixed(2)} already paid. Refund the difference separately before saving this edit.`,
        )
      }

      // Deliberately partial: booking number, booking date, outlet, lifecycle
      // status, paidPaise, tax mode and preparation/packing fields are not
      // written, so concurrent operational updates survive.
      transaction.update(bookingRef, {
        customerId: replacementCustomer?.id ?? live.customerId,
        customerName: replacementCustomer?.name ?? live.customerName,
        customerPhone: replacementCustomer?.phone ?? live.customerPhone,
        eventType: input.eventType,
        eventDate: input.eventDate,
        eventTime: input.eventTime,
        fulfillment: input.fulfillment,
        deliveryAddress: input.deliveryAddress?.trim() || '',
        departmentIds: input.departmentIds,
        instructions: input.instructions?.trim() || '',
        lines,
        subtotalPaise: totals.subtotalPaise,
        lineDiscountPaise: totals.lineDiscountPaise,
        orderDiscountPaise: totals.orderDiscountPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        balancePaise: totals.totalPaise - paidPaise,
        paymentStatus: derivePaymentStatus(totals.totalPaise, paidPaise),
        discountType: discount.type,
        discountValue: discount.value,
        revision: (live.revision ?? 0) + 1,
        lastEditReason: input.editReason?.trim() || '',
        updatedAt: now,
        updatedBy: profile.uid,
      })
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export async function updateBookingStatus({
  booking,
  status,
  profile,
  reason,
}: {
  booking: Booking
  status: BookingStatus
  profile: UserProfile
  reason?: string
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  if (!canTransitionBooking(booking.status, status)) {
    throw new Error(`A booking cannot move from ${booking.status} to ${status}.`)
  }
  const now = nowIso()
  await updateDoc(doc(db, 'bookings', booking.id), {
    status,
    updatedAt: now,
    updatedBy: profile.uid,
    ...(status === 'cancelled'
      ? { cancelledAt: now, cancellationReason: reason?.trim() || 'Cancelled by staff' }
      : {}),
  })
}

export async function updateBookingOperations({
  bookingId,
  preparationStatus,
  packingStatus,
  instructions,
  profile,
}: {
  bookingId: string
  preparationStatus: Booking['preparationStatus']
  packingStatus: Booking['packingStatus']
  instructions?: string
  profile: UserProfile
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  await updateDoc(doc(db, 'bookings', bookingId), {
    preparationStatus,
    packingStatus,
    instructions: instructions?.trim() ?? '',
    updatedAt: nowIso(),
    updatedBy: profile.uid,
  })
}

export async function updateBookingFulfilment({
  bookingId,
  fulfillment,
  deliveryAddress,
  profile,
}: {
  bookingId: string
  fulfillment: Booking['fulfillment']
  deliveryAddress?: string
  profile: UserProfile
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  await updateDoc(doc(db, 'bookings', bookingId), {
    fulfillment,
    deliveryAddress: deliveryAddress?.trim() ?? '',
    updatedAt: nowIso(),
    updatedBy: profile.uid,
  })
}
