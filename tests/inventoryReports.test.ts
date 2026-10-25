import { describe, expect, it } from 'vitest'
import {
  buildInventoryBalance,
  buildMovementTypeBreakdown,
  buildProductStockSnapshot,
  buildProductionSummary,
} from '@/lib/inventoryReports'
import type {
  InventoryItem,
  InventoryMovement,
  ProductionTask,
} from '@/types/models'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    ...base,
    id: 'item-a',
    name: 'Sugar',
    kind: 'raw_material',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    unit: 'kg',
    currentQty: 17,
    active: true,
    ...overrides,
  }
}

function movement(overrides: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    ...base,
    id: 'movement-1',
    requestId: 'request-1',
    itemId: 'item-a',
    itemName: 'Sugar',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    unit: 'kg',
    type: 'opening_balance',
    quantity: 20,
    balanceBefore: 0,
    balanceAfter: 20,
    reason: 'Opening',
    occurredAt: '2026-10-01T10:00:00.000Z',
    actorName: 'Staff',
    ...overrides,
  }
}

function task(overrides: Partial<ProductionTask> = {}): ProductionTask {
  return {
    ...base,
    id: 'task-1',
    sourceType: 'order',
    sourceId: 'order-1',
    sourceNumber: 'ORD-1',
    lineId: 'line-1',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    productId: 'product-1',
    productName: 'Kaju Barfi',
    unit: 'kg',
    requiredQty: 10,
    completedQty: 10,
    rejectedQty: 0,
    reworkQty: 0,
    dueAt: '2026-10-02T10:00:00.000Z',
    status: 'completed',
    qualityStatus: 'passed',
    priority: 'normal',
    ...overrides,
  }
}

describe('buildInventoryBalance', () => {
  it('reconstructs opening, movement and closing quantities per item', () => {
    const rows = buildInventoryBalance({
      items: [item()],
      movements: [
        movement(),
        movement({
          id: 'movement-2',
          type: 'issue',
          quantity: -5,
          balanceBefore: 20,
          balanceAfter: 15,
          occurredAt: '2026-10-01T11:00:00.000Z',
        }),
        movement({
          id: 'movement-3',
          type: 'purchase',
          quantity: 2,
          balanceBefore: 15,
          balanceAfter: 17,
          occurredAt: '2026-10-01T12:00:00.000Z',
        }),
      ],
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.openingQty).toBe(0)
    expect(row.inQty).toBe(22)
    expect(row.outQty).toBe(5)
    expect(row.netQty).toBe(17)
    expect(row.closingQty).toBe(17)
    expect(row.currentQty).toBe(17)
    expect(row.movements).toBe(3)
    expect(row.reconciles).toBe(true)
  })

  it('reports unknown opening and closing when an item has no movements', () => {
    const rows = buildInventoryBalance({
      items: [item({ id: 'item-b', name: 'Ghee', currentQty: 3 })],
      movements: [],
    })
    expect(rows[0].openingQty).toBeNull()
    expect(rows[0].closingQty).toBeNull()
    expect(rows[0].movements).toBe(0)
    expect(rows[0].reconciles).toBe(false)
    expect(rows[0].currentQty).toBe(3)
  })

  it('flags a ledger where opening plus net does not equal closing', () => {
    const rows = buildInventoryBalance({
      items: [item({ id: 'item-c', name: 'Milk', currentQty: 20 })],
      movements: [
        movement({
          id: 'movement-c',
          itemId: 'item-c',
          itemName: 'Milk',
          type: 'count_adjustment',
          quantity: 5,
          balanceBefore: 10,
          balanceAfter: 20,
        }),
      ],
    })
    expect(rows[0].openingQty).toBe(10)
    expect(rows[0].netQty).toBe(5)
    expect(rows[0].closingQty).toBe(20)
    expect(rows[0].reconciles).toBe(false)
  })
})

describe('buildMovementTypeBreakdown', () => {
  it('groups signed quantities by movement type', () => {
    const rows = buildMovementTypeBreakdown([
      movement(),
      movement({ id: 'm2', type: 'issue', quantity: -5, balanceBefore: 20, balanceAfter: 15 }),
      movement({ id: 'm3', type: 'issue', quantity: -2, balanceBefore: 15, balanceAfter: 13 }),
    ])
    const opening = rows.find((row) => row.type === 'opening_balance')
    const issue = rows.find((row) => row.type === 'issue')
    expect(opening).toMatchObject({ count: 1, inQty: 20, outQty: 0 })
    expect(issue).toMatchObject({ count: 2, inQty: 0, outQty: 7 })
  })
})

describe('buildProductionSummary', () => {
  it('groups tasks by product and counts overdue work', () => {
    const now = '2026-10-10T00:00:00.000Z'
    const rows = buildProductionSummary(
      [
        task(),
        task({
          id: 'task-2',
          requiredQty: 5,
          completedQty: 2,
          rejectedQty: 1,
          reworkQty: 1,
          status: 'in_progress',
          qualityStatus: 'rework',
        }),
        task({ id: 'task-3', requiredQty: 100, status: 'cancelled' }),
        task({
          id: 'task-4',
          productId: 'product-2',
          productName: 'Soan Papdi',
          requiredQty: 3,
          completedQty: 3,
        }),
      ],
      now,
    )
    expect(rows).toHaveLength(2)
    const barfi = rows.find((row) => row.productId === 'product-1')
    expect(barfi).toMatchObject({
      tasks: 2,
      requiredQty: 15,
      completedQty: 12,
      rejectedQty: 1,
      reworkQty: 1,
      overdueTasks: 1,
      completionPercent: 80,
    })
    const papdi = rows.find((row) => row.productId === 'product-2')
    expect(papdi).toMatchObject({ tasks: 1, requiredQty: 3, overdueTasks: 0, completionPercent: 100 })
    // Overdue work sorts first.
    expect(rows[0].productId).toBe('product-1')
  })

  it('does not mark completed tasks as overdue', () => {
    const rows = buildProductionSummary([task({ dueAt: '2020-01-01T00:00:00.000Z' })], '2026-10-10T00:00:00.000Z')
    expect(rows[0].overdueTasks).toBe(0)
  })
})

describe('buildProductStockSnapshot', () => {
  it('shows active stock-tracked products and flags low stock', () => {
    const rows = buildProductStockSnapshot([
      {
        id: 'product-1',
        name: 'Kaju Barfi',
        unit: 'kg',
        departmentId: 'dept-sweets',
        trackStock: true,
        stockQty: 4,
        criticalStock: 5,
        active: true,
      },
      {
        id: 'product-2',
        name: 'Untracked',
        unit: 'kg',
        departmentId: 'dept-sweets',
        trackStock: false,
        active: true,
      },
      {
        id: 'product-3',
        name: 'Inactive',
        unit: 'kg',
        departmentId: 'dept-sweets',
        trackStock: true,
        stockQty: 100,
        active: false,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ productId: 'product-1', stockQty: 4, low: true })
  })
})
