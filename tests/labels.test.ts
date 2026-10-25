import { describe, expect, it } from 'vitest'
import {
  MAX_LABEL_JOB_QUANTITY,
  MAX_LABEL_LINE_QUANTITY,
  buildLabelDashboard,
  computeLabelLedger,
  defaultLabelTemplate,
  encodeCode128B,
  isWholeQuantity,
  labelQuantityError,
  labelTotals,
  reconcileLabelLine,
} from '@/lib/labels'
import type {
  LabelEvent,
  LabelJobLine,
  LabelPrintJob,
  LabelTemplateSnapshot,
} from '@/types/models'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

function line(overrides: Partial<LabelJobLine> = {}): LabelJobLine {
  return {
    lineId: 'line-1',
    refId: 'product-1',
    kind: 'item',
    name: 'Kaju Barfi',
    sku: 'SKU-1',
    barcodeValue: 'SKU-1',
    unit: 'kg',
    pricePaise: 72000,
    requestedQty: 10,
    printedQty: 0,
    appliedQty: 0,
    damagedQty: 0,
    returnedQty: 0,
    ...overrides,
  }
}

function template(overrides: Partial<LabelTemplateSnapshot> = {}): LabelTemplateSnapshot {
  return {
    ...defaultLabelTemplate('item'),
    ...overrides,
  }
}

function job(overrides: Partial<LabelPrintJob> = {}): LabelPrintJob {
  return {
    ...base,
    id: 'job-1',
    jobNumber: 'LBL-1-001',
    jobType: 'item',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    template: template(),
    lines: [line({ printedQty: 10 })],
    requestedQty: 10,
    printedQty: 10,
    reprintQty: 0,
    appliedQty: 0,
    damagedQty: 0,
    returnedQty: 0,
    unaccountedQty: 10,
    status: 'printed',
    reconciliationStatus: 'open',
    printedByName: 'Operator One',
    lastActivityAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

function event(overrides: Partial<LabelEvent> = {}): LabelEvent {
  return {
    ...base,
    id: 'event-1',
    jobId: 'job-1',
    jobNumber: 'LBL-1-001',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    kind: 'confirmed',
    lines: [{ lineId: 'line-1', quantity: 10 }],
    actorName: 'Operator One',
    occurredAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('encodeCode128B', () => {
  it('builds start, data, checksum and stop symbols', () => {
    const result = encodeCode128B('ABC')
    expect(result.symbols).toHaveLength(6)
    expect(result.symbols[0]).toBe(104)
    expect(result.symbols.slice(1, 4)).toEqual([33, 34, 35])
    expect(result.checksum).toBe(1)
    expect(result.symbols[5]).toBe(106)
  })

  it('frames the payload with a ten-module quiet zone on each side', () => {
    const result = encodeCode128B('ABC')
    expect(result.modules.startsWith('0'.repeat(10))).toBe(true)
    expect(result.modules.endsWith('0'.repeat(10))).toBe(true)
    // 5 symbols × 11 modules + 13-module stop + 20 quiet modules.
    expect(result.modules).toHaveLength(5 * 11 + 13 + 20)
  })

  it('rejects empty, non-ASCII and over-long values', () => {
    expect(() => encodeCode128B('')).toThrow(/required/i)
    expect(() => encodeCode128B('Kaju ₹')).toThrow(/printable ASCII/i)
    expect(() => encodeCode128B('x'.repeat(49))).toThrow(/48/)
  })
})

describe('defaultLabelTemplate', () => {
  it('uses account fields for account labels', () => {
    const account = defaultLabelTemplate('account')
    expect(account.type).toBe('account')
    expect(account.showAddress).toBe(true)
    expect(account.showPhone).toBe(true)
    expect(account.showPrice).toBe(false)
  })

  it('keeps dimensions inside the supported limits', () => {
    for (const type of ['item', 'account'] as const) {
      const value = defaultLabelTemplate(type)
      expect(value.widthMm).toBeGreaterThanOrEqual(25)
      expect(value.heightMm).toBeGreaterThanOrEqual(10)
      expect(value.columns).toBeGreaterThanOrEqual(1)
      expect(value.columns).toBeLessThanOrEqual(4)
    }
  })

  it('starts item labels with quantity visible and optional batch/date fields hidden', () => {
    const item = defaultLabelTemplate('item')
    expect(item.showUnit).toBe(true)
    expect(item.showBatch).toBe(false)
    expect(item.showMfgDate).toBe(false)
    expect(item.showExpiryDate).toBe(false)
    expect(item.showMrp).toBe(true)
  })
})

describe('reconcileLabelLine', () => {
  it('derives unaccounted and application rate', () => {
    const row = reconcileLabelLine(line({ printedQty: 10, appliedQty: 5, damagedQty: 2, returnedQty: 1 }))
    expect(row.accounted).toBe(8)
    expect(row.unaccounted).toBe(2)
    expect(row.available).toBe(2)
    expect(row.applicationRate).toBe(50)
  })

  it('never reports negative unaccounted quantity', () => {
    const row = reconcileLabelLine(line({ printedQty: 1, appliedQty: 4 }))
    expect(row.unaccounted).toBe(0)
    expect(row.available).toBe(0)
  })

  it('reports no rate when nothing is printed', () => {
    expect(reconcileLabelLine(line({ printedQty: 0 })).applicationRate).toBeNull()
  })
})

describe('labelTotals', () => {
  it('sums every line', () => {
    const totals = labelTotals([
      line({ lineId: 'a', printedQty: 10, appliedQty: 5, damagedQty: 1, returnedQty: 1 }),
      line({ lineId: 'b', printedQty: 4, appliedQty: 4 }),
    ])
    expect(totals.printed).toBe(14)
    expect(totals.applied).toBe(9)
    expect(totals.damaged).toBe(1)
    expect(totals.returned).toBe(1)
    expect(totals.unaccounted).toBe(3)
  })
})

describe('computeLabelLedger', () => {
  it('rebuilds printed and usage quantities from events', () => {
    const events: LabelEvent[] = [
      event({ id: 'confirmed-1' }),
      event({ id: 'reprint-1', kind: 'reprinted', lines: [{ lineId: 'line-1', quantity: 2 }] }),
      event({ id: 'use-1', kind: 'usage', lineId: 'line-1', category: 'applied', quantity: 4 }),
      event({ id: 'use-2', kind: 'usage', lineId: 'line-1', category: 'damaged', quantity: 1 }),
      event({ id: 'use-3', kind: 'usage', lineId: 'line-1', category: 'returned', quantity: 2 }),
      event({ id: 'adj-1', kind: 'adjusted', lineId: 'line-1', category: 'applied', quantity: -1 }),
    ]
    const ledger = computeLabelLedger([line()], events)
    expect(ledger.totals.printed).toBe(12)
    expect(ledger.totals.applied).toBe(3)
    expect(ledger.totals.damaged).toBe(1)
    expect(ledger.totals.returned).toBe(2)
    expect(ledger.totals.unaccounted).toBe(6)
  })

  it('ignores a print event cancelled by a void event', () => {
    const events: LabelEvent[] = [
      event({ id: 'confirmed-1' }),
      event({ id: 'void-1', kind: 'voided', lines: [], voidsEventId: 'confirmed-1' }),
    ]
    const ledger = computeLabelLedger([line()], events)
    expect(ledger.totals.printed).toBe(0)
    expect(ledger.totals.unaccounted).toBe(0)
  })
})

describe('labelQuantityError', () => {
  it('accepts a balanced quantity set', () => {
    expect(labelQuantityError({ printed: 10, applied: 5, damaged: 2, returned: 3 })).toBeNull()
  })

  it('rejects over-application and negative values', () => {
    expect(labelQuantityError({ printed: 5, applied: 6, damaged: 0, returned: 0 })).toMatch(/cannot exceed/i)
    expect(labelQuantityError({ printed: 5, applied: -1, damaged: 0, returned: 0 })).toMatch(/negative/i)
    expect(labelQuantityError({ printed: Number.NaN, applied: 0, damaged: 0, returned: 0 })).toMatch(/finite/i)
  })

  it('validates whole quantities', () => {
    expect(isWholeQuantity(0)).toBe(true)
    expect(isWholeQuantity(3)).toBe(true)
    expect(isWholeQuantity(1.5)).toBe(false)
    expect(isWholeQuantity(-1)).toBe(false)
  })

  it('documents the supported caps', () => {
    expect(MAX_LABEL_JOB_QUANTITY).toBeGreaterThan(MAX_LABEL_LINE_QUANTITY)
  })
})

describe('buildLabelDashboard', () => {
  it('filters by date and aggregates printed, usage and trend', () => {
    const jobs = [
      job({ id: 'job-1' }),
      job({
        id: 'job-2',
        jobNumber: 'LBL-1-002',
        createdAt: '2026-09-01T10:00:00.000Z',
        printedByName: 'Operator Two',
        lines: [line({ lineId: 'line-2', refId: 'product-2', name: 'Soan Papdi', printedQty: 5, appliedQty: 5 })],
        printedQty: 5,
        appliedQty: 5,
        unaccountedQty: 0,
      }),
    ]
    const events = [
      event({ id: 'e1', occurredAt: '2026-10-02T10:00:00.000Z' }),
      event({
        id: 'e2',
        kind: 'usage',
        category: 'applied',
        quantity: 3,
        lineId: 'line-1',
        occurredAt: '2026-10-02T12:00:00.000Z',
      }),
    ]
    const dashboard = buildLabelDashboard({
      jobs,
      events,
      filters: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' },
    })
    expect(dashboard.jobs).toBe(1)
    expect(dashboard.printed).toBe(10)
    expect(dashboard.applied).toBe(0)
    expect(dashboard.unaccounted).toBe(10)
    expect(dashboard.trend).toEqual([{ date: '2026-10-02', printed: 10, applied: 3 }])
    expect(dashboard.byOperator).toHaveLength(1)
    expect(dashboard.byUsageOperator).toHaveLength(1)
  })

  it('excludes jobs outside the range and honours type filters', () => {
    const dashboard = buildLabelDashboard({
      jobs: [job({ jobType: 'account', departmentId: '' })],
      filters: {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
        jobType: 'item',
      },
    })
    expect(dashboard.jobs).toBe(0)
  })
})
