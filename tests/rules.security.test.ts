import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { defaultPermissionsForRole } from '@/auth/permissions'
import type { Department, PermissionMap, RoleCode, UserProfile } from '@/types/models'

let testEnv: RulesTestEnvironment

const NOW = '2026-10-01T10:00:00.000Z'
const FUTURE = Date.now() + 7 * 24 * 60 * 60 * 1000
const PAST = Date.now() - 7 * 24 * 60 * 60 * 1000

function user(uid: string, role: RoleCode, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid,
    displayName: uid,
    email: `${uid}@example.com`,
    role,
    permissions: defaultPermissionsForRole(role),
    outletIds: ['o1'],
    departmentIds: [],
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function permissionPatch(patch: Partial<PermissionMap>): PermissionMap {
  return { ...defaultPermissionsForRole('cake_admin'), ...patch }
}

function productPayload(
  id: string,
  createdBy: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: 'New Product',
    printName: 'NEW PRODUCT',
    group: 'Catalogue',
    category: 'Category',
    departmentId: 'd1',
    outletIds: ['o1'],
    pricingMode: 'fixed',
    unit: 'piece',
    conversionFactor: 1,
    salePricePaise: 10000,
    taxPercent: 5,
    trackStock: false,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy,
    updatedBy: createdBy,
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
    createdAt: NOW,
    updatedAt: NOW,
  },
  d2: {
    id: 'd2',
    code: 'sweets',
    name: 'Sweets',
    outletIds: ['o1', 'o2'],
    color: '#C8922C',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
}

function orderPayload(id: string, departmentId: string, createdBy: string) {
  return {
    id,
    orderNumber: `ORD-${id}`,
    outletId: 'o1',
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
    createdAt: NOW,
    updatedAt: NOW,
    createdBy,
    updatedBy: createdBy,
  }
}

function invitePayload({
  id,
  email,
  role = 'cake_admin',
  status = 'pending',
  expiresAtMillis = FUTURE,
  overrides = {},
}: {
  id: string
  email: string
  role?: RoleCode
  status?: 'pending' | 'accepted' | 'revoked'
  expiresAtMillis?: number
  overrides?: Record<string, unknown>
}) {
  return {
    id,
    token: id,
    email,
    displayName: 'Invited Staff',
    role,
    permissions: defaultPermissionsForRole(role),
    outletIds: ['o1'],
    departmentIds: role === 'cake_admin' ? ['d1'] : [],
    status,
    createdAt: NOW,
    expiresAt: new Date(expiresAtMillis).toISOString(),
    expiresAtMillis,
    createdBy: 'super',
    ...overrides,
  }
}

function inviteProfile(uid: string, email: string, invite: ReturnType<typeof invitePayload>, overrides = {}) {
  return {
    uid,
    displayName: 'Invited Staff',
    email,
    role: invite.role,
    permissions: invite.permissions,
    outletIds: invite.outletIds,
    departmentIds: invite.departmentIds,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    inviteToken: invite.id,
    ...overrides,
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vishal-prem-rules-sec',
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
    batch.set(doc(db, 'users', 'cake'), user('cake', 'cake_admin', { departmentIds: ['d1'] }))
    batch.set(
      doc(db, 'users', 'clerk'),
      user('clerk', 'cake_admin', {
        departmentIds: ['d1'],
        permissions: permissionPatch({ ordersCancel: false }),
      }),
    )
    batch.set(
      doc(db, 'users', 'staffadmin'),
      user('staffadmin', 'cake_admin', {
        departmentIds: ['d1'],
        permissions: permissionPatch({ usersManage: true }),
      }),
    )
    batch.set(doc(db, 'users', 'manager'), user('manager', 'manager'))
    batch.set(doc(db, 'users', 'finance'), user('finance', 'accountant'))
    batch.set(doc(db, 'users', 'inactive'), user('inactive', 'cake_admin', { departmentIds: ['d1'], active: false }))
    batch.set(
      doc(db, 'users', 'stockmanager'),
      user('stockmanager', 'cake_admin', {
        departmentIds: ['d1'],
        permissions: permissionPatch({ inventoryAdjust: true }),
      }),
    )

    for (const product of [
      { id: 'p1', departmentId: 'd1', name: 'Cake' },
      { id: 'p2', departmentId: 'd2', name: 'Barfi' },
    ]) {
      batch.set(doc(db, 'products', product.id), {
        id: product.id,
        name: product.name,
        printName: product.name.toUpperCase(),
        group: 'Catalogue',
        category: 'Category',
        departmentId: product.departmentId,
        outletIds: ['o1'],
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
        createdBy: 'cake',
        updatedBy: 'cake',
      })
    }

    batch.set(doc(db, 'stockAdjustments', 'adjust-existing'), {
      id: 'adjust-existing',
      productId: 'p1',
      productName: 'Cake',
      departmentId: 'd1',
      outletIds: ['o1'],
      unit: 'piece',
      delta: 1,
      previousStockQty: 9,
      resultingStockQty: 10,
      reason: 'Opening count',
      actorName: 'Cake Admin',
      source: 'manual',
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'cake',
      updatedBy: 'cake',
    })
    batch.set(doc(db, 'stockAdjustments', 'adjust-sweets'), {
      id: 'adjust-sweets',
      productId: 'p2',
      productName: 'Barfi',
      departmentId: 'd2',
      outletIds: ['o1'],
      unit: 'piece',
      delta: 1,
      previousStockQty: 9,
      resultingStockQty: 10,
      reason: 'Opening count',
      actorName: 'Manager',
      source: 'manual',
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'manager',
      updatedBy: 'manager',
    })

    batch.set(doc(db, 'orders', 'order-cake'), orderPayload('order-cake', 'd1', 'cake'))
    batch.set(doc(db, 'orders', 'order-sweets'), orderPayload('order-sweets', 'd2', 'manager'))
    batch.set(
      doc(db, 'orders', 'order-cancelled'),
      {
        ...orderPayload('order-cancelled', 'd1', 'cake'),
        status: 'cancelled',
        cancelledAt: NOW,
        cancelReason: 'Already cancelled',
      },
    )

    batch.set(doc(db, 'customers', 'c1'), { id: 'c1', name: 'Customer One', outletIds: ['o1'], active: true })
    batch.set(doc(db, 'customers', 'c2'), { id: 'c2', name: 'Customer Two', outletIds: ['o2'], active: true })

    batch.set(doc(db, 'invites', 'inv-pending'), invitePayload({ id: 'inv-pending', email: 'invited@example.com' }))
    batch.set(
      doc(db, 'invites', 'inv-expired'),
      invitePayload({ id: 'inv-expired', email: 'expired@example.com', expiresAtMillis: PAST }),
    )
    batch.set(
      doc(db, 'invites', 'inv-accepted'),
      invitePayload({ id: 'inv-accepted', email: 'accepted@example.com', status: 'accepted' }),
    )
    await batch.commit()
  })
})

function dbFor(uid: string, email = `${uid}@example.com`) {
  return testEnv.authenticatedContext(uid, { email }).firestore()
}

function unauthenticatedDb() {
  return testEnv.unauthenticatedContext().firestore()
}

const superAdminDocument = {
  uid: 'stranger',
  displayName: 'Forged Admin',
  email: 'stranger@example.com',
  role: 'super_admin',
  permissions: defaultPermissionsForRole('super_admin'),
  outletIds: ['o1', 'o2'],
  departmentIds: [],
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('staff cannot escalate their own profile', () => {
  it('allows the narrow self-service fields', async () => {
    const db = dbFor('cake')
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'cake'), { displayName: 'Cake Admin', phone: '9876500000', updatedAt: NOW }),
    )
  })

  it('denies a self role change to Super Admin', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'users', 'cake'), { role: 'super_admin' }))
    await assertFails(updateDoc(doc(db, 'users', 'cake'), { role: 'super_admin', updatedAt: NOW }))
  })

  it('denies self-granted permissions', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'users', 'cake'), { permissions: defaultPermissionsForRole('super_admin') }),
    )
    await assertFails(updateDoc(doc(db, 'users', 'cake'), { 'permissions.usersManage': true }))
  })

  it('denies widening outlet scope', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'users', 'cake'), { outletIds: ['o1', 'o2'] }))
  })

  it('denies widening department scope', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'users', 'cake'), { departmentIds: ['d1', 'd2'] }))
  })

  it('denies self-deactivation and reactivation', async () => {
    const active = dbFor('cake')
    await assertFails(updateDoc(doc(active, 'users', 'cake'), { active: false }))

    const inactive = dbFor('inactive')
    await assertFails(updateDoc(doc(inactive, 'users', 'inactive'), { active: true }))
  })

  it('denies editing another staff profile without usersManage', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'users', 'manager'), { displayName: 'Renamed' }))
    await assertFails(updateDoc(doc(db, 'users', 'manager'), { role: 'super_admin' }))
  })
})

describe('forged Super Admin creation', () => {
  it('denies a profile-less signed-in user creating a Super Admin document', async () => {
    const db = dbFor('stranger')
    await assertFails(setDoc(doc(db, 'users', 'stranger'), superAdminDocument))
  })

  it('denies a department admin creating a Super Admin for someone else', async () => {
    const db = dbFor('cake')
    await assertFails(setDoc(doc(db, 'users', 'attacker'), { ...superAdminDocument, uid: 'attacker' }))
  })

  it('denies a self-created profile without an invitation', async () => {
    const db = dbFor('stranger')
    await assertFails(
      setDoc(doc(db, 'users', 'stranger'), {
        ...superAdminDocument,
        role: 'manager',
        permissions: defaultPermissionsForRole('manager'),
      }),
    )
  })
})

describe('invitation acceptance', () => {
  const invite = invitePayload({ id: 'inv-pending', email: 'invited@example.com' })

  it('allows a matching email to create the invited profile', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    await assertSucceeds(setDoc(doc(db, 'users', 'newstaff'), inviteProfile('newstaff', 'invited@example.com', invite)))
  })

  it('allows the realistic batch: create profile and mark the invite accepted', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', 'newstaff'), inviteProfile('newstaff', 'invited@example.com', invite))
    batch.update(doc(db, 'invites', 'inv-pending'), {
      status: 'accepted',
      acceptedUid: 'newstaff',
      acceptedAt: NOW,
    })
    await assertSucceeds(batch.commit())
  })

  it('denies acceptance from a different email', async () => {
    const db = dbFor('impostor', 'impostor@example.com')
    await assertFails(setDoc(doc(db, 'users', 'impostor'), inviteProfile('impostor', 'impostor@example.com', invite)))
  })

  it('denies acceptance of an expired invitation', async () => {
    const expired = invitePayload({ id: 'inv-expired', email: 'expired@example.com', expiresAtMillis: PAST })
    const db = dbFor('expiredstaff', 'expired@example.com')
    await assertFails(setDoc(doc(db, 'users', 'expiredstaff'), inviteProfile('expiredstaff', 'expired@example.com', expired)))
  })

  it('denies acceptance of an already accepted invitation', async () => {
    const accepted = invitePayload({ id: 'inv-accepted', email: 'accepted@example.com', status: 'accepted' })
    const db = dbFor('secondstaff', 'accepted@example.com')
    await assertFails(setDoc(doc(db, 'users', 'secondstaff'), inviteProfile('secondstaff', 'accepted@example.com', accepted)))
  })

  it('denies forging a Super Admin role during acceptance', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    await assertFails(
      setDoc(
        doc(db, 'users', 'newstaff'),
        inviteProfile('newstaff', 'invited@example.com', invite, {
          role: 'super_admin',
          permissions: defaultPermissionsForRole('super_admin'),
        }),
      ),
    )
  })

  it('denies forging wider outlet or department scope during acceptance', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    await assertFails(
      setDoc(doc(db, 'users', 'newstaff'), inviteProfile('newstaff', 'invited@example.com', invite, { outletIds: ['o1', 'o2'] })),
    )
    await assertFails(
      setDoc(
        doc(db, 'users', 'newstaff'),
        inviteProfile('newstaff', 'invited@example.com', invite, { departmentIds: ['d1', 'd2'] }),
      ),
    )
  })

  it('denies a profile create without an inviteToken', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    const profile = inviteProfile('newstaff', 'invited@example.com', invite)
    delete (profile as { inviteToken?: string }).inviteToken
    await assertFails(setDoc(doc(db, 'users', 'newstaff'), profile))
  })

  it('allows only the invited email to accept the invitation document', async () => {
    const matching = dbFor('newstaff', 'invited@example.com')
    await assertSucceeds(
      updateDoc(doc(matching, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
      }),
    )

    const wrong = dbFor('impostor', 'impostor@example.com')
    await assertFails(
      updateDoc(doc(wrong, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'impostor',
        acceptedAt: NOW,
      }),
    )
  })

  it('denies smuggling extra fields into the invitation acceptance', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
        role: 'super_admin',
      }),
    )
  })

  it('denies changing permissions, email or scope during acceptance', async () => {
    const db = dbFor('newstaff', 'invited@example.com')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
        permissions: defaultPermissionsForRole('super_admin'),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
        email: 'other@example.com',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
        outletIds: ['o1', 'o2'],
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        status: 'accepted',
        acceptedUid: 'newstaff',
        acceptedAt: NOW,
        departmentIds: ['d1', 'd2'],
      }),
    )
  })

  it('denies acceptance of an expired invitation document', async () => {
    const db = dbFor('expiredstaff', 'expired@example.com')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-expired'), {
        status: 'accepted',
        acceptedUid: 'expiredstaff',
        acceptedAt: NOW,
      }),
    )
  })

  it('denies an invalid acceptance transition from a non-pending invitation', async () => {
    const db = dbFor('acceptedstaff', 'accepted@example.com')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-accepted'), {
        status: 'accepted',
        acceptedUid: 'acceptedstaff',
        acceptedAt: NOW,
      }),
    )
  })
})

describe('invitation visibility and management', () => {
  it('denies listing invites without usersManage', async () => {
    const db = dbFor('cake')
    await assertFails(getDocs(collection(db, 'invites')))
  })

  it('denies listing invites for a non-Super Admin with usersManage', async () => {
    const db = dbFor('staffadmin')
    await assertFails(getDocs(collection(db, 'invites')))
  })

  it('denies creating and deleting invites without usersManage', async () => {
    const db = dbFor('cake')
    await assertFails(
      setDoc(doc(db, 'invites', 'inv-new'), invitePayload({ id: 'inv-new', email: 'new@example.com' })),
    )
    await assertFails(deleteDoc(doc(db, 'invites', 'inv-pending')))
  })

  it('lets a Super Admin create a legitimate invitation', async () => {
    const db = dbFor('super')
    await assertSucceeds(
      setDoc(
        doc(db, 'invites', 'inv-super-new'),
        invitePayload({ id: 'inv-super-new', email: 'new@example.com', overrides: { createdBy: 'super' } }),
      ),
    )
  })

  it('denies a non-Super Admin with usersManage creating an ordinary invitation', async () => {
    const db = dbFor('staffadmin')
    await assertFails(
      setDoc(
        doc(db, 'invites', 'inv-staffadmin-new'),
        invitePayload({ id: 'inv-staffadmin-new', email: 'new@example.com' }),
      ),
    )
  })

  it('denies a non-Super Admin with usersManage creating a Super Admin invitation', async () => {
    const db = dbFor('staffadmin')
    await assertFails(
      setDoc(
        doc(db, 'invites', 'inv-staffadmin-super'),
        invitePayload({ id: 'inv-staffadmin-super', email: 'new@example.com', role: 'super_admin' }),
      ),
    )
  })

  it('denies a non-Super Admin with usersManage promoting an invitation to Super Admin', async () => {
    const db = dbFor('staffadmin')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        role: 'super_admin',
        permissions: defaultPermissionsForRole('super_admin'),
      }),
    )
  })

  it('denies a non-Super Admin with usersManage changing invitation permissions, email, scope, creator or status', async () => {
    const db = dbFor('staffadmin')
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), {
        permissions: defaultPermissionsForRole('manager'),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), { email: 'attacker@example.com' }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), { outletIds: ['o1', 'o2'] }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), { departmentIds: ['d1', 'd2'] }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), { createdBy: 'staffadmin' }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-pending'), { status: 'revoked' }),
    )
    await assertFails(
      updateDoc(doc(db, 'invites', 'inv-accepted'), { status: 'pending' }),
    )
  })

  it('denies a non-Super Admin with usersManage deleting an invitation', async () => {
    const db = dbFor('staffadmin')
    await assertFails(deleteDoc(doc(db, 'invites', 'inv-pending')))
  })

  it('denies reading accepted or expired invites', async () => {
    const db = dbFor('cake')
    await assertFails(getDoc(doc(db, 'invites', 'inv-accepted')))
    await assertFails(getDoc(doc(db, 'invites', 'inv-expired')))
  })

  it('denies management reads of accepted or expired invites for a non-Super Admin with usersManage', async () => {
    const db = dbFor('staffadmin')
    await assertFails(getDoc(doc(db, 'invites', 'inv-accepted')))
    await assertFails(getDoc(doc(db, 'invites', 'inv-expired')))
  })

  it('allows a pending invite lookup by token, even before sign-in', async () => {
    await assertSucceeds(getDoc(doc(unauthenticatedDb(), 'invites', 'inv-pending')))
  })

  it('lets a Super Admin list and revoke invites', async () => {
    const db = dbFor('super')
    await assertSucceeds(getDocs(collection(db, 'invites')))
    await assertSucceeds(updateDoc(doc(db, 'invites', 'inv-pending'), { status: 'revoked' }))
  })
})

describe('order cancellation permission', () => {
  it('denies direct cancellation without ordersCancel', async () => {
    const db = dbFor('clerk')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        status: 'cancelled',
        cancelReason: 'Customer changed their mind',
        updatedAt: NOW,
        updatedBy: 'clerk',
      }),
    )
  })

  it('denies direct cancellation even with ordersCancel', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        status: 'cancelled',
        cancelReason: 'Customer changed their mind',
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('still allows non-cancellation status changes without ordersCancel', async () => {
    const db = dbFor('clerk')
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'order-cake'), { status: 'preparing', updatedAt: NOW, updatedBy: 'clerk' }),
    )
  })

  it('denies skipping the order status flow', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), { status: 'completed', updatedAt: NOW, updatedBy: 'cake' }),
    )
  })

  it('denies reopening a cancelled order', async () => {
    const cake = dbFor('cake')
    await assertFails(
      updateDoc(doc(cake, 'orders', 'order-cancelled'), {
        status: 'preparing',
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })
})

describe('order immutability', () => {
  it('denies changing outletId', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'orders', 'order-cake'), { outletId: 'o2' }))
  })

  it('denies changing departmentId', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'orders', 'order-cake'), { departmentId: 'd2' }))
  })

  it('denies changing createdBy', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'orders', 'order-cake'), { createdBy: 'manager' }))
  })

  it('denies changing order lines', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        lines: [{ id: 'line-2', productId: 'p2', name: 'Forged', quantity: 1, unitPricePaise: 1 }],
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('denies changing order totals', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        totalPaise: 1,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('denies changing stock-consumption snapshots', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        'lines.0.stockConsumed': 0,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('denies changing updatedBy to another user', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        status: 'preparing',
        updatedAt: NOW,
        updatedBy: 'manager',
      }),
    )
  })

  it('denies altering lines while cancelling', async () => {
    const db = dbFor('cake')
    await assertFails(
      updateDoc(doc(db, 'orders', 'order-cake'), {
        status: 'cancelled',
        cancelReason: 'Forged',
        lines: [{ id: 'line-2', productId: 'p2', name: 'Forged', quantity: 1, unitPricePaise: 1 }],
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('denies creating an order with a forged updatedBy', async () => {
    const db = dbFor('cake')
    await assertFails(
      setDoc(doc(db, 'orders', 'order-forged-actor'), {
        ...orderPayload('order-forged-actor', 'd1', 'cake'),
        updatedBy: 'manager',
      }),
    )
  })
})

describe('payment record validation', () => {
  const base = {
    id: 'p-new',
    receiptNumber: 'RCPT-NEW',
    outletId: 'o1',
    departmentIds: ['d2'],
    bookingId: 'booking-cake',
    customerName: 'Test Customer',
    amountPaise: 5000,
    type: 'payment',
    mode: 'cash',
    receivedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'finance',
  }

  it('denies direct booking payment creation even for finance staff', async () => {
    const db = dbFor('finance')
    await assertFails(setDoc(doc(db, 'payments', 'p-new'), base))
  })

  it('rejects a direct order payment record', async () => {
    const db = dbFor('finance')
    await assertFails(
      setDoc(doc(db, 'payments', 'p-order'), {
        ...base,
        id: 'p-order',
        orderId: 'order-sweets',
      }),
    )
  })

  it('rejects zero or negative amounts', async () => {
    const db = dbFor('finance')
    await assertFails(setDoc(doc(db, 'payments', 'p-zero'), { ...base, id: 'p-zero', amountPaise: 0 }))
    await assertFails(setDoc(doc(db, 'payments', 'p-neg'), { ...base, id: 'p-neg', amountPaise: -100 }))
  })

  it('rejects non-integer amounts', async () => {
    const db = dbFor('finance')
    await assertFails(setDoc(doc(db, 'payments', 'p-float'), { ...base, id: 'p-float', amountPaise: 10.5 }))
  })

  it('rejects unknown type or mode values', async () => {
    const db = dbFor('finance')
    await assertFails(setDoc(doc(db, 'payments', 'p-type'), { ...base, id: 'p-type', type: 'transfer' }))
    await assertFails(setDoc(doc(db, 'payments', 'p-mode'), { ...base, id: 'p-mode', mode: 'crypto' }))
  })

  it('rejects payments outside the user outlet', async () => {
    const db = dbFor('cake')
    await assertFails(setDoc(doc(db, 'payments', 'p-o2'), { ...base, id: 'p-o2', outletId: 'o2', createdBy: 'cake' }))
  })
})

describe('configuration write boundaries', () => {
  it('denies deleting the business profile even for a Super Admin', async () => {
    const db = dbFor('super')
    await assertFails(deleteDoc(doc(db, 'business', 'main')))
  })

  it('denies outlet edits without outletsManage', async () => {
    const db = dbFor('cake')
    await assertFails(updateDoc(doc(db, 'outlets', 'o1'), { name: 'Renamed' }))
  })

  it('denies cross-outlet product creation for a single-outlet admin', async () => {
    const db = dbFor('cake')
    await assertFails(
      setDoc(doc(db, 'products', 'p-cross'), {
        id: 'p-cross',
        name: 'Cross Outlet',
        printName: 'CROSS',
        departmentId: 'd1',
        outletIds: ['o1', 'o2'],
        active: true,
        available: true,
        createdBy: 'cake',
      }),
    )
  })

  it('keeps customer reads within outlet scope', async () => {
    const db = dbFor('finance')
    await assertSucceeds(getDoc(doc(db, 'customers', 'c1')))
    await assertFails(getDoc(doc(db, 'customers', 'c2')))
  })
})

describe('product stock and adjustment boundaries', () => {
  it('denies direct current and opening stock edits while preserving metadata edits', async () => {
    const db = dbFor('cake')

    await assertSucceeds(
      updateDoc(doc(db, 'products', 'p1'), {
        name: 'Renamed Cake',
        criticalStock: 3,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'products', 'p1'), {
        stockQty: 99,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'products', 'p1'), {
        openingStock: 99,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
  })

  it('denies direct tracking and conversion-factor edits', async () => {
    const db = dbFor('cake')

    await assertFails(
      updateDoc(doc(db, 'products', 'p1'), {
        trackStock: false,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'products', 'p1'), {
        conversionFactor: 0.5,
        updatedAt: NOW,
        updatedBy: 'cake',
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'products', 'p1'), {
        updatedBy: 'manager',
      }),
    )
  })

  it('denies creating a tracked product without the stock permission', async () => {
    const db = dbFor('cake')

    await assertFails(
      setDoc(
        doc(db, 'products', 'p-no-stock-perm'),
        productPayload('p-no-stock-perm', 'cake', {
          trackStock: true,
          openingStock: 5,
          stockQty: 5,
        }),
      ),
    )
  })

  it('allows an inventory manager to create a tracked product with an equal initial count', async () => {
    const db = dbFor('stockmanager')

    await assertSucceeds(
      setDoc(
        doc(db, 'products', 'p-initial'),
        productPayload('p-initial', 'stockmanager', {
          trackStock: true,
          openingStock: 5,
          stockQty: 5,
        }),
      ),
    )
    await assertFails(
      setDoc(
        doc(db, 'products', 'p-bad-initial'),
        productPayload('p-bad-initial', 'stockmanager', {
          trackStock: true,
          openingStock: 2,
          stockQty: 5,
        }),
      ),
    )
    await assertFails(
      setDoc(
        doc(db, 'products', 'p-negative-initial'),
        productPayload('p-negative-initial', 'stockmanager', {
          trackStock: true,
          openingStock: -1,
          stockQty: -1,
        }),
      ),
    )
  })

  it('allows an untracked product to be created without stock fields', async () => {
    const db = dbFor('cake')

    await assertSucceeds(
      setDoc(doc(db, 'products', 'p-untracked'), productPayload('p-untracked', 'cake')),
    )
    await assertFails(
      setDoc(
        doc(db, 'products', 'p-untracked-with-stock'),
        productPayload('p-untracked-with-stock', 'cake', { stockQty: 5 }),
      ),
    )
  })

  it('denies every direct write to stock adjustment records', async () => {
    const superDb = dbFor('super')
    const stockDb = dbFor('stockmanager')

    await assertFails(
      setDoc(doc(stockDb, 'stockAdjustments', 'forged'), {
        ...productPayload('forged', 'stockmanager'),
        productId: 'p1',
      }),
    )
    await assertFails(
      updateDoc(doc(superDb, 'stockAdjustments', 'adjust-existing'), {
        delta: 10,
      }),
    )
    await assertFails(deleteDoc(doc(superDb, 'stockAdjustments', 'adjust-existing')))
  })

  it('scopes stock adjustment history reads to inventory managers in scope', async () => {
    const stock = dbFor('stockmanager')
    await assertSucceeds(getDoc(doc(stock, 'stockAdjustments', 'adjust-existing')))
    await assertFails(getDoc(doc(stock, 'stockAdjustments', 'adjust-sweets')))

    const finance = dbFor('finance')
    await assertFails(getDoc(doc(finance, 'stockAdjustments', 'adjust-existing')))
  })
})

describe('unmapped collections', () => {
  it('denies reads and writes to collections with no rule', async () => {
    const db = dbFor('super')
    await assertFails(getDoc(doc(db, 'secrets', 'x')))
    await assertFails(setDoc(doc(db, 'secrets', 'x'), { value: 'hidden' }))
    await assertFails(getDocs(query(collection(db, 'secrets'), where('value', '==', 'hidden'))))
  })

  it('denies unauthenticated access to unmapped collections', async () => {
    const db = unauthenticatedDb()
    await assertFails(getDoc(doc(db, 'secrets', 'x')))
  })
})
