import type {
  InventoryItem,
  InventoryMovement,
  ProductionTask,
} from '@/types/models'

/**
 * Inventory balance reconstruction.
 *
 * The movement ledger stores `balanceBefore` and `balanceAfter` on every entry,
 * so an opening and closing balance can be reconstructed for the loaded
 * movement window without inventing a second stock figure. When an item has no
 * movement inside the window, opening and closing are unknown rather than zero.
 *
 * Finished-product stock is deliberately absent: product orders decrement
 * `stockQty` without writing a movement, so product history cannot be rebuilt
 * and is reported as a current snapshot instead.
 */

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

export interface InventoryBalanceRow {
  itemId: string
  itemName: string
  unit: string
  departmentId: string
  movements: number
  openingQty: number | null
  inQty: number
  outQty: number
  netQty: number
  closingQty: number | null
  currentQty: number
  reconciles: boolean
}

export function buildInventoryBalance({
  items,
  movements,
}: {
  items: InventoryItem[]
  movements: InventoryMovement[]
}): InventoryBalanceRow[] {
  const byItem = new Map<string, InventoryMovement[]>()
  for (const movement of movements) {
    const list = byItem.get(movement.itemId) ?? []
    list.push(movement)
    byItem.set(movement.itemId, list)
  }

  return items
    .map((item) => {
      const list = (byItem.get(item.id) ?? [])
        .slice()
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      const openingQty = list.length > 0 ? list[0].balanceBefore : null
      const closingQty = list.length > 0 ? list[list.length - 1].balanceAfter : null
      const inQty = round(
        list.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0),
      )
      const outQty = round(
        Math.abs(list.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + movement.quantity, 0)),
      )
      const netQty = round(inQty - outQty)
      const reconciles =
        openingQty !== null && closingQty !== null && round(openingQty + netQty) === round(closingQty)

      return {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        departmentId: item.departmentId,
        movements: list.length,
        openingQty,
        inQty,
        outQty,
        netQty,
        closingQty,
        currentQty: item.currentQty,
        reconciles,
      }
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
}

export interface MovementTypeRow {
  type: string
  count: number
  inQty: number
  outQty: number
}

export function buildMovementTypeBreakdown(movements: InventoryMovement[]): MovementTypeRow[] {
  const map = new Map<string, MovementTypeRow>()
  for (const movement of movements) {
    const row = map.get(movement.type) ?? { type: movement.type, count: 0, inQty: 0, outQty: 0 }
    row.count += 1
    if (movement.quantity > 0) row.inQty = round(row.inQty + movement.quantity)
    else row.outQty = round(row.outQty + Math.abs(movement.quantity))
    map.set(movement.type, row)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

export interface ProductionRow {
  productId: string
  productName: string
  departmentId: string
  unit: string
  tasks: number
  requiredQty: number
  completedQty: number
  rejectedQty: number
  reworkQty: number
  overdueTasks: number
  completionPercent: number | null
}

export function buildProductionSummary(
  tasks: ProductionTask[],
  nowIso: string,
): ProductionRow[] {
  const map = new Map<string, ProductionRow>()
  const now = Date.parse(nowIso)

  for (const task of tasks) {
    if (task.status === 'cancelled') continue
    const key = `${task.departmentId}:${task.productId}`
    const row = map.get(key) ?? {
      productId: task.productId,
      productName: task.productName,
      departmentId: task.departmentId,
      unit: task.unit,
      tasks: 0,
      requiredQty: 0,
      completedQty: 0,
      rejectedQty: 0,
      reworkQty: 0,
      overdueTasks: 0,
      completionPercent: null,
    }
    row.tasks += 1
    row.requiredQty = round(row.requiredQty + task.requiredQty)
    row.completedQty = round(row.completedQty + task.completedQty)
    row.rejectedQty = round(row.rejectedQty + task.rejectedQty)
    row.reworkQty = round(row.reworkQty + task.reworkQty)
    if (task.status !== 'completed' && Number.isFinite(now) && Date.parse(task.dueAt) < now) {
      row.overdueTasks += 1
    }
    map.set(key, row)
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      completionPercent:
        row.requiredQty > 0 ? Math.round((row.completedQty / row.requiredQty) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.overdueTasks - a.overdueTasks || b.requiredQty - a.requiredQty)
}

export interface ProductStockRow {
  productId: string
  name: string
  unit: string
  departmentId: string
  stockQty: number
  criticalStock: number | null
  low: boolean
}

/**
 * Current finished-product stock. This is a snapshot: product order lines do
 * not write stock movements, so no opening balance or movement history is
 * claimed for products.
 */
export function buildProductStockSnapshot(
  products: Array<{
    id: string
    name: string
    unit: string
    departmentId: string
    trackStock: boolean
    stockQty?: number
    criticalStock?: number
    active: boolean
  }>,
): ProductStockRow[] {
  return products
    .filter((product) => product.active && product.trackStock)
    .map((product) => {
      const stockQty = round(product.stockQty ?? 0)
      const criticalStock = product.criticalStock ?? null
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        departmentId: product.departmentId,
        stockQty,
        criticalStock,
        low: criticalStock !== null && stockQty <= criticalStock,
      }
    })
    .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name))
}
