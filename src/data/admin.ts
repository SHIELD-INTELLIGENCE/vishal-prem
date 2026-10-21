import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { nowIso, uniqueId } from '@/lib/utils'
import type { Business, Department, Outlet, UserProfile } from '@/types/models'
import type { DepartmentValues, OutletValues } from '@/lib/validation'

export async function saveOutlet({
  values,
  existing,
  profile,
}: {
  values: OutletValues
  existing?: Outlet | null
  profile: UserProfile
}): Promise<string> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()
  const id = existing?.id ?? uniqueId()
  const payload: Outlet = {
    id,
    code: values.code.trim().toUpperCase(),
    name: values.name.trim(),
    address: values.address.trim(),
    phone: values.phone.replace(/\D/g, '').slice(-10),
    email: values.email?.trim().toLowerCase() || '',
    gstin: values.gstin?.trim().toUpperCase() || '',
    active: values.active,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? profile.uid,
    updatedBy: profile.uid,
  }
  try {
    await setDoc(doc(db, 'outlets', id), payload)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return id
}

export async function saveDepartment({
  values,
  existing,
  profile,
}: {
  values: DepartmentValues
  existing?: Department | null
  profile: UserProfile
}): Promise<string> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()
  const id = existing?.id ?? uniqueId()
  const payload: Department = {
    id,
    code: values.code.trim().toLowerCase(),
    name: values.name.trim(),
    description: values.description?.trim() || '',
    outletIds: values.outletIds,
    color: values.color,
    active: values.active,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? profile.uid,
    updatedBy: profile.uid,
  }
  try {
    await setDoc(doc(db, 'departments', id), payload)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return id
}

export interface DepartmentUsage {
  products: number
  orders: number
  bookings: number
  total: number
}

/**
 * Counts the records that point at a department before it is removed. These are
 * single-field queries, so they use the automatic indexes and never need a
 * composite index deployment.
 */
export async function getDepartmentUsage(departmentId: string): Promise<DepartmentUsage> {
  if (!db) throw new Error('Firestore is not available.')
  try {
    const [products, orders, bookings] = await Promise.all([
      getCountFromServer(query(collection(db, 'products'), where('departmentId', '==', departmentId))),
      getCountFromServer(query(collection(db, 'orders'), where('departmentId', '==', departmentId))),
      getCountFromServer(query(collection(db, 'bookings'), where('departmentIds', 'array-contains', departmentId))),
    ])
    const counts = {
      products: products.data().count,
      orders: orders.data().count,
      bookings: bookings.data().count,
    }
    return { ...counts, total: counts.products + counts.orders + counts.bookings }
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

/** Super Admin only (enforced by firestore.rules → departments delete). */
export async function deleteDepartment(departmentId: string): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  try {
    await deleteDoc(doc(db, 'departments', departmentId))
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export async function savePrinterSettings(
  printer: Business['printer'],
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  try {
    await setDoc(
      doc(db, 'business', 'main'),
      { printer, updatedAt: nowIso(), updatedBy: profile.uid },
      { merge: true },
    )
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}
