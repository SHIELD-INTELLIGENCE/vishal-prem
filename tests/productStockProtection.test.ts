import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Stock protection for product edits.
 *
 * The fake Firestore enforces read-before-write transactions and only applies
 * staged writes when the callback resolves. It proves the client sequence and
 * the values written; it does not prove real Firestore retry semantics.
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

  const setDoc = async (ref: FakeRef, data: FakeDoc) => {
    apply(ref.path, data)
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
    products.clear()
    payments.clear()
    writeLog.length = 0
    commits.count = 0
    paymentSequence = 0
  }

  return {
    orders,
    products,
    payments,
    writeLog,
    commits,
    collection,
    doc,
    increment,
    setDoc,
    updateDoc,
    runTransaction,
    reset,
  }
})

vi.mock('firebase/firestore', () => ({
  collection: firestore.collection,
  doc: firestore.doc,
  increment: firestore.increment,
  setDoc: firestore.setDoc,
  updateDoc: firestore.updateDoc,
  runTransaction: firestore.runTransaction,
}))

vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(),
  ref: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  storage: null,
}))

import { defaultPermissionsForRole } from '@/auth/permissions'
import { createOrder, updateOrderStatus } from '@/data/orders'
import { saveProduct } from '@/data/products'
import type { OrderFormValues, ProductValues } from '@/lib/validation'
import type { Order, OrderLine, Outlet, Product, UserProfile } from '@/types/models'

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

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
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
    pricingMode: 'fixed',
    unit: 'piece',
    conversionFactor: 1,
    salePricePaise: 10000,
    taxPercent: 5,
    trackStock: true,
    openingStock: 10,
    stockQty: 10,
    criticalStock: 2,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    ...overrides,
  }
}

function valuesFrom(source: Product, overrides: Partial<ProductValues> = {}): ProductValues {
  return {
    name: source.name,
    alias: source.alias ?? '',
    printName: source.printName,
    group: source.group,
    category: source.category,
    departmentId: source.departmentId,
    outletIds: source.outletIds,
    pricingMode: source.pricingMode,
    unit: source.unit,
    altUnit: source.altUnit ?? '',
    conversionFactor: source.conversionFactor,
    packagingUnit: source.packagingUnit ?? '',
    boxQuantity: source.boxQuantity,
    cakeSizes:
      source.cakeSizes?.map((size) => ({
        label: size.label,
        pounds: size.pounds,
        price: size.pricePaise / 100,
      })) ?? [],
    salePrice: source.salePricePaise / 100,
    purchasePrice:
      source.purchasePricePaise !== undefined ? source.purchasePricePaise / 100 : undefined,
    mrp: source.mrpPaise !== undefined ? source.mrpPaise / 100 : undefined,
    minSalePrice:
      source.minSalePricePaise !== undefined ? source.minSalePricePaise / 100 : undefined,
    discountPercent: source.discountPercent ?? 0,
    taxPercent: source.taxPercent,
    taxCategory: source.taxCategory ?? '',
    hsn: source.hsn ?? '',
    trackStock: source.trackStock,
    openingStock: source.openingStock,
    stockQty: source.stockQty,
    criticalStock: source.criticalStock,
    batchTracking: source.batchTracking ?? false,
    expiryTracking: source.expiryTracking ?? false,
    description: source.description ?? '',
    active: source.active,
    available: source.available,
    ...overrides,
  }
}

function lineInput(quantity = 2): OrderFormValues['lines'][number] {
  return { productId: 'product-1', quantity, unitPrice: 100, discountPercent: 0, notes: '' }
}

function orderLine(quantity = 2): OrderLine {
  return {
    id: 'line-1',
    productId: 'product-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    departmentId: 'dept-sweets',
    pricingMode: 'fixed',
    quantity,
    unit: 'piece',
    unitPricePaise: 10000,
    discountPercent: 0,
    taxPercent: 5,
    stockTracked: true,
    stockFactor: 1,
    stockConsumed: quantity,
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
    lines: [orderLine()],
    subtotalPaise: 20000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 1000,
    totalPaise: 21000,
    paidPaise: 0,
    balancePaise: 21000,
    pricesIncludeTax: false,
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'staff-1',
    updatedBy: 'staff-1',
    ...overrides,
  }
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

function seedProduct(value: Product) {
  firestore.products.set(value.id, value as unknown as Record<string, unknown>)
}

function storedProduct(id = 'product-1'): Product {
  return firestore.products.get(id) as unknown as Product
}

async function saveEdit({
  existing,
  values,
}: {
  existing: Product
  values: ProductValues
}): Promise<string> {
  return saveProduct({ existing, values, image: null, profile: profile() })
}

beforeEach(() => {
  firestore.reset()
})

describe('saveProduct stock protection', () => {
  it('cannot restore a stale stock quantity during a metadata edit', async () => {
    seedProduct(product({ stockQty: 8 }))
    const stale = product({ stockQty: 10 })

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, { name: 'Kaju Barfi Special', stockQty: 10 }),
    })

    expect(storedProduct().name).toBe('Kaju Barfi Special')
    expect(storedProduct().stockQty).toBe(8)
    expect(storedProduct().stockQty).not.toBe(stale.stockQty)
  })

  it('preserves stock deducted by an order when product metadata is edited', async () => {
    const stale = product({ stockQty: 10 })
    seedProduct(stale)

    await createOrder({
      values: orderValues({ lines: [lineInput(2)] }),
      outlet: outlet(),
      businessName: 'Vishal Prem',
      pricesIncludeTax: false,
      profile: profile(),
      requestId: 'order-1',
    })
    expect(storedProduct().stockQty).toBe(8)

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, { name: 'Kaju Barfi Special', stockQty: 10 }),
    })

    expect(storedProduct().name).toBe('Kaju Barfi Special')
    expect(storedProduct().stockQty).toBe(8)
  })

  it('preserves stock restored by an order cancellation when product metadata is edited', async () => {
    const stale = product({ stockQty: 8 })
    seedProduct(stale)
    const currentOrder = order()
    firestore.orders.set(currentOrder.id, currentOrder as unknown as Record<string, unknown>)

    await updateOrderStatus({
      order: currentOrder,
      status: 'cancelled',
      profile: profile(),
      reason: 'Customer changed mind',
    })
    expect(storedProduct().stockQty).toBe(10)

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, { name: 'Kaju Barfi Special', stockQty: 8 }),
    })

    expect(storedProduct().name).toBe('Kaju Barfi Special')
    expect(storedProduct().stockQty).toBe(10)
  })

  it('still saves an explicitly entered initial stock when creating a product', async () => {
    const draft = product({ id: 'unused', openingStock: 25, stockQty: 25 })

    const id = await saveProduct({
      existing: null,
      values: valuesFrom(draft, { name: 'New Sweet', openingStock: 25, stockQty: 25 }),
      image: null,
      profile: profile(),
    })

    expect(storedProduct(id)).toMatchObject({
      name: 'New Sweet',
      trackStock: true,
      openingStock: 25,
      stockQty: 25,
    })
  })

  it('ignores an attempted stock edit during a metadata save', async () => {
    const current = product({ stockQty: 10 })
    seedProduct(current)

    await saveEdit({
      existing: current,
      values: valuesFrom(current, { name: 'Renamed Sweet', stockQty: 12 }),
    })

    expect(storedProduct()).toMatchObject({
      name: 'Renamed Sweet',
      stockQty: 10,
    })
  })

  it('keeps the live balance when a stale form also tries to change stock', async () => {
    seedProduct(product({ stockQty: 8 }))
    const stale = product({ stockQty: 10 })

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, { name: 'Renamed Sweet', stockQty: 12 }),
    })

    expect(storedProduct()).toMatchObject({
      name: 'Renamed Sweet',
      stockQty: 8,
    })
  })

  it('does not convert or recalculate stock or the conversion factor when units change', async () => {
    seedProduct(product({ stockQty: 8 }))
    const stale = product({ stockQty: 10 })

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, {
        unit: 'kg',
        conversionFactor: 2.5,
        stockQty: 10,
      }),
    })

    expect(storedProduct()).toMatchObject({
      unit: 'kg',
      conversionFactor: 1,
      stockQty: 8,
    })
  })

  it('does not erase stock or disable tracking when the form tries to', async () => {
    seedProduct(product({ stockQty: 8 }))
    const stale = product({ stockQty: 10 })

    await saveEdit({
      existing: stale,
      values: valuesFrom(stale, { trackStock: false, stockQty: 10 }),
    })

    expect(storedProduct()).toMatchObject({
      trackStock: true,
      stockQty: 8,
    })
  })

  it('does not enable tracking or invent a balance during a metadata edit', async () => {
    const current = product({ trackStock: false, openingStock: undefined, stockQty: undefined })
    seedProduct(current)

    await saveEdit({
      existing: current,
      values: valuesFrom(current, { trackStock: true, stockQty: 5 }),
    })

    expect(storedProduct()).toMatchObject({
      trackStock: false,
    })
    expect(storedProduct().stockQty).toBeUndefined()
  })

  it('rejects creating a tracked product without the stock permission', async () => {
    const draft = product({ id: 'unused', openingStock: 25, stockQty: 25 })
    const cakeAdmin = profile({
      role: 'cake_admin',
      permissions: defaultPermissionsForRole('cake_admin'),
    })

    await expect(
      saveProduct({
        existing: null,
        values: valuesFrom(draft, { name: 'New Sweet', openingStock: 25, stockQty: 25 }),
        image: null,
        profile: cakeAdmin,
      }),
    ).rejects.toThrow(/Adjust stock permission/i)
  })

  it('creates an untracked product without the stock permission', async () => {
    const draft = product({ id: 'unused', openingStock: undefined, stockQty: undefined })
    const cakeAdmin = profile({
      role: 'cake_admin',
      permissions: defaultPermissionsForRole('cake_admin'),
    })

    const id = await saveProduct({
      existing: null,
      values: valuesFrom(draft, {
        name: 'New Untracked Sweet',
        trackStock: false,
        openingStock: undefined,
        stockQty: undefined,
      }),
      image: null,
      profile: cakeAdmin,
    })

    expect(storedProduct(id)).toMatchObject({
      name: 'New Untracked Sweet',
      trackStock: false,
    })
    expect(storedProduct(id).stockQty).toBeUndefined()
  })
})
