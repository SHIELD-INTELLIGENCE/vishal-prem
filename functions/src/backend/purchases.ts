import type {
  Business,
  Customer,
  InventoryItem,
  InventoryMovement,
  Product,
  Purchase,
  PurchaseLine,
  SupplierPayment,
  UserProfile,
} from '../../../src/types/models'
import {
  computePurchaseLine,
  deriveSupplyType,
  isTaxableTreatment,
  purchaseTotals,
} from '../../../src/lib/gst'
import { getAdminDb } from '../admin'
import { makePurchaseNumber, makeSupplierPaymentNumber, serverNow } from '../utils'
import {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './context'
import { OperationError } from './errors'
import type { PurchaseOperationInput } from './validation'

const MAX_STOCK = 1_000_000

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function isoDate(value: string, field: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new OperationError('invalid-argument', `Enter a valid ${field}.`)
  }
  return new Date(parsed).toISOString()
}

export type PurchaseOperationResult =
  | { purchaseId: string; purchaseNumber: string; payablePaise: number }
  | { purchaseId: string; status: 'cancelled' }
  | { paymentId: string; paymentNumber: string; amountPaise: number }

/**
 * Trusted purchase posting.
 *
 * Supplier, item identity, units, HSN, tax split and stock effects are all
 * derived from persisted documents. The client may propose quantities, rates
 * and treatments; it can never propose totals, balances or stock.
 */
export async function purchaseOperationForActor(
  profile: UserProfile,
  input: PurchaseOperationInput,
): Promise<PurchaseOperationResult> {
  const db = getAdminDb()
  const now = serverNow()
  const actorName = profile.displayName?.trim() || profile.email || profile.uid

  if (input.action === 'post') {
    requirePermission(profile, 'purchasesManage')
    requireOutletScope(profile, input.outletId)
    requireDepartmentScope(profile, input.departmentId)

    const isTransfer = input.taxTreatment === 'stock_transfer'
    if (isTransfer && input.supplierId) {
      throw new OperationError('invalid-argument', 'A stock transfer does not have a supplier.')
    }
    if (!isTransfer && !input.supplierId) {
      throw new OperationError('invalid-argument', 'Choose a supplier for this purchase.')
    }

    const seen = new Set<string>()
    for (const line of input.lines) {
      const key = `${line.itemType}:${line.itemId}`
      if (seen.has(key)) {
        throw new OperationError('invalid-argument', 'Each item can appear once per purchase voucher.')
      }
      seen.add(key)
    }

    return db.runTransaction(async (transaction) => {
      const purchaseRef = db.collection('purchases').doc(input.requestId)
      const existing = await transaction.get(purchaseRef)
      if (existing.exists) {
        const purchase = { ...(existing.data() as Purchase), id: existing.id }
        requireOutletScope(profile, purchase.outletId)
        requireDepartmentScope(profile, purchase.departmentId)
        return {
          purchaseId: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          payablePaise: purchase.payablePaise,
        }
      }

      const outletSnapshot = await transaction.get(db.collection('outlets').doc(input.outletId))
      if (!outletSnapshot.exists) {
        throw new OperationError('not-found', 'The selected outlet no longer exists.')
      }
      const outlet = outletSnapshot.data() as { code: string }

      let supplier: Customer | null = null
      let supplierName = 'Internal stock transfer'
      let supplierGstin: string | undefined
      let supplierState: string | undefined

      if (!isTransfer) {
        const supplierSnapshot = await transaction.get(
          db.collection('customers').doc(input.supplierId as string),
        )
        if (!supplierSnapshot.exists) {
          throw new OperationError('failed-precondition', 'The selected supplier no longer exists.')
        }
        supplier = { ...(supplierSnapshot.data() as Customer), id: supplierSnapshot.id }
        if (!supplier.active) {
          throw new OperationError('failed-precondition', `${supplier.name} is inactive.`)
        }
        if (supplier.accountGroup !== 'supplier') {
          throw new OperationError('failed-precondition', `${supplier.name} is not a supplier account.`)
        }
        if (supplier.outletIds.length > 0 && !supplier.outletIds.includes(input.outletId)) {
          throw new OperationError('failed-precondition', `${supplier.name} is outside this outlet.`)
        }
        supplierName = supplier.name
        supplierGstin = supplier.gstin
        supplierState = supplier.state

        const duplicateQuery = db
          .collection('purchases')
          .where('supplierId', '==', supplier.id)
          .where('invoiceNumber', '==', input.invoiceNumber.trim())
        const duplicates = await transaction.get(duplicateQuery)
        if (duplicates.docs.some((doc) => (doc.data() as Purchase).status === 'posted')) {
          throw new OperationError(
            'already-exists',
            'This supplier invoice number is already posted. Use a different invoice or cancel the earlier voucher.',
          )
        }
      }

      if (!isTransfer && supplierState) {
        const businessSnapshot = await transaction.get(db.collection('business').doc('main'))
        const business = businessSnapshot.exists
          ? (businessSnapshot.data() as Business)
          : null
        const expected = deriveSupplyType(business?.state, supplierState, input.supplyType)
        if (input.supplyType !== expected) {
          throw new OperationError(
            'invalid-argument',
            `This supply is ${expected === 'inter_state' ? 'inter-state' : 'intra-state'} because the supplier is in ${supplierState}. Choose the matching tax split.`,
          )
        }
      }

      const lines: PurchaseLine[] = []
      const computedLines: ReturnType<typeof computePurchaseLine>[] = []
      const stockUpdates: Array<
        | { type: 'inventory'; item: InventoryItem; after: number; quantity: number }
        | { type: 'product'; item: Product; after: number; quantity: number }
      > = []

      let index = 0
      for (const inputLine of input.lines) {
        index += 1
        const lineId = `line-${index}`

        let name = ''
        let unit = ''
        let hsn: string | undefined

        if (inputLine.itemType === 'inventory') {
          const itemSnapshot = await transaction.get(
            db.collection('inventoryItems').doc(inputLine.itemId),
          )
          if (!itemSnapshot.exists) {
            throw new OperationError('failed-precondition', 'A selected inventory item no longer exists.')
          }
          const item = { ...(itemSnapshot.data() as InventoryItem), id: itemSnapshot.id }
          if (item.outletId !== input.outletId || item.departmentId !== input.departmentId) {
            throw new OperationError('failed-precondition', `${item.name} belongs to another inventory location.`)
          }
          if (!item.active) {
            throw new OperationError('failed-precondition', `${item.name} is inactive.`)
          }
          const quantity = roundQty(inputLine.quantity)
          const after = roundQty(item.currentQty + quantity)
          if (after > MAX_STOCK) {
            throw new OperationError('failed-precondition', `${item.name} would exceed the supported stock limit.`)
          }
          name = item.name
          unit = item.unit
          stockUpdates.push({ type: 'inventory', item, after, quantity })
        } else {
          const productSnapshot = await transaction.get(
            db.collection('products').doc(inputLine.itemId),
          )
          if (!productSnapshot.exists) {
            throw new OperationError('failed-precondition', 'A selected product no longer exists.')
          }
          const product = { ...(productSnapshot.data() as Product), id: productSnapshot.id }
          if (!product.outletIds.includes(input.outletId)) {
            throw new OperationError('failed-precondition', `${product.name} is not sold at this outlet.`)
          }
          if (product.departmentId !== input.departmentId) {
            throw new OperationError('failed-precondition', `${product.name} belongs to another department.`)
          }
          if (!product.trackStock) {
            throw new OperationError('failed-precondition', `${product.name} does not track stock.`)
          }
          const quantity = roundQty(inputLine.quantity)
          const after = roundQty((product.stockQty ?? 0) + quantity)
          if (after > MAX_STOCK) {
            throw new OperationError('failed-precondition', `${product.name} would exceed the supported stock limit.`)
          }
          name = product.name
          unit = product.unit
          hsn = product.hsn
          stockUpdates.push({ type: 'product', item: product, after, quantity })
        }

        const computed = computePurchaseLine({
          quantity: inputLine.quantity,
          ratePaise: inputLine.ratePaise,
          discountPercent: inputLine.discountPercent,
          taxPercent: inputLine.taxPercent,
          taxInclusive: inputLine.taxInclusive,
          treatment: input.taxTreatment,
          supplyType: input.supplyType,
        })
        computedLines.push(computed)

        lines.push({
          id: lineId,
          itemType: inputLine.itemType,
          itemId: inputLine.itemId,
          name,
          unit,
          hsn,
          quantity: roundQty(inputLine.quantity),
          ratePaise: inputLine.ratePaise,
          discountPercent: inputLine.discountPercent,
          taxPercent: isTaxableTreatment(input.taxTreatment) ? inputLine.taxPercent : 0,
          taxInclusive: inputLine.taxInclusive,
          taxablePaise: computed.taxablePaise,
          taxPaise: computed.taxPaise,
          cgstPaise: computed.cgstPaise,
          sgstPaise: computed.sgstPaise,
          igstPaise: computed.igstPaise,
          totalPaise: computed.totalPaise,
        })
      }

      const totals = purchaseTotals(computedLines)
      const subtotalPaise = computedLines.reduce((sum, line) => sum + line.grossPaise, 0)
      const discountPaise = computedLines.reduce((sum, line) => sum + line.discountPaise, 0)
      const rcmTaxPaise = totals.rcmTaxPaise
      const payablePaise = totals.payablePaise

      const purchaseNumber = makePurchaseNumber(outlet.code)
      const purchase: Purchase = {
        id: purchaseRef.id,
        purchaseNumber,
        supplierId: supplier?.id ?? '',
        supplierName,
        supplierGstin,
        supplierState,
        invoiceNumber: input.invoiceNumber.trim(),
        invoiceDate: isoDate(input.invoiceDate, 'invoice date'),
        receivedAt: isoDate(input.receivedAt, 'received date'),
        outletId: input.outletId,
        departmentId: input.departmentId,
        taxTreatment: input.taxTreatment,
        supplyType: input.supplyType,
        reverseCharge: input.taxTreatment === 'reverse_charge',
        taxInclusive: lines.every((line) => line.taxInclusive),
        itcClaimable: isTaxableTreatment(input.taxTreatment) ? input.itcClaimable : false,
        lines,
        subtotalPaise,
        discountPaise,
        taxablePaise: totals.taxablePaise,
        taxPaise: totals.taxPaise,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        igstPaise: totals.igstPaise,
        rcmTaxPaise,
        totalPaise: totals.totalPaise,
        payablePaise,
        status: 'posted',
        notes: input.notes?.trim() || '',
        actorName,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }

      transaction.set(purchaseRef, purchase)

      for (let stockIndex = 0; stockIndex < stockUpdates.length; stockIndex += 1) {
        const update = stockUpdates[stockIndex]
        const line = lines[stockIndex]
        if (update.type === 'inventory') {
          const movementId = `${purchase.id}:${line.id}`
          const movement: InventoryMovement = {
            id: movementId,
            requestId: movementId,
            itemId: update.item.id,
            itemName: update.item.name,
            outletId: update.item.outletId,
            departmentId: update.item.departmentId,
            unit: update.item.unit,
            type: 'purchase',
            quantity: update.quantity,
            balanceBefore: update.item.currentQty,
            balanceAfter: update.after,
            reason: `Purchase ${purchaseNumber}`,
            reference: purchase.invoiceNumber,
            occurredAt: purchase.receivedAt,
            actorName,
            sourceType: 'purchase',
            sourceId: purchase.id,
            createdAt: now,
            updatedAt: now,
            createdBy: profile.uid,
            updatedBy: profile.uid,
          }
          transaction.set(db.collection('inventoryMovements').doc(movementId), movement)
          transaction.update(db.collection('inventoryItems').doc(update.item.id), {
            currentQty: update.after,
            lastMovementAt: now,
            updatedAt: now,
            updatedBy: profile.uid,
          })
        } else {
          transaction.update(db.collection('products').doc(update.item.id), {
            stockQty: update.after,
            updatedAt: now,
            updatedBy: profile.uid,
          })
        }
      }

      return { purchaseId: purchase.id, purchaseNumber, payablePaise }
    })
  }

  if (input.action === 'cancel') {
    requirePermission(profile, 'purchasesManage')
    return db.runTransaction(async (transaction) => {
      const purchaseRef = db.collection('purchases').doc(input.purchaseId)
      const snapshot = await transaction.get(purchaseRef)
      if (!snapshot.exists) throw new OperationError('not-found', 'This purchase voucher no longer exists.')
      const purchase = { ...(snapshot.data() as Purchase), id: snapshot.id }
      requireOutletScope(profile, purchase.outletId)
      requireDepartmentScope(profile, purchase.departmentId)
      if (purchase.status === 'cancelled') {
        return { purchaseId: purchase.id, status: 'cancelled' as const }
      }

      for (let index = 0; index < purchase.lines.length; index += 1) {
        const line = purchase.lines[index]
        if (line.itemType === 'inventory') {
          const itemRef = db.collection('inventoryItems').doc(line.itemId)
          const itemSnapshot = await transaction.get(itemRef)
          if (!itemSnapshot.exists) {
            throw new OperationError('failed-precondition', `${line.name} no longer exists; reconcile stock manually.`)
          }
          const item = { ...(itemSnapshot.data() as InventoryItem), id: itemSnapshot.id }
          const after = roundQty(item.currentQty - line.quantity)
          if (after < 0) {
            throw new OperationError(
              'failed-precondition',
              `${item.name} has already been issued. Cannot cancel this receipt without a negative balance.`,
            )
          }
          const movementId = `${purchase.id}:cancel:${line.id}`
          const movement: InventoryMovement = {
            id: movementId,
            requestId: movementId,
            itemId: item.id,
            itemName: item.name,
            outletId: item.outletId,
            departmentId: item.departmentId,
            unit: item.unit,
            type: 'purchase_return',
            quantity: -line.quantity,
            balanceBefore: item.currentQty,
            balanceAfter: after,
            reason: `Purchase cancelled: ${input.reason.trim()}`,
            reference: purchase.invoiceNumber,
            occurredAt: now,
            actorName,
            sourceType: 'purchase_cancel',
            sourceId: purchase.id,
            createdAt: now,
            updatedAt: now,
            createdBy: profile.uid,
            updatedBy: profile.uid,
          }
          transaction.set(db.collection('inventoryMovements').doc(movementId), movement)
          transaction.update(itemRef, {
            currentQty: after,
            lastMovementAt: now,
            updatedAt: now,
            updatedBy: profile.uid,
          })
        } else {
          const productRef = db.collection('products').doc(line.itemId)
          const productSnapshot = await transaction.get(productRef)
          if (!productSnapshot.exists) {
            throw new OperationError('failed-precondition', `${line.name} no longer exists.`)
          }
          const product = { ...(productSnapshot.data() as Product), id: productSnapshot.id }
          const after = roundQty((product.stockQty ?? 0) - line.quantity)
          if (after < 0) {
            throw new OperationError(
              'failed-precondition',
              `${product.name} stock is already sold. Cannot cancel this receipt without a negative balance.`,
            )
          }
          transaction.update(productRef, {
            stockQty: after,
            updatedAt: now,
            updatedBy: profile.uid,
          })
        }
      }

      transaction.update(purchaseRef, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: profile.uid,
        cancelReason: input.reason.trim(),
        updatedAt: now,
        updatedBy: profile.uid,
      })
      return { purchaseId: purchase.id, status: 'cancelled' as const }
    })
  }

  if (input.action === 'supplier_payment') {
    requirePermission(profile, 'financeManage')
    requireOutletScope(profile, input.outletId)

    return db.runTransaction(async (transaction) => {
      const paymentRef = db.collection('supplierPayments').doc(input.requestId)
      const existing = await transaction.get(paymentRef)
      if (existing.exists) {
        const payment = { ...(existing.data() as SupplierPayment), id: existing.id }
        requireOutletScope(profile, payment.outletId)
        return {
          paymentId: payment.id,
          paymentNumber: payment.paymentNumber,
          amountPaise: payment.amountPaise,
        }
      }

      const supplierSnapshot = await transaction.get(
        db.collection('customers').doc(input.supplierId),
      )
      if (!supplierSnapshot.exists) {
        throw new OperationError('failed-precondition', 'The selected supplier no longer exists.')
      }
      const supplier = { ...(supplierSnapshot.data() as Customer), id: supplierSnapshot.id }
      if (supplier.accountGroup !== 'supplier' || !supplier.active) {
        throw new OperationError('failed-precondition', 'Choose an active supplier account.')
      }
      if (supplier.outletIds.length > 0 && !supplier.outletIds.includes(input.outletId)) {
        throw new OperationError('failed-precondition', `${supplier.name} is outside this outlet.`)
      }

      const outletSnapshot = await transaction.get(db.collection('outlets').doc(input.outletId))
      if (!outletSnapshot.exists) {
        throw new OperationError('not-found', 'The selected outlet no longer exists.')
      }
      const outlet = outletSnapshot.data() as { code: string }

      const paymentNumber = makeSupplierPaymentNumber(outlet.code)
      const payment: SupplierPayment = {
        id: paymentRef.id,
        paymentNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        outletId: input.outletId,
        amountPaise: input.amountPaise,
        mode: input.mode,
        reference: input.reference?.trim() || '',
        paidAt: isoDate(input.paidAt, 'payment date'),
        notes: input.notes?.trim() || '',
        status: 'posted',
        actorName,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(paymentRef, payment)
      return { paymentId: payment.id, paymentNumber, amountPaise: payment.amountPaise }
    })
  }

  requirePermission(profile, 'financeManage')
  return db.runTransaction(async (transaction) => {
    const paymentRef = db.collection('supplierPayments').doc(input.paymentId)
    const snapshot = await transaction.get(paymentRef)
    if (!snapshot.exists) throw new OperationError('not-found', 'This supplier payment no longer exists.')
    const payment = { ...(snapshot.data() as SupplierPayment), id: snapshot.id }
    requireOutletScope(profile, payment.outletId)
    if (payment.status === 'void') {
      return { paymentId: payment.id, paymentNumber: payment.paymentNumber, amountPaise: payment.amountPaise }
    }
    transaction.update(paymentRef, {
      status: 'void',
      voidReason: input.reason.trim(),
      voidedAt: now,
      voidedBy: profile.uid,
      updatedAt: now,
      updatedBy: profile.uid,
    })
    return { paymentId: payment.id, paymentNumber: payment.paymentNumber, amountPaise: payment.amountPaise }
  })
}
