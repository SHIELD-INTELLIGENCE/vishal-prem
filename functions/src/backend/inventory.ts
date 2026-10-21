import type {
  InventoryCount,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  Product,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { serverNow } from '../utils'
import { requireDepartmentScope, requireOutletScope, requirePermission } from './context'
import { OperationError } from './errors'
import type { InventoryOperationInput } from './validation'

const DIRECTIONS: Record<InventoryMovementType, 'increase' | 'decrease' | 'either'> = {
  opening_balance: 'increase',
  purchase: 'increase',
  purchase_return: 'decrease',
  issue: 'decrease',
  consumption: 'decrease',
  wastage: 'decrease',
  customer_return: 'increase',
  supplier_return: 'decrease',
  transfer_in: 'increase',
  transfer_out: 'decrease',
  count_adjustment: 'either',
}

const MAX_STOCK = 1_000_000

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function validateMovementType(type: InventoryMovementType, quantity: number): void {
  const direction = DIRECTIONS[type]
  if (direction === 'increase' && quantity < 0) {
    throw new OperationError('invalid-argument', `${type} must increase stock.`)
  }
  if (direction === 'decrease' && quantity > 0) {
    throw new OperationError('invalid-argument', `${type} must decrease stock.`)
  }
}

export type InventoryOperationResult =
  | { itemId: string; movementId?: string; currentQty: number }
  | { countId: string; variance: number; currentQty: number }
  | { fromItemId: string; toItemId: string; quantity: number }

export async function inventoryOperationForActor(
  profile: UserProfile,
  input: InventoryOperationInput,
): Promise<InventoryOperationResult> {
  requirePermission(profile, 'inventoryManage')
  const db = getAdminDb()
  const now = serverNow()
  const actorName = profile.displayName?.trim() || profile.email || profile.uid

  if (input.action === 'create_item') {
    requireOutletScope(profile, input.outletId)
    requireDepartmentScope(profile, input.departmentId)
    productIdCheck(input.productId)

    return db.runTransaction(async (transaction) => {
      const ref = db.collection('inventoryItems').doc(input.requestId)
      const existing = await transaction.get(ref)
      if (existing.exists) {
        const item = existing.data() as InventoryItem
        requireOutletScope(profile, item.outletId)
        requireDepartmentScope(profile, item.departmentId)
        return { itemId: existing.id, currentQty: item.currentQty }
      }

      let product: Product | null = null
      if (input.productId) {
        const productSnapshot = await transaction.get(db.collection('products').doc(input.productId))
        if (!productSnapshot.exists) {
          throw new OperationError('failed-precondition', 'The linked product no longer exists.')
        }
        product = { ...(productSnapshot.data() as Product), id: productSnapshot.id }
        if (product.departmentId !== input.departmentId || !product.outletIds.includes(input.outletId)) {
          throw new OperationError('failed-precondition', 'The linked product is outside this inventory location.')
        }
      }

      const openingQty = roundQty(input.openingQty ?? 0)
      if (openingQty < 0 || openingQty > MAX_STOCK) {
        throw new OperationError('invalid-argument', 'Opening stock is outside the supported range.')
      }

      const item: InventoryItem = {
        id: ref.id,
        name: input.name.trim(),
        sku: input.sku?.trim() || '',
        kind: input.kind,
        outletId: input.outletId,
        departmentId: input.departmentId,
        unit: input.unit.trim(),
        currentQty: openingQty,
        criticalQty: input.criticalQty,
        productId: product?.id,
        active: true,
        openingRecordedAt: openingQty > 0 ? now : undefined,
        lastMovementAt: openingQty > 0 ? now : undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(ref, item)

      let movementId: string | undefined
      if (openingQty > 0) {
        movementId = `mv-${input.requestId}`
        const movement: InventoryMovement = {
          id: movementId,
          requestId: movementId,
          itemId: ref.id,
          itemName: item.name,
          outletId: item.outletId,
          departmentId: item.departmentId,
          unit: item.unit,
          type: 'opening_balance',
          quantity: openingQty,
          balanceBefore: 0,
          balanceAfter: openingQty,
          reason: 'Opening balance from recorded physical count',
          occurredAt: now,
          actorName,
          sourceType: 'manual',
          sourceId: ref.id,
          createdAt: now,
          updatedAt: now,
          createdBy: profile.uid,
          updatedBy: profile.uid,
        }
        transaction.set(db.collection('inventoryMovements').doc(movementId), movement)
      }

      return { itemId: ref.id, movementId, currentQty: openingQty }
    })
  }

  if (input.action === 'movement') {
    if (input.type === 'transfer_in' || input.type === 'transfer_out') {
      throw new OperationError('invalid-argument', 'Use the transfer action for department/outlet transfers.')
    }
    validateMovementType(input.type, input.quantity)

    return db.runTransaction(async (transaction) => {
      const itemRef = db.collection('inventoryItems').doc(input.itemId)
      const movementRef = db.collection('inventoryMovements').doc(input.requestId)
      const [itemSnapshot, movementSnapshot] = await transaction.getAll(itemRef, movementRef)
      if (movementSnapshot.exists) {
        const existing = movementSnapshot.data() as InventoryMovement
        return { itemId: existing.itemId, movementId: existing.id, currentQty: existing.balanceAfter }
      }
      if (!itemSnapshot.exists) throw new OperationError('not-found', 'This inventory item no longer exists.')
      const item = { ...(itemSnapshot.data() as InventoryItem), id: itemSnapshot.id }
      requireOutletScope(profile, item.outletId)
      requireDepartmentScope(profile, item.departmentId)
      if (!item.active) throw new OperationError('failed-precondition', 'This inventory item is inactive.')
      if (input.type === 'opening_balance' && item.openingRecordedAt) {
        throw new OperationError('failed-precondition', 'An opening balance is already recorded for this item.')
      }

      const before = roundQty(item.currentQty)
      const after = roundQty(before + input.quantity)
      if (after < 0) {
        throw new OperationError('failed-precondition', `This movement would make ${item.name} negative.`)
      }
      if (after > MAX_STOCK) {
        throw new OperationError('failed-precondition', 'The resulting stock is above the supported maximum.')
      }

      const movement: InventoryMovement = {
        id: movementRef.id,
        requestId: input.requestId,
        itemId: item.id,
        itemName: item.name,
        outletId: item.outletId,
        departmentId: item.departmentId,
        unit: item.unit,
        type: input.type,
        quantity: roundQty(input.quantity),
        balanceBefore: before,
        balanceAfter: after,
        reason: input.reason.trim(),
        reference: input.reference?.trim() || '',
        occurredAt: new Date(input.occurredAt).toISOString(),
        actorName,
        sourceType: 'manual',
        sourceId: item.id,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(movementRef, movement)
      transaction.update(itemRef, {
        currentQty: after,
        lastMovementAt: now,
        ...(input.type === 'opening_balance' ? { openingRecordedAt: now } : {}),
        updatedAt: now,
        updatedBy: profile.uid,
      })
      return { itemId: item.id, movementId: movement.id, currentQty: after }
    })
  }

  if (input.action === 'count') {
    return db.runTransaction(async (transaction) => {
      const itemRef = db.collection('inventoryItems').doc(input.itemId)
      const countRef = db.collection('inventoryCounts').doc(input.requestId)
      const movementRef = db.collection('inventoryMovements').doc(`count-${input.requestId}`)
      const [itemSnapshot, countSnapshot, movementSnapshot] = await transaction.getAll(
        itemRef,
        countRef,
        movementRef,
      )
      if (countSnapshot.exists) {
        const existing = countSnapshot.data() as InventoryCount
        return {
          countId: countSnapshot.id,
          variance: existing.variance,
          currentQty: existing.countedQty,
        }
      }
      if (!itemSnapshot.exists) throw new OperationError('not-found', 'This inventory item no longer exists.')
      const item = { ...(itemSnapshot.data() as InventoryItem), id: itemSnapshot.id }
      requireOutletScope(profile, item.outletId)
      requireDepartmentScope(profile, item.departmentId)
      if (!item.active) throw new OperationError('failed-precondition', 'This inventory item is inactive.')

      const recorded = roundQty(item.currentQty)
      const counted = roundQty(input.countedQty)
      const variance = roundQty(counted - recorded)
      const count: InventoryCount = {
        id: countRef.id,
        requestId: input.requestId,
        itemId: item.id,
        itemName: item.name,
        outletId: item.outletId,
        departmentId: item.departmentId,
        unit: item.unit,
        recordedQty: recorded,
        countedQty: counted,
        variance,
        reason: input.reason.trim(),
        actorName,
        countedAt: new Date(input.countedAt).toISOString(),
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(countRef, count)
      transaction.update(itemRef, {
        currentQty: counted,
        lastMovementAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      if (variance !== 0) {
        const movement: InventoryMovement = {
          id: movementRef.id,
          requestId: movementRef.id,
          itemId: item.id,
          itemName: item.name,
          outletId: item.outletId,
          departmentId: item.departmentId,
          unit: item.unit,
          type: 'count_adjustment',
          quantity: variance,
          balanceBefore: recorded,
          balanceAfter: counted,
          reason: input.reason.trim(),
          reference: count.id,
          occurredAt: new Date(input.countedAt).toISOString(),
          actorName,
          sourceType: 'manual',
          sourceId: count.id,
          createdAt: now,
          updatedAt: now,
          createdBy: profile.uid,
          updatedBy: profile.uid,
        }
        transaction.set(movementRef, movement)
      } else if (movementSnapshot.exists) {
        throw new OperationError('failed-precondition', 'The count movement state is inconsistent.')
      }
      return { countId: count.id, variance, currentQty: counted }
    })
  }

  if (input.action === 'transfer') {
    if (input.fromItemId === input.toItemId) {
      throw new OperationError('invalid-argument', 'Choose two different inventory locations for a transfer.')
    }
    return db.runTransaction(async (transaction) => {
      const fromRef = db.collection('inventoryItems').doc(input.fromItemId)
      const toRef = db.collection('inventoryItems').doc(input.toItemId)
      const outRef = db.collection('inventoryMovements').doc(`${input.requestId}:out`)
      const inRef = db.collection('inventoryMovements').doc(`${input.requestId}:in`)
      const [fromSnapshot, toSnapshot, outSnapshot, inSnapshot] = await transaction.getAll(
        fromRef,
        toRef,
        outRef,
        inRef,
      )
      if (outSnapshot.exists || inSnapshot.exists) {
        if (!outSnapshot.exists || !inSnapshot.exists) {
          throw new OperationError('failed-precondition', 'This transfer is only partially recorded.')
        }
        return {
          fromItemId: input.fromItemId,
          toItemId: input.toItemId,
          quantity: input.quantity,
        }
      }
      if (!fromSnapshot.exists || !toSnapshot.exists) {
        throw new OperationError('not-found', 'One of the inventory items no longer exists.')
      }
      const from = { ...(fromSnapshot.data() as InventoryItem), id: fromSnapshot.id }
      const to = { ...(toSnapshot.data() as InventoryItem), id: toSnapshot.id }
      requireOutletScope(profile, from.outletId)
      requireOutletScope(profile, to.outletId)
      requireDepartmentScope(profile, from.departmentId)
      requireDepartmentScope(profile, to.departmentId)
      if (!from.active || !to.active) {
        throw new OperationError('failed-precondition', 'Both inventory items must be active.')
      }
      if (from.unit !== to.unit) {
        throw new OperationError('failed-precondition', 'Transfers require matching base units.')
      }
      if (from.outletId === to.outletId && from.departmentId === to.departmentId) {
        throw new OperationError('invalid-argument', 'Choose two different inventory locations for a transfer.')
      }
      const quantity = roundQty(input.quantity)
      const fromAfter = roundQty(from.currentQty - quantity)
      const toAfter = roundQty(to.currentQty + quantity)
      if (fromAfter < 0) {
        throw new OperationError('failed-precondition', `Only ${from.currentQty} ${from.unit} are available to transfer.`)
      }
      if (toAfter > MAX_STOCK) {
        throw new OperationError('failed-precondition', 'The destination would exceed the supported maximum.')
      }
      const occurredAt = new Date(input.occurredAt).toISOString()
      const common = {
        requestId: input.requestId,
        itemName: from.name,
        unit: from.unit,
        reason: input.reason.trim(),
        occurredAt,
        actorName,
        sourceType: 'transfer' as const,
        sourceId: input.requestId,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(outRef, {
        ...common,
        id: outRef.id,
        itemId: from.id,
        itemName: from.name,
        outletId: from.outletId,
        departmentId: from.departmentId,
        type: 'transfer_out',
        quantity: -quantity,
        balanceBefore: from.currentQty,
        balanceAfter: fromAfter,
      } satisfies InventoryMovement)
      transaction.set(inRef, {
        ...common,
        id: inRef.id,
        itemId: to.id,
        itemName: to.name,
        outletId: to.outletId,
        departmentId: to.departmentId,
        type: 'transfer_in',
        quantity,
        balanceBefore: to.currentQty,
        balanceAfter: toAfter,
      } satisfies InventoryMovement)
      transaction.update(fromRef, { currentQty: fromAfter, lastMovementAt: now, updatedAt: now, updatedBy: profile.uid })
      transaction.update(toRef, { currentQty: toAfter, lastMovementAt: now, updatedAt: now, updatedBy: profile.uid })
      return { fromItemId: from.id, toItemId: to.id, quantity }
    })
  }

  // update_item
  return db.runTransaction(async (transaction) => {
    const ref = db.collection('inventoryItems').doc(input.itemId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new OperationError('not-found', 'This inventory item no longer exists.')
    const item = { ...(snapshot.data() as InventoryItem), id: snapshot.id }
    requireOutletScope(profile, item.outletId)
    requireDepartmentScope(profile, item.departmentId)
    const patch: Partial<InventoryItem> = { updatedAt: now, updatedBy: profile.uid }
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.sku !== undefined) patch.sku = input.sku.trim()
    if (input.criticalQty !== undefined) patch.criticalQty = roundQty(input.criticalQty)
    if (input.active !== undefined) patch.active = input.active
    transaction.update(ref, patch)
    return { itemId: item.id, currentQty: item.currentQty }
  })
}

function productIdCheck(productId: string | undefined): void {
  if (productId && (productId.includes('/') || productId.length > 128)) {
    throw new OperationError('invalid-argument', 'The linked product identifier is invalid.')
  }
}
