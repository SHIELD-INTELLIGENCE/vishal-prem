import {
  collection,
  limit,
  orderBy,
  query,
  where,
  type CollectionReference,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ID, UserProfile } from '@/types/models'

function needsDepartmentFilter(profile: UserProfile): boolean {
  return profile.role !== 'super_admin' && profile.role !== 'manager' && profile.role !== 'accountant'
}

function scopedDepartments(profile: UserProfile): ID[] {
  return profile.departmentIds.slice(0, 10)
}

export function productsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 500,
): Query | null {
  if (!db) return null
  const base = collection(db, 'products') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletIds', 'array-contains', outletId)]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentId', 'in', departments))
  }
  constraints.push(orderBy('name', 'asc'), limit(max))
  return query(base, ...constraints)
}

export function ordersQuery(
  outletId: ID,
  profile: UserProfile,
  max = 400,
): Query | null {
  if (!db) return null
  const base = collection(db, 'orders') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentId', 'in', departments))
  }
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function bookingsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 400,
): Query | null {
  if (!db) return null
  const base = collection(db, 'bookings') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', departments))
  }
  constraints.push(orderBy('eventDate', 'asc'), limit(max))
  return query(base, ...constraints)
}

export function paymentsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 400,
): Query | null {
  if (!db) return null
  const base = collection(db, 'payments') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', departments))
  }
  constraints.push(orderBy('receivedAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function customersQuery(
  outletId: ID,
  max = 500,
): Query | null {
  if (!db) return null
  const base = collection(db, 'customers') as CollectionReference
  return query(
    base,
    where('outletIds', 'array-contains', outletId),
    orderBy('name', 'asc'),
    limit(max),
  )
}

/**
 * Department-scoped reads.
 *
 * Each query is deliberately built with the outlet constraint first so it maps
 * onto a composite index that already exists in `firestore.indexes.json`
 * (`outletId`/`outletIds` + department + sort field). Do not drop the outlet
 * constraint: doing so would require a new index and widen the result set.
 */
export function departmentProductsQuery(
  outletId: ID,
  departmentId: ID,
  max = 300,
): Query | null {
  if (!db || !departmentId) return null
  const base = collection(db, 'products') as CollectionReference
  return query(
    base,
    where('outletIds', 'array-contains', outletId),
    where('departmentId', '==', departmentId),
    orderBy('name', 'asc'),
    limit(max),
  )
}

export function departmentOrdersQuery(
  outletId: ID,
  departmentId: ID,
  max = 300,
): Query | null {
  if (!db || !departmentId) return null
  const base = collection(db, 'orders') as CollectionReference
  return query(
    base,
    where('outletId', '==', outletId),
    where('departmentId', '==', departmentId),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
}

export function departmentBookingsQuery(
  outletId: ID,
  departmentId: ID,
  max = 200,
): Query | null {
  if (!db || !departmentId) return null
  const base = collection(db, 'bookings') as CollectionReference
  return query(
    base,
    where('outletId', '==', outletId),
    where('departmentIds', 'array-contains', departmentId),
    orderBy('eventDate', 'asc'),
    limit(max),
  )
}

export function usersQuery(max = 200): Query | null {
  if (!db) return null
  return query(collection(db, 'users'), orderBy('displayName', 'asc'), limit(max))
}

export function invitesQuery(max = 100): Query | null {
  if (!db) return null
  return query(collection(db, 'invites'), orderBy('createdAt', 'desc'), limit(max))
}

export function ordersInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  startIso: string,
  endIso: string,
  max = 1000,
): Query | null {
  if (!db) return null
  const base = collection(db, 'orders') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('createdAt', '>=', startIso),
    where('createdAt', '<=', endIso),
  ]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentId', 'in', departments))
  }
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function paymentsInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  startIso: string,
  endIso: string,
  max = 1000,
): Query | null {
  if (!db) return null
  const base = collection(db, 'payments') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('receivedAt', '>=', startIso),
    where('receivedAt', '<=', endIso),
  ]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', departments))
  }
  constraints.push(orderBy('receivedAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function bookingsInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  startIso: string,
  endIso: string,
  max = 1000,
): Query | null {
  if (!db) return null
  const base = collection(db, 'bookings') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('createdAt', '>=', startIso),
    where('createdAt', '<=', endIso),
  ]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', departments))
  }
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

/** Revision history for one booking. Newest revision first. */
export function bookingRevisionsQuery(
  bookingId: ID,
  outletId: ID,
  profile: UserProfile,
  max = 50,
): Query | null {
  if (!db || !bookingId || !outletId) return null
  const base = collection(db, 'bookingRevisions') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('bookingId', '==', bookingId),
    where('outletId', '==', outletId),
  ]
  if (needsDepartmentFilter(profile)) {
    const departments = scopedDepartments(profile)
    if (departments.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', departments))
  }
  constraints.push(orderBy('revision', 'desc'), limit(max))
  return query(base, ...constraints)
}
