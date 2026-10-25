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

function outletWide(profile: UserProfile): boolean {
  return profile.role === 'super_admin' || profile.role === 'manager' || profile.role === 'accountant'
}

function departments(profile: UserProfile): ID[] {
  return profile.departmentIds.slice(0, 10)
}

function scopedDeptConstraint(profile: UserProfile, field = 'departmentId'): QueryConstraint | null {
  if (outletWide(profile)) return null
  const ids = departments(profile)
  if (ids.length === 0) return null
  return where(field, field === 'departmentIds' ? 'array-contains-any' : 'in', ids)
}

export function productionTasksQuery(
  outletId: ID,
  profile: UserProfile,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, 'productionTasks') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = scopedDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('dueAt', 'asc'), limit(max))
  return query(base, ...constraints)
}

export function productionEventsQuery(
  taskId: ID,
  outletId: ID,
  departmentId: ID,
  profile: UserProfile,
  max = 100,
): Query | null {
  if (!db || !taskId) return null
  const base = collection(db, 'productionEvents') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('taskId', '==', taskId),
    where('outletId', '==', outletId),
  ]
  if (!outletWide(profile)) constraints.push(where('departmentId', '==', departmentId))
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function inventoryItemsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, 'inventoryItems') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = scopedDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('name', 'asc'), limit(max))
  return query(base, ...constraints)
}

export function inventoryMovementsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 1500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, 'inventoryMovements') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = scopedDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('occurredAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function inventoryItemMovementsQuery(
  itemId: ID,
  outletId: ID,
  departmentId: ID,
  profile: UserProfile,
  max = 300,
): Query | null {
  if (!db || !itemId) return null
  const base = collection(db, 'inventoryMovements') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('itemId', '==', itemId),
    where('outletId', '==', outletId),
    where('departmentId', '==', departmentId),
  ]
  constraints.push(orderBy('occurredAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function inventoryMovementsInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  from: string,
  to: string,
  max = 1500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, 'inventoryMovements') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('occurredAt', '>=', from),
    where('occurredAt', '<=', to),
  ]
  const dept = scopedDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('occurredAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function inventoryCountsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 300,
): Query | null {
  const result = inventoryMovementsBase('inventoryCounts', 'countedAt', outletId, profile, max)
  return result
}

function inventoryMovementsBase(
  collectionName: string,
  sortField: string,
  outletId: ID,
  profile: UserProfile,
  max: number,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, collectionName) as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = scopedDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy(sortField, 'desc'), limit(max))
  return query(base, ...constraints)
}

export function deliveriesQuery(
  outletId: ID,
  profile: UserProfile,
  max = 400,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && departments(profile).length === 0) return null
  const base = collection(db, 'deliveries') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = scopedDeptConstraint(profile, 'departmentIds')
  if (dept) constraints.push(dept)
  constraints.push(orderBy('scheduledAt', 'asc'), limit(max))
  return query(base, ...constraints)
}

export function deliveryEventsQuery(
  deliveryId: ID,
  outletId: ID,
  profile: UserProfile,
  max = 100,
): Query | null {
  if (!db || !deliveryId) return null
  const base = collection(db, 'deliveryEvents') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('deliveryId', '==', deliveryId),
    where('outletId', '==', outletId),
  ]
  if (!outletWide(profile)) {
    const ids = departments(profile)
    if (ids.length === 0) return null
    constraints.push(where('departmentIds', 'array-contains-any', ids))
  }
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function expensesQuery(
  outletId: ID,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  return query(
    collection(db, 'expenses') as CollectionReference,
    where('outletId', '==', outletId),
    orderBy('paidAt', 'desc'),
    limit(max),
  )
}

export function cashSessionsQuery(
  outletId: ID,
  max = 200,
): Query | null {
  if (!db || !outletId) return null
  return query(
    collection(db, 'cashSessions') as CollectionReference,
    where('outletId', '==', outletId),
    orderBy('openedAt', 'desc'),
    limit(max),
  )
}
