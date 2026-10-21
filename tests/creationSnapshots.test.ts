import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Creation snapshots for the future edit flows.
 *
 * Firestore is mocked with a small transactional harness. It enforces the same
 * read-before-write rule as the real SDK and applies staged writes only after
 * the transaction callback resolves, so a thrown validation error leaves no
 * partial document or stock change behind.
 *
 * The harness proves the client write sequence and captured values. It does not
 * prove real Firestore commit semantics; that still needs the emulator or a
 * project.
 */

const firestore = vi.hoisted(() => {
  type FakeDoc = Record<string, unknown>
  type FakeRef = { path: string; id: string }
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
  const bookings = new Map<string, FakeDoc>()
  const products = new Map<string, FakeDoc>()
  const payments = new Map<string, FakeDoc>()
  const writeLog: string[] = []
  const commits = { count: 0 }
  let paymentSequence = 0

  function isIncrement(value: unknown): value is { __increment: number } {
    return typeof value === 'object' && value !== null && '__increment' in value
  }

  function targetFor(collectionName: string): Map<string, FakeDoc> | undefined {
    if (collectionName === 'orders') return orders
    if (collectionName === 'bookings') return bookings
    if (collectionName === 'products') return products
    if (collectionName === 'payments') return payments
    return undefined
  }

  function apply(path: string, data: FakeDoc) {
    const [collectionName, id] = path.split('/')
    const target = targetFor(collectionName)
    if (!target) throw new Error(`Test harness: unknown collection ${collectionName}`)
    const current = target.get(id) ?? {}
    const next: FakeDoc = { ...current }
    for (const [key, value] of Object.entries(data)) {
      next[key] = isIncrement(value) ? Number(current[key] ?? 0) + value.__increment : value
    }
    target.set(id, next)
    writeLog.push(path)
  }

  function collection(_db: unknown, name: string) {
    return { name }
  }

  function doc(first: unknown, collectionName?: string, id?: string): FakeRef {
    if (typeof collectionName === 'string' && typeof id === 'string') {
      return { path: `${collectionName}/${id}`, id }
    }
    const source = first as { name?: string } | undefined
    if (!source?.name) throw new Error('Test harness: invalid document reference')
    paymentSequence += 1
    const generated = `payment-${paymentSequence}`
    return { path: `${source.name}/${generated}`, id: generated }
  }

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
        const source = targetFor(collectionName)
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
    for (const write of staged) apply(write.path, write.data)
    commits.count += 1
  }

  function reset() {
    orders.clear()
    bookings.clear()
    products.clear()
    payments.clear()
    writeLog.length = 0
    commits.count = 0
    paymentSequence = 0
  }

  return {
    orders,
    bookings,
    products,
    payments,
    writeLog,
    commits,
    collection,
    doc,
    increment,
    updateDoc,
    runTransaction,
    reset,
  }
})

vi.mock('firebase/firestore', () => ({
  collection: firestore.collection,
  doc: firestore.doc,
  increment: firestore.increment,
  runTransaction: firestore.runTransaction,
  updateDoc: firestore.updateDoc,
}))

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
}))

import { defaultPermissionsForRole } from '@/auth/permissions'
import { createBooking } from '@/data/bookings'
import { createOrder } from '@/data/orders'
import { calculateOrder } from '@/lib/calculations'
import type { BookingFormValues, OrderFormValues } from '@/lib/validation'
import type {
  Booking,
  Customer,
  Order,
  Outlet,
  Payment,
  Product,
  UserProfile,
} from '@/types/models'

const NOW = '2026-10-20T10:00:00.000Z'

function outlet(): Outlet {
  return {
    id: 'outlet-1',
    code: 'VP',
    name: 'Main Outlet',
    address: 'Main Road',
    phone: '9876543210',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
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
    createdAt: NOW,
    updatedAt: NOW,
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
    salePricePaise: 10000,
    taxPercent: 5,
    trackStock: true,
    openingStock: 20,
    stockQty: 20,
    criticalStock: 2,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    name: 'Test Customer',
    type: 'individual',
    accountGroup: 'retail_customer',
    phone: '9876543210',
    addresses: [],
    openingBalancePaise: 0,
    outletIds: ['outlet-1'],
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function lineInput(
  productId = 'product-1',
  quantity = 2,
  unitPrice = 100,
  discountPercent = 0,
): OrderFormValues['lines'][number] {
  return { productId, quantity, unitPrice, discountPercent, notes: '' }
}

function orderValues(overrides: Partial<OrderFormValues> = {}): OrderFormValues {
  return {
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    customerId: '',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    orderType: 'takeaway',
    channel: 'counter',
    notes: '',
    pickupAt: '',
    lines: [lineInput()],
    discountType: 'none',
    discountValue: 0,
    advanceAmount: 0,
    paymentMode: 'cash',
    paymentReference: '',
    ...overrides,
  }
}

function bookingValues(overrides: Partial<BookingFormValues> = {}): BookingFormValues {
  return {
    outletId: 'outlet-1',
    customerId: 'customer-1',
    eventType: 'wedding',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    fulfillment: 'pickup',
    deliveryAddress: '',
    departmentIds: ['dept-sweets'],
    instructions: '',
    lines: [lineInput()],
    discountType: 'none',
    discountValue: 0,
    advanceAmount: 0,
    paymentMode: 'cash',
    paymentReference: '',
    ...overrides,
  }
}

function seedProduct(value: Product) {
  firestore.products.set(value.id, value as unknown as Record<string, unknown>)
}

function orderArgs(values: OrderFormValues, requestId: string) {
  return {
    values,
    outlet: outlet(),
    businessName: 'Vishal Prem',
    pricesIncludeTax: false,
    profile: profile(),
    requestId,
  }
}

function bookingArgs(values: BookingFormValues, requestId: string) {
  return {
    values,
    outlet: outlet(),
    customer: customer(),
    pricesIncludeTax: false,
    profile: profile(),
    requestId,
  }
}

function storedOrder(id: string): Order {
  return firestore.orders.get(id) as unknown as Order
}

function storedBooking(id: string): Booking {
  return firestore.bookings.get(id) as unknown as Booking
}

function storedProduct(id: string): Product {
  return firestore.products.get(id) as unknown as Product
}

beforeEach(() => {
  firestore.reset()
})

describe('createOrder stock snapshots', () => {
  it('records the exact stock deducted for a tracked line', async () => {
    seedProduct(product({ conversionFactor: 2, stockQty: 20 }))

    const result = await createOrder(
      orderArgs(orderValues({ lines: [lineInput('product-1', 3, 100)] }), 'order-tracked'),
    )

    const created = storedOrder(result.id)
    expect(created.lines[0]).toMatchObject({
      stockTracked: true,
      stockFactor: 2,
      stockConsumed: 6,
    })
    expect(storedProduct('product-1').stockQty).toBe(14)
    expect(firestore.writeLog).toContain('products/product-1')
  })

  it('records factor 1 when the product has no conversion factor', async () => {
    seedProduct(product({ stockQty: 20 }))

    const result = await createOrder(
      orderArgs(orderValues({ lines: [lineInput('product-1', 2, 100)] }), 'order-default-factor'),
    )

    const created = storedOrder(result.id)
    expect(created.lines[0]).toMatchObject({
      stockTracked: true,
      stockFactor: 1,
      stockConsumed: 2,
    })
    expect(storedProduct('product-1').stockQty).toBe(18)
  })

  it('records no deduction for an untracked product', async () => {
    seedProduct(product({ trackStock: false, stockQty: 20 }))

    const result = await createOrder(
      orderArgs(orderValues({ lines: [lineInput('product-1', 3, 100)] }), 'order-untracked'),
    )

    const line = storedOrder(result.id).lines[0]
    expect(line.stockTracked).toBe(false)
    expect(line.stockConsumed).toBe(0)
    expect(line.stockFactor).toBeUndefined()
    expect(storedProduct('product-1').stockQty).toBe(20)
    expect(firestore.writeLog).not.toContain('products/product-1')
  })

  it('keeps independent snapshots for multiple lines and factors', async () => {
    seedProduct(product({ id: 'product-1', conversionFactor: 0.5, stockQty: 10 }))
    seedProduct(
      product({
        id: 'product-2',
        name: 'Patties',
        printName: 'PATTIES',
        pricingMode: 'fixed',
        unit: 'piece',
        conversionFactor: 3,
        stockQty: 20,
      }),
    )

    const result = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 2, 100), lineInput('product-2', 3, 50)],
        }),
        'order-multi',
      ),
    )

    const created = storedOrder(result.id)
    expect(created.lines[0]).toMatchObject({
      productId: 'product-1',
      stockTracked: true,
      stockFactor: 0.5,
      stockConsumed: 1,
    })
    expect(created.lines[1]).toMatchObject({
      productId: 'product-2',
      stockTracked: true,
      stockFactor: 3,
      stockConsumed: 9,
    })
    expect(storedProduct('product-1').stockQty).toBe(9)
    expect(storedProduct('product-2').stockQty).toBe(11)
  })
})

describe('createOrder aggregate stock demand', () => {
  it('rejects duplicate lines whose combined demand exceeds stock without writing anything', async () => {
    seedProduct(product({ stockQty: 10 }))

    const args = orderArgs(
      orderValues({
        lines: [lineInput('product-1', 6, 100), lineInput('product-1', 6, 100)],
        advanceAmount: 50,
      }),
      'order-combined-overdraw',
    )

    await expect(createOrder(args)).rejects.toThrow(/only 10 kg in stock/i)
    expect(firestore.orders.size).toBe(0)
    expect(firestore.payments.size).toBe(0)
    expect(storedProduct('product-1').stockQty).toBe(10)
    expect(firestore.writeLog).toEqual([])
  })

  it('deducts the combined demand once when duplicate lines fit', async () => {
    seedProduct(product({ stockQty: 10 }))

    const result = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 6, 100), lineInput('product-1', 4, 100)],
        }),
        'order-combined-fit',
      ),
    )

    const created = storedOrder(result.id)
    expect(created.lines).toHaveLength(2)
    expect(created.lines.map((line) => line.stockConsumed)).toEqual([6, 4])
    expect(storedProduct('product-1').stockQty).toBe(0)
    expect(firestore.writeLog.filter((path) => path === 'products/product-1')).toHaveLength(1)
  })

  it('aggregates converted consumption instead of raw sale quantities', async () => {
    seedProduct(product({ conversionFactor: 2, stockQty: 10 }))

    await expect(
      createOrder(
        orderArgs(
          orderValues({
            lines: [lineInput('product-1', 3, 100), lineInput('product-1', 3, 100)],
          }),
          'order-factor-overdraw',
        ),
      ),
    ).rejects.toThrow(/only 10 kg in stock/i)

    expect(storedProduct('product-1').stockQty).toBe(10)
    expect(firestore.writeLog).toEqual([])
  })

  it('writes one converted total for duplicate lines', async () => {
    seedProduct(product({ conversionFactor: 2, stockQty: 10 }))

    const result = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 2, 100), lineInput('product-1', 3, 100)],
        }),
        'order-factor-fit',
      ),
    )

    const created = storedOrder(result.id)
    expect(created.lines.map((line) => line.stockConsumed)).toEqual([4, 6])
    expect(storedProduct('product-1').stockQty).toBe(0)
    expect(firestore.writeLog.filter((path) => path === 'products/product-1')).toHaveLength(1)
  })

  it('keeps duplicate lines separate while deducting their combined stock', async () => {
    seedProduct(product({ stockQty: 10 }))

    const result = await createOrder(
      orderArgs(
        orderValues({
          lines: [
            { ...lineInput('product-1', 1, 100), notes: 'Gift box' },
            { ...lineInput('product-1', 2, 100, 10), notes: 'Office order' },
          ],
        }),
        'order-combined-details',
      ),
    )

    const created = storedOrder(result.id)
    expect(created.lines).toHaveLength(2)
    expect(created.lines[0]).toMatchObject({
      quantity: 1,
      notes: 'Gift box',
      discountPercent: 0,
    })
    expect(created.lines[1]).toMatchObject({
      quantity: 2,
      notes: 'Office order',
      discountPercent: 10,
    })
    expect(storedProduct('product-1').stockQty).toBe(7)
    expect(firestore.writeLog.filter((path) => path === 'products/product-1')).toHaveLength(1)
  })

  it('does not deduct stock for duplicate untracked lines', async () => {
    seedProduct(product({ trackStock: false, stockQty: 10 }))

    const result = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 6, 100), lineInput('product-1', 6, 100)],
        }),
        'order-untracked-duplicates',
      ),
    )

    const created = storedOrder(result.id)
    expect(created.lines).toHaveLength(2)
    expect(created.lines.every((line) => line.stockConsumed === 0)).toBe(true)
    expect(storedProduct('product-1').stockQty).toBe(10)
    expect(firestore.writeLog).not.toContain('products/product-1')
  })

  it.each([
    ['zero', 0],
    ['negative', -2],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const)('rejects a %s line quantity before any writes', async (label, quantity) => {
    seedProduct(product({ stockQty: 10 }))

    await expect(
      createOrder(
        orderArgs(
          orderValues({
            lines: [lineInput('product-1', quantity, 100)],
            advanceAmount: 50,
          }),
          `order-invalid-quantity-${label}`,
        ),
      ),
    ).rejects.toThrow(/valid quantity/i)

    expect(firestore.orders.size).toBe(0)
    expect(firestore.payments.size).toBe(0)
    expect(storedProduct('product-1').stockQty).toBe(10)
    expect(firestore.writeLog).toEqual([])
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const)('rejects an invalid %s conversion factor before any writes', async (label, factor) => {
    seedProduct(product({ conversionFactor: factor, stockQty: 10 }))

    await expect(
      createOrder(
        orderArgs(
          orderValues({ lines: [lineInput('product-1', 2, 100)] }),
          `order-invalid-factor-${label}`,
        ),
      ),
    ).rejects.toThrow(/invalid stock conversion factor/i)

    expect(firestore.orders.size).toBe(0)
    expect(storedProduct('product-1').stockQty).toBe(10)
    expect(firestore.writeLog).toEqual([])
  })

  it('rejects a non-finite stock consumption before any writes', async () => {
    seedProduct(product({ conversionFactor: 2, stockQty: Number.MAX_VALUE }))

    await expect(
      createOrder(
        orderArgs(
          orderValues({ lines: [lineInput('product-1', Number.MAX_VALUE, 100)] }),
          'order-invalid-consumption',
        ),
      ),
    ).rejects.toThrow(/invalid stock consumption/i)

    expect(firestore.orders.size).toBe(0)
    expect(storedProduct('product-1').stockQty).toBe(Number.MAX_VALUE)
    expect(firestore.writeLog).toEqual([])
  })

  it('rejects a non-finite combined demand even when each line is finite', async () => {
    seedProduct(product({ stockQty: Number.MAX_VALUE }))

    await expect(
      createOrder(
        orderArgs(
          orderValues({
            lines: [
              lineInput('product-1', Number.MAX_VALUE * 0.75, 100),
              lineInput('product-1', Number.MAX_VALUE * 0.75, 100),
            ],
          }),
          'order-combined-overflow',
        ),
      ),
    ).rejects.toThrow(/combined stock consumption.*too large/i)

    expect(firestore.orders.size).toBe(0)
    expect(storedProduct('product-1').stockQty).toBe(Number.MAX_VALUE)
    expect(firestore.writeLog).toEqual([])
  })
})

describe('creation metadata', () => {
  it('starts new orders and bookings at revision 1', async () => {
    seedProduct(product())

    const orderResult = await createOrder(orderArgs(orderValues(), 'order-revision'))
    await createBooking(bookingArgs(bookingValues(), 'booking-revision'))

    expect(storedOrder(orderResult.id).revision).toBe(1)
    expect(storedBooking('booking-revision').revision).toBe(1)
  })

  it.each([
    ['none', 0, 0],
    ['percent', 10, 2000],
    ['amount', 250, 20000],
  ] as const)('round-trips the %s discount on orders and bookings', async (discountType, discountValue, expectedDiscountPaise) => {
    seedProduct(product())

    const orderResult = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 2, 100)],
          discountType,
          discountValue,
        }),
        `order-discount-${discountType}`,
      ),
    )
    await createBooking(
      bookingArgs(
        bookingValues({
          lines: [lineInput('product-1', 2, 100)],
          discountType,
          discountValue,
        }),
        `booking-discount-${discountType}`,
      ),
    )

    const order = storedOrder(orderResult.id)
    const booking = storedBooking(`booking-discount-${discountType}`)
    expect(order).toMatchObject({
      discountType,
      discountValue,
      orderDiscountPaise: expectedDiscountPaise,
    })
    expect(booking).toMatchObject({
      discountType,
      discountValue,
      orderDiscountPaise: expectedDiscountPaise,
    })
  })
})

describe('existing creation behavior', () => {
  it('keeps order totals, advance payments, and booking stock behavior unchanged', async () => {
    seedProduct(product({ stockQty: 20 }))

    const orderResult = await createOrder(
      orderArgs(
        orderValues({
          lines: [lineInput('product-1', 2, 100)],
          advanceAmount: 50,
        }),
        'order-totals',
      ),
    )
    const order = storedOrder(orderResult.id)
    expect(order).toMatchObject({
      totalPaise: 21000,
      paidPaise: 5000,
      balancePaise: 16000,
      paymentStatus: 'partial',
    })
    expect(storedProduct('product-1').stockQty).toBe(18)

    const orderPayment = Array.from(firestore.payments.values())[0] as unknown as Payment
    expect(orderPayment).toMatchObject({
      orderId: 'order-totals',
      amountPaise: 5000,
      type: 'payment',
    })

    await createBooking(
      bookingArgs(
        bookingValues({
          lines: [lineInput('product-1', 2, 100)],
          advanceAmount: 50,
        }),
        'booking-totals',
      ),
    )
    const booking = storedBooking('booking-totals')
    expect(booking).toMatchObject({
      totalPaise: 21000,
      paidPaise: 5000,
      balancePaise: 16000,
      paymentStatus: 'partial',
    })

    // The booking only checks stock. It must not deduct or reserve it.
    expect(storedProduct('product-1').stockQty).toBe(18)
    expect(firestore.writeLog.filter((path) => path.startsWith('products/'))).toEqual([
      'products/product-1',
    ])
    expect(firestore.payments.size).toBe(2)
  })

  it('keeps duplicate order submission idempotent', async () => {
    seedProduct(product({ stockQty: 20 }))
    const args = orderArgs(orderValues({ advanceAmount: 50 }), 'order-duplicate')

    const first = await createOrder(args)
    const orderCount = firestore.orders.size
    const paymentCount = firestore.payments.size
    const stock = storedProduct('product-1').stockQty
    const writes = firestore.writeLog.length

    const second = await createOrder(args)

    expect(second).toEqual(first)
    expect(firestore.orders.size).toBe(orderCount)
    expect(firestore.payments.size).toBe(paymentCount)
    expect(storedProduct('product-1').stockQty).toBe(stock)
    expect(firestore.writeLog).toHaveLength(writes)
  })

  it('keeps duplicate booking submission idempotent', async () => {
    seedProduct(product({ stockQty: 20 }))
    const args = bookingArgs(bookingValues({ advanceAmount: 50 }), 'booking-duplicate')

    const first = await createBooking(args)
    const bookingCount = firestore.bookings.size
    const paymentCount = firestore.payments.size
    const stock = storedProduct('product-1').stockQty
    const writes = firestore.writeLog.length

    const second = await createBooking(args)

    expect(second).toEqual(first)
    expect(firestore.bookings.size).toBe(bookingCount)
    expect(firestore.payments.size).toBe(paymentCount)
    expect(storedProduct('product-1').stockQty).toBe(stock)
    expect(firestore.writeLog).toHaveLength(writes)
  })

  it('reads existing documents that lack the new optional fields', async () => {
    seedProduct(product({ stockQty: 20 }))

    const orderResult = await createOrder(orderArgs(orderValues(), 'legacy-order'))
    const legacyOrder = JSON.parse(JSON.stringify(storedOrder(orderResult.id))) as Order
    delete legacyOrder.revision
    delete legacyOrder.discountType
    delete legacyOrder.discountValue
    for (const line of legacyOrder.lines) {
      delete line.stockTracked
      delete line.stockFactor
      delete line.stockConsumed
    }
    firestore.orders.set('legacy-order', legacyOrder as unknown as Record<string, unknown>)
    const writesBeforeOrderRetry = firestore.writeLog.length

    const orderRetry = await createOrder(orderArgs(orderValues(), 'legacy-order'))

    expect(orderRetry.orderNumber).toBe(legacyOrder.orderNumber)
    expect(firestore.orders.get('legacy-order')).toEqual(legacyOrder)
    expect(firestore.writeLog).toHaveLength(writesBeforeOrderRetry)
    expect(
      calculateOrder(legacyOrder.lines, legacyOrder.orderDiscountPaise, legacyOrder.pricesIncludeTax)
        .totalPaise,
    ).toBe(legacyOrder.totalPaise)

    await createBooking(bookingArgs(bookingValues(), 'legacy-booking'))
    const legacyBooking = JSON.parse(JSON.stringify(storedBooking('legacy-booking'))) as Booking
    delete legacyBooking.revision
    delete legacyBooking.discountType
    delete legacyBooking.discountValue
    firestore.bookings.set('legacy-booking', legacyBooking as unknown as Record<string, unknown>)
    const writesBeforeBookingRetry = firestore.writeLog.length

    const bookingRetry = await createBooking(bookingArgs(bookingValues(), 'legacy-booking'))

    expect(bookingRetry.bookingNumber).toBe(legacyBooking.bookingNumber)
    expect(firestore.bookings.get('legacy-booking')).toEqual(legacyBooking)
    expect(firestore.writeLog).toHaveLength(writesBeforeBookingRetry)
    expect(
      calculateOrder(
        legacyBooking.lines,
        legacyBooking.orderDiscountPaise,
        legacyBooking.pricesIncludeTax,
      ).totalPaise,
    ).toBe(legacyBooking.totalPaise)
  })
})
