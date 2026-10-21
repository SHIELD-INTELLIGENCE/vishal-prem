import { describe, expect, it } from 'vitest'
import {
  STOCK_DEPARTMENTS,
  STOCK_MOVEMENT_DIRECTIONS,
  applyStockMovement,
  calculateCountVariance,
  calculateStockBalances,
  convertQuantity,
  createOpeningBalanceMovement,
  createTransferMovements,
  isLowStock,
  movementDirection,
  reconcileStockBalances,
  roundStockQuantity,
  stockBalanceKey,
  validateStockMovement,
  type StockBalance,
  type StockDepartmentId,
  type StockItem,
  type StockLocation,
  type StockMovement,
  type StockMovementType,
} from '@/lib/stockLedger'

const NOW = '2026-10-20T10:00:00.000Z'

function item(overrides: Partial<StockItem> = {}): StockItem {
  return { itemId: 'sugar', baseUnit: 'kg', ...overrides }
}

function location(
  departmentId: StockDepartmentId = STOCK_DEPARTMENTS.sweets,
): StockLocation {
  return { departmentId }
}

function movement(
  id: string,
  overrides: Partial<Omit<StockMovement, 'id'>> = {},
): StockMovement {
  return {
    id,
    location: location(),
    item: item(),
    type: 'purchase',
    quantity: 1,
    occurredAt: NOW,
    ...overrides,
  }
}

function balance(
  quantity: number,
  overrides: Partial<Omit<StockBalance, 'quantity'>> = {},
): StockBalance {
  return {
    location: location(),
    item: item(),
    quantity,
    ...overrides,
  }
}

describe('stock ledger quantity precision', () => {
  it('rounds to six decimal places, half away from zero', () => {
    expect(roundStockQuantity(1.2345674)).toBe(1.234567)
    expect(roundStockQuantity(1.2345676)).toBe(1.234568)
    expect(roundStockQuantity(-1.2345676)).toBe(-1.234568)
    expect(roundStockQuantity(0.1 + 0.2)).toBe(0.3)
  })

  it('accumulates fractional movements without binary drift', () => {
    const balances = calculateStockBalances([
      movement('fraction-1', { type: 'opening_balance', quantity: 0.1 }),
      movement('fraction-2', { type: 'purchase', quantity: 0.2 }),
      movement('fraction-3', { type: 'issue', quantity: -0.05 }),
    ])

    expect(balances).toHaveLength(1)
    expect(balances[0].quantity).toBe(0.25)
  })

  it('rejects zero, non-finite and excessively large quantities', () => {
    expect(() => validateStockMovement(movement('zero', { quantity: 0 }))).toThrow(
      /must not be zero/i,
    )
    expect(() => validateStockMovement(movement('nan', { quantity: Number.NaN }))).toThrow(
      /finite/i,
    )
    expect(() =>
      validateStockMovement(movement('infinite', { quantity: Number.POSITIVE_INFINITY })),
    ).toThrow(/finite/i)
    expect(() =>
      validateStockMovement(movement('huge', { quantity: Number.MAX_VALUE })),
    ).toThrow(/too large/i)
  })
})

describe('stock movement directions', () => {
  it('defines every supported direction', () => {
    const expected: Record<StockMovementType, string> = {
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
      sale_deduction: 'decrease',
      sale_reversal: 'increase',
    }

    for (const [type, direction] of Object.entries(expected)) {
      expect(movementDirection(type as StockMovementType)).toBe(direction)
      expect(STOCK_MOVEMENT_DIRECTIONS[type as StockMovementType]).toBe(direction)
    }
  })

  it('accepts the valid sign for every movement type and rejects the wrong sign', () => {
    for (const type of Object.keys(STOCK_MOVEMENT_DIRECTIONS) as StockMovementType[]) {
      const direction = STOCK_MOVEMENT_DIRECTIONS[type]
      const validQuantity = direction === 'decrease' ? -1 : 1
      expect(() =>
        validateStockMovement(movement(`valid-${type}`, { type, quantity: validQuantity })),
      ).not.toThrow()

      if (direction !== 'either') {
        expect(() =>
          validateStockMovement(movement(`invalid-${type}`, { type, quantity: -validQuantity })),
        ).toThrow(/must (increase|decrease) stock/i)
      }
    }
  })

  it('allows count adjustments in either direction', () => {
    expect(() =>
      validateStockMovement(movement('count-up', { type: 'count_adjustment', quantity: 1.5 })),
    ).not.toThrow()
    expect(() =>
      validateStockMovement(movement('count-down', { type: 'count_adjustment', quantity: -1.5 })),
    ).not.toThrow()
  })

  it('calculates positive and negative deltas against a balance', () => {
    const opening = createOpeningBalanceMovement({
      id: 'opening',
      location: location(),
      item: item(),
      quantity: 10,
    })
    expect(applyStockMovement(0, opening)).toBe(10)
    expect(applyStockMovement(10, movement('purchase', { quantity: 5 }))).toBe(15)
    expect(applyStockMovement(15, movement('issue', { type: 'issue', quantity: -2.5 }))).toBe(
      12.5,
    )
  })
})

describe('department and item isolation', () => {
  it('keeps identical item ids in different departments separate', () => {
    const balances = calculateStockBalances([
      movement('sweets-opening', {
        type: 'opening_balance',
        location: location(STOCK_DEPARTMENTS.sweets),
        quantity: 10,
      }),
      movement('cake-opening', {
        type: 'opening_balance',
        location: location(STOCK_DEPARTMENTS.cakePastry),
        quantity: 4,
      }),
    ])

    expect(balances).toHaveLength(2)
    expect(
      balances.find((entry) => entry.location.departmentId === STOCK_DEPARTMENTS.sweets)
        ?.quantity,
    ).toBe(10)
    expect(
      balances.find((entry) => entry.location.departmentId === STOCK_DEPARTMENTS.cakePastry)
        ?.quantity,
    ).toBe(4)
  })

  it('includes the base unit in the balance identity', () => {
    const kgKey = stockBalanceKey(location(), item({ baseUnit: 'kg' }))
    const pieceKey = stockBalanceKey(location(), item({ baseUnit: 'piece' }))
    expect(kgKey).not.toBe(pieceKey)
  })
})

describe('unit conversion', () => {
  it('converts with an explicit factor', () => {
    expect(
      convertQuantity({ quantity: 1.5, fromUnit: 'box', toUnit: 'piece', factor: 12 }),
    ).toBe(18)
    expect(
      convertQuantity({ quantity: 0.333333, fromUnit: 'box', toUnit: 'kg', factor: 3 }),
    ).toBe(0.999999)
  })

  it('allows same-unit conversion without a factor, but not a wrong factor', () => {
    expect(convertQuantity({ quantity: 2.5, fromUnit: 'kg', toUnit: 'kg' })).toBe(2.5)
    expect(
      convertQuantity({ quantity: 2.5, fromUnit: 'kg', toUnit: 'kg', factor: 1 }),
    ).toBe(2.5)
    expect(() =>
      convertQuantity({ quantity: 2.5, fromUnit: 'kg', toUnit: 'kg', factor: 2 }),
    ).toThrow(/must be 1/i)
  })

  it('rejects missing, non-finite, zero and negative factors when units differ', () => {
    expect(() =>
      convertQuantity({ quantity: 1, fromUnit: 'box', toUnit: 'piece' }),
    ).toThrow(/factor is required/i)
    expect(() =>
      convertQuantity({ quantity: 1, fromUnit: 'box', toUnit: 'piece', factor: Number.NaN }),
    ).toThrow(/finite/i)
    expect(() =>
      convertQuantity({
        quantity: 1,
        fromUnit: 'box',
        toUnit: 'piece',
        factor: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/finite/i)
    expect(() =>
      convertQuantity({ quantity: 1, fromUnit: 'box', toUnit: 'piece', factor: 0 }),
    ).toThrow(/greater than zero/i)
    expect(() =>
      convertQuantity({ quantity: 1, fromUnit: 'box', toUnit: 'piece', factor: -2 }),
    ).toThrow(/greater than zero/i)
  })

  it('preserves the sign of a converted movement quantity', () => {
    expect(
      convertQuantity({ quantity: -2, fromUnit: 'box', toUnit: 'piece', factor: 6 }),
    ).toBe(-12)
  })
})

describe('opening balances and movement direction checks', () => {
  it('creates a positive opening movement without inferring a quantity', () => {
    const opening = createOpeningBalanceMovement({
      id: 'opening-1',
      location: location(STOCK_DEPARTMENTS.gajak),
      item: item({ itemId: 'sesame', baseUnit: 'kg' }),
      quantity: 12.5,
      reason: 'Physical opening count',
      actorId: 'staff-1',
    })

    expect(opening).toMatchObject({
      type: 'opening_balance',
      quantity: 12.5,
      location: { departmentId: STOCK_DEPARTMENTS.gajak },
      item: { itemId: 'sesame', baseUnit: 'kg' },
    })
    expect(() =>
      createOpeningBalanceMovement({
        id: 'negative-opening',
        location: location(),
        item: item(),
        quantity: -1,
      }),
    ).toThrow(/must increase stock/i)
  })

  it('validates a purchase, issue, consumption and wastage sequence', () => {
    const balances = calculateStockBalances([
      movement('opening', { type: 'opening_balance', quantity: 20 }),
      movement('purchase', { type: 'purchase', quantity: 5 }),
      movement('issue', { type: 'issue', quantity: -3 }),
      movement('consumption', { type: 'consumption', quantity: -1.5 }),
      movement('wastage', { type: 'wastage', quantity: -0.5 }),
    ])

    expect(balances[0].quantity).toBe(20)
  })

  it('rejects malformed identifiers, units, timestamps and source references', () => {
    expect(() => validateStockMovement(movement(''))).toThrow(/movement id/i)
    expect(() =>
      validateStockMovement(movement('blank-department', { location: { departmentId: ' ' } })),
    ).toThrow(/department id/i)
    expect(() =>
      validateStockMovement(movement('blank-item', { item: { itemId: '', baseUnit: 'kg' } })),
    ).toThrow(/item id/i)
    expect(() =>
      validateStockMovement(movement('blank-unit', { item: { itemId: 'sugar', baseUnit: '' } })),
    ).toThrow(/base unit/i)
    expect(() =>
      validateStockMovement(movement('bad-time', { occurredAt: 'not-a-date' })),
    ).toThrow(/valid date/i)
    expect(() =>
      validateStockMovement(
        movement('bad-source', { source: { type: 'order', documentId: '' } }),
      ),
    ).toThrow(/source document id/i)
  })
})

describe('returns', () => {
  it('restores usable stock for a customer return and removes stock for supplier returns', () => {
    const balances = calculateStockBalances([
      movement('opening', { type: 'opening_balance', quantity: 10 }),
      movement('customer-return', { type: 'customer_return', quantity: 2 }),
      movement('supplier-return', { type: 'supplier_return', quantity: -1 }),
      movement('purchase-return', { type: 'purchase_return', quantity: -0.5 }),
    ])

    expect(balances[0].quantity).toBe(10.5)
  })

  it('rejects a customer return that would decrease stock and a supplier return that increases it', () => {
    expect(() =>
      validateStockMovement(movement('bad-customer-return', { type: 'customer_return', quantity: -1 })),
    ).toThrow(/must increase stock/i)
    expect(() =>
      validateStockMovement(movement('bad-supplier-return', { type: 'supplier_return', quantity: 1 })),
    ).toThrow(/must decrease stock/i)
  })
})

describe('transfers', () => {
  it('creates paired movements that conserve total quantity', () => {
    const transfer = createTransferMovements({
      id: 'transfer-1',
      item: item(),
      from: location(STOCK_DEPARTMENTS.sweets),
      to: location(STOCK_DEPARTMENTS.cakePastry),
      quantity: 3.5,
      occurredAt: NOW,
      idempotencyKey: 'transfer-key',
    })

    expect(transfer.outbound).toMatchObject({
      id: 'transfer-1:out',
      type: 'transfer_out',
      quantity: -3.5,
      location: { departmentId: STOCK_DEPARTMENTS.sweets },
      source: { type: 'transfer', documentId: 'transfer-1' },
      idempotencyKey: 'transfer-key:out',
    })
    expect(transfer.inbound).toMatchObject({
      id: 'transfer-1:in',
      type: 'transfer_in',
      quantity: 3.5,
      location: { departmentId: STOCK_DEPARTMENTS.cakePastry },
      source: { type: 'transfer', documentId: 'transfer-1' },
      idempotencyKey: 'transfer-key:in',
    })
    expect(transfer.outbound.quantity + transfer.inbound.quantity).toBe(0)
  })

  it('rejects same-department transfers', () => {
    expect(() =>
      createTransferMovements({
        id: 'same-location',
        item: item(),
        from: location(STOCK_DEPARTMENTS.sweets),
        to: location(STOCK_DEPARTMENTS.sweets),
        quantity: 1,
      }),
    ).toThrow(/different departments/i)
  })

  it('rejects zero and negative transfer quantities', () => {
    expect(() =>
      createTransferMovements({
        id: 'zero',
        item: item(),
        from: location(STOCK_DEPARTMENTS.sweets),
        to: location(STOCK_DEPARTMENTS.hotSection),
        quantity: 0,
      }),
    ).toThrow(/greater than zero/i)
    expect(() =>
      createTransferMovements({
        id: 'negative',
        item: item(),
        from: location(STOCK_DEPARTMENTS.sweets),
        to: location(STOCK_DEPARTMENTS.hotSection),
        quantity: -1,
      }),
    ).toThrow(/greater than zero/i)
  })
})

describe('physical counts and low stock', () => {
  it('calculates surplus, shortage and match variances', () => {
    expect(calculateCountVariance({ countedQuantity: 12, recordedQuantity: 10 })).toMatchObject({
      variance: 2,
      direction: 'surplus',
    })
    expect(calculateCountVariance({ countedQuantity: 8.5, recordedQuantity: 10 })).toMatchObject({
      variance: -1.5,
      direction: 'shortage',
    })
    expect(calculateCountVariance({ countedQuantity: 10, recordedQuantity: 10 })).toMatchObject({
      variance: 0,
      direction: 'match',
    })
  })

  it('rejects a negative counted quantity', () => {
    expect(() =>
      calculateCountVariance({ countedQuantity: -1, recordedQuantity: 0 }),
    ).toThrow(/counted quantity cannot be negative/i)
  })

  it('treats the threshold as an inclusive low-stock boundary', () => {
    expect(isLowStock(balance(5), { quantity: 5, unit: 'kg' })).toBe(true)
    expect(isLowStock(balance(4.999999), { quantity: 5, unit: 'kg' })).toBe(true)
    expect(isLowStock(balance(5.000001), { quantity: 5, unit: 'kg' })).toBe(false)
  })

  it('rejects a threshold in a different unit or a negative threshold', () => {
    expect(() => isLowStock(balance(5), { quantity: 5, unit: 'piece' })).toThrow(
      /does not match item base unit/i,
    )
    expect(() => isLowStock(balance(5), { quantity: -1, unit: 'kg' })).toThrow(
      /cannot be negative/i,
    )
  })
})

describe('negative stock policy', () => {
  it('rejects a movement that would make stock negative by default', () => {
    expect(() =>
      applyStockMovement(2, movement('issue', { type: 'issue', quantity: -3 })),
    ).toThrow(/would make sugar negative/i)
    expect(() =>
      calculateStockBalances([
        movement('opening', { type: 'opening_balance', quantity: 2 }),
        movement('issue', { type: 'issue', quantity: -3 }),
      ]),
    ).toThrow(/would make sugar negative/i)
  })

  it('allows negative stock only when the caller explicitly opts in', () => {
    expect(
      applyStockMovement(2, movement('issue', { type: 'issue', quantity: -3 }), 'allow'),
    ).toBe(-1)
    expect(
      calculateStockBalances(
        [
          movement('opening', { type: 'opening_balance', quantity: 2 }),
          movement('issue', { type: 'issue', quantity: -3 }),
        ],
        'allow',
      )[0].quantity,
    ).toBe(-1)
  })
})

describe('reconciliation', () => {
  const movements = [
    movement('opening', { type: 'opening_balance', quantity: 10 }),
    movement('purchase', { type: 'purchase', quantity: 5 }),
    movement('issue', { type: 'issue', quantity: -3 }),
  ]

  it('matches correct supplied balances', () => {
    const report = reconcileStockBalances({
      movements,
      suppliedBalances: [balance(12)],
    })

    expect(report).toEqual({ matched: true, discrepancies: [] })
  })

  it('reports a discrepancy rather than repairing it', () => {
    const report = reconcileStockBalances({
      movements,
      suppliedBalances: [balance(11)],
    })

    expect(report.matched).toBe(false)
    expect(report.discrepancies).toHaveLength(1)
    expect(report.discrepancies[0]).toMatchObject({
      expectedQuantity: 12,
      suppliedQuantity: 11,
      difference: -1,
    })
  })

  it('reports missing and extra balances', () => {
    const missing = reconcileStockBalances({
      movements,
      suppliedBalances: [],
    })
    expect(missing.matched).toBe(false)
    expect(missing.discrepancies[0]).toMatchObject({
      expectedQuantity: 12,
      suppliedQuantity: 0,
      difference: -12,
    })

    const extraItem = item({ itemId: 'flour' })
    const extra = reconcileStockBalances({
      movements,
      suppliedBalances: [balance(12), balance(4, { item: extraItem })],
    })
    expect(extra.matched).toBe(false)
    expect(extra.discrepancies[0]).toMatchObject({
      expectedQuantity: 0,
      suppliedQuantity: 4,
      difference: 4,
    })
  })

  it('rejects duplicate supplied balances', () => {
    expect(() =>
      reconcileStockBalances({
        movements,
        suppliedBalances: [balance(12), balance(12)],
      }),
    ).toThrow(/duplicate supplied balance/i)
  })

  it('uses the selected negative-stock policy when calculating expected balances', () => {
    const report = reconcileStockBalances({
      movements: [
        movement('opening', { type: 'opening_balance', quantity: 1 }),
        movement('issue', { type: 'issue', quantity: -2 }),
      ],
      suppliedBalances: [balance(-1)],
      policy: 'allow',
    })
    expect(report.matched).toBe(true)
  })
})

describe('movement identity and idempotency', () => {
  it('rejects duplicate movement ids', () => {
    expect(() =>
      calculateStockBalances([
        movement('duplicate', { type: 'opening_balance', quantity: 1 }),
        movement('duplicate', { type: 'purchase', quantity: 1 }),
      ]),
    ).toThrow(/duplicate stock movement id/i)
  })

  it('rejects duplicate idempotency keys', () => {
    expect(() =>
      calculateStockBalances([
        movement('first', { type: 'opening_balance', quantity: 1, idempotencyKey: 'same-key' }),
        movement('second', { type: 'purchase', quantity: 1, idempotencyKey: 'same-key' }),
      ]),
    ).toThrow(/duplicate stock idempotency key/i)
  })

  it('allows movements without idempotency keys', () => {
    expect(() =>
      calculateStockBalances([
        movement('first', { type: 'opening_balance', quantity: 1 }),
        movement('second', { type: 'purchase', quantity: 1 }),
      ]),
    ).not.toThrow()
  })
})
