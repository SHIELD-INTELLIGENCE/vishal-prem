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
import { callTrustedOperation } from '@/lib/functions'
import type {
  GstSupplyType,
  ID,
  PaymentMode,
  PurchaseTaxTreatment,
  UserProfile,
} from '@/types/models'

export interface PurchaseLineInput {
  itemType: 'inventory' | 'product'
  itemId: ID
  quantity: number
  ratePaise: number
  discountPercent: number
  taxPercent: number
  taxInclusive: boolean
}

export interface PostPurchaseInput {
  requestId: string
  outletId: ID
  departmentId: ID
  supplierId?: ID
  invoiceNumber: string
  invoiceDate: string
  receivedAt: string
  taxTreatment: PurchaseTaxTreatment
  supplyType: GstSupplyType
  itcClaimable: boolean
  notes?: string
  lines: PurchaseLineInput[]
}

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('purchaseOperation', body)
}

export async function postPurchase(input: PostPurchaseInput): Promise<{
  purchaseId: string
  purchaseNumber: string
  payablePaise: number
}> {
  return run({ action: 'post', ...input })
}

export async function cancelPurchase(input: {
  purchaseId: string
  reason: string
}): Promise<{ purchaseId: string; status: 'cancelled' }> {
  return run({ action: 'cancel', ...input })
}

export async function recordSupplierPayment(input: {
  requestId: string
  supplierId: ID
  outletId: ID
  amountPaise: number
  mode: PaymentMode
  reference?: string
  paidAt: string
  notes?: string
}): Promise<{ paymentId: string; paymentNumber: string; amountPaise: number }> {
  return run({ action: 'supplier_payment', ...input })
}

export async function voidSupplierPayment(input: {
  paymentId: string
  reason: string
}): Promise<{ paymentId: string; paymentNumber: string; amountPaise: number }> {
  return run({ action: 'void_payment', ...input })
}

function outletWide(profile: UserProfile): boolean {
  return profile.role === 'super_admin' || profile.role === 'manager' || profile.role === 'accountant'
}

export function purchasesQuery(
  outletId: ID,
  profile: UserProfile,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && profile.departmentIds.length === 0) return null
  const base = collection(db, 'purchases') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  if (!outletWide(profile)) {
    constraints.push(where('departmentId', 'in', profile.departmentIds.slice(0, 10)))
  }
  constraints.push(orderBy('receivedAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function purchasesInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  from: string,
  to: string,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && profile.departmentIds.length === 0) return null
  const base = collection(db, 'purchases') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('receivedAt', '>=', from),
    where('receivedAt', '<=', to),
  ]
  if (!outletWide(profile)) {
    constraints.push(where('departmentId', 'in', profile.departmentIds.slice(0, 10)))
  }
  constraints.push(orderBy('receivedAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function supplierPaymentsQuery(
  outletId: ID,
  max = 500,
): Query | null {
  if (!db || !outletId) return null
  const base = collection(db, 'supplierPayments') as CollectionReference
  return query(
    base,
    where('outletId', '==', outletId),
    orderBy('paidAt', 'desc'),
    limit(max),
  )
}
