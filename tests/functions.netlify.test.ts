import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
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
import { ALL_PERMISSIONS, defaultPermissionsForRole } from '@/auth/permissions'
import type { OrderFormValues } from '@/lib/validation'
import type { UserProfile } from '@/types/models'
import createOrderHandler from '../netlify/functions/create-order.mts'
import cancelOrderHandler from '../netlify/functions/cancel-order.mts'
import recordOrderPaymentHandler from '../netlify/functions/record-order-payment.mts'
import recordBookingPaymentHandler from '../netlify/functions/record-booking-payment.mts'
import adjustProductStockHandler from '../netlify/functions/adjust-product-stock.mts'
import productionOperationHandler from '../netlify/functions/production-operation.mts'
import inventoryOperationHandler from '../netlify/functions/inventory-operation.mts'
import deliveryOperationHandler from '../netlify/functions/delivery-operation.mts'
import financeOperationHandler from '../netlify/functions/finance-operation.mts'
import staffDirectoryHandler from '../netlify/functions/staff-directory.mts'
import createBookingHandler from '../netlify/functions/create-booking.mts'
import updateBookingHandler from '../netlify/functions/update-booking.mts'
import updateBookingFulfilmentHandler from '../netlify/functions/update-booking-fulfilment.mts'

const PROJECT_ID = 'vishal-prem-functions-test'
const FIRESTORE_HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080
const AUTH_URL = 'http://127.0.0.1:9099'
const NOW = '2026-10-20T10:00:00.000Z'
const PASSWORD = 'Test-password-123'
const ALLOWED_ORIGIN = 'http://localhost:5173'

process.env.GCLOUD_PROJECT ??= PROJECT_ID
process.env.FIRESTORE_EMULATOR_HOST ??= `${FIRESTORE_HOST}:${FIRESTORE_PORT}`
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
process.env.ALLOWED_APP_ORIGINS ??= ALLOWED_ORIGIN

type Handler = (request: Request) => Promise<Response>

const ROUTES: Record<string, Handler> = {
  '/.netlify/functions/create-order': createOrderHandler,
  '/.netlify/functions/cancel-order': cancelOrderHandler,
  '/.netlify/functions/record-order-payment': recordOrderPaymentHandler,
  '/.netlify/functions/record-booking-payment': recordBookingPaymentHandler,
  '/.netlify/functions/adjust-product-stock': adjustProductStockHandler,
  '/.netlify/functions/production-operation': productionOperationHandler,
  '/.netlify/functions/inventory-operation': inventoryOperationHandler,
  '/.netlify/functions/delivery-operation': deliveryOperationHandler,
  '/.netlify/functions/finance-operation': financeOperationHandler,
  '/.netlify/functions/staff-directory': staffDirectoryHandler,
  '/.netlify/functions/create-booking': createBookingHandler,
  '/.netlify/functions/update-booking': updateBookingHandler,
  '/.netlify/functions/update-booking-fulfilment': updateBookingFulfilmentHandler,
}

let testEnv: RulesTestEnvironment
let adminApp: ReturnType<typeof initializeAdminApp>
let adminDb: AdminFirestore
let adminAuth: ReturnType<typeof getAdminAuth>
let localServer: Server
let baseUrl = ''
const clients = new Map<string, { app: FirebaseApp; auth: Auth }>()

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

function customerPayload(id = 'c-booking'): Record<string, unknown> {
  return {
    id,
    name: 'Party Customer',
    phone: '9876543210',
    outletIds: ['o1'],
    active: true,
    accountGroup: 'retail',
    addresses: [],
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'manager',
    updatedBy: 'manager',
  }
}

function bookingPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    bookingNumber: `BKG-${id}`,
    outletId: 'o1',
    departmentIds: ['d1'],
    customerId: 'c-booking',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    eventType: 'birthday',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    bookingDate: NOW,
    fulfillment: 'pickup',
    deliveryAddress: '',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    lines: [{
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
      taxPercent: 0,
      notes: '',
    }],
    subtotalPaise: 10000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 10000,
    paidPaise: 0,
    balancePaise: 10000,
    pricesIncludeTax: false,
    discountType: 'none',
    discountValue: 0,
    revision: 1,
    instructions: '',
    preparationStatus: 'pending',
    packingStatus: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'manager',
    updatedBy: 'manager',
    ...overrides,
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
  batch.set(adminDb.doc('users/no-pay'), userProfile('no-pay', 'cake_admin', {
    permissions: {
      ...defaultPermissionsForRole('cake_admin'),
      paymentsManage: false,
    },
  }))

  for (const [id, overrides] of [
    ['prod-cake', {}],
    ['prod-sweets', { departmentId: 'd2' }],
    ['prod-dup', { stockQty: 5, openingStock: 5 }],
    ['prod-last', { stockQty: 1, openingStock: 1 }],
    ['prod-meta', {}],
    ['prod-legacy', {}],
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
  await batch.commit()
}

async function tokenFor(uid: string): Promise<string> {
  const client = clients.get(uid)
  if (!client) throw new Error(`Missing Firebase test client for ${uid}`)
  return client.auth.currentUser!.getIdToken()
}

async function post(
  endpoint: keyof typeof ROUTES,
  body: unknown,
  options: {
    token?: string
    origin?: string
    contentType?: string
    rawBody?: string
  } = {},
): Promise<Response> {
  const headers = new Headers()
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  if (options.origin) headers.set('Origin', options.origin)
  headers.set('Content-Type', options.contentType ?? 'application/json')
  return fetch(`${baseUrl}/${endpoint.replace(/^\//, '')}`, {
    method: 'POST',
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  })
}

type JsonBody = Record<string, unknown> & {
  error?: { code?: string; message?: string }
}

async function json(response: Response): Promise<JsonBody> {
  return response.json() as Promise<JsonBody>
}

async function expectFailure(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  expect(response.status).toBe(status)
  const payload = await json(response)
  expect(payload.error?.code).toBe(code)
  expect(typeof payload.error?.message).toBe('string')
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

  adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'netlify-test-admin')
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
    'no-pay',
    'no-profile',
  ]) {
    await adminAuth.createUser({
      uid,
      email: `${uid}@example.com`,
      password: PASSWORD,
    })
    const app = initializeApp(
      {
        apiKey: 'demo-api-key',
        authDomain: `${PROJECT_ID}.firebaseapp.com`,
        projectId: PROJECT_ID,
      },
      `netlify-test-client-${uid}`,
    )
    const auth = getAuth(app)
    connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true })
    await signInWithEmailAndPassword(auth, `${uid}@example.com`, PASSWORD)
    clients.set(uid, { app, auth })
  }

  localServer = createServer(async (incoming, outgoing) => {
    const url = new URL(
      incoming.url ?? '/',
      `http://${incoming.headers.host ?? '127.0.0.1'}`,
    )
    const handler = ROUTES[url.pathname]
    if (!handler) {
      outgoing.statusCode = 404
      outgoing.end('Not found')
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of incoming) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const headers = new Headers()
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item)
      } else if (value !== undefined) {
        headers.set(key, value)
      }
    }
    const request = new Request(url, {
      method: incoming.method,
      headers,
      body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    })
    const response = await handler(request)
    outgoing.statusCode = response.status
    response.headers.forEach((value, key) => outgoing.setHeader(key, value))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })

  await new Promise<void>((resolve) => {
    localServer.listen(0, '127.0.0.1', () => {
      const address = localServer.address()
      if (!address || typeof address === 'string') throw new Error('No test server address')
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    localServer.close((error) => (error ? reject(error) : resolve()))
  })
  await Promise.all(Array.from(clients.values(), (client) => deleteApp(client.app)))
  await deleteAdminApp(adminApp)
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedBase()
})

describe('Netlify endpoint authentication boundary', () => {
  it('rejects missing, malformed and unknown sign-ins before any write', async () => {
    const requestId = randomUUID()
    await expectFailure(
      await post('/.netlify/functions/create-order', {
        requestId,
        values: orderValues('prod-cake'),
      }),
      401,
      'unauthenticated',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        { requestId, values: orderValues('prod-cake') },
        { token: 'not-a-real-token' },
      ),
      401,
      'unauthenticated',
    )

    const validButUnprofiled = await tokenFor('no-profile')
    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        { requestId, values: orderValues('prod-cake') },
        { token: validButUnprofiled },
      ),
      403,
      'permission-denied',
    )

    expect((await adminDb.doc(`orders/${requestId}`).get()).exists).toBe(false)
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
  })

  it('rejects forged actor and privileged fields in otherwise valid requests', async () => {
    const requestId = randomUUID()
    const token = await tokenFor('manager')
    const response = await post(
      '/.netlify/functions/create-order',
      {
        requestId,
        values: orderValues('prod-cake'),
        createdBy: 'super',
        actorUid: 'super',
      },
      { token },
    )
    await expectFailure(response, 400, 'invalid-argument')
    expect((await adminDb.doc(`orders/${requestId}`).get()).exists).toBe(false)
  })

  it('derives the write actor from the verified token, not the body', async () => {
    const requestId = randomUUID()
    const response = await post(
      '/.netlify/functions/create-order',
      { requestId, values: orderValues('prod-cake') },
      { token: await tokenFor('manager') },
    )
    expect(response.status).toBe(200)
    const order = (await adminDb.doc(`orders/${requestId}`).get()).data()
    expect(order?.createdBy).toBe('manager')
    expect(order?.updatedBy).toBe('manager')
  })

  it('enforces authorization and outlet/department scope', async () => {
    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        { requestId: randomUUID(), values: orderValues('prod-cake') },
        { token: await tokenFor('finance') },
      ),
      403,
      'permission-denied',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        {
          requestId: randomUUID(),
          productId: 'prod-cake',
          delta: 1,
          reason: 'Physical count',
        },
        { token: await tokenFor('cake') },
      ),
      403,
      'permission-denied',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        {
          requestId: randomUUID(),
          productId: 'prod-cake',
          delta: 1,
          reason: 'Physical count',
        },
        { token: await tokenFor('storekeeper-o2') },
      ),
      403,
      'permission-denied',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        {
          requestId: randomUUID(),
          productId: 'prod-cake',
          delta: 1,
          reason: 'Physical count',
        },
        { token: await tokenFor('storekeeper-d2') },
      ),
      403,
      'permission-denied',
    )

    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        {
          requestId: randomUUID(),
          values: orderValues('prod-cake', { outletId: 'o2' }),
        },
        { token: await tokenFor('manager') },
      ),
      403,
      'permission-denied',
    )

    await expectFailure(
      await post(
        '/.netlify/functions/cancel-order',
        { orderId: 'order-cake', expectedStatus: 'confirmed' },
        { token: await tokenFor('clerk') },
      ),
      403,
      'permission-denied',
    )
  })

  it('requires paymentsManage for order and booking advances', async () => {
    const token = await tokenFor('no-pay')
    const orderRequest = randomUUID()
    await expectFailure(
      await post('/.netlify/functions/create-order', {
        requestId: orderRequest,
        values: orderValues('prod-cake', { advanceAmount: 10 }),
      }, { token }),
      403,
      'permission-denied',
    )
    expect((await adminDb.doc(`orders/${orderRequest}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`payments/advance-${orderRequest}`).get()).exists).toBe(false)

    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingRequest = randomUUID()
    await expectFailure(
      await post('/.netlify/functions/create-booking', {
        requestId: bookingRequest,
        values: {
          outletId: 'o1',
          customerId: 'c-booking',
          eventType: 'birthday',
          eventDate: '2026-12-01',
          eventTime: '18:00',
          fulfillment: 'pickup',
          departmentIds: ['d1'],
          instructions: '',
          lines: [{ productId: 'prod-cake', quantity: 1, unitPrice: 100, discountPercent: 0, notes: '' }],
          discountType: 'none',
          discountValue: 0,
          advanceAmount: 10,
          paymentMode: 'cash',
          paymentReference: '',
        },
      }, { token }),
      403,
      'permission-denied',
    )
    expect((await adminDb.doc(`bookings/${bookingRequest}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`payments/advance-${bookingRequest}`).get()).exists).toBe(false)
  })
})

describe('Netlify order operations', () => {
  it('rejects duplicate lines that together oversell stock', async () => {
    const requestId = randomUUID()
    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        {
          requestId,
          values: orderValues('prod-dup', {
            lines: [
              { productId: 'prod-dup', quantity: 3, unitPrice: 100, discountPercent: 0, notes: '' },
              { productId: 'prod-dup', quantity: 3, unitPrice: 100, discountPercent: 0, notes: '' },
            ],
          }),
        },
        { token: await tokenFor('manager') },
      ),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc(`orders/${requestId}`).get()).exists).toBe(false)
    expect((await adminDb.doc('products/prod-dup').get()).data()?.stockQty).toBe(5)
  })

  it('lets only one concurrent request buy the last unit', async () => {
    const token = await tokenFor('manager')
    const first = randomUUID()
    const second = randomUUID()
    const results = await Promise.all([
      post(
        '/.netlify/functions/create-order',
        { requestId: first, values: orderValues('prod-last') },
        { token },
      ),
      post(
        '/.netlify/functions/create-order',
        { requestId: second, values: orderValues('prod-last') },
        { token },
      ),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 412])
    const orders = await adminDb.collection('orders').get()
    const created = [first, second].filter((id) => orders.docs.some((order) => order.id === id))
    expect(created).toHaveLength(1)
    expect((await adminDb.doc('products/prod-last').get()).data()?.stockQty).toBe(0)
  })

  it('applies creation and advance-payment retries once', async () => {
    const requestId = randomUUID()
    const token = await tokenFor('manager')
    const payload = {
      requestId,
      values: orderValues('prod-cake', { advanceAmount: 10 }),
    }

    const first = await post('/.netlify/functions/create-order', payload, { token })
    expect(first.status).toBe(200)
    const firstBody = await json(first)
    const second = await post('/.netlify/functions/create-order', payload, { token })
    expect(second.status).toBe(200)
    expect((await json(second)).orderNumber).toBe(firstBody.orderNumber)

    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(9)
    expect((await adminDb.doc(`orders/${requestId}`).get()).data()?.paidPaise).toBe(1000)
    expect((await adminDb.doc(`payments/advance-${requestId}`).get()).exists).toBe(true)
  })

  it('restores stock once on cancellation and rejects legacy snapshots', async () => {
    const requestId = randomUUID()
    const token = await tokenFor('manager')
    await post(
      '/.netlify/functions/create-order',
      { requestId, values: orderValues('prod-meta', {
        lines: [
          { productId: 'prod-meta', quantity: 2, unitPrice: 100, discountPercent: 0, notes: '' },
        ],
      }) },
      { token },
    )
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(8)

    const cakeToken = await tokenFor('cake')
    const first = await post(
      '/.netlify/functions/cancel-order',
      { orderId: requestId, expectedStatus: 'confirmed', reason: 'Customer changed their mind' },
      { token: cakeToken },
    )
    expect(first.status).toBe(200)
    expect((await json(first)).restored).toBe(true)
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(10)

    const second = await post(
      '/.netlify/functions/cancel-order',
      { orderId: requestId, expectedStatus: 'confirmed', reason: 'Retry' },
      { token: cakeToken },
    )
    expect(second.status).toBe(200)
    expect((await json(second)).restored).toBe(false)
    expect((await adminDb.doc('products/prod-meta').get()).data()?.stockQty).toBe(10)

    await expectFailure(
      await post(
        '/.netlify/functions/cancel-order',
        { orderId: 'order-legacy', expectedStatus: 'confirmed' },
        { token: cakeToken },
      ),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc('orders/order-legacy').get()).data()?.status).toBe('confirmed')
    expect((await adminDb.doc('products/prod-legacy').get()).data()?.stockQty).toBe(10)
  })
})

describe('Netlify payment operation', () => {
  it('posts the payment and order balance once, atomically', async () => {
    const orderId = randomUUID()
    const managerToken = await tokenFor('manager')
    await post(
      '/.netlify/functions/create-order',
      {
        requestId: orderId,
        values: orderValues('prod-cake', {
          lines: [
            { productId: 'prod-cake', quantity: 2, unitPrice: 100, discountPercent: 0, notes: '' },
          ],
        }),
      },
      { token: managerToken },
    )

    const requestId = randomUUID()
    const token = await tokenFor('finance')
    const payload = {
      requestId,
      orderId,
      amountPaise: 10000,
      type: 'payment',
      mode: 'cash',
      receivedAt: NOW,
      reference: '',
      notes: '',
    }

    const first = await post('/.netlify/functions/record-order-payment', payload, { token })
    expect(first.status).toBe(200)
    const receipt = (await json(first)).receiptNumber
    const second = await post('/.netlify/functions/record-order-payment', payload, { token })
    expect(second.status).toBe(200)
    expect((await json(second)).receiptNumber).toBe(receipt)
    expect((await adminDb.doc(`payments/${requestId}`).get()).exists).toBe(true)

    const order = (await adminDb.doc(`orders/${orderId}`).get()).data()
    expect(order?.paidPaise).toBe(10000)
    expect(order?.balancePaise).toBe(11000)
    expect(order?.paymentStatus).toBe('partial')
    const payments = await adminDb.collection('payments').get()
    expect(payments.docs).toHaveLength(1)
  })

  it('rejects an overpayment without writing either document', async () => {
    const orderId = randomUUID()
    await post(
      '/.netlify/functions/create-order',
      { requestId: orderId, values: orderValues('prod-cake') },
      { token: await tokenFor('manager') },
    )

    const requestId = randomUUID()
    await expectFailure(
      await post(
        '/.netlify/functions/record-order-payment',
        {
          requestId,
          orderId,
          amountPaise: 999999,
          type: 'payment',
          mode: 'cash',
          receivedAt: NOW,
        },
        { token: await tokenFor('finance') },
      ),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc(`payments/${requestId}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`orders/${orderId}`).get()).data()?.paidPaise).toBe(0)
  })
})

describe('Netlify stock adjustment operation', () => {
  it('rejects missing reasons, zero deltas and negative resulting balances without writes', async () => {
    const token = await tokenFor('storekeeper')
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: randomUUID(), productId: 'prod-cake', delta: 1, reason: '' },
        { token },
      ),
      400,
      'invalid-argument',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: randomUUID(), productId: 'prod-cake', delta: 0, reason: 'Physical count' },
        { token },
      ),
      400,
      'invalid-argument',
    )
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: randomUUID(), productId: 'prod-cake', delta: -11, reason: 'Physical count' },
        { token },
      ),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
    expect((await adminDb.collection('stockAdjustments').get()).empty).toBe(true)
  })

  it('writes the live balance and immutable audit record together', async () => {
    const requestId = randomUUID()
    const response = await post(
      '/.netlify/functions/adjust-product-stock',
      {
        requestId,
        productId: 'prod-cake',
        delta: 4.5,
        reason: 'Physical count surplus',
      },
      { token: await tokenFor('storekeeper') },
    )
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({
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
    expect((await adminDb.doc(`stockAdjustments/${requestId}`).get()).data()).toMatchObject({
      productId: 'prod-cake',
      delta: 4.5,
      previousStockQty: 10,
      resultingStockQty: 14.5,
      reason: 'Physical count surplus',
      createdBy: 'storekeeper',
      source: 'manual',
    })
  })

  it('applies a retry once and rejects request-id reuse for another edit', async () => {
    const requestId = randomUUID()
    const token = await tokenFor('storekeeper')
    const payload = {
      requestId,
      productId: 'prod-cake',
      delta: 2,
      reason: 'Physical count',
    }

    const first = await post('/.netlify/functions/adjust-product-stock', payload, { token })
    const second = await post('/.netlify/functions/adjust-product-stock', payload, { token })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect((await json(second)).resultingStockQty).toBe((await json(first)).resultingStockQty)
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(12)
    expect((await adminDb.collection('stockAdjustments').get()).size).toBe(1)

    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        { ...payload, delta: 5 },
        { token },
      ),
      409,
      'already-exists',
    )
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(12)
  })

  it('serialises concurrent adjustments and leaves no record for a missing product', async () => {
    const token = await tokenFor('storekeeper')
    const results = await Promise.all([
      post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: randomUUID(), productId: 'prod-cake', delta: 2, reason: 'Purchase A' },
        { token },
      ),
      post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: randomUUID(), productId: 'prod-cake', delta: 3, reason: 'Purchase B' },
        { token },
      ),
    ])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(15)
    expect((await adminDb.collection('stockAdjustments').get()).size).toBe(2)

    const missingId = randomUUID()
    await expectFailure(
      await post(
        '/.netlify/functions/adjust-product-stock',
        { requestId: missingId, productId: 'prod-missing', delta: 1, reason: 'Count' },
        { token },
      ),
      404,
      'not-found',
    )
    expect((await adminDb.doc(`stockAdjustments/${missingId}`).get()).exists).toBe(false)
  })
})

describe('Netlify operations for production, inventory, delivery and finance', () => {
  it('creates production work from real order lines and prevents over-completion', async () => {
    const token = await tokenFor('cake')
    const sync = await post('/.netlify/functions/production-operation', {
      action: 'sync',
      outletId: 'o1',
    }, { token })
    expect(sync.status).toBe(200)
    expect((await json(sync)).created).toBe(2)

    const again = await post('/.netlify/functions/production-operation', {
      action: 'sync',
      outletId: 'o1',
    }, { token })
    const againBody = await json(again)
    expect(againBody.created).toBe(0)
    expect(againBody.total).toBe(2)

    const taskId = 'prod-order-order-cake-order-cake-line-1'
    expect((await adminDb.doc(`productionTasks/${taskId}`).get()).exists).toBe(true)

    const start = await post('/.netlify/functions/production-operation', {
      action: 'start',
      taskId,
    }, { token })
    expect(start.status).toBe(200)

    const progress = await post('/.netlify/functions/production-operation', {
      action: 'progress',
      taskId,
      completedDelta: 1,
      rejectedDelta: 0,
      reworkDelta: 0,
      note: 'First batch',
    }, { token })
    expect(progress.status).toBe(200)
    expect((await adminDb.doc(`productionTasks/${taskId}`).get()).data()?.status).toBe('completed')

    await expectFailure(
      await post('/.netlify/functions/production-operation', {
        action: 'progress',
        taskId,
        completedDelta: 1,
      }, { token }),
      412,
      'failed-precondition',
    )
    const events = await adminDb.collection('productionEvents').get()
    expect(events.docs.length).toBeGreaterThanOrEqual(2)
  })

  it('reconciles completed, cancelled and removed source tasks', async () => {
    const token = await tokenFor('cake')
    await post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token })

    const cakeTask = 'prod-order-order-cake-order-cake-line-1'
    const legacyTask = 'prod-order-order-legacy-legacy-line-1'
    expect((await adminDb.doc(`productionTasks/${cakeTask}`).get()).data()?.status).toBe('pending')
    expect((await adminDb.doc(`productionTasks/${legacyTask}`).get()).data()?.status).toBe('pending')

    await adminDb.doc('orders/order-legacy').update({ status: 'completed' })
    await post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token })
    expect((await adminDb.doc(`productionTasks/${legacyTask}`).get()).data()?.status).toBe('completed')

    await adminDb.doc('orders/order-cake').update({ status: 'cancelled' })
    await post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token })
    expect((await adminDb.doc(`productionTasks/${cakeTask}`).get()).data()?.status).toBe('cancelled')

    await adminDb.doc('orders/order-removed').set(orderPayload('order-removed'))
    await post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token })
    const removedTask = 'prod-order-order-removed-order-removed-line-1'
    expect((await adminDb.doc(`productionTasks/${removedTask}`).get()).data()?.status).toBe('pending')

    await adminDb.doc('orders/order-removed').update({ lines: [] })
    await post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token })
    expect((await adminDb.doc(`productionTasks/${removedTask}`).get()).data()?.status).toBe('cancelled')
  })

  it('syncs more than the old booking cap without silently dropping work', async () => {
    const batch = adminDb.batch()
    for (let index = 0; index < 301; index += 1) {
      const id = `page-${index}`
      batch.set(adminDb.doc(`bookings/${id}`), bookingPayload(id))
    }
    await batch.commit()

    const sync = await post('/.netlify/functions/production-operation', {
      action: 'sync',
      outletId: 'o1',
    }, { token: await tokenFor('cake') })
    expect(sync.status).toBe(200)
    expect((await json(sync)).total).toBeGreaterThanOrEqual(301)
    const tasks = await adminDb.collection('productionTasks').where('outletId', '==', 'o1').get()
    expect(tasks.docs.length).toBeGreaterThanOrEqual(301)
  })

  it('does not duplicate tasks or creation events under concurrent sync', async () => {
    const token = await tokenFor('cake')
    const results = await Promise.all([
      post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token }),
      post('/.netlify/functions/production-operation', { action: 'sync', outletId: 'o1' }, { token }),
    ])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    const tasks = await adminDb.collection('productionTasks').where('outletId', '==', 'o1').get()
    expect(tasks.docs).toHaveLength(2)
    const createdEvents = await adminDb.collection('productionEvents').where('action', '==', 'created').get()
    expect(createdEvents.docs).toHaveLength(2)
  })

  it('keeps inventory append-only, idempotent and transfer-atomic', async () => {
    const token = await tokenFor('manager')
    const itemA = randomUUID()
    const itemB = randomUUID()
    await post('/.netlify/functions/inventory-operation', {
      action: 'create_item',
      requestId: itemA,
      name: 'Flour',
      kind: 'raw_material',
      outletId: 'o1',
      departmentId: 'd1',
      unit: 'kg',
      openingQty: 10,
    }, { token })
    await post('/.netlify/functions/inventory-operation', {
      action: 'create_item',
      requestId: itemB,
      name: 'Flour',
      kind: 'raw_material',
      outletId: 'o1',
      departmentId: 'd2',
      unit: 'kg',
      openingQty: 2,
    }, { token })

    const duplicate = await post('/.netlify/functions/inventory-operation', {
      action: 'create_item',
      requestId: itemA,
      name: 'Flour',
      kind: 'raw_material',
      outletId: 'o1',
      departmentId: 'd1',
      unit: 'kg',
      openingQty: 10,
    }, { token })
    expect((await json(duplicate)).currentQty).toBe(10)
    expect((await adminDb.collection('inventoryMovements').get()).docs).toHaveLength(2)

    const requestId = randomUUID()
    const movement = await post('/.netlify/functions/inventory-operation', {
      action: 'movement',
      requestId,
      itemId: itemA,
      type: 'issue',
      quantity: -5,
      reason: 'Issued to cake production',
      occurredAt: NOW,
    }, { token })
    expect(movement.status).toBe(200)
    const retry = await post('/.netlify/functions/inventory-operation', {
      action: 'movement',
      requestId,
      itemId: itemA,
      type: 'issue',
      quantity: -5,
      reason: 'Issued to cake production',
      occurredAt: NOW,
    }, { token })
    expect((await json(retry)).currentQty).toBe(5)

    await expectFailure(
      await post('/.netlify/functions/inventory-operation', {
        action: 'movement',
        requestId: randomUUID(),
        itemId: itemA,
        type: 'wastage',
        quantity: -6,
        reason: 'Too much wastage',
        occurredAt: NOW,
      }, { token }),
      412,
      'failed-precondition',
    )

    const transfer = await post('/.netlify/functions/inventory-operation', {
      action: 'transfer',
      requestId: randomUUID(),
      fromItemId: itemA,
      toItemId: itemB,
      quantity: 4,
      reason: 'Move to sweets department',
      occurredAt: NOW,
    }, { token })
    expect(transfer.status).toBe(200)
    expect((await adminDb.doc(`inventoryItems/${itemA}`).get()).data()?.currentQty).toBe(1)
    expect((await adminDb.doc(`inventoryItems/${itemB}`).get()).data()?.currentQty).toBe(6)

    const count = await post('/.netlify/functions/inventory-operation', {
      action: 'count',
      requestId: randomUUID(),
      itemId: itemA,
      countedQty: 0.5,
      reason: 'Physical verification',
      countedAt: NOW,
    }, { token })
    expect((await json(count)).variance).toBe(-0.5)
    expect((await adminDb.doc(`inventoryItems/${itemA}`).get()).data()?.currentQty).toBe(0.5)
  })

  it('runs a delivery lifecycle and posts a delivery collection once', async () => {
    await adminDb.doc('orders/order-cake').update({ orderType: 'delivery', pickupAt: NOW })
    const token = await tokenFor('manager')
    const created = await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'order',
      sourceId: 'order-cake',
    }, { token })
    expect(created.status).toBe(200)
    const deliveryId = 'del-order-order-cake'
    expect((await json(created)).deliveryId).toBe(deliveryId)

    const duplicate = await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'order',
      sourceId: 'order-cake',
    }, { token })
    expect((await json(duplicate)).deliveryId).toBe(deliveryId)

    await expectFailure(
      await post('/.netlify/functions/delivery-operation', {
        action: 'dispatch',
        deliveryId,
      }, { token }),
      412,
      'failed-precondition',
    )
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'assign',
      deliveryId,
      assignedTo: 'manager',
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'dispatch',
      deliveryId,
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'complete',
      deliveryId,
      status: 'delivered',
      lines: [{ lineId: 'order-cake-line-1', deliveredQty: 1, returnedQty: 0, damagedQty: 0 }],
    }, { token })).status).toBe(200)

    await expectFailure(
      await post('/.netlify/functions/delivery-operation', {
        action: 'complete',
        deliveryId,
        status: 'delivered',
        lines: [{ lineId: 'order-cake-line-1', deliveredQty: 1, returnedQty: 0, damagedQty: 0 }],
      }, { token }),
      412,
      'failed-precondition',
    )

    const requestId = randomUUID()
    const collection = await post('/.netlify/functions/delivery-operation', {
      action: 'collect',
      deliveryId,
      requestId,
      amountPaise: 5000,
      mode: 'cash',
      reference: 'Door collection',
    }, { token })
    expect(collection.status).toBe(200)
    const receipt = (await json(collection)).receiptNumber
    const retry = await post('/.netlify/functions/delivery-operation', {
      action: 'collect',
      deliveryId,
      requestId,
      amountPaise: 5000,
      mode: 'cash',
      reference: 'Door collection',
    }, { token })
    expect((await json(retry)).receiptNumber).toBe(receipt)
    expect((await adminDb.collection('payments').get()).docs).toHaveLength(1)
    const order = (await adminDb.doc('orders/order-cake').get()).data()
    expect(order?.paidPaise).toBe(5000)
    expect(order?.balancePaise).toBe(5500)
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.collectedPaise).toBe(5000)
  })

  it('requires paymentsManage for delivery collections', async () => {
    await adminDb.doc('orders/order-cake').update({ orderType: 'delivery', pickupAt: NOW })
    const managerToken = await tokenFor('manager')
    await post('/.netlify/functions/delivery-operation', {
      action: 'create', sourceType: 'order', sourceId: 'order-cake',
    }, { token: managerToken })
    await post('/.netlify/functions/delivery-operation', {
      action: 'assign', deliveryId: 'del-order-order-cake', assignedTo: 'manager',
    }, { token: managerToken })
    await post('/.netlify/functions/delivery-operation', {
      action: 'dispatch', deliveryId: 'del-order-order-cake',
    }, { token: managerToken })
    await post('/.netlify/functions/delivery-operation', {
      action: 'complete',
      deliveryId: 'del-order-order-cake',
      status: 'delivered',
      lines: [{ lineId: 'order-cake-line-1', deliveredQty: 1, returnedQty: 0, damagedQty: 0 }],
    }, { token: managerToken })

    await expectFailure(
      await post('/.netlify/functions/delivery-operation', {
        action: 'collect',
        deliveryId: 'del-order-order-cake',
        requestId: randomUUID(),
        amountPaise: 5000,
        mode: 'cash',
      }, { token: await tokenFor('no-pay') }),
      403,
      'permission-denied',
    )
    expect((await adminDb.collection('payments').get()).docs).toHaveLength(0)
    expect((await adminDb.doc('orders/order-cake').get()).data()?.paidPaise).toBe(0)
    expect((await adminDb.doc('deliveries/del-order-order-cake').get()).data()?.collectedPaise).toBe(0)
  })

  it('marks returned and partial delivery outcomes as pending reconciliation without changing stock or paid totals', async () => {
    await adminDb.doc('orders/order-cake').update({ orderType: 'delivery', pickupAt: NOW })
    const token = await tokenFor('manager')
    await post('/.netlify/functions/delivery-operation', {
      action: 'create', sourceType: 'order', sourceId: 'order-cake',
    }, { token })
    await post('/.netlify/functions/delivery-operation', {
      action: 'assign', deliveryId: 'del-order-order-cake', assignedTo: 'manager',
    }, { token })
    await post('/.netlify/functions/delivery-operation', {
      action: 'dispatch', deliveryId: 'del-order-order-cake',
    }, { token })
    const complete = await post('/.netlify/functions/delivery-operation', {
      action: 'complete',
      deliveryId: 'del-order-order-cake',
      status: 'partially_delivered',
      lines: [{ lineId: 'order-cake-line-1', deliveredQty: 0.5, returnedQty: 0.5, damagedQty: 0 }],
      note: 'One half returned',
    }, { token })
    expect(complete.status).toBe(200)

    const delivery = (await adminDb.doc('deliveries/del-order-order-cake').get()).data()
    expect(delivery?.status).toBe('partially_delivered')
    expect(delivery?.reconciliationStatus).toBe('pending')
    expect(delivery?.reconciliationNote).toContain('No stock or paid totals were changed')
    expect((await adminDb.doc('products/prod-cake').get()).data()?.stockQty).toBe(10)
    expect((await adminDb.doc('orders/order-cake').get()).data()?.paidPaise).toBe(0)
    expect((await adminDb.collection('payments').get()).docs).toHaveLength(0)
  })

  it('records idempotent expenses, voids with a reason and closes cash with variance', async () => {
    const token = await tokenFor('finance')
    const expenseId = randomUUID()
    const payload = {
      action: 'expense_create',
      requestId: expenseId,
      outletId: 'o1',
      head: 'utilities',
      amountPaise: 125000,
      paidAt: NOW,
      mode: 'cash',
      reference: 'Electricity bill',
      notes: 'October',
    }
    const first = await post('/.netlify/functions/finance-operation', payload, { token })
    expect(first.status).toBe(200)
    const second = await post('/.netlify/functions/finance-operation', payload, { token })
    expect((await json(second)).expenseId).toBe(expenseId)
    expect((await adminDb.collection('expenses').get()).docs).toHaveLength(1)

    expect((await post('/.netlify/functions/finance-operation', {
      action: 'expense_void',
      expenseId,
      reason: 'Entered against the wrong outlet',
    }, { token })).status).toBe(200)
    expect((await adminDb.doc(`expenses/${expenseId}`).get()).data()?.status).toBe('void')

    const sessionId = randomUUID()
    expect((await post('/.netlify/functions/finance-operation', {
      action: 'cash_open',
      requestId: sessionId,
      outletId: 'o1',
      openingFloatPaise: 100000,
      notes: 'Morning shift',
    }, { token })).status).toBe(200)
    await adminDb.doc('payments/cash-drawer').set({
      id: 'cash-drawer',
      receiptNumber: 'RCPT-CASH-1',
      outletId: 'o1',
      departmentIds: ['d1'],
      orderId: 'order-cake',
      customerName: 'Test Customer',
      amountPaise: 5000,
      type: 'payment',
      mode: 'cash',
      receivedAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'finance',
    })
    await expectFailure(
      await post('/.netlify/functions/finance-operation', {
        action: 'cash_open',
        requestId: randomUUID(),
        outletId: 'o1',
        openingFloatPaise: 100000,
      }, { token }),
      412,
      'failed-precondition',
    )
    const close = await post('/.netlify/functions/finance-operation', {
      action: 'cash_close',
      sessionId,
      countedCashPaise: 90000,
      handedOverTo: 'Manager',
      notes: 'Short by 100',
    }, { token })
    expect(close.status).toBe(200)
    const closeBody = await json(close)
    expect(closeBody.expectedCashPaise).toBe(105000)
    expect(closeBody.variancePaise).toBe(-15000)
    expect((await adminDb.doc(`cashSessions/${sessionId}`).get()).data()?.status).toBe('closed')
  })

  it('allows only one concurrent cash session open for the same opener and outlet', async () => {
    const token = await tokenFor('finance')
    const first = randomUUID()
    const second = randomUUID()
    const results = await Promise.all([
      post('/.netlify/functions/finance-operation', {
        action: 'cash_open',
        requestId: first,
        outletId: 'o1',
        openingFloatPaise: 100000,
      }, { token }),
      post('/.netlify/functions/finance-operation', {
        action: 'cash_open',
        requestId: second,
        outletId: 'o1',
        openingFloatPaise: 100000,
      }, { token }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([200, 412])

    const open = await adminDb.collection('cashSessions')
      .where('outletId', '==', 'o1')
      .where('openedBy', '==', 'finance')
      .where('status', '==', 'open')
      .get()
    expect(open.docs).toHaveLength(1)
    const lock = (await adminDb.doc('cashSessionLocks/o1__finance').get()).data()
    expect(lock?.status).toBe('open')
    expect(lock?.sessionId).toBe(open.docs[0].id)
  })

  it('returns a minimal staff directory without permissions or email', async () => {
    const response = await post('/.netlify/functions/staff-directory', {
      outletId: 'o1',
      departmentId: 'd1',
    }, { token: await tokenFor('manager') })
    expect(response.status).toBe(200)
    const entries = (await json(response)) as unknown as Array<Record<string, unknown>>
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(['departmentIds', 'displayName', 'role', 'uid'])
    }
    await expectFailure(
      await post('/.netlify/functions/staff-directory', { outletId: 'o2' }, {
        token: await tokenFor('cake'),
      }),
      403,
      'permission-denied',
    )
  })

  it('records booking payments through the trusted booking transaction', async () => {
    await adminDb.doc('bookings/booking-pay').set({
      id: 'booking-pay',
      bookingNumber: 'BKG-PAY',
      outletId: 'o1',
      departmentIds: ['d1'],
      customerId: 'c1',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      eventType: 'birthday',
      eventDate: '2026-12-01',
      eventTime: '18:00',
      bookingDate: NOW,
      fulfillment: 'pickup',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      lines: [{
        id: 'bl-1', productId: 'prod-cake', name: 'Product prod-cake', printName: 'PRODUCT',
        departmentId: 'd1', pricingMode: 'fixed', quantity: 1, unit: 'piece',
        unitPricePaise: 10000, discountPercent: 0, taxPercent: 0, notes: '',
      }],
      subtotalPaise: 10000,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: 10000,
      paidPaise: 0,
      balancePaise: 10000,
      pricesIncludeTax: false,
      preparationStatus: 'pending',
      packingStatus: 'pending',
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'manager',
      updatedBy: 'manager',
    })
    const requestId = randomUUID()
    const token = await tokenFor('finance')
    const payload = {
      requestId,
      bookingId: 'booking-pay',
      amountPaise: 4000,
      type: 'payment',
      mode: 'upi',
      reference: 'UPI-1',
      receivedAt: NOW,
      notes: '',
    }
    const first = await post('/.netlify/functions/record-booking-payment', payload, { token })
    expect(first.status).toBe(200)
    const receipt = (await json(first)).receiptNumber
    const second = await post('/.netlify/functions/record-booking-payment', payload, { token })
    expect((await json(second)).receiptNumber).toBe(receipt)
    const booking = (await adminDb.doc('bookings/booking-pay').get()).data()
    expect(booking?.paidPaise).toBe(4000)
    expect(booking?.balancePaise).toBe(6000)
    expect(booking?.paymentStatus).toBe('partial')
    expect((await adminDb.collection('payments').get()).docs).toHaveLength(1)
  })
})

describe('Trusted booking creation and edits', () => {
  it('creates a booking with a server-priced advance and edits it with revision history', async () => {
    await adminDb.doc('customers/c-booking').set({
      id: 'c-booking',
      name: 'Party Customer',
      phone: '9876543210',
      outletIds: ['o1'],
      active: true,
      accountGroup: 'retail',
      addresses: [],
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'manager',
      updatedBy: 'manager',
    })
    const requestId = randomUUID()
    const token = await tokenFor('manager')
    const values = {
      outletId: 'o1',
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-01',
      eventTime: '18:00',
      fulfillment: 'pickup',
      departmentIds: ['d1'],
      instructions: 'Call before delivery',
      lines: [{ productId: 'prod-cake', quantity: 2, unitPrice: 100, discountPercent: 0, notes: '' }],
      discountType: 'none',
      discountValue: 0,
      advanceAmount: 50,
      paymentMode: 'cash',
      paymentReference: 'Advance',
    }
    const created = await post('/.netlify/functions/create-booking', { requestId, values }, { token })
    expect(created.status).toBe(200)
    const createdBody = await json(created)
    expect(createdBody.id).toBe(requestId)
    const booking = (await adminDb.doc(`bookings/${requestId}`).get()).data()
    expect(booking).toMatchObject({
      totalPaise: 21000,
      paidPaise: 5000,
      balancePaise: 16000,
      paymentStatus: 'partial',
      revision: 1,
      createdBy: 'manager',
    })
    expect((await adminDb.doc(`payments/advance-${requestId}`).get()).exists).toBe(true)

    const retry = await post('/.netlify/functions/create-booking', { requestId, values }, { token })
    expect((await json(retry)).bookingNumber).toBe(createdBody.bookingNumber)
    expect((await adminDb.collection('payments').get()).docs).toHaveLength(1)
    await expectFailure(
      await post('/.netlify/functions/create-booking', {
        requestId: randomUUID(),
        values: { ...values, outletId: 'o2' },
      }, { token }),
      403,
      'permission-denied',
    )

    const edit = {
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-02',
      eventTime: '19:00',
      fulfillment: 'pickup',
      departmentIds: ['d1'],
      instructions: 'Updated timing',
      lines: [{
        id: `${requestId}-line-1`, productId: 'prod-cake', quantity: 3,
        unitPrice: 100, discountPercent: 0, notes: '',
      }],
      discountType: 'none',
      discountValue: 0,
      editReason: 'Guest count increased',
    }
    const updated = await post('/.netlify/functions/update-booking', {
      bookingId: requestId,
      expectedRevision: 1,
      values: edit,
    }, { token })
    expect(updated.status).toBe(200)
    const updatedBody = await json(updated)
    expect(updatedBody).toMatchObject({ revision: 2, totalPaise: 31500, balancePaise: 26500 })
    const live = (await adminDb.doc(`bookings/${requestId}`).get()).data()
    expect(live).toMatchObject({
      totalPaise: 31500,
      paidPaise: 5000,
      balancePaise: 26500,
      revision: 2,
      lastEditReason: 'Guest count increased',
      updatedBy: 'manager',
    })
    expect((await adminDb.doc(`bookingRevisions/${requestId}-r2`).get()).data()).toMatchObject({
      beforeTotalPaise: 21000,
      afterTotalPaise: 31500,
      paidPaise: 5000,
      createdBy: 'manager',
    })

    await expectFailure(
      await post('/.netlify/functions/update-booking', {
        bookingId: requestId,
        expectedRevision: 1,
        values: edit,
      }, { token }),
      412,
      'failed-precondition',
    )
    await expectFailure(
      await post('/.netlify/functions/update-booking', {
        bookingId: requestId,
        expectedRevision: 2,
        values: {
          ...edit,
          lines: [{
            id: `${requestId}-line-1`, productId: 'prod-cake', quantity: 3,
            unitPrice: 10, discountPercent: 0, notes: '',
          }],
        },
      }, { token }),
      412,
      'failed-precondition',
    )
  })

  it('allows booking edits until dispatch and blocks them once the delivery is dispatched', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-dispatch'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')

    const created = await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })
    expect(created.status).toBe(200)

    const edit = {
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-02',
      eventTime: '19:00',
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
      departmentIds: ['d1'],
      instructions: 'Updated before dispatch',
      lines: [{
        id: 'booking-dispatch-line-1', productId: 'prod-cake', quantity: 1,
        unitPrice: 110, discountPercent: 0, notes: '',
      }],
      discountType: 'none',
      discountValue: 0,
      editReason: '',
    }

    const pendingEdit = await post('/.netlify/functions/update-booking', {
      bookingId,
      expectedRevision: 1,
      values: edit,
    }, { token })
    expect(pendingEdit.status).toBe(200)
    expect((await json(pendingEdit)).revision).toBe(2)

    const deliveryId = `del-booking-${bookingId}`
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'assign',
      deliveryId,
      assignedTo: 'manager',
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'dispatch',
      deliveryId,
    }, { token })).status).toBe(200)

    await expectFailure(
      await post('/.netlify/functions/update-booking', {
        bookingId,
        expectedRevision: 2,
        values: { ...edit, instructions: 'Dispatch already happened' },
      }, { token }),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc(`bookings/${bookingId}`).get()).data()?.revision).toBe(2)
    expect((await adminDb.collection('bookingRevisions').get()).docs).toHaveLength(1)
  })

  it('keeps a dispatchable delivery in step with an edited booking', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-sync'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')

    const created = await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })
    expect(created.status).toBe(200)
    const deliveryId = `del-booking-${bookingId}`
    const before = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(before?.lines[0].expectedQty).toBe(1)
    expect(before?.address).toBe('12 Main Road')

    const edit = {
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-03',
      eventTime: '19:30',
      fulfillment: 'delivery',
      deliveryAddress: '45 Park Lane',
      departmentIds: ['d1'],
      instructions: 'Three boxes, call on arrival',
      lines: [{
        id: `${bookingId}-line-1`, productId: 'prod-cake', quantity: 3,
        unitPrice: 110, discountPercent: 0, notes: '',
      }],
      discountType: 'none',
      discountValue: 0,
      editReason: 'Customer changed the load',
    }

    const edited = await post('/.netlify/functions/update-booking', {
      bookingId,
      expectedRevision: 1,
      values: edit,
    }, { token })
    expect(edited.status).toBe(200)

    const delivery = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(delivery?.lines).toHaveLength(1)
    expect(delivery?.lines[0].expectedQty).toBe(3)
    expect(delivery?.address).toBe('45 Park Lane')
    expect(delivery?.notes).toBe('Three boxes, call on arrival')
    expect(delivery?.scheduledAt).toBe(new Date('2026-12-03T19:30:00').toISOString())
    expect(delivery?.status).toBe('pending')

    const events = await adminDb.collection('deliveryEvents')
      .where('deliveryId', '==', deliveryId)
      .where('action', '==', 'source_updated')
      .get()
    expect(events.docs).toHaveLength(1)

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'assign',
      deliveryId,
      assignedTo: 'manager',
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'dispatch',
      deliveryId,
    }, { token })).status).toBe(200)
  })

  it('refuses to dispatch a delivery that no longer matches its booking', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-stale'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')
    const deliveryId = `del-booking-${bookingId}`

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'assign',
      deliveryId,
      assignedTo: 'manager',
    }, { token })).status).toBe(200)

    // A change that did not come through the trusted booking edit, for example
    // the direct fulfilment and address write the rules still allow.
    await adminDb.doc(`bookings/${bookingId}`).update({ deliveryAddress: '99 Somewhere Else' })

    await expectFailure(
      await post('/.netlify/functions/delivery-operation', {
        action: 'dispatch',
        deliveryId,
      }, { token }),
      412,
      'failed-precondition',
    )
    const delivery = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(delivery?.status).toBe('assigned')
    expect(delivery?.dispatchedAt).toBeUndefined()
  })

  it('still allows a failed delivery to be closed after the source booking is cancelled', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-cancelled-source'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')
    const deliveryId = `del-booking-${bookingId}`

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })).status).toBe(200)
    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'assign',
      deliveryId,
      assignedTo: 'manager',
    }, { token })).status).toBe(200)

    // The customer cancelled the booking before the load left.
    await adminDb.doc(`bookings/${bookingId}`).update({
      status: 'cancelled',
      cancelledAt: NOW,
      cancellationReason: 'Customer cancelled',
    })

    await expectFailure(
      await post('/.netlify/functions/delivery-operation', {
        action: 'dispatch',
        deliveryId,
      }, { token }),
      412,
      'failed-precondition',
    )

    const closed = await post('/.netlify/functions/delivery-operation', {
      action: 'complete',
      deliveryId,
      status: 'failed',
      lines: [{ lineId: `${bookingId}-line-1`, deliveredQty: 0, returnedQty: 1, damagedQty: 0 }],
      note: 'Booking cancelled, goods returned to the counter',
    }, { token })
    expect(closed.status).toBe(200)
    const delivery = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(delivery?.status).toBe('failed')
    expect(delivery?.reconciliationStatus).toBe('pending')
  })

  it('refuses to switch a booking to pickup while a delivery exists', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-fulfilment'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')
    const deliveryId = `del-booking-${bookingId}`

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })).status).toBe(200)

    await expectFailure(
      await post('/.netlify/functions/update-booking', {
        bookingId,
        expectedRevision: 1,
        values: {
          customerId: 'c-booking',
          eventType: 'birthday',
          eventDate: '2026-12-01',
          eventTime: '18:00',
          fulfillment: 'pickup',
          deliveryAddress: '',
          departmentIds: ['d1'],
          instructions: '',
          lines: [{
            id: `${bookingId}-line-1`, productId: 'prod-cake', quantity: 1,
            unitPrice: 100, discountPercent: 0, notes: '',
          }],
          discountType: 'none',
          discountValue: 0,
          editReason: '',
        },
      }, { token }),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc(`bookings/${bookingId}`).get()).data()?.fulfillment).toBe('delivery')
    expect((await adminDb.doc(`bookings/${bookingId}`).get()).data()?.revision).toBe(1)
    expect((await adminDb.collection('bookingRevisions').get()).docs).toHaveLength(0)
    const delivery = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(delivery?.status).toBe('pending')
    expect(delivery?.lines[0].expectedQty).toBe(1)
  })

  it('records a fulfilment change through the trusted operation and keeps a dispatchable delivery in step', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-fulfilment-op'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')
    const deliveryId = `del-booking-${bookingId}`

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })).status).toBe(200)

    const response = await post('/.netlify/functions/update-booking-fulfilment', {
      bookingId,
      fulfillment: 'delivery',
      deliveryAddress: '45 Park Lane',
    }, { token })
    expect(response.status).toBe(200)
    expect((await json(response)).deliveryAddress).toBe('45 Park Lane')

    const booking = (await adminDb.doc(`bookings/${bookingId}`).get()).data()
    expect(booking?.fulfillment).toBe('delivery')
    expect(booking?.deliveryAddress).toBe('45 Park Lane')
    // An operational change: no repricing, no revision, no paid money moved.
    expect(booking?.revision).toBe(1)
    expect(booking?.totalPaise).toBe(10000)
    expect(booking?.paidPaise).toBe(0)

    const delivery = (await adminDb.doc(`deliveries/${deliveryId}`).get()).data()
    expect(delivery?.address).toBe('45 Park Lane')

    const events = await adminDb.collection('deliveryEvents')
      .where('deliveryId', '==', deliveryId)
      .where('action', '==', 'source_updated')
      .get()
    expect(events.docs).toHaveLength(1)
  })

  it('refuses a delivery fulfilment without an address and a pickup switch while a delivery exists', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-fulfilment-guard'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))
    const token = await tokenFor('manager')

    await expectFailure(
      await post('/.netlify/functions/update-booking-fulfilment', {
        bookingId,
        fulfillment: 'delivery',
        deliveryAddress: '   ',
      }, { token }),
      400,
      'invalid-argument',
    )

    expect((await post('/.netlify/functions/delivery-operation', {
      action: 'create',
      sourceType: 'booking',
      sourceId: bookingId,
    }, { token })).status).toBe(200)

    await expectFailure(
      await post('/.netlify/functions/update-booking-fulfilment', {
        bookingId,
        fulfillment: 'pickup',
      }, { token }),
      412,
      'failed-precondition',
    )
    expect((await adminDb.doc(`bookings/${bookingId}`).get()).data()?.fulfillment).toBe('delivery')
  })

  it('denies the fulfilment operation without the permission or the department scope', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const bookingId = 'booking-fulfilment-scope'
    await adminDb.doc(`bookings/${bookingId}`).set(bookingPayload(bookingId, {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
    }))

    await expectFailure(
      await post('/.netlify/functions/update-booking-fulfilment', {
        bookingId,
        fulfillment: 'delivery',
        deliveryAddress: '45 Park Lane',
      }, { token: await tokenFor('finance') }),
      403,
      'permission-denied',
    )

    await adminDb.doc(`bookings/${bookingId}`).update({ departmentIds: ['d2'] })
    await expectFailure(
      await post('/.netlify/functions/update-booking-fulfilment', {
        bookingId,
        fulfillment: 'delivery',
        deliveryAddress: '45 Park Lane',
      }, { token: await tokenFor('cake') }),
      403,
      'permission-denied',
    )
    expect((await adminDb.doc(`bookings/${bookingId}`).get()).data()?.deliveryAddress).toBe('12 Main Road')
  })

  it('rejects a booking advance that would overwrite an existing payment id', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    const requestId = randomUUID()
    await adminDb.doc(`payments/advance-${requestId}`).set({
      id: `advance-${requestId}`,
      receiptNumber: 'RCPT-EXISTING',
      outletId: 'o1',
      departmentIds: ['d1'],
      orderId: 'order-cake',
      customerName: 'Existing Customer',
      amountPaise: 7777,
      type: 'payment',
      mode: 'cash',
      receivedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'manager',
    })
    const token = await tokenFor('manager')
    const values = {
      outletId: 'o1',
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-01',
      eventTime: '18:00',
      fulfillment: 'pickup',
      departmentIds: ['d1'],
      instructions: '',
      lines: [{ productId: 'prod-cake', quantity: 1, unitPrice: 100, discountPercent: 0, notes: '' }],
      discountType: 'none',
      discountValue: 0,
      advanceAmount: 10,
      paymentMode: 'cash',
      paymentReference: '',
    }

    await expectFailure(
      await post('/.netlify/functions/create-booking', { requestId, values }, { token }),
      409,
      'already-exists',
    )
    expect((await adminDb.doc(`bookings/${requestId}`).get()).exists).toBe(false)
    const payment = (await adminDb.doc(`payments/advance-${requestId}`).get()).data()
    expect(payment?.amountPaise).toBe(7777)
    expect(payment?.orderId).toBe('order-cake')
    expect((await adminDb.collection('bookingRevisions').get()).docs).toHaveLength(0)
  })

  it('rejects mixed-department booking edits for a department-scoped actor', async () => {
    await adminDb.doc('customers/c-booking').set(customerPayload())
    await adminDb.doc('bookings/booking-mixed').set(bookingPayload('booking-mixed', {
      departmentIds: ['d1', 'd2'],
      subtotalPaise: 20000,
      totalPaise: 20000,
      balancePaise: 20000,
      lines: [
        {
          id: 'mix-cake', productId: 'prod-cake', name: 'Cake', printName: 'CAKE',
          departmentId: 'd1', pricingMode: 'fixed', quantity: 1, unit: 'piece',
          unitPricePaise: 10000, discountPercent: 0, taxPercent: 0, notes: '',
        },
        {
          id: 'mix-sweets', productId: 'prod-sweets', name: 'Sweets', printName: 'SWEETS',
          departmentId: 'd2', pricingMode: 'fixed', quantity: 1, unit: 'piece',
          unitPricePaise: 10000, discountPercent: 0, taxPercent: 0, notes: '',
        },
      ],
    }))
    const edit = {
      customerId: 'c-booking',
      eventType: 'birthday',
      eventDate: '2026-12-01',
      eventTime: '18:00',
      fulfillment: 'pickup',
      departmentIds: ['d1', 'd2'],
      instructions: '',
      lines: [
        { id: 'mix-cake', productId: 'prod-cake', quantity: 1, unitPrice: 100, discountPercent: 0, notes: '' },
        { id: 'mix-sweets', productId: 'prod-sweets', quantity: 1, unitPrice: 100, discountPercent: 0, notes: '' },
      ],
      discountType: 'none',
      discountValue: 0,
    }

    await expectFailure(
      await post('/.netlify/functions/update-booking', {
        bookingId: 'booking-mixed',
        expectedRevision: 1,
        values: edit,
      }, { token: await tokenFor('cake') }),
      403,
      'permission-denied',
    )
    expect((await adminDb.doc('bookings/booking-mixed').get()).data()?.revision).toBe(1)
    expect((await adminDb.collection('bookingRevisions').get()).docs).toHaveLength(0)

    const managerEdit = await post('/.netlify/functions/update-booking', {
      bookingId: 'booking-mixed',
      expectedRevision: 1,
      values: edit,
    }, { token: await tokenFor('manager') })
    expect(managerEdit.status).toBe(200)
    expect((await json(managerEdit)).revision).toBe(2)
    expect((await adminDb.doc('bookingRevisions/booking-mixed-r2').get()).exists).toBe(true)
  })
})

describe('Netlify endpoint request hardening', () => {
  it('rejects unsupported methods, media types, invalid JSON and oversized bodies', async () => {
    const token = await tokenFor('manager')
    const getResponse = await fetch(`${baseUrl}/.netlify/functions/create-order`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    await expectFailure(getResponse, 405, 'method-not-allowed')

    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        {},
        { token, contentType: 'text/plain' },
      ),
      415,
      'unsupported-media-type',
    )

    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        undefined,
        { token, rawBody: '{' },
      ),
      400,
      'invalid-argument',
    )

    await expectFailure(
      await post(
        '/.netlify/functions/create-order',
        undefined,
        { token, rawBody: JSON.stringify({ padding: 'x'.repeat(300 * 1024) }) },
      ),
      413,
      'payload-too-large',
    )
  })

  it('allows only configured application origins for CORS', async () => {
    const allowed = await fetch(`${baseUrl}/.netlify/functions/create-order`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)

    const denied = await fetch(`${baseUrl}/.netlify/functions/create-order`, {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await tokenFor('manager')}`,
      },
      body: JSON.stringify({ requestId: randomUUID(), values: orderValues('prod-cake') }),
    })
    await expectFailure(denied, 403, 'permission-denied')
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not expose stack traces or internal paths in failures', async () => {
    const response = await post(
      '/.netlify/functions/create-order',
      { requestId: randomUUID(), values: { invalid: true } },
      { token: await tokenFor('manager') },
    )
    const payload = await json(response)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toMatch(/node_modules|firestore|stack|functions\/src/i)
    expect(serialized).not.toMatch(/BEGIN PRIVATE KEY|service-account|FIREBASE_/i)
  })
})
