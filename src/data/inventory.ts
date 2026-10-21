import { callTrustedOperation } from '@/lib/functions'
import type { InventoryKind, InventoryMovementType } from '@/types/models'

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('inventoryOperation', body)
}

export interface CreateInventoryItemInput {
  requestId: string
  name: string
  sku?: string
  kind: InventoryKind
  outletId: string
  departmentId: string
  unit: string
  criticalQty?: number
  productId?: string
  openingQty?: number
}

export async function createInventoryItem(input: CreateInventoryItemInput) {
  return run<{ itemId: string; movementId?: string; currentQty: number }>({ action: 'create_item', ...input })
}

export async function recordInventoryMovement(input: {
  requestId: string
  itemId: string
  type: InventoryMovementType
  quantity: number
  reason: string
  reference?: string
  occurredAt: string
}) {
  return run<{ itemId: string; movementId: string; currentQty: number }>({ action: 'movement', ...input })
}

export async function transferInventory(input: {
  requestId: string
  fromItemId: string
  toItemId: string
  quantity: number
  reason: string
  occurredAt: string
}) {
  return run<{ fromItemId: string; toItemId: string; quantity: number }>({ action: 'transfer', ...input })
}

export async function recordInventoryCount(input: {
  requestId: string
  itemId: string
  countedQty: number
  reason: string
  countedAt: string
}) {
  return run<{ countId: string; variance: number; currentQty: number }>({ action: 'count', ...input })
}

export async function updateInventoryItem(input: {
  itemId: string
  name?: string
  sku?: string
  criticalQty?: number
  active?: boolean
}) {
  return run<{ itemId: string; currentQty: number }>({ action: 'update_item', ...input })
}
