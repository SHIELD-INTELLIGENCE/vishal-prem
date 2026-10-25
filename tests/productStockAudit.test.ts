import { describe, expect, it } from 'vitest'
import { buildStockAdjustment } from '@/lib/stockOperations'
import type { Product, UserProfile } from '@/types/models'

const product = {
  id: 'product-1',
  name: 'Aloo Patties',
  departmentId: 'dept-snacks',
  outletIds: ['outlet-1'],
  unit: 'piece',
} as Product

const profile = {
  uid: 'staff-1',
  displayName: 'Operator One',
  email: 'operator@example.com',
} as UserProfile

describe('buildStockAdjustment', () => {
  it('records a normal manual adjustment by default', () => {
    const record = buildStockAdjustment({
      product,
      profile,
      adjustmentId: 'adj-1',
      delta: -2,
      reason: 'Wastage',
      previousStockQty: 5,
      resultingStockQty: 3,
      now: '2026-10-24T10:00:00.000Z',
    })
    expect(record.source).toBe('manual')
    expect(record.previousStockQty).toBe(5)
    expect(record.resultingStockQty).toBe(3)
  })

  it('marks the audited opening balance when tracking is enabled', () => {
    const record = buildStockAdjustment({
      product,
      profile,
      adjustmentId: 'adj-2',
      delta: 0,
      reason: 'Enable tracking with zero opening stock',
      previousStockQty: 0,
      resultingStockQty: 0,
      now: '2026-10-24T10:00:00.000Z',
      source: 'enable_tracking',
    })
    expect(record.source).toBe('enable_tracking')
    expect(record.delta).toBe(0)
    expect(record.resultingStockQty).toBe(0)
  })
})
