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
import { uniqueId } from '@/lib/utils'
import type {
  ID,
  LabelBarcodeFormat,
  LabelEvent,
  LabelJobStatus,
  LabelPrintJob,
  LabelReconciliationStatus,
  LabelTemplateSnapshot,
  LabelType,
  LabelUsageCategory,
  UserProfile,
} from '@/types/models'

export interface LabelJobSummary {
  jobId: string
  jobNumber: string
  printedQty: number
  appliedQty: number
  damagedQty: number
  returnedQty: number
  unaccountedQty: number
  status: LabelJobStatus
  reconciliationStatus: LabelReconciliationStatus
}

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('labelOperation', body)
}

export function newRequestId(): string {
  return uniqueId()
}

export async function createLabelJob(input: {
  requestId: string
  jobType: LabelType
  outletId: ID
  departmentId?: ID
  template: LabelTemplateSnapshot
  lines: Array<{
    refId: ID
    requestedQty: number
    batchNumber?: string
    manufacturedAt?: string
    expiryAt?: string
    netQuantity?: string
  }>
  note?: string
}): Promise<{ jobId: string; jobNumber: string }> {
  return run({ action: 'create', ...input })
}

export async function confirmLabelPrint(input: {
  jobId: string
  lines: Array<{ lineId: string; quantity: number }>
  note?: string
}): Promise<LabelJobSummary> {
  return run({ action: 'confirm', ...input })
}

export async function reprintLabels(input: {
  jobId: string
  lines: Array<{ lineId: string; quantity: number }>
  reason: string
}): Promise<LabelJobSummary> {
  return run({ action: 'reprint', ...input })
}

export async function voidLabelPrintEvent(input: {
  jobId: string
  eventId: string
  reason: string
}): Promise<LabelJobSummary> {
  return run({ action: 'void', ...input })
}

export async function recordLabelUsage(input: {
  requestId: string
  jobId: string
  lineId: string
  usageAction: 'apply' | 'damage' | 'return_unused'
  quantity: number
  note?: string
}): Promise<LabelJobSummary> {
  return run({ action: 'usage', ...input })
}

export async function adjustLabelUsage(input: {
  jobId: string
  lineId: string
  category: LabelUsageCategory
  delta: number
  reason: string
}): Promise<LabelJobSummary> {
  return run({ action: 'adjust', ...input })
}

export async function closeLabelJob(input: {
  jobId: string
  note?: string
}): Promise<LabelJobSummary> {
  return run({ action: 'close', ...input })
}

export async function reopenLabelJob(input: {
  jobId: string
  reason: string
}): Promise<LabelJobSummary> {
  return run({ action: 'reopen', ...input })
}

function outletWide(profile: UserProfile): boolean {
  return profile.role === 'super_admin' || profile.role === 'manager' || profile.role === 'accountant'
}

/**
 * Department operators may read their own departments plus outlet-wide account
 * label jobs. Outlet-wide roles read the whole outlet.
 */
function labelDeptConstraint(profile: UserProfile): QueryConstraint | null {
  if (outletWide(profile)) return null
  const departments = profile.departmentIds.slice(0, 9)
  return where('departmentId', 'in', [...departments, ''])
}

export function labelJobsQuery(
  outletId: ID,
  profile: UserProfile,
  max = 400,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && profile.departmentIds.length === 0) return null
  const base = collection(db, 'labelPrintJobs') as CollectionReference
  const constraints: QueryConstraint[] = [where('outletId', '==', outletId)]
  const dept = labelDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('createdAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function labelEventsQuery(
  job: LabelPrintJob,
  profile: UserProfile,
  max = 200,
): Query | null {
  if (!db || !job.id) return null
  const base = collection(db, 'labelEvents') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('jobId', '==', job.id),
    where('outletId', '==', job.outletId),
  ]
  const dept = labelDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('occurredAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export function labelEventsInRangeQuery(
  outletId: ID,
  profile: UserProfile,
  from: string,
  to: string,
  max = 2000,
): Query | null {
  if (!db || !outletId) return null
  if (!outletWide(profile) && profile.departmentIds.length === 0) return null
  const base = collection(db, 'labelEvents') as CollectionReference
  const constraints: QueryConstraint[] = [
    where('outletId', '==', outletId),
    where('occurredAt', '>=', from),
    where('occurredAt', '<=', to),
  ]
  const dept = labelDeptConstraint(profile)
  if (dept) constraints.push(dept)
  constraints.push(orderBy('occurredAt', 'desc'), limit(max))
  return query(base, ...constraints)
}

export interface LabelPrintSetupValues {
  jobType: LabelType
  outletId: ID
  departmentId: ID
  templateName: string
  widthMm: number
  heightMm: number
  marginMm: number
  columns: number
  showName: boolean
  showSku: boolean
  showPrice: boolean
  showMrp: boolean
  showAddress: boolean
  showPhone: boolean
  showUnit: boolean
  showBatch: boolean
  showMfgDate: boolean
  showExpiryDate: boolean
  barcodeFormat: LabelBarcodeFormat
}

export function templateFromSetup(
  values: LabelPrintSetupValues,
): LabelTemplateSnapshot {
  return {
    name: values.templateName,
    type: values.jobType,
    widthMm: values.widthMm,
    heightMm: values.heightMm,
    marginMm: values.marginMm,
    columns: values.columns,
    showName: values.showName,
    showSku: values.showSku,
    showPrice: values.showPrice,
    showMrp: values.showMrp,
    showAddress: values.showAddress,
    showPhone: values.showPhone,
    showUnit: values.showUnit,
    showBatch: values.showBatch,
    showMfgDate: values.showMfgDate,
    showExpiryDate: values.showExpiryDate,
    barcodeFormat: values.barcodeFormat,
  }
}

export function labelEventLabel(event: LabelEvent): string {
  switch (event.kind) {
    case 'created':
      return 'Print job created'
    case 'confirmed':
      return 'Printed quantity confirmed'
    case 'reprinted':
      return 'Reprint recorded'
    case 'voided':
      return 'Print event voided'
    case 'usage':
      return event.category === 'applied'
        ? 'Labels applied'
        : event.category === 'damaged'
          ? 'Labels damaged'
          : 'Unused labels returned'
    case 'adjusted':
      return 'Quantity corrected'
    case 'closed':
      return 'Job closed'
    case 'reopened':
      return 'Job reopened'
    default:
      return 'Label event'
  }
}
