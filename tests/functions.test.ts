import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from 'firebase-admin/firestore'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth'
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import {
  ALL_PERMISSIONS,
  defaultPermissionsForRole,
} from '@/auth/permissions'
import type { OrderFormValues } from '@/lib/validation'
import type { UserProfile } from '@/types/models'

const PROJECT_ID = 'vishal-prem-functions-test'
const FIRESTORE_HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080
const AUTH_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_HOST = '127.0.0.1'
const FUNCTIONS_PORT = 5001
const NOW = '2026-10-20T10:00:00.000Z'
const PASSWORD = 'Test-password-123'

process.env.GCLOUD_PROJECT ??= PROJECT_ID
process.env.FIRESTORE_EMULATOR_HOST ??= `${FIRESTORE_HOST}:${FIRESTORE_PORT}`
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

interface ClientBundle {
  app: FirebaseApp
  auth: Auth
  functions: Functions
}

let testEnv: RulesTestEnvironment
let adminApp: ReturnType<typeof initializeAdminApp>
let adminDb: AdminFirestore
let adminAuth: ReturnType<typeof getAdminAuth>
const clients = new Map<string, ClientBundle>()

function userProfile(
  uid: string,
  role: UserProfile['role'],
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    uid,
    displayName: uid,
    email: `${uid}@example.com`,
    role,
    permissions: role === 'super_admin'
      ? { ...ALL_PERMISSIONS }
      : defaultPermissionsForRole(role),
    outletIds: ['o1'],
    departmentIds: ['d1'],
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function productPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `Product ${id}`,
    printName: `PRODUCT ${id}`,
    group: 'Sweets',
    category: 'Barfi',
    departmentId: 'd1',
    outletIds: ['o1'],
    pricingMode: 'fixed',
    unit: 'piece',
    salePricePaise: 10000,
    minSalePricePaise: 5000,
    taxPercent: 5,
    trackStock: true,
    openingStock: 10,
    stockQty: 10,
    criticalStock: 1,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function orderPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    orderNumber: `ORD-${id}`,
    outletId: 'o1',
    departmentId: 'd1',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    channel: 'counter',
    orderType: 'takeaway',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    lines: [
      {
        id: `${id}-line-1`,
        productId: 'prod-cake',
        name: 'Product prod-cake',
        printName: 'PRODUCT prod-cake',
        departmentId: 'd1',
        pricingMode: 'fixed',
        quantity: 1,
        unit: 'piece',
        unitPricePaise: 10000,
        discountPercent: 0,
        taxPercent: 5,
        notes: '',
        stockTracked: true,
        stockFactor: 1,
        stockConsumed: 1,
      },
    ],
    subtotalPaise: 10000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 500,
    totalPaise: 10500,
    paidPaise: 0,
    balancePaise: 10500,
    pricesIncludeTax: false,
    discountType: 'none',
    discountValue: 0,
    revision: 1,
    notes: '',
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'cake',
    updatedBy: 'cake',
    ...overrides,
  }
}

function paymentPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    receiptNumber: `RCPT-${id}`,
    outletId: 'o1',
    departmentIds: ['d1'],
    customerName: 'Test Customer',
    amountPaise: 5000,
    type: 'payment',
    mode: 'cash',
    receivedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'finance',
    ...overrides,
  }
}

function bookingPayload(id: string): Record<string, unknown> {
  return {
    id,
    bookingNumber: `BKG-${id}`,
    outletId: 'o1',
    departmentIds: ['d1'],
    customerId: 'c1',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    eventType: 'wedding',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    bookingDate: NOW,
    fulfillment: 'pickup',
    status: 'enquiry',
    paymentStatus: 'unpaid',
    lines: [],
    subtotalPaise: 0,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 0,
    paidPaise: 0,
    balancePaise: 0,
    pricesIncludeTax: false,
    preparationStatus: 'pending',
    packingStatus: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'cake',
    updatedBy: 'cake',
  }
}

function orderValues(
  productId: string,
  overrides: Partial<OrderFormValues> = {},
): OrderFormValues {
  return {
    outletId: 'o1',
    departmentId: 'd1',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    orderType: 'takeaway',
    channel: 'counter',
    notes: '',
    pickupAt: '',
    lines: [
      {
        productId,
        quantity: 1,
        unitPrice: 100,
        discountPercent: 0,
        notes: '',
      },
    ],
    discountType: 'none',
    discountValue: 0,
    advanceAmount: 0,
    paymentMode: 'cash',
    paymentReference: '',
    ...overrides,
  }
}

async function seedBase(): Promise<void> {
  const batch = adminDb.batch()
  batch.set(adminDb.doc('business/main'), {
    id: 'main',
    name: 'Vishal Prem',
    pricesIncludeTax: false,
  })
  batch.set(adminDb.doc('outlets/o1'), {
    id: 'o1',
    code: 'VP1',
    name: 'Main Outlet',
    address: 'Main Road',
    phone: '9876543210',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  })
  batch.set(adminDb.doc('outlets/o2'), {
    id: 'o2',
    code: 'VP2',
    name: 'Second Outlet',
    address: 'Second Road',
    phone: '9876543211',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  })
  for (const departmentId of ['d1', 'd2']) {
    batch.set(adminDb.doc(`departments/${departmentId}`), {
      id: departmentId,
      code: departmentId,
      name: `Department ${departmentId}`,
      outletIds: ['o1'],
      color: '#C8102E',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }

  batch.set(adminDb.doc('users/super'), userProfile('super', 'super_admin', {
    outletIds: ['o1', 'o2'],
    departmentIds: [],
  }))
  batch.set(adminDb.doc('users/manager'), userProfile('manager', 'manager', {
    departmentIds: [],
  }))
  batch.set(adminDb.doc('users/cake'), userProfile('cake', 'cake_admin'))
  batch.set(adminDb.doc('users/finance'), userProfile('finance', 'accountant', {
    outletIds: ['o1'],
    departmentIds: [],
  }))
  batch.set(adminDb.doc('users/clerk'), userProfile('clerk', 'cake_admin', {
    permissions: {
      ...defaultPermissionsForRole('cake_admin'),
      ordersCancel: false,
    },
  }))
  batch.set(adminDb.doc('users/storekeeper'), userProfile('storekeeper', 'cake_admin', {
    permissions: {
      ...defaultPermissionsForRole('cake_admin'),
      inventoryAdjust: true,
    },
  }))
  batch.set(adminDb.doc('users/storekeeper-o2'), userProfile('storekeeper-o2', 'cake_admin', {
    permissions: {
      ...defaultPermissionsForRole('cake_admin'),
      inventoryAdjust: true,
    },
    outletIds: ['o2'],
  }))
  batch.set(adminDb.doc('users/storekeeper-d2'), userProfile('storekeeper-d2', 'cake_admin', {
    permissions: {
      ...defaultPermissionsForRole('cake_admin'),
      inventoryAdjust: true,
    },
    departmentIds: ['d2'],
  }))

  for (const [id, overrides] of [
    ['prod-cake', {}],
    ['prod-dup', { stockQty: 5, openingStock: 5 }],
    ['prod-last', { stockQty: 1, openingStock: 1 }],
    ['prod-meta', {}],
    ['prod-legacy', {}],
    ['prod-untracked', {
      trackStock: false,
    }],
  ] as const) {
    batch.set(adminDb.doc(`products/${id}`), productPayload(id, overrides))
  }

  batch.set(adminDb.doc('orders/order-cake'), orderPayload('order-cake'))
  batch.set(adminDb.doc('orders/order-legacy'), orderPayload('order-legacy', {
    lines: [
      {
        id: 'legacy-line-1',
        productId: 'prod-legacy',
        name: 'Product prod-legacy',
        printName: 'PRODUCT prod-legacy',
        departmentId: 'd1',
        pricingMode: 'fixed',
        quantity: 1,
        unit: 'piece',
        unitPricePaise: 10000,
        discountPercent: 0,
        taxPercent: 5,
        notes: '',
      },
    ],
  }))
  batch.set(adminDb.doc('bookings/booking-cake'), bookingPayload('booking-cake'))
  await batch.commit()
}

async function makeClient(uid: string, email: string): Promise<ClientBundle> {
  const app = initializeApp(
    {
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `functions-test-${uid}`,
  )
  const auth = getAuth(app)
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true })
  await signInWithEmailAndPassword(auth, email, PASSWORD)
  const functions = getFunctions(app, 'us-central1')
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT)
  return { app, auth, functions }
}

async function callAs(
  uid: string,
  name: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = clients.get(uid)
  if (!client) throw new Error(`Missing test client for ${uid}`)
  const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(
    client.functions,
    name,
  )
  const result = await callable(data)
  return result.data
}

async function expectCallFailure(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let error: unknown
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  expect(error).toBeTruthy()
  expect((error as { code?: string }).code).toBe(`functions/${code}`)
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })

  adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'functions-test-admin')
  adminDb = getAdminFirestore(adminApp)
  adminAuth = getAdminAuth(adminApp)

  const existing = await adminAuth.listUsers(1000).catch(() => ({ users: [] }))
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid))
  }

  for (const uid of [
    'super',
    'manager',
    'cake',
    'finance',
    'clerk',
    'storekeeper',
    'storekeeper-o2',
    'storekeeper-d2',
  ]) {
    await adminAuth.createUser({
      uid,
      email: `${uid}@example.com`,
      password: PASSWORD,
    })
    clients.set(uid, await makeClient(uid, `${uid}@example.com`))
  }
})

afterAll(async () => {
  await Promise.all(Array.from(clients.values(), (client) => deleteApp(client.app)))
  await deleteAdminApp(adminApp)
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedBase()
})

describe('trusted order creation', () => {
  it('rejects an unauthenticated caller', async () => {
    const app = initializeApp(
      {
        apiKey: 'demo-api-key',
        authDomain: `${PROJECT_ID}.firebaseapp.com`,
        projectId: PROJECT_ID,
      },
      `functions-test-unauth-${randomUUID()}`,
    )
    const functions = getFunctions(app, 'us-central1')
    connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT)
    try {
      const callable = httpsCallable(functions, 'createOrder')
      await expectCallFailure(
        callable({ requestId: randomUUID(), values: orderValues('prod-cake') }),
        'unauthenticated',
      )
    } finally {
      await deleteApp(app)
    }
  })

  it('rejects an actor outside the requested department', async () => {
    await expectCallFailure(
      callAs('cake', 'createOrder', {
        requestId: randomUUID(),
        values: orderValues('prod-cake', { departmentId: 'd2' }),
      }),
      'permission-denied',
    )
  })

  it('recomputes totals and ignores forged line stock snapshots', async () => {
    const requestId = randomUUID()
    const values = orderValues('prod-cake', {
      discountType: 'percent',
      discountValue: 10,
      lines: [
        {
          productId: 'prod-cake',
          quantity: 2,
          unitPrice: 100,
          discountPercent: 10,
          notes: '',
          // A malicious client can add fields the form does not expose.
          stockConsumed: 999,
          stockTracked: false,
        } as OrderFormValues['lines'][number],
      ],
    })

    const result = await callAs('manager', 'createOrder', { requestId, values })
    const snapshot = await adminDb.doc(`orders/${requestId}`).get()
    const order = snapshot.data() as Record<string, unknown>
    const lines = order.lines as Array<Record<string, unknown>>

    expect(result.orderNumber).toBe(order.orderNumber)
    expect(order.subtotalPaise).toBe(20000)
    expect(order.discountPaise).toBe(3800)
    expect(order.taxPaise).toBe(810)
    expect(order.totalPaise).toBe(17010)
    expect(order.paidPaise).toBe(0)
    expect(lines[0]?.stockTracked).toBe(true)
    expect(lines[0]?.stockConsumed).toBe(2)
  })

  it('rejects a forged top-level total instead of accepting it', async () => {
    await expectCallFailure(
      callAs('manager', 'createOrder', {
        requestId: randomUUID(),
        values: { ...orderValues('prod-cake'), totalPaise: 1 },
      }),
      'invalid-argument',
    )
  })

  it('rejects duplicate lines that together oversell stock', async () => {
    const requestId = randomUUID()
    const values = orderValues('prod-dup', {
      lines: [
        { productId: 'prod-dup', quantity: 3, unitPrice: 100, discountPercent: 0, notes: '' },
        { productId: 'prod-dup', quantity: 3, unitPrice: 100, discountPercent: 0, notes: '' },
      ],
    })

    await expectCallFailure(
      callAs('manager', 'createOrder', { requestId, values }),
      'failed-precondition',
    )
    expect((await adminDb.doc(`orders/${requestId}`).get()).exists).toBe(false)
    expect((await adminDb.doc('products/prod-dup').get()).data()?.stockQty).toBe(5)
  })

  it('lets only one concurrent request buy the last unit', async () => {
    const firstRequest = randomUUID()
    const secondRequest = randomUUID()
    const results = await Promise.allSettled([
      callAs('manager', 'createOrder', {
        requestId: firstRequest,
        values: orderValues('prod-last'),
      }),
      callAs('manager', 'createOrder', {
        requestId: secondRequest,
        values: orderValues('prod-last'),
      }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(
      'functions/failed-precondition',
    )

    const orders = await adminDb.collection('orders').get()
    const created = [firstRequest, secondRequest].filter((requestId) => (
      orders.docs.some((order) => order.id === requestId)
    ))
    // Concurrency does not guarantee which request wins; exactly one must.
    expect(created).toHaveLength(1)
    expect((await adminDb.doc('products/prod-last').get()).data()?.stockQty).toBe(0)
  })

  it('makes request-id retries idempotent', async () => {
    const requestId = randomUUID()
    const values = orderValues('prod-cake', { advanceAmount: 10 })

    const first = await callAs('manager', 'createOrder', { requestId, values })
    const second = await callAs('manager', 'createOrder', { requestId, values })

    expect(second.orderNumber).toBe(first.orderNumber)
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(9)
    expect((await adminDb.doc(`orders/${requestId}`).get()).data()?.paidPaise).toBe(1000)
    expect((await adminDb.doc(`payments/advance-${requestId}`).get()).exists).toBe(true)
  })
})

describe('trusted cancellation', () => {
  it('restores from the saved snapshot, not changed product metadata, and is idempotent', async () => {
    const requestId = randomUUID()
    const values = orderValues('prod-meta', {
      lines: [
        { productId: 'prod-meta', quantity: 2, unitPrice: 100, discountPercent: 0, notes: '' },
      ],
    })
    await callAs('manager', 'createOrder', { requestId, values })
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(8)

    // Current metadata now disagrees with the immutable order snapshot. The
    // cancellation must still return exactly the two units that were taken.
    await adminDb.doc('products/prod-meta').update({
      stockQty: 100,
      conversionFactor: 3,
      trackStock: false,
      updatedAt: NOW,
    })

    const first = await callAs('cake', 'cancelOrder', {
      orderId: requestId,
      expectedStatus: 'confirmed',
      reason: 'Customer changed their mind',
    })
    expect(first.restored).toBe(true)
    expect((await adminDb.doc(`orders/${requestId}`).get()).data()?.status).toBe('cancelled')
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(102)

    const second = await callAs('cake', 'cancelOrder', {
      orderId: requestId,
      expectedStatus: 'confirmed',
      reason: 'Retry',
    })
    expect(second.restored).toBe(false)
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(102)
  })

  it('rejects a legacy order without stock snapshots', async () => {
    await expectCallFailure(
      callAs('cake', 'cancelOrder', {
        orderId: 'order-legacy',
        expectedStatus: 'confirmed',
      }),
      'failed-precondition',
    )
    expect((await adminDb.doc('orders/order-legacy').get()).data()?.status).toBe('confirmed')
    expect((await adminDb.doc('products/prod-legacy').get()).data()?.stockQty).toBe(10)
  })
})

describe('trusted stock adjustments', () => {
  it('denies actors without the inventory permission and actors outside scope', async () => {
    await expectCallFailure(
      callAs('cake', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 1,
        reason: 'Physical count',
      }),
      'permission-denied',
    )
    await expectCallFailure(
      callAs('storekeeper-o2', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 1,
        reason: 'Physical count',
      }),
      'permission-denied',
    )
    await expectCallFailure(
      callAs('storekeeper-d2', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 1,
        reason: 'Physical count',
      }),
      'permission-denied',
    )

    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
    expect((await adminDb.collection('stockAdjustments').get()).empty).toBe(true)
  })

  it('rejects a missing reason, zero quantity and a negative resulting balance', async () => {
    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 1,
        reason: '',
      }),
      'invalid-argument',
    )
    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 0,
        reason: 'Physical count',
      }),
      'invalid-argument',
    )
    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: -11,
        reason: 'Physical count',
      }),
      'failed-precondition',
    )

    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
    expect((await adminDb.collection('stockAdjustments').get()).empty).toBe(true)
  })

  it('updates the live balance and writes an immutable audit record atomically', async () => {
    const requestId = randomUUID()
    const result = await callAs('storekeeper', 'adjustProductStock', {
      requestId,
      productId: 'prod-cake',
      delta: 4.5,
      reason: 'Physical count surplus',
    })

    expect(result).toMatchObject({
      adjustmentId: requestId,
      productId: 'prod-cake',
      previousStockQty: 10,
      resultingStockQty: 14.5,
      unit: 'piece',
    })
    expect((await adminDb.doc('products/prod-cake').get()).data()).toMatchObject({
      stockQty: 14.5,
      updatedBy: 'storekeeper',
    })

    const adjustment = (await adminDb.doc(`stockAdjustments/${requestId}`).get()).data()
    expect(adjustment).toMatchObject({
      id: requestId,
      productId: 'prod-cake',
      departmentId: 'd1',
      outletIds: ['o1'],
      delta: 4.5,
      previousStockQty: 10,
      resultingStockQty: 14.5,
      reason: 'Physical count surplus',
      actorName: 'storekeeper',
      createdBy: 'storekeeper',
      source: 'manual',
    })
    expect(typeof adjustment?.createdAt).toBe('string')
  })

  it('allows an adjustment that reduces the live balance to exactly zero', async () => {
    const requestId = randomUUID()
    const result = await callAs('storekeeper', 'adjustProductStock', {
      requestId,
      productId: 'prod-cake',
      delta: -10,
      reason: 'Physical count cleared the shelf',
    })

    expect(result).toMatchObject({
      adjustmentId: requestId,
      productId: 'prod-cake',
      previousStockQty: 10,
      resultingStockQty: 0,
      unit: 'piece',
    })
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(0)

    const adjustment = (await adminDb.doc(`stockAdjustments/${requestId}`).get()).data()
    expect(adjustment).toMatchObject({
      delta: -10,
      previousStockQty: 10,
      resultingStockQty: 0,
    })
  })

  it('rejects a zero-delta adjustment with a clear validation message', async () => {
    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 0,
        reason: 'No change',
      }),
      'invalid-argument',
    )
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
    expect((await adminDb.collection('stockAdjustments').get()).empty).toBe(true)
  })

  it('serialises concurrent adjustments instead of overwriting a balance', async () => {
    const [first, second] = await Promise.all([
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 2,
        reason: 'Purchase received A',
      }),
      callAs('storekeeper', 'adjustProductStock', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        delta: 3,
        reason: 'Purchase received B',
      }),
    ])

    expect(first.resultingStockQty).toBe(12)
    expect(second.resultingStockQty).toBe(15)
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(15)
    expect((await adminDb.collection('stockAdjustments').get()).size).toBe(2)
  })

  it('applies a retried request once and rejects request-id reuse for a different edit', async () => {
    const requestId = randomUUID()
    const payload = {
      requestId,
      productId: 'prod-cake',
      delta: 2,
      reason: 'Physical count',
    }

    const first = await callAs('storekeeper', 'adjustProductStock', payload)
    const second = await callAs('storekeeper', 'adjustProductStock', payload)
    expect(second.resultingStockQty).toBe(first.resultingStockQty)
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(12)
    expect((await adminDb.collection('stockAdjustments').get()).size).toBe(1)

    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', { ...payload, delta: 5 }),
      'already-exists',
    )
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(12)
  })

  it('writes nothing when the product does not exist', async () => {
    const requestId = randomUUID()
    await expectCallFailure(
      callAs('storekeeper', 'adjustProductStock', {
        requestId,
        productId: 'prod-missing',
        delta: 1,
        reason: 'Physical count',
      }),
      'not-found',
    )
    expect((await adminDb.doc(`stockAdjustments/${requestId}`).get()).exists).toBe(false)
  })
})

describe('trusted stock-tracking conversion', () => {
  it('denies actors without inventoryAdjust and actors outside outlet or department scope', async () => {
    await expectCallFailure(
      callAs('cake', 'enableProductStockTracking', {
        requestId: randomUUID(),
        productId: 'prod-untracked',
        openingStock: 0,
        reason: 'Enable stock control',
      }),
      'permission-denied',
    )
    await expectCallFailure(
      callAs('storekeeper-o2', 'enableProductStockTracking', {
        requestId: randomUUID(),
        productId: 'prod-untracked',
        openingStock: 0,
        reason: 'Enable stock control',
      }),
      'permission-denied',
    )
    await expectCallFailure(
      callAs('storekeeper-d2', 'enableProductStockTracking', {
        requestId: randomUUID(),
        productId: 'prod-untracked',
        openingStock: 0,
        reason: 'Enable stock control',
      }),
      'permission-denied',
    )

    expect((await adminDb.doc('products/prod-untracked').get()).data()?.trackStock).toBe(false)
    expect(
      (await adminDb.collection('stockAdjustments').where('source', '==', 'enable_tracking').get()).empty,
    ).toBe(true)
  })

  it('rejects negative opening stock and an already tracked product', async () => {
    await expectCallFailure(
      callAs('storekeeper', 'enableProductStockTracking', {
        requestId: randomUUID(),
        productId: 'prod-untracked',
        openingStock: -1,
        reason: 'Enable stock control',
      }),
      'invalid-argument',
    )
    await expectCallFailure(
      callAs('storekeeper', 'enableProductStockTracking', {
        requestId: randomUUID(),
        productId: 'prod-cake',
        openingStock: 0,
        reason: 'Enable stock control',
      }),
      'failed-precondition',
    )

    expect((await adminDb.doc('products/prod-untracked').get()).data()?.trackStock).toBe(false)
    expect(
      (await adminDb.collection('stockAdjustments').where('source', '==', 'enable_tracking').get()).empty,
    ).toBe(true)
  })

  it('enables tracking with zero opening stock, writes an audit record, and retries idempotently', async () => {
    const requestId = randomUUID()
    const payload = {
      requestId,
      productId: 'prod-untracked',
      openingStock: 0,
      criticalStock: 2,
      reason: 'Product should be stock-controlled; opening count verified',
    }

    const first = await callAs('storekeeper', 'enableProductStockTracking', payload)
    expect(first).toMatchObject({
      adjustmentId: requestId,
      productId: 'prod-untracked',
      previousStockQty: 0,
      resultingStockQty: 0,
      unit: 'piece',
    })
    expect((await adminDb.doc('products/prod-untracked').get()).data()).toMatchObject({
      trackStock: true,
      openingStock: 0,
      stockQty: 0,
      criticalStock: 2,
      updatedBy: 'storekeeper',
    })

    const adjustment = (await adminDb.doc(`stockAdjustments/${requestId}`).get()).data()
    expect(adjustment).toMatchObject({
      id: requestId,
      productId: 'prod-untracked',
      delta: 0,
      previousStockQty: 0,
      resultingStockQty: 0,
      source: 'enable_tracking',
      createdBy: 'storekeeper',
    })

    const second = await callAs('storekeeper', 'enableProductStockTracking', payload)
    expect(second.resultingStockQty).toBe(0)
    expect(
      (await adminDb.collection('stockAdjustments').where('source', '==', 'enable_tracking').get()).size,
    ).toBe(1)

    await expectCallFailure(
      callAs('storekeeper', 'enableProductStockTracking', { ...payload, openingStock: 5 }),
      'already-exists',
    )
    expect((await adminDb.doc('products/prod-untracked').get()).data()?.stockQty).toBe(0)
  })
})

describe('trusted order payments', () => {
  it('posts the payment record and order balance atomically, with retry idempotency', async () => {
    const orderId = randomUUID()
    await callAs('manager', 'createOrder', {
      requestId: orderId,
      values: orderValues('prod-cake', {
        lines: [
          { productId: 'prod-cake', quantity: 2, unitPrice: 100, discountPercent: 0, notes: '' },
        ],
      }),
    })

    const requestId = randomUUID()
    const first = await callAs('finance', 'recordOrderPayment', {
      requestId,
      orderId,
      amountPaise: 10000,
      type: 'payment',
      mode: 'cash',
      receivedAt: NOW,
      reference: '',
      notes: '',
    })
    const second = await callAs('finance', 'recordOrderPayment', {
      requestId,
      orderId,
      amountPaise: 10000,
      type: 'payment',
      mode: 'cash',
      receivedAt: NOW,
      reference: '',
      notes: '',
    })

    expect(second.receiptNumber).toBe(first.receiptNumber)
    const order = (await adminDb.doc(`orders/${orderId}`).get()).data()
    expect(order?.paidPaise).toBe(10000)
    expect(order?.balancePaise).toBe(11000)
    expect(order?.paymentStatus).toBe('partial')
    expect((await adminDb.doc(`payments/${requestId}`).get()).data()?.orderId).toBe(orderId)
    const payments = await adminDb.collection('payments').get()
    expect(payments.docs).toHaveLength(1)
  })

  it('rejects an overpayment without writing either document', async () => {
    const orderId = randomUUID()
    await callAs('manager', 'createOrder', {
      requestId: orderId,
      values: orderValues('prod-cake'),
    })

    const requestId = randomUUID()
    await expectCallFailure(
      callAs('finance', 'recordOrderPayment', {
        requestId,
        orderId,
        amountPaise: 999999,
        type: 'payment',
        mode: 'cash',
        receivedAt: NOW,
      }),
      'failed-precondition',
    )
    expect((await adminDb.doc(`payments/${requestId}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`orders/${orderId}`).get()).data()?.paidPaise).toBe(0)
  })
})

describe('Firestore rules after callable migration', () => {
  it('denies direct order creation and cancellation', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
    }).firestore()

    await assertFails(
      setDoc(
        doc(manager, 'orders/client-created'),
        orderPayload('client-created', { createdBy: 'manager', updatedBy: 'manager' }),
      ),
    )
    await assertFails(
      updateDoc(doc(manager, 'orders/order-cake'), {
        status: 'cancelled',
        cancelReason: 'Bypass attempt',
        updatedAt: NOW,
        updatedBy: 'manager',
      }),
    )
  })

  it('denies direct paid-field patches and direct order payment records', async () => {
    const finance = testEnv.authenticatedContext('finance', {
      email: 'finance@example.com',
    }).firestore()

    await assertFails(
      updateDoc(doc(finance, 'orders/order-cake'), {
        paidPaise: 5000,
        balancePaise: 5500,
        paymentStatus: 'partial',
        updatedAt: NOW,
        updatedBy: 'finance',
      }),
    )
    await assertFails(
      setDoc(
        doc(finance, 'payments/p-order'),
        paymentPayload('p-order', { orderId: 'order-cake', createdBy: 'finance' }),
      ),
    )
  })

  it('preserves legitimate notes, print counts and status advancement while denying direct payments', async () => {
    const manager = testEnv.authenticatedContext('manager', {
      email: 'manager@example.com',
    }).firestore()

    await assertSucceeds(
      updateDoc(doc(manager, 'orders/order-cake'), {
        status: 'preparing',
        updatedAt: NOW,
        updatedBy: 'manager',
      }),
    )
    await assertSucceeds(
      updateDoc(doc(manager, 'orders/order-cake'), {
        notes: 'Packed for pickup',
        updatedAt: NOW,
        updatedBy: 'manager',
      }),
    )
    await assertSucceeds(
      updateDoc(doc(manager, 'orders/order-cake'), {
        'printCounts.receipt': 1,
        updatedAt: NOW,
        updatedBy: 'manager',
      }),
    )

    const finance = testEnv.authenticatedContext('finance', {
      email: 'finance@example.com',
    }).firestore()
    await assertFails(
      setDoc(
        doc(finance, 'payments/p-booking'),
        paymentPayload('p-booking', {
          bookingId: 'booking-cake',
          createdBy: 'finance',
        }),
      ),
    )
  })
})
