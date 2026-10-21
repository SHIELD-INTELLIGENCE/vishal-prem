import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Booking-detail editing data layer.
 *
 * The Firestore mock stages writes and applies them only after the transaction
 * callback resolves. It also enforces the real SDK rule that every read happens
 * before the first write. This proves the client call sequence and failure
 * behaviour; it does not prove real Firestore retry/commit semantics, which
 * still require the emulator or a project.
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

  const bookings = new Map<string, FakeDoc>()
  const products = new Map<string, FakeDoc>()
  const customers = new Map<string, FakeDoc>()
  const payments = new Map<string, FakeDoc>()
  const writeLog: string[] = []
  const readLog: string[] = []
  const commits = { count: 0 }

  function targetFor(collectionName: string): Map<string, FakeDoc> | undefined {
    if (collectionName === 'bookings') return bookings
    if (collectionName === 'products') return products
    if (collectionName === 'customers') return customers
    if (collectionName === 'payments') return payments
    return undefined
  }

  function apply(path: string, data: FakeDoc) {
    const [collectionName, id] = path.split('/')
    const target = targetFor(collectionName)
    if (!target) throw new Error(`Test harness: unknown collection ${collectionName}`)
    target.set(id, { ...(target.get(id) ?? {}), ...data })
    writeLog.push(path)
  }

  const collection = (_db: unknown, name: string) => ({ name })

  const doc = (first: unknown, collectionName?: string, id?: string): FakeRef => {
    if (typeof collectionName === 'string' && typeof id === 'string') {
      return { path: `${collectionName}/${id}`, id }
    }
    const source = first as { name?: string } | undefined
    if (!source?.name) throw new Error('Test harness: invalid document reference')
    throw new Error('Test harness: generated document ids are not used by this suite')
  }

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
        readLog.push(ref.path)
        const [collectionName, id] = ref.path.split('/')
        const data = targetFor(collectionName)?.get(id)
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
    bookings.clear()
    products.clear()
    customers.clear()
    payments.clear()
    writeLog.length = 0
    readLog.length = 0
    commits.count = 0
  }

  return {
    bookings,
    products,
    customers,
    payments,
    writeLog,
    readLog,
    commits,
    collection,
    doc,
    updateDoc,
    runTransaction,
    reset,
  }
})

vi.mock('firebase/firestore', () => ({
  collection: firestore.collection,
  doc: firestore.doc,
  runTransaction: firestore.runTransaction,
  updateDoc: firestore.updateDoc,
}))

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
}))

import { defaultPermissionsForRole } from '@/auth/permissions'
import { updateBookingDetails } from '@/data/bookings'
import type { BookingEditValues } from '@/lib/validation'
import type {
  Booking,
  Customer,
  OrderLine,
  Product,
  UserProfile,
} from '@/types/models'

const NOW = '2026-10-20T10:00:00.000Z'

function staffProfile(overrides: Partial<UserProfile> = {}): UserProfile {
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
    unitPricePaise: 10000,
    discountPercent: 0,
    taxPercent: 5,
    notes: '',
    ...overrides,
  }
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    bookingNumber: 'BKG-VP-261001-ABCD',
    outletId: 'outlet-1',
    departmentIds: ['dept-sweets'],
    customerId: 'customer-1',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    eventType: 'wedding',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    bookingDate: '2026-10-01T10:00:00.000Z',
    fulfillment: 'pickup',
    deliveryAddress: '',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    lines: [line()],
    subtotalPaise: 20000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 1000,
    totalPaise: 21000,
    paidPaise: 0,
    balancePaise: 21000,
    pricesIncludeTax: false,
    discountType: 'none',
    discountValue: 0,
    revision: 1,
    instructions: '',
    preparationStatus: 'pending',
    packingStatus: 'pending',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    ...overrides,
  }
}

function editLine(
  overrides: Partial<BookingEditValues['lines'][number]> = {},
): BookingEditValues['lines'][number] {
  return {
    id: 'line-1',
    productId: 'product-1',
    quantity: 2,
    unitPrice: 100,
    discountPercent: 0,
    notes: '',
    ...overrides,
  }
}

function editValues(overrides: Partial<BookingEditValues> = {}): BookingEditValues {
  return {
    customerId: 'customer-1',
    eventType: 'wedding',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    fulfillment: 'pickup',
    deliveryAddress: '',
    departmentIds: ['dept-sweets'],
    instructions: '',
    lines: [editLine()],
    discountType: 'none',
    discountValue: 0,
    editReason: '',
    ...overrides,
  }
}

function args(
  values: BookingEditValues = editValues(),
  expectedRevision = 1,
  profile: UserProfile = staffProfile(),
) {
  return { bookingId: 'booking-1', expectedRevision, values, profile }
}

function seedBooking(value: Booking = booking()) {
  firestore.bookings.set(value.id, value as unknown as Record<string, unknown>)
}

function seedProduct(...values: Product[]) {
  for (const value of values) {
    firestore.products.set(value.id, value as unknown as Record<string, unknown>)
  }
}

function seedCustomer(...values: Customer[]) {
  for (const value of values) {
    firestore.customers.set(value.id, value as unknown as Record<string, unknown>)
  }
}

function storedBooking(): Booking {
  return firestore.bookings.get('booking-1') as unknown as Booking
}

function storedProduct(id = 'product-1'): Product {
  return firestore.products.get(id) as unknown as Product
}

beforeEach(() => {
  firestore.reset()
})

describe('updateBookingDetails success and concurrency', () => {
  it('updates editable details, increments revision, and writes only the booking', async () => {
    const original = booking({
      preparationStatus: 'done',
      packingStatus: 'packed',
    })
    seedBooking(original)
    seedProduct(product())

    await updateBookingDetails(
      args(
        editValues({
          eventType: 'birthday',
          eventDate: '2026-12-05',
          eventTime: '20:30',
          fulfillment: 'delivery',
          deliveryAddress: ' 12 Park Street ',
          instructions: ' Ring the bell ',
          lines: [editLine({ quantity: 3, notes: ' Extra box ' })],
        }),
      ),
    )

    const saved = storedBooking()
    expect(saved).toMatchObject({
      revision: 2,
      eventType: 'birthday',
      eventDate: '2026-12-05',
      eventTime: '20:30',
      fulfillment: 'delivery',
      deliveryAddress: '12 Park Street',
      instructions: 'Ring the bell',
      status: 'confirmed',
      preparationStatus: 'done',
      packingStatus: 'packed',
      bookingNumber: original.bookingNumber,
      bookingDate: original.bookingDate,
      outletId: original.outletId,
      paidPaise: original.paidPaise,
      pricesIncludeTax: original.pricesIncludeTax,
      totalPaise: 31500,
      balancePaise: 31500,
      paymentStatus: 'unpaid',
      updatedBy: 'staff-1',
    })
    expect(saved.lines[0]).toMatchObject({
      id: 'line-1',
      quantity: 3,
      unitPricePaise: 10000,
      taxPercent: 5,
      notes: 'Extra box',
    })
    expect(firestore.writeLog).toEqual(['bookings/booking-1'])
    expect(firestore.commits.count).toBe(1)
  })

  it('treats a missing legacy revision as zero', async () => {
    const legacy = booking()
    delete legacy.revision
    seedBooking(legacy)

    await updateBookingDetails(args(editValues({ eventType: 'corporate' }), 0))

    expect(storedBooking()).toMatchObject({
      revision: 1,
      eventType: 'corporate',
    })
  })

  it('rejects a stale revision before any write', async () => {
    seedBooking(booking({ revision: 3 }))
    seedProduct(product())

    await expect(updateBookingDetails(args(editValues(), 2))).rejects.toThrow(
      /changed while you were working/i,
    )

    expect(storedBooking().revision).toBe(3)
    expect(firestore.writeLog).toHaveLength(0)
    expect(firestore.commits.count).toBe(0)
  })

  it('rejects a missing booking', async () => {
    await expect(updateBookingDetails(args())).rejects.toThrow(/no longer exists/i)

    expect(firestore.writeLog).toHaveLength(0)
    expect(firestore.commits.count).toBe(0)
  })

  it.each(['ready', 'completed', 'cancelled'] as const)(
    'rejects editing a %s booking',
    async (status) => {
      seedBooking(booking({ status }))

      await expect(updateBookingDetails(args())).rejects.toThrow(/cannot be edited/i)

      expect(storedBooking().status).toBe(status)
      expect(firestore.writeLog).toHaveLength(0)
    },
  )

  it('requires a non-empty reason for an in-production edit', async () => {
    seedBooking(booking({ status: 'in_production' }))

    await expect(
      updateBookingDetails(args(editValues({ editReason: '   ' }))),
    ).rejects.toThrow(/reason/i)
    expect(firestore.writeLog).toHaveLength(0)

    await updateBookingDetails(
      args(editValues({ editReason: ' Updated guest count ' })),
    )

    expect(storedBooking()).toMatchObject({
      status: 'in_production',
      revision: 2,
      lastEditReason: 'Updated guest count',
    })
  })

  it.each(['enquiry', 'confirmed'] as const)(
    'allows a %s edit without a reason',
    async (status) => {
      seedBooking(booking({ status }))

      await updateBookingDetails(
        args(editValues({ eventType: 'corporate', editReason: undefined })),
      )

      expect(storedBooking()).toMatchObject({
        status,
        eventType: 'corporate',
        revision: 2,
        lastEditReason: '',
      })
    },
  )

  it('uses the live paid amount, recalculates the balance, and leaves payments untouched', async () => {
    const payment = {
      id: 'payment-1',
      bookingId: 'booking-1',
      amountPaise: 5000,
      type: 'payment',
    }
    firestore.payments.set('payment-1', payment)
    seedBooking(booking({ paidPaise: 5000, balancePaise: 16000, paymentStatus: 'partial' }))
    seedProduct(product())

    const values = {
      ...editValues({ lines: [editLine({ quantity: 3 })] }),
      paidPaise: 999999,
    } as BookingEditValues

    await updateBookingDetails(args(values))

    expect(storedBooking()).toMatchObject({
      paidPaise: 5000,
      totalPaise: 31500,
      balancePaise: 26500,
      paymentStatus: 'partial',
    })
    expect(firestore.payments.get('payment-1')).toEqual(payment)
    expect(firestore.writeLog).toEqual(['bookings/booking-1'])
  })

  it('rejects a new total below the live amount paid with zero writes', async () => {
    seedBooking(booking({ paidPaise: 5000, balancePaise: 16000, paymentStatus: 'partial' }))

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [editLine({ quantity: 1 })],
            discountType: 'amount',
            discountValue: 100,
          }),
        ),
      ),
    ).rejects.toThrow(/below the .* already paid.*refund/i)

    expect(storedBooking()).toMatchObject({ paidPaise: 5000, totalPaise: 21000 })
    expect(firestore.writeLog).toHaveLength(0)
  })
})

describe('updateBookingDetails customer policy', () => {
  it('refreshes the customer snapshot on a switch with no payment', async () => {
    seedBooking()
    seedCustomer(customer({ id: 'customer-2', name: 'New Party', phone: '9123456789' }))

    await updateBookingDetails(args(editValues({ customerId: 'customer-2' })))

    expect(storedBooking()).toMatchObject({
      customerId: 'customer-2',
      customerName: 'New Party',
      customerPhone: '9123456789',
    })
  })

  it('rejects a customer switch after any payment is recorded', async () => {
    seedBooking(booking({ paidPaise: 5000, balancePaise: 16000, paymentStatus: 'partial' }))

    await expect(
      updateBookingDetails(args(editValues({ customerId: 'customer-2' }))),
    ).rejects.toThrow(/payments recorded.*refund/i)

    expect(storedBooking().customerId).toBe('customer-1')
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects a missing replacement customer', async () => {
    seedBooking()

    await expect(
      updateBookingDetails(args(editValues({ customerId: 'customer-2' }))),
    ).rejects.toThrow(/customer no longer exists/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects an inactive replacement customer', async () => {
    seedBooking()
    seedCustomer(customer({ id: 'customer-2', active: false }))

    await expect(
      updateBookingDetails(args(editValues({ customerId: 'customer-2' }))),
    ).rejects.toThrow(/customer is inactive/i)

    expect(firestore.writeLog).toHaveLength(0)
  })
})

describe('updateBookingDetails product and department validation', () => {
  it('rejects a missing new product', async () => {
    seedBooking()

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({ id: undefined, productId: 'product-missing' }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/selected product no longer exists/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects an inactive new product', async () => {
    seedBooking()
    seedProduct(product({ id: 'product-2', name: 'Inactive Sweet', active: false }))

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({ id: undefined, productId: 'product-2' }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/inactive/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('allows an inactive product to be retained on an unchanged line', async () => {
    seedBooking()
    seedProduct(product({ active: false }))

    await updateBookingDetails(args(editValues({ eventType: 'corporate' })))

    expect(storedBooking()).toMatchObject({
      eventType: 'corporate',
      revision: 2,
    })
    expect(storedBooking().lines[0].productId).toBe('product-1')
    expect(firestore.writeLog).toEqual(['bookings/booking-1'])
  })

  it('rejects increasing an inactive existing line', async () => {
    seedBooking()
    seedProduct(product({ active: false }))

    await expect(
      updateBookingDetails(args(editValues({ lines: [editLine({ quantity: 3 })] }))),
    ).rejects.toThrow(/inactive/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects a new product below its minimum sale price', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Premium Sweet',
        minSalePricePaise: 6000,
        stockQty: 20,
      }),
    )

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({
                id: undefined,
                productId: 'product-2',
                quantity: 1,
                unitPrice: 50,
              }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/minimum price/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects a new product from another outlet', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Other Outlet Sweet',
        outletIds: ['outlet-2'],
      }),
    )

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({ id: undefined, productId: 'product-2' }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/not sold at this outlet/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects a new product from an unselected department', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Cake',
        departmentId: 'dept-cake',
      }),
    )

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({ id: undefined, productId: 'product-2' }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/does not belong to a selected department/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects departments outside the caller scope', async () => {
    seedBooking()
    const sweetsAdmin = staffProfile({
      role: 'sweets_admin',
      permissions: defaultPermissionsForRole('sweets_admin'),
      departmentIds: ['dept-sweets'],
    })

    await expect(
      updateBookingDetails(
        args(
          editValues({ departmentIds: ['dept-sweets', 'dept-cake'] }),
          1,
          sweetsAdmin,
        ),
      ),
    ).rejects.toThrow(/outside your access scope/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('rejects an existing line whose department is no longer submitted', async () => {
    seedBooking()

    await expect(
      updateBookingDetails(
        args(editValues({ departmentIds: ['dept-cake'], lines: [editLine()] })),
      ),
    ).rejects.toThrow(/belongs to a department that is no longer selected/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('does not leave an orphan line when a department is removed', async () => {
    seedBooking(
      booking({
        departmentIds: ['dept-sweets', 'dept-cake'],
        lines: [
          line(),
          line({
            id: 'line-2',
            productId: 'product-2',
            name: 'Cake',
            departmentId: 'dept-cake',
          }),
        ],
      }),
    )

    await expect(
      updateBookingDetails(
        args(
          editValues({
            departmentIds: ['dept-sweets'],
            lines: [
              editLine(),
              editLine({ id: 'line-2', productId: 'product-2' }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/belongs to a department that is no longer selected/i)

    expect(firestore.writeLog).toHaveLength(0)
  })

  it('checks stock for an increased existing line without writing products', async () => {
    seedBooking()
    seedProduct(product({ stockQty: 5 }))

    await expect(
      updateBookingDetails(args(editValues({ lines: [editLine({ quantity: 10 })] }))),
    ).rejects.toThrow(/only 5 kg in stock/i)

    expect(storedProduct().stockQty).toBe(5)
    expect(firestore.writeLog).toHaveLength(0)
  })

  it('checks stock for a newly added line without writing products', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Patties',
        pricingMode: 'fixed',
        unit: 'piece',
        stockQty: 1,
      }),
    )

    await expect(
      updateBookingDetails(
        args(
          editValues({
            lines: [
              editLine(),
              editLine({
                id: undefined,
                productId: 'product-2',
                quantity: 2,
                unitPrice: 50,
              }),
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/only 1 piece in stock/i)

    expect(storedProduct('product-2').stockQty).toBe(1)
    expect(firestore.writeLog).toHaveLength(0)
  })
})

describe('updateBookingDetails pricing snapshots and line changes', () => {
  it('preserves the historical tax snapshot on an existing line', async () => {
    seedBooking()
    seedProduct(product({ taxPercent: 12, salePricePaise: 12000 }))

    await updateBookingDetails(
      args(editValues({ lines: [editLine({ quantity: 3, unitPrice: 100 })] })),
    )

    expect(storedBooking().lines[0]).toMatchObject({
      taxPercent: 5,
      name: 'Kaju Barfi',
      unitPricePaise: 10000,
    })
    expect(storedBooking().totalPaise).toBe(31500)
  })

  it('uses current catalogue snapshots for a newly added line', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Patties',
        printName: 'PATTIES',
        pricingMode: 'fixed',
        unit: 'piece',
        taxPercent: 12,
        salePricePaise: 5000,
        stockQty: 20,
      }),
    )

    await updateBookingDetails(
      args(
        editValues({
          lines: [
            editLine(),
            editLine({
              id: undefined,
              productId: 'product-2',
              quantity: 2,
              unitPrice: 50,
            }),
          ],
        }),
      ),
    )

    const added = storedBooking().lines.find((item) => item.productId === 'product-2')
    expect(added).toMatchObject({
      name: 'Patties',
      printName: 'PATTIES',
      taxPercent: 12,
      unit: 'piece',
      pricingMode: 'fixed',
      unitPricePaise: 5000,
    })
    expect(storedBooking().totalPaise).toBe(32200)
  })

  it('uses current catalogue snapshots for a substituted product', async () => {
    seedBooking()
    seedProduct(
      product({
        id: 'product-2',
        name: 'Patties',
        printName: 'PATTIES',
        pricingMode: 'fixed',
        unit: 'piece',
        taxPercent: 12,
        salePricePaise: 5000,
        stockQty: 20,
      }),
    )

    await updateBookingDetails(
      args(
        editValues({
          lines: [
            editLine({
              productId: 'product-2',
              quantity: 2,
              unitPrice: 50,
            }),
          ],
        }),
      ),
    )

    expect(storedBooking().lines).toHaveLength(1)
    expect(storedBooking().lines[0]).toMatchObject({
      id: 'line-1',
      productId: 'product-2',
      name: 'Patties',
      taxPercent: 12,
      unit: 'piece',
      pricingMode: 'fixed',
    })
  })

  it('removes a booking line without touching products', async () => {
    seedBooking(
      booking({
        lines: [
          line(),
          line({
            id: 'line-2',
            productId: 'product-2',
            name: 'Cake',
            departmentId: 'dept-sweets',
          }),
        ],
      }),
    )

    await updateBookingDetails(args(editValues({ lines: [editLine()] })))

    expect(storedBooking().lines).toHaveLength(1)
    expect(storedBooking().lines[0].id).toBe('line-1')
    expect(firestore.writeLog).toEqual(['bookings/booking-1'])
  })
})

describe('updateBookingDetails discounts', () => {
  it('persists a percentage discount and recalculates tax', async () => {
    seedBooking()

    await updateBookingDetails(
      args(editValues({ discountType: 'percent', discountValue: 10 })),
    )

    expect(storedBooking()).toMatchObject({
      discountType: 'percent',
      discountValue: 10,
      subtotalPaise: 20000,
      lineDiscountPaise: 0,
      orderDiscountPaise: 2000,
      discountPaise: 2000,
      taxPaise: 900,
      totalPaise: 18900,
      balancePaise: 18900,
      paymentStatus: 'unpaid',
    })
  })

  it('persists a fixed-amount discount in rupees and recalculates tax', async () => {
    seedBooking()

    await updateBookingDetails(
      args(editValues({ discountType: 'amount', discountValue: 50 })),
    )

    expect(storedBooking()).toMatchObject({
      discountType: 'amount',
      discountValue: 50,
      orderDiscountPaise: 5000,
      taxPaise: 750,
      totalPaise: 15750,
    })
  })

  it('falls back to the stored fixed amount for a legacy booking', async () => {
    const legacy = booking({
      orderDiscountPaise: 2000,
      discountPaise: 2000,
      taxPaise: 900,
      totalPaise: 18900,
      balancePaise: 18900,
    })
    delete legacy.discountType
    delete legacy.discountValue
    seedBooking(legacy)

    const values = editValues()
    delete values.discountType
    delete values.discountValue

    await updateBookingDetails(args(values))

    expect(storedBooking()).toMatchObject({
      discountType: 'amount',
      discountValue: 20,
      orderDiscountPaise: 2000,
      taxPaise: 900,
      totalPaise: 18900,
    })
  })
})
