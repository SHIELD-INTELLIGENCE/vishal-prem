import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cancellation restores stock inside a Firestore transaction.
 *
 * Firestore is mocked with a small transactional harness so the client code can
 * be exercised without a project. The harness enforces two properties that the
 * real SDK also enforces:
 *   1. every `get` must happen before the first `set`/`update`; and
 *   2. writes are applied only after the transaction callback resolves.
 *
 * This proves our call sequence and failure behaviour. It does not prove the
 * real Firestore commit semantics, which can only be verified against the
 * emulator or a project; see the report for that limitation.
 */

const firestore = vi.hoisted(() => {
  type FakeDoc = Record<string, unknown>
  type FakeRef = { path: string }
  type FakeSnapshot = {
    id: string
    exists: () => boolean
    data: () => FakeDoc | undefined
  }
  type FakeTransaction = {
    get: (ref: FakeRef) => Promise<FakeSnapshot>
    set: (ref: FakeRef, data: FakeDoc) => void
    update: (ref: FakeRef, data: FakeDoc) => void
  }

  const orders = new Map<string, FakeDoc>()
  const products = new Map<string, FakeDoc>()
  const writeLog: string[] = []
  const commits = { count: 0 }

  function isIncrement(value: unknown): value is { __increment: number } {
    return typeof value === 'object' && value !== null && '__increment' in value
  }

  function apply(path: string, data: FakeDoc) {
    const [collectionName, id] = path.split('/')
    const target = collectionName === 'orders' ? orders : products
    const current = target.get(id) ?? {}
    const next: FakeDoc = { ...current }
    for (const [key, value] of Object.entries(data)) {
      next[key] = isIncrement(value) ? Number(current[key] ?? 0) + value.__increment : value
    }
    target.set(id, next)
    writeLog.push(path)
  }

  const doc = (_db: unknown, collectionName: string, id: string): FakeRef => ({
    path: `${collectionName}/${id}`,
  })

  const increment = (value: number) => ({ __increment: value })

  const updateDoc = async (ref: FakeRef, data: FakeDoc) => {
    apply(ref.path, data)
  }

  const runTransaction = async (
    _db: unknown,
    callback: (transaction: FakeTransaction) => Promise<void>,
  ) => {
    const staged: Array<{ path: string; data: FakeDoc }> = []
    let readPhase = true

    const transaction: FakeTransaction = {
      get: async (ref) => {
        if (!readPhase) throw new Error('Test harness: transaction read after write')
        const [collectionName, id] = ref.path.split('/')
        const source =
          collectionName === 'orders' ? orders : collectionName === 'products' ? products : undefined
        const data = source?.get(id)
        return { id, exists: () => data !== undefined, data: () => data }
      },
      set: (ref, data) => {
        readPhase = false
        staged.push({ path: ref.path, data })
      },
      update: (ref, data) => {
        readPhase = false
        staged.push({ path: ref.path, data })
      },
    }

    await callback(transaction)
    // Firestore commits all staged writes together. Apply them only after the
    // callback resolves, so a throw leaves the fake database untouched.
    for (const write of staged) apply(write.path, write.data)
    commits.count += 1
  }

  function reset() {
    orders.clear()
    products.clear()
    writeLog.length = 0
    commits.count = 0
  }

  return { orders, products, writeLog, commits, doc, increment, updateDoc, runTransaction, reset }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: firestore.doc,
  increment: firestore.increment,
  runTransaction: firestore.runTransaction,
  updateDoc: firestore.updateDoc,
}))

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
}))

import { defaultPermissionsForRole } from '@/auth/permissions'
import { updateOrderStatus } from '@/data/orders'
import type { Order, OrderLine, Product, UserProfile } from '@/types/models'

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 'line-1',
    productId: 'product-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    departmentId: 'dept-sweets',
    pricingMode: 'per_kg',
    quantity: 2,
    unit: 'kg',
    unitPricePaise: 72000,
    discountPercent: 0,
    taxPercent: 5,
    stockTracked: true,
    stockFactor: 1,
    stockConsumed: 2,
    ...overrides,
  }
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'VP-0001',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    customerName: 'Test Customer',
    channel: 'counter',
    orderType: 'takeaway',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    lines: [line()],
    subtotalPaise: 144000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 7200,
    totalPaise: 151200,
    paidPaise: 0,
    balancePaise: 151200,
    pricesIncludeTax: false,
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    ...overrides,
  }
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    group: 'Sweets',
    category: 'Barfi',
    departmentId: 'dept-sweets',
    outletIds: ['outlet-1'],
    pricingMode: 'per_kg',
    unit: 'kg',
    salePricePaise: 72000,
    taxPercent: 5,
    trackStock: true,
    openingStock: 10,
    stockQty: 10,
    criticalStock: 2,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    ...overrides,
  }
}

function profile(): UserProfile {
  return {
    uid: 'staff-1',
    displayName: 'Owner',
    email: 'owner@example.com',
    role: 'super_admin',
    permissions: defaultPermissionsForRole('super_admin'),
    outletIds: ['outlet-1'],
    departmentIds: ['dept-sweets'],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function seed(orderValue: Order, ...productValues: Product[]) {
  firestore.orders.set(orderValue.id, orderValue as unknown as Record<string, unknown>)
  for (const value of productValues) {
    firestore.products.set(value.id, value as unknown as Record<string, unknown>)
  }
}

function stockOf(productId: string): unknown {
  return firestore.products.get(productId)?.stockQty
}

beforeEach(() => {
  firestore.reset()
})

describe('updateOrderStatus cancellation', () => {
  it('cancels the order and restores the quantity deducted at creation', async () => {
    const current = order()
    seed(current, product())

    await updateOrderStatus({
      order: current,
      status: 'cancelled',
      profile: profile(),
      reason: 'Customer changed mind',
    })

    expect(firestore.commits.count).toBe(1)
    expect(firestore.orders.get('order-1')).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Customer changed mind',
      updatedBy: 'staff-1',
    })
    expect(stockOf('product-1')).toBe(12)
    expect(firestore.writeLog).toEqual(['orders/order-1', 'products/product-1'])
  })

  it('does not write stock for a line that was untracked at creation', async () => {
    const current = order({
      lines: [line({ stockTracked: false, stockFactor: undefined, stockConsumed: 0 })],
    })
    seed(current, product({ trackStock: false }))

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })

    expect(stockOf('product-1')).toBe(10)
    expect(firestore.writeLog).toEqual(['orders/order-1'])
  })

  it('uses the saved consumption when the conversion factor changes after creation', async () => {
    const current = order({ lines: [line({ quantity: 10, stockConsumed: 4 })] })
    seed(current, product({ conversionFactor: 5 }))

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })

    expect(stockOf('product-1')).toBe(14)
    expect(firestore.writeLog).toEqual(['orders/order-1', 'products/product-1'])
  })

  it('restores from the snapshot even when tracking is disabled after creation', async () => {
    const current = order()
    seed(current, product({ trackStock: false }))

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })

    expect(stockOf('product-1')).toBe(12)
    expect(firestore.writeLog).toEqual(['orders/order-1', 'products/product-1'])
  })

  it('aggregates duplicate lines into one product restoration', async () => {
    const current = order({
      lines: [
        line({ id: 'line-1', stockConsumed: 2 }),
        line({ id: 'line-2', stockConsumed: 3 }),
      ],
    })
    seed(current, product({ stockQty: 10 }))

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })

    expect(stockOf('product-1')).toBe(15)
    expect(
      firestore.writeLog.filter((path) => path === 'products/product-1'),
    ).toHaveLength(1)
  })

  it('restores several products from their saved consumption', async () => {
    const current = order({
      lines: [
        line({ id: 'line-1', stockConsumed: 4 }),
        line({
          id: 'line-2',
          productId: 'product-2',
          name: 'Patties',
          pricingMode: 'fixed',
          unit: 'piece',
          stockConsumed: 4,
        }),
      ],
    })
    seed(
      current,
      product({ stockQty: 10, conversionFactor: 0.5 }),
      product({
        id: 'product-2',
        name: 'Patties',
        pricingMode: 'fixed',
        unit: 'piece',
        stockQty: 4,
        conversionFactor: 3,
      }),
    )

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })

    expect(stockOf('product-1')).toBe(14)
    expect(stockOf('product-2')).toBe(8)
    expect(
      firestore.writeLog.filter((path) => path === 'products/product-1'),
    ).toHaveLength(1)
    expect(
      firestore.writeLog.filter((path) => path === 'products/product-2'),
    ).toHaveLength(1)
  })

  it('makes repeated cancellation a successful no-op without restoring again', async () => {
    const current = order()
    seed(current, product())

    await updateOrderStatus({ order: current, status: 'cancelled', profile: profile() })
    const writesAfterFirstCancellation = firestore.writeLog.length

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).resolves.toBeUndefined()

    expect(stockOf('product-1')).toBe(12)
    expect(firestore.writeLog).toHaveLength(writesAfterFirstCancellation)
  })

  it('returns a successful no-op when the caller copy is already cancelled', async () => {
    const stored = order({ status: 'cancelled' })
    seed(stored, product({ stockQty: 12 }))

    await expect(
      updateOrderStatus({ order: stored, status: 'cancelled', profile: profile() }),
    ).resolves.toBeUndefined()

    expect(stockOf('product-1')).toBe(12)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects an invalid transition before writing anything', async () => {
    const completed = order({ status: 'completed' })
    seed(completed, product())

    await expect(
      updateOrderStatus({ order: completed, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/cannot move from completed/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'completed' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects a stale cancellation when the order moved on in another session', async () => {
    seed(order({ status: 'preparing' }), product())

    await expect(
      updateOrderStatus({ order: order({ status: 'confirmed' }), status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/changed while you were working/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'preparing' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('aborts when a line is missing its stock-tracking snapshot', async () => {
    const legacyLine = line()
    delete legacyLine.stockTracked
    const current = order({ lines: [legacyLine] })
    seed(current, product())

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/stock-tracking snapshot.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('aborts when a tracked line is missing its stock-consumption snapshot', async () => {
    const legacyLine = line()
    delete legacyLine.stockConsumed
    const current = order({ lines: [legacyLine] })
    seed(current, product())

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/saved stock consumption is invalid.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it.each([
    ['zero', 0],
    ['negative', -2],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const)('aborts for a %s saved consumption value', async (_label, stockConsumed) => {
    const current = order({ lines: [line({ stockConsumed })] })
    seed(current, product())

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/saved stock consumption is invalid.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('aborts with no partial writes when a referenced product is missing', async () => {
    const current = order({
      lines: [
        line({ id: 'line-1', productId: 'product-1', stockConsumed: 2 }),
        line({
          id: 'line-2',
          productId: 'deleted',
          name: 'Deleted Sweet',
          stockConsumed: 1,
        }),
      ],
    })
    seed(current, product())

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/product record no longer exists.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('leaves every product unchanged when another line has an invalid snapshot', async () => {
    const current = order({
      lines: [
        line({ id: 'line-1', stockConsumed: 2 }),
        line({
          id: 'line-2',
          productId: 'product-2',
          name: 'Patties',
          stockConsumed: 0,
        }),
      ],
    })
    seed(
      current,
      product({ stockQty: 10 }),
      product({ id: 'product-2', name: 'Patties', stockQty: 10 }),
    )

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/saved stock consumption is invalid.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(stockOf('product-1')).toBe(10)
    expect(stockOf('product-2')).toBe(10)
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('aborts when a tracked product has no stock quantity to restore into', async () => {
    const trackedWithoutQuantity = product()
    delete trackedWithoutQuantity.stockQty
    const current = order()
    seed(current, trackedWithoutQuantity)

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/stock quantity is missing or invalid.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('aborts when a tracked product stock quantity is not finite', async () => {
    const current = order()
    seed(current, product({ stockQty: Number.NaN }))

    await expect(
      updateOrderStatus({ order: current, status: 'cancelled', profile: profile() }),
    ).rejects.toThrow(/stock quantity is missing or invalid.*manual/i)

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'confirmed' })
    expect(firestore.commits.count).toBe(0)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('does not restore stock for a draft order that never deducted any', async () => {
    const draft = order({ status: 'draft' })
    seed(draft, product())

    await updateOrderStatus({ order: draft, status: 'cancelled', profile: profile() })

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'cancelled' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.writeLog).toEqual(['orders/order-1'])
  })

  it('leaves ordinary status advances as a single order write', async () => {
    const current = order({ status: 'confirmed' })
    seed(current, product())

    await updateOrderStatus({ order: current, status: 'preparing', profile: profile() })

    expect(firestore.orders.get('order-1')).toMatchObject({ status: 'preparing', updatedBy: 'staff-1' })
    expect(stockOf('product-1')).toBe(10)
    expect(firestore.writeLog).toEqual(['orders/order-1'])
  })
})
