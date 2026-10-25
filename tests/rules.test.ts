import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { defaultPermissionsForRole, ALL_PERMISSIONS } from '@/auth/permissions'
import type { Department, UserProfile } from '@/types/models'

let testEnv: RulesTestEnvironment

const now = '2026-10-01T10:00:00.000Z'

function user(uid: string, role: UserProfile['role'], overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid,
    displayName: uid,
    email: `${uid}@example.com`,
    role,
    permissions: role === 'super_admin' ? { ...ALL_PERMISSIONS } : defaultPermissionsForRole(role),
    outletIds: ['o1'],
    departmentIds: [],
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const departments: Record<string, Department> = {
  d1: {
    id: 'd1',
    code: 'cake',
    name: 'Cake',
    outletIds: ['o1', 'o2'],
    color: '#C8102E',
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  d2: {
    id: 'd2',
    code: 'sweets',
    name: 'Sweets',
    outletIds: ['o1', 'o2'],
    color: '#C8922C',
    active: true,
    createdAt: now,
    updatedAt: now,
  },
}

function orderPayload(id: string, outletId: string, departmentId: string, createdBy: string) {
  return {
    id,
    orderNumber: `ORD-${id}`,
    outletId,
    departmentId,
    customerName: 'Test Customer',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    lines: [{ id: 'line-1', productId: 'p1', name: 'Item', quantity: 1, unitPricePaise: 10000 }],
    subtotalPaise: 10000,
    discountPaise: 0,
    taxPaise: 500,
    totalPaise: 10500,
    paidPaise: 0,
    balancePaise: 10500,
    pricesIncludeTax: false,
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  }
}

function bookingPayload(id: string, departmentIds: string[], createdBy: string) {
  return {
    id,
    bookingNumber: `BKG-${id}`,
    outletId: 'o1',
    departmentIds,
    customerId: 'c1',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    eventType: 'wedding',
    eventDate: '2026-12-01',
    eventTime: '18:00',
    bookingDate: now,
    fulfillment: 'pickup',
    status: 'enquiry',
    paymentStatus: 'unpaid',
    lines: [{ id: 'line-1', productId: 'p1', name: 'Item', quantity: 1, unitPricePaise: 10000 }],
    subtotalPaise: 10000,
    discountPaise: 0,
    taxPaise: 500,
    totalPaise: 10500,
    paidPaise: 0,
    balancePaise: 10500,
    pricesIncludeTax: false,
    preparationStatus: 'pending',
    packingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  }
}

function paymentPayload(id: string, departmentIds: string[], createdBy: string) {
  return {
    id,
    receiptNumber: `RCPT-${id}`,
    outletId: 'o1',
    departmentIds,
    bookingId: 'booking-cake',
    customerName: 'Test Customer',
    amountPaise: 5000,
    type: 'payment',
    mode: 'cash',
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vishal-prem-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, 'business', 'main'), { id: 'main', name: 'Vishal Prem' })
    batch.set(doc(db, 'outlets', 'o1'), { id: 'o1', code: 'VP1', name: 'Outlet 1', active: true })
    batch.set(doc(db, 'outlets', 'o2'), { id: 'o2', code: 'VP2', name: 'Outlet 2', active: true })
    for (const department of Object.values(departments)) {
      batch.set(doc(db, 'departments', department.id), department)
    }

    batch.set(doc(db, 'users', 'super'), user('super', 'super_admin', { outletIds: ['o1', 'o2'] }))
    // Legacy profile shape: no canonical `permissions` map, only top-level flags.
    batch.set(doc(db, 'users', 'legacy-super'), {
      uid: 'legacy-super',
      displayName: 'Legacy Super',
      email: 'legacy-super@example.com',
      role: 'super_admin',
      outletIds: [''],
      departmentIds: [''],
      active: true,
      createdAt: now,
      updatedAt: now,
      dashboardView: true,
      labelsView: true,
      labelsManage: true,
      labelsReconcile: true,
    })
    batch.set(doc(db, 'users', 'cake'), user('cake', 'cake_admin', { departmentIds: ['d1'] }))
    batch.set(doc(db, 'users', 'manager'), user('manager', 'manager', { departmentIds: [] }))
    batch.set(doc(db, 'users', 'finance'), user('finance', 'accountant', { departmentIds: [] }))
    batch.set(doc(db, 'users', 'inactive'), user('inactive', 'cake_admin', { departmentIds: ['d1'], active: false }))

    batch.set(doc(db, 'orders', 'order-cake'), orderPayload('order-cake', 'o1', 'd1', 'cake'))
    batch.set(doc(db, 'orders', 'order-sweets'), orderPayload('order-sweets', 'o1', 'd2', 'manager'))
    batch.set(doc(db, 'orders', 'order-o2'), orderPayload('order-o2', 'o2', 'd1', 'super'))
    batch.set(doc(db, 'bookings', 'booking-cake'), bookingPayload('booking-cake', ['d1'], 'cake'))
    batch.set(doc(db, 'bookings', 'booking-sweets'), bookingPayload('booking-sweets', ['d2'], 'manager'))
    batch.set(doc(db, 'payments', 'payment-cake'), paymentPayload('payment-cake', ['d1'], 'cake'))
    batch.set(doc(db, 'payments', 'payment-sweets'), paymentPayload('payment-sweets', ['d2'], 'manager'))
    batch.set(doc(db, 'products', 'p1'), {
      id: 'p1',
      name: 'Cake',
      printName: 'CAKE',
      departmentId: 'd1',
      outletIds: ['o1'],
      active: true,
      available: true,
    })
    batch.set(doc(db, 'products', 'p2'), {
      id: 'p2',
      name: 'Barfi',
      printName: 'BARFI',
      departmentId: 'd2',
      outletIds: ['o1'],
      active: true,
      available: true,
    })
    batch.set(doc(db, 'customers', 'c1'), {
      id: 'c1',
      name: 'Test Customer',
      outletIds: ['o1'],
      active: true,
    })

    batch.set(doc(db, 'bookingRevisions', 'booking-cake-r1'), {
      id: 'booking-cake-r1',
      bookingId: 'booking-cake',
      outletId: 'o1',
      departmentIds: ['d1'],
      revision: 1,
      beforeTotalPaise: 10000,
      afterTotalPaise: 10500,
      paidPaise: 0,
    })
    batch.set(doc(db, 'productionTasks', 'task-cake'), {
      id: 'task-cake',
      outletId: 'o1',
      departmentId: 'd1',
      productName: 'Cake',
      status: 'pending',
    })
    batch.set(doc(db, 'productionTasks', 'task-sweets'), {
      id: 'task-sweets',
      outletId: 'o1',
      departmentId: 'd2',
      productName: 'Barfi',
      status: 'pending',
    })
    batch.set(doc(db, 'productionEvents', 'event-cake'), {
      id: 'event-cake',
      taskId: 'task-cake',
      outletId: 'o1',
      departmentId: 'd1',
      action: 'created',
    })
    batch.set(doc(db, 'inventoryItems', 'item-cake'), {
      id: 'item-cake',
      outletId: 'o1',
      departmentId: 'd1',
      name: 'Flour',
      currentQty: 10,
    })
    batch.set(doc(db, 'inventoryItems', 'item-sweets'), {
      id: 'item-sweets',
      outletId: 'o1',
      departmentId: 'd2',
      name: 'Sugar',
      currentQty: 10,
    })
    batch.set(doc(db, 'inventoryMovements', 'movement-cake'), {
      id: 'movement-cake',
      outletId: 'o1',
      departmentId: 'd1',
      itemId: 'item-cake',
      quantity: 10,
    })
    batch.set(doc(db, 'inventoryCounts', 'count-cake'), {
      id: 'count-cake',
      outletId: 'o1',
      departmentId: 'd1',
      itemId: 'item-cake',
      countedQty: 10,
    })
    batch.set(doc(db, 'deliveries', 'delivery-cake'), {
      id: 'delivery-cake',
      outletId: 'o1',
      departmentIds: ['d1'],
      deliveryNumber: 'DEL-1',
      status: 'pending',
    })
    batch.set(doc(db, 'deliveries', 'delivery-sweets'), {
      id: 'delivery-sweets',
      outletId: 'o1',
      departmentIds: ['d2'],
      deliveryNumber: 'DEL-2',
      status: 'pending',
    })
    batch.set(doc(db, 'deliveryEvents', 'delivery-event-cake'), {
      id: 'delivery-event-cake',
      deliveryId: 'delivery-cake',
      outletId: 'o1',
      departmentIds: ['d1'],
      action: 'created',
    })
    batch.set(doc(db, 'expenses', 'expense-1'), {
      id: 'expense-1',
      outletId: 'o1',
      expenseNumber: 'EXP-1',
      amountPaise: 5000,
      status: 'posted',
    })
    batch.set(doc(db, 'cashSessions', 'session-1'), {
      id: 'session-1',
      outletId: 'o1',
      sessionNumber: 'CASH-1',
      status: 'open',
    })
    batch.set(doc(db, 'labelPrintJobs', 'job-cake'), {
      id: 'job-cake',
      jobNumber: 'LBL-1',
      jobType: 'item',
      outletId: 'o1',
      departmentId: 'd1',
      status: 'printed',
      reconciliationStatus: 'open',
    })
    batch.set(doc(db, 'labelPrintJobs', 'job-sweets'), {
      id: 'job-sweets',
      jobNumber: 'LBL-2',
      jobType: 'item',
      outletId: 'o1',
      departmentId: 'd2',
      status: 'printed',
      reconciliationStatus: 'open',
    })
    batch.set(doc(db, 'labelPrintJobs', 'job-account'), {
      id: 'job-account',
      jobNumber: 'LBL-3',
      jobType: 'account',
      outletId: 'o1',
      departmentId: '',
      status: 'printed',
      reconciliationStatus: 'open',
    })
    batch.set(doc(db, 'labelEvents', 'label-event-cake'), {
      id: 'label-event-cake',
      jobId: 'job-cake',
      outletId: 'o1',
      departmentId: 'd1',
      kind: 'confirmed',
    })
    batch.set(doc(db, 'purchases', 'purchase-cake'), {
      id: 'purchase-cake',
      purchaseNumber: 'PUR-1',
      outletId: 'o1',
      departmentId: 'd1',
      status: 'posted',
    })
    batch.set(doc(db, 'purchases', 'purchase-sweets'), {
      id: 'purchase-sweets',
      purchaseNumber: 'PUR-2',
      outletId: 'o1',
      departmentId: 'd2',
      status: 'posted',
    })
    batch.set(doc(db, 'supplierPayments', 'supplier-payment-1'), {
      id: 'supplier-payment-1',
      paymentNumber: 'SPAY-1',
      outletId: 'o1',
      supplierId: 's1',
      amountPaise: 1000,
      status: 'posted',
    })
    await batch.commit()
  })
})

function firestoreFor(uid: string, email = `${uid}@example.com`) {
  return testEnv.authenticatedContext(uid, { email }).firestore()
}

describe('default deny and profile checks', () => {
  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'business', 'main')))
  })

  it('denies signed-in users with no staff profile', async () => {
    const db = firestoreFor('stranger')
    await assertFails(getDoc(doc(db, 'business', 'main')))
    await assertFails(getDoc(doc(db, 'orders', 'order-cake')))
  })

  it('denies inactive profiles even with a valid role', async () => {
    const db = firestoreFor('inactive')
    await assertFails(getDoc(doc(db, 'business', 'main')))
    await assertFails(getDoc(doc(db, 'orders', 'order-cake')))
  })

  it('allows an active Super Admin to read workspace configuration', async () => {
    const db = firestoreFor('super')
    await assertSucceeds(getDoc(doc(db, 'business', 'main')))
    await assertSucceeds(getDoc(doc(db, 'outlets', 'o2')))
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-o2')))
  })
})

describe('outlet and department read scope', () => {
  it('limits a department admin to their own department and outlet', async () => {
    const db = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-cake')))
    await assertFails(getDoc(doc(db, 'orders', 'order-sweets')))
    await assertFails(getDoc(doc(db, 'orders', 'order-o2')))
  })

  it('allows a manager with no department assignments to read across departments in the outlet', async () => {
    const db = firestoreFor('manager')
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-sweets')))
    await assertFails(getDoc(doc(db, 'orders', 'order-o2')))
  })

  it('keeps catalogue reads scoped by permission, outlet and department', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'products', 'p1')))
    await assertFails(getDoc(doc(cake, 'products', 'p2')))

    const finance = firestoreFor('finance')
    await assertFails(getDoc(doc(finance, 'products', 'p1')))

    const manager = firestoreFor('manager')
    await assertSucceeds(getDoc(doc(manager, 'products', 'p2')))
  })

  it('prevents non-admins from listing staff profiles', async () => {
    const cake = firestoreFor('cake')
    await assertFails(getDocs(collection(cake, 'users')))
    await assertSucceeds(getDoc(doc(cake, 'users', 'cake')))

    const admin = firestoreFor('super')
    await assertSucceeds(getDocs(collection(admin, 'users')))
  })
})

describe('order creation and updates', () => {
  it('denies direct order creation even within the actor scope', async () => {
    const cake = firestoreFor('cake')
    await assertFails(setDoc(doc(cake, 'orders', 'new-cake'), orderPayload('new-cake', 'o1', 'd1', 'cake')))
    await assertFails(setDoc(doc(cake, 'orders', 'new-sweets'), orderPayload('new-sweets', 'o1', 'd2', 'cake')))

    const manager = firestoreFor('manager')
    await assertFails(setDoc(doc(manager, 'orders', 'manager-order'), orderPayload('manager-order', 'o1', 'd2', 'manager')))
    await assertFails(setDoc(doc(manager, 'orders', 'manager-order-o2'), orderPayload('manager-order-o2', 'o2', 'd2', 'manager')))
  })

  it('allows a permitted print-count update but blocks payment-field patches', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(
      updateDoc(doc(cake, 'orders', 'order-cake'), {
        'printCounts.receipt': 1,
        updatedAt: now,
        updatedBy: 'cake',
      }),
    )

    const finance = firestoreFor('finance')
    await assertFails(
      updateDoc(doc(finance, 'orders', 'order-sweets'), {
        paidPaise: 5000,
        balancePaise: 5500,
        paymentStatus: 'partial',
        updatedAt: now,
        updatedBy: 'finance',
      }),
    )
    await assertFails(updateDoc(doc(finance, 'orders', 'order-sweets'), { totalPaise: 1 }))
  })
})

describe('bookings, payments and customers', () => {
  it('denies direct booking creation and priced edits', async () => {
    const cake = firestoreFor('cake')
    await assertFails(setDoc(doc(cake, 'bookings', 'b-own'), bookingPayload('b-own', ['d1'], 'cake')))
    await assertFails(setDoc(doc(cake, 'bookings', 'b-mixed'), bookingPayload('b-mixed', ['d1', 'd2'], 'cake')))

    const manager = firestoreFor('manager')
    await assertFails(setDoc(doc(manager, 'bookings', 'b-manager'), bookingPayload('b-manager', ['d1', 'd2'], 'manager')))

    await assertSucceeds(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'confirmed',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), { totalPaise: 1 }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), { paidPaise: 100 }))
  })

  it('denies direct fulfilment and delivery address writes but keeps operational updates', async () => {
    const cake = firestoreFor('cake')

    // Fulfilment and the delivery address decide what is physically loaded.
    // They are trusted-only, so a direct client write must be denied.
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      fulfillment: 'delivery',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      deliveryAddress: '12 Main Road',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
      updatedAt: now,
      updatedBy: 'cake',
    }))

    // A Super Admin is bound by the same rule. Trusted operations run with the
    // Admin SDK and are not evaluated against these client rules.
    const superAdmin = firestoreFor('super')
    await assertFails(updateDoc(doc(superAdmin, 'bookings', 'booking-cake'), {
      fulfillment: 'delivery',
      deliveryAddress: '12 Main Road',
      updatedAt: now,
      updatedBy: 'super',
    }))

    // Legitimate operational updates still work for the same actor.
    await assertSucceeds(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      preparationStatus: 'in_progress',
      packingStatus: 'packed',
      instructions: 'Pack in two boxes',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertSucceeds(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'confirmed',
      updatedAt: now,
      updatedBy: 'cake',
    }))
  })

  it('enforces booking status enums, legal transitions and cancellation fields', async () => {    const cake = firestoreFor('cake')
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'completed',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'bogus',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'confirmed',
      cancelledAt: now,
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertSucceeds(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      preparationStatus: 'in_progress',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertFails(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'cancelled',
      updatedAt: now,
      updatedBy: 'cake',
    }))
    await assertSucceeds(updateDoc(doc(cake, 'bookings', 'booking-cake'), {
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: 'Customer request',
      updatedAt: now,
      updatedBy: 'cake',
    }))
  })

  it('scopes booking revisions and denies direct writes', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'bookingRevisions', 'booking-cake-r1')))
    await assertSucceeds(getDocs(query(
      collection(cake, 'bookingRevisions'),
      where('bookingId', '==', 'booking-cake'),
      where('outletId', '==', 'o1'),
      where('departmentIds', 'array-contains-any', ['d1']),
      orderBy('revision', 'desc'),
    )))
    await assertFails(setDoc(doc(cake, 'bookingRevisions', 'booking-cake-r2'), {
      id: 'booking-cake-r2', bookingId: 'booking-cake', outletId: 'o1', departmentIds: ['d1'], revision: 2,
    }))
  })

  it('denies direct payment writes while keeping scoped reads', async () => {
    const cake = firestoreFor('cake')
    await assertFails(setDoc(doc(cake, 'payments', 'p-own'), paymentPayload('p-own', ['d1'], 'cake')))
    await assertFails(setDoc(doc(cake, 'payments', 'p-other'), paymentPayload('p-other', ['d2'], 'cake')))
    await assertFails(setDoc(doc(cake, 'payments', 'p-empty'), paymentPayload('p-empty', [], 'cake')))

    await assertSucceeds(getDoc(doc(cake, 'payments', 'payment-cake')))
    await assertFails(getDoc(doc(cake, 'payments', 'payment-sweets')))
  })

  it('allows customer creation only for permitted outlets', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(
      setDoc(doc(cake, 'customers', 'c-new'), {
        id: 'c-new',
        name: 'New Customer',
        outletIds: ['o1'],
        active: true,
        createdBy: 'cake',
      }),
    )
    await assertFails(
      setDoc(doc(cake, 'customers', 'c-o2'), {
        id: 'c-o2',
        name: 'Other Outlet',
        outletIds: ['o2'],
        active: true,
        createdBy: 'cake',
      }),
    )
  })

  it('lets an accountant read payments but not edit a payment record', async () => {
    const finance = firestoreFor('finance')
    await assertSucceeds(getDoc(doc(finance, 'payments', 'payment-sweets')))
    await assertFails(updateDoc(doc(finance, 'payments', 'payment-sweets'), { amountPaise: 999999 }))
  })
})

describe('operations, inventory, delivery and finance rules', () => {
  it('scopes production tasks and events to the department and denies writes', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'productionTasks', 'task-cake')))
    await assertFails(getDoc(doc(cake, 'productionTasks', 'task-sweets')))
    await assertSucceeds(getDoc(doc(cake, 'productionEvents', 'event-cake')))
    await assertFails(setDoc(doc(cake, 'productionTasks', 'task-new'), {
      id: 'task-new', outletId: 'o1', departmentId: 'd1', productName: 'New', status: 'pending',
    }))
    await assertFails(updateDoc(doc(cake, 'productionTasks', 'task-cake'), { status: 'completed' }))
  })

  it('scopes the inventory ledger and denies client writes', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'inventoryItems', 'item-cake')))
    await assertFails(getDoc(doc(cake, 'inventoryItems', 'item-sweets')))
    await assertSucceeds(getDoc(doc(cake, 'inventoryMovements', 'movement-cake')))
    await assertSucceeds(getDoc(doc(cake, 'inventoryCounts', 'count-cake')))
    await assertFails(updateDoc(doc(cake, 'inventoryItems', 'item-cake'), { currentQty: 999 }))
    await assertFails(setDoc(doc(cake, 'inventoryMovements', 'movement-new'), {
      id: 'movement-new', outletId: 'o1', departmentId: 'd1', itemId: 'item-cake', quantity: 1,
    }))
  })

  it('scopes deliveries to any responsible department and denies client writes', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'deliveries', 'delivery-cake')))
    await assertFails(getDoc(doc(cake, 'deliveries', 'delivery-sweets')))
    await assertSucceeds(getDoc(doc(cake, 'deliveryEvents', 'delivery-event-cake')))
    await assertFails(updateDoc(doc(cake, 'deliveries', 'delivery-cake'), { status: 'delivered' }))
    await assertFails(setDoc(doc(cake, 'deliveryEvents', 'event-new'), {
      id: 'event-new', deliveryId: 'delivery-cake', outletId: 'o1', departmentIds: ['d1'], action: 'dispatched',
    }))
  })

  it('scopes expenses and cash sessions to finance staff and denies client writes', async () => {
    const finance = firestoreFor('finance')
    await assertSucceeds(getDoc(doc(finance, 'expenses', 'expense-1')))
    await assertSucceeds(getDoc(doc(finance, 'cashSessions', 'session-1')))
    const cake = firestoreFor('cake')
    await assertFails(getDoc(doc(cake, 'expenses', 'expense-1')))
    await assertFails(getDoc(doc(cake, 'cashSessions', 'session-1')))
    await assertFails(updateDoc(doc(finance, 'expenses', 'expense-1'), { amountPaise: 1 }))
    await assertFails(updateDoc(doc(finance, 'cashSessions', 'session-1'), { status: 'closed' }))
  })

  it('scopes label jobs and events, keeping account labels outlet-wide', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'labelPrintJobs', 'job-cake')))
    await assertSucceeds(getDoc(doc(cake, 'labelPrintJobs', 'job-account')))
    await assertFails(getDoc(doc(cake, 'labelPrintJobs', 'job-sweets')))
    await assertSucceeds(getDoc(doc(cake, 'labelEvents', 'label-event-cake')))
    await assertFails(setDoc(doc(cake, 'labelPrintJobs', 'job-new'), {
      id: 'job-new', jobNumber: 'LBL-NEW', jobType: 'item', outletId: 'o1', departmentId: 'd1', status: 'printed',
    }))
    await assertFails(updateDoc(doc(cake, 'labelPrintJobs', 'job-cake'), { status: 'closed' }))
    await assertFails(setDoc(doc(cake, 'labelEvents', 'label-event-new'), {
      id: 'label-event-new', jobId: 'job-cake', outletId: 'o1', departmentId: 'd1', kind: 'usage',
    }))

    const finance = firestoreFor('finance')
    await assertSucceeds(getDoc(doc(finance, 'labelPrintJobs', 'job-sweets')))
    await assertSucceeds(getDoc(doc(finance, 'labelPrintJobs', 'job-account')))
  })

  it('allows a legacy Super Admin profile without a permissions map to read labels', async () => {
    const legacySuper = firestoreFor('legacy-super')

    await assertSucceeds(getDoc(doc(legacySuper, 'labelPrintJobs', 'job-cake')))
    await assertSucceeds(getDoc(doc(legacySuper, 'labelPrintJobs', 'job-account')))
    await assertSucceeds(
      getDocs(query(collection(legacySuper, 'labelPrintJobs'), where('outletId', '==', 'o1'))),
    )
    await assertSucceeds(getDoc(doc(legacySuper, 'labelEvents', 'label-event-cake')))
  })

  it('scopes purchases by department and supplier payments to outlet-wide staff', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(getDoc(doc(cake, 'purchases', 'purchase-cake')))
    await assertFails(getDoc(doc(cake, 'purchases', 'purchase-sweets')))
    await assertFails(getDoc(doc(cake, 'supplierPayments', 'supplier-payment-1')))
    await assertFails(setDoc(doc(cake, 'purchases', 'purchase-new'), {
      id: 'purchase-new', purchaseNumber: 'PUR-NEW', outletId: 'o1', departmentId: 'd1', status: 'posted',
    }))

    const finance = firestoreFor('finance')
    await assertSucceeds(getDoc(doc(finance, 'purchases', 'purchase-sweets')))
    await assertSucceeds(getDoc(doc(finance, 'supplierPayments', 'supplier-payment-1')))
    await assertFails(updateDoc(doc(finance, 'supplierPayments', 'supplier-payment-1'), { amountPaise: 1 }))
    await assertFails(setDoc(doc(finance, 'supplierPayments', 'supplier-payment-new'), {
      id: 'supplier-payment-new', paymentNumber: 'SPAY-NEW', outletId: 'o1', supplierId: 's1', amountPaise: 1,
    }))

    const inactive = firestoreFor('inactive')
    await assertFails(getDoc(doc(inactive, 'labelPrintJobs', 'job-cake')))
    await assertFails(getDoc(doc(inactive, 'purchases', 'purchase-cake')))
  })
})

describe('query constraints mirror the rules', () => {
  it('allows a scoped list query and denies a broad list query', async () => {
    const db = firestoreFor('cake')
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'orders'),
          where('outletId', '==', 'o1'),
          where('departmentId', '==', 'd1'),
        ),
      ),
    )
    await assertFails(getDocs(collection(db, 'orders')))
  })

  it('returns only the accessible order from a scoped query', async () => {
    const db = firestoreFor('cake')
    const snapshot = await getDocs(
      query(collection(db, 'orders'), where('outletId', '==', 'o1'), where('departmentId', '==', 'd1')),
    )
    expect(snapshot.docs.map((item) => item.id)).toEqual(['order-cake'])
  })

  it('allows department-scoped label job and event list queries and denies broad lists', async () => {
    const cake = firestoreFor('cake')

    await assertSucceeds(
      getDocs(
        query(
          collection(cake, 'labelPrintJobs'),
          where('outletId', '==', 'o1'),
          where('departmentId', '==', 'd1'),
        ),
      ),
    )
    await assertFails(getDocs(collection(cake, 'labelPrintJobs')))

    await assertSucceeds(
      getDocs(
        query(
          collection(cake, 'labelEvents'),
          where('jobId', '==', 'job-cake'),
          where('outletId', '==', 'o1'),
          where('departmentId', '==', 'd1'),
        ),
      ),
    )
    await assertFails(getDocs(collection(cake, 'labelEvents')))
  })

  it('allows outlet-wide label history for outlet-wide roles', async () => {
    const finance = firestoreFor('finance')
    await assertSucceeds(
      getDocs(
        query(
          collection(finance, 'labelPrintJobs'),
          where('outletId', '==', 'o1'),
        ),
      ),
    )
    await assertSucceeds(
      getDocs(
        query(
          collection(finance, 'labelEvents'),
          where('jobId', '==', 'job-cake'),
          where('outletId', '==', 'o1'),
          orderBy('occurredAt', 'desc'),
        ),
      ),
    )
  })

  it('allows scoped purchase lists and outlet-wide supplier payment lists', async () => {
    const cake = firestoreFor('cake')
    await assertSucceeds(
      getDocs(
        query(
          collection(cake, 'purchases'),
          where('outletId', '==', 'o1'),
          where('departmentId', '==', 'd1'),
        ),
      ),
    )
    await assertFails(getDocs(collection(cake, 'purchases')))
    await assertFails(getDocs(collection(cake, 'supplierPayments')))

    const finance = firestoreFor('finance')
    await assertSucceeds(
      getDocs(
        query(
          collection(finance, 'purchases'),
          where('outletId', '==', 'o1'),
        ),
      ),
    )
    await assertSucceeds(
      getDocs(
        query(
          collection(finance, 'supplierPayments'),
          where('outletId', '==', 'o1'),
        ),
      ),
    )
  })
})
