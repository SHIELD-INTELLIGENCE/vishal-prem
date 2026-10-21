import 'firebase/compat/storage'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, writeBatch } from 'firebase/firestore'
import { defaultPermissionsForRole } from '@/auth/permissions'
import type { PermissionMap, RoleCode, UserProfile } from '@/types/models'

let testEnv: RulesTestEnvironment

const NOW = '2026-10-01T10:00:00.000Z'
const ONE_PIXEL_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const OVERSIZED_BYTES = new Uint8Array(4 * 1024 * 1024 + 1)

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

function storageFor(uid: string, email = `${uid}@example.com`) {
  return testEnv.authenticatedContext(uid, { email }).storage()
}

function unauthenticatedStorage() {
  return testEnv.unauthenticatedContext().storage()
}

/** The compat UploadTask is a thenable, not a native Promise; wrap it for the assertions. */
function upload(
  storage: ReturnType<typeof storageFor>,
  path: string,
  data: Uint8Array,
  contentType: string,
): Promise<unknown> {
  return storage.ref(path).put(data, { contentType }).then((result) => result)
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vishal-prem-rules-storage',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync('storage.rules', 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', 'super'), user('super', 'super_admin', { outletIds: ['o1', 'o2'] }))
    batch.set(doc(db, 'users', 'cake'), user('cake', 'cake_admin', { departmentIds: ['d1'] }))
    batch.set(
      doc(db, 'users', 'cataloguer'),
      user('cataloguer', 'cake_admin', {
        departmentIds: ['d1'],
        permissions: permissionPatch({ productsManage: false }),
      }),
    )
    batch.set(doc(db, 'users', 'finance'), user('finance', 'accountant', { departmentIds: [] }))
    batch.set(doc(db, 'users', 'inactive'), user('inactive', 'cake_admin', { departmentIds: ['d1'], active: false }))
    await batch.commit()
  })
})

describe('product image uploads', () => {
  it('denies unauthenticated uploads', async () => {
    const storage = unauthenticatedStorage()
    await assertFails(upload(storage, 'product-images/o1/anonymous.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('allows an active productsManage staff member to upload to their outlet', async () => {
    const storage = storageFor('cake')
    await assertSucceeds(upload(storage, 'product-images/o1/cake.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('allows a Super Admin to upload to any outlet', async () => {
    const storage = storageFor('super')
    await assertSucceeds(upload(storage, 'product-images/o2/super.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('denies uploads without productsManage', async () => {
    const cataloguer = storageFor('cataloguer')
    await assertFails(upload(cataloguer, 'product-images/o1/no-permission.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))

    const finance = storageFor('finance')
    await assertFails(upload(finance, 'product-images/o1/finance.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('denies uploads to an outlet outside the staff member scope', async () => {
    const storage = storageFor('cake')
    await assertFails(upload(storage, 'product-images/o2/cross-outlet.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('denies an inactive profile', async () => {
    const storage = storageFor('inactive')
    await assertFails(upload(storage, 'product-images/o1/inactive.jpg', ONE_PIXEL_JPEG, 'image/jpeg'))
  })

  it('denies non-image content types', async () => {
    const storage = storageFor('cake')
    await assertFails(upload(storage, 'product-images/o1/note.txt', new TextEncoder().encode('hello'), 'text/plain'))
  })

  it('denies objects at or above the 4 MB limit', async () => {
    const storage = storageFor('cake')
    await assertFails(upload(storage, 'product-images/o1/oversized.jpg', OVERSIZED_BYTES, 'image/jpeg'))
  })
})

describe('product image reads and deletes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref('product-images/o1/existing.jpg').put(ONE_PIXEL_JPEG, { contentType: 'image/jpeg' })
    })
  })

  it('allows public reads of product images', async () => {
    const storage = unauthenticatedStorage()
    await assertSucceeds(storage.ref('product-images/o1/existing.jpg').getDownloadURL())
  })

  it('allows an authorised staff member to delete an image', async () => {
    const storage = storageFor('cake')
    await assertSucceeds(storage.ref('product-images/o1/existing.jpg').delete())
  })

  it('denies deletion without productsManage', async () => {
    const finance = storageFor('finance')
    await assertFails(finance.ref('product-images/o1/existing.jpg').delete())

    const cataloguer = storageFor('cataloguer')
    await assertFails(cataloguer.ref('product-images/o1/existing.jpg').delete())
  })

  it('denies deletion outside the outlet scope', async () => {
    const storage = storageFor('cake')
    await assertFails(storage.ref('product-images/o2/existing.jpg').delete())
  })
})

describe('storage deny-all', () => {
  it('denies reads and writes outside product images', async () => {
    const storage = storageFor('super')
    await assertFails(upload(storage, 'private/secrets.txt', new TextEncoder().encode('x'), 'text/plain'))
    await assertFails(storage.ref('private/secrets.txt').getDownloadURL())
  })
})
