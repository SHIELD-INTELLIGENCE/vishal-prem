import { randomUUID } from 'node:crypto'
import type {
  Customer,
  LabelEvent,
  LabelJobLine,
  LabelPrintJob,
  LabelTemplateSnapshot,
  LabelUsageCategory,
  Outlet,
  Product,
  UserProfile,
} from '../../../src/types/models'
import {
  MAX_LABEL_JOB_QUANTITY,
  encodeCode128B,
  labelTotals,
} from '../../../src/lib/labels'
import { getAdminDb } from '../admin'
import { makeLabelJobNumber, serverNow } from '../utils'
import {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './context'
import { OperationError } from './errors'
import type { LabelOperationInput } from './validation'

export interface LabelJobSummary {
  jobId: string
  jobNumber: string
  printedQty: number
  appliedQty: number
  damagedQty: number
  returnedQty: number
  unaccountedQty: number
  status: LabelPrintJob['status']
  reconciliationStatus: LabelPrintJob['reconciliationStatus']
}

function summary(job: LabelPrintJob): LabelJobSummary {
  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    printedQty: job.printedQty,
    appliedQty: job.appliedQty,
    damagedQty: job.damagedQty,
    returnedQty: job.returnedQty,
    unaccountedQty: job.unaccountedQty,
    status: job.status,
    reconciliationStatus: job.reconciliationStatus,
  }
}

function requireJobScope(profile: UserProfile, job: LabelPrintJob): void {
  requireOutletScope(profile, job.outletId)
  if (job.departmentId) requireDepartmentScope(profile, job.departmentId)
}

function findLine(job: LabelPrintJob, lineId: string): LabelJobLine {
  const line = job.lines.find((candidate) => candidate.lineId === lineId)
  if (!line) {
    throw new OperationError('not-found', 'This label line is not part of the print job.')
  }
  return line
}

function usageCategory(
  action: 'apply' | 'damage' | 'return_unused',
): LabelUsageCategory {
  if (action === 'apply') return 'applied'
  if (action === 'damage') return 'damaged'
  return 'returned'
}

function applyTotals(job: LabelPrintJob): LabelPrintJob {
  const totals = labelTotals(job.lines)
  return {
    ...job,
    printedQty: totals.printed,
    appliedQty: totals.applied,
    damagedQty: totals.damaged,
    returnedQty: totals.returned,
    unaccountedQty: totals.unaccounted,
  }
}

function validateBarcode(template: LabelTemplateSnapshot, value: string): void {
  if (template.barcodeFormat !== 'code128') return
  try {
    encodeCode128B(value)
  } catch (error) {
    throw new OperationError(
      'invalid-argument',
      `The barcode value cannot be encoded: ${(error as Error).message}`,
    )
  }
}

function firstAddressLine(customer: Customer): string {
  const address = customer.addresses?.[0]
  if (!address) return ''
  return [address.line1, address.line2, address.city, address.pin]
    .filter((part) => Boolean(part?.trim()))
    .join(', ')
}

/**
 * Trusted label operations.
 *
 * The browser can request labels and report physical activity, but every
 * quantity is validated here against persisted products, customers and the
 * append-only label ledger. A browser print dialog never creates a print
 * confirmation.
 */
export async function labelOperationForActor(
  profile: UserProfile,
  input: LabelOperationInput,
): Promise<LabelJobSummary | { jobId: string; jobNumber: string }> {
  const db = getAdminDb()
  const now = serverNow()
  const actorName = profile.displayName?.trim() || profile.email || profile.uid

  if (input.action === 'create') {
    requirePermission(profile, 'labelsManage')
    requireOutletScope(profile, input.outletId)
    if (input.jobType !== input.template.type) {
      throw new OperationError('invalid-argument', 'The template does not match the label type.')
    }
    if (input.jobType === 'item' && !input.departmentId) {
      throw new OperationError('invalid-argument', 'Choose a department for item labels.')
    }
    if (input.jobType === 'account' && input.departmentId) {
      throw new OperationError('invalid-argument', 'Account labels are printed for the outlet, not a department.')
    }
    if (input.departmentId) requireDepartmentScope(profile, input.departmentId)

    const seen = new Set<string>()
    for (const line of input.lines) {
      if (seen.has(line.refId)) {
        throw new OperationError('invalid-argument', 'Each product or account can appear once per print job.')
      }
      seen.add(line.refId)
    }
    const requestedTotal = input.lines.reduce((sum, line) => sum + line.requestedQty, 0)
    if (requestedTotal > MAX_LABEL_JOB_QUANTITY) {
      throw new OperationError(
        'invalid-argument',
        `A print job cannot request more than ${MAX_LABEL_JOB_QUANTITY} labels.`,
      )
    }

    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.requestId)
      const existing = await transaction.get(jobRef)
      if (existing.exists) {
        const job = { ...(existing.data() as LabelPrintJob), id: existing.id }
        requireJobScope(profile, job)
        return { jobId: job.id, jobNumber: job.jobNumber }
      }

      const outletSnapshot = await transaction.get(
        db.collection('outlets').doc(input.outletId),
      )
      if (!outletSnapshot.exists) {
        throw new OperationError('not-found', 'The selected outlet no longer exists.')
      }
      const outlet = outletSnapshot.data() as Outlet

      const lines: LabelJobLine[] = []
      let lineIndex = 0
      for (const requested of input.lines) {
        lineIndex += 1
        const lineId = `line-${lineIndex}`

        if (input.jobType === 'item') {
          const productSnapshot = await transaction.get(
            db.collection('products').doc(requested.refId),
          )
          if (!productSnapshot.exists) {
            throw new OperationError('failed-precondition', 'A selected product no longer exists.')
          }
          const product: Product = {
            ...(productSnapshot.data() as Product),
            id: productSnapshot.id,
          }
          if (!product.outletIds.includes(input.outletId)) {
            throw new OperationError('failed-precondition', `${product.name} is not sold at this outlet.`)
          }
          if (product.departmentId !== input.departmentId) {
            throw new OperationError(
              'failed-precondition',
              `${product.name} belongs to another department. Print one department per job.`,
            )
          }
          if (!product.active) {
            throw new OperationError('failed-precondition', `${product.name} is inactive and cannot be labelled.`)
          }
          if (
            requested.manufacturedAt
            && requested.expiryAt
            && requested.expiryAt < requested.manufacturedAt
          ) {
            throw new OperationError(
              'invalid-argument',
              `${product.name}: the expiry date cannot be before the manufacturing date.`,
            )
          }
          if (input.template.showBatch && product.batchTracking && !requested.batchNumber?.trim()) {
            throw new OperationError(
              'invalid-argument',
              `${product.name} uses batch tracking. Enter a batch or lot number for this label job.`,
            )
          }
          if (input.template.showExpiryDate && product.expiryTracking && !requested.expiryAt) {
            throw new OperationError(
              'invalid-argument',
              `${product.name} uses expiry tracking. Enter an expiry or use-by date for this label job.`,
            )
          }
          const sku = product.sku?.trim() || product.id
          const barcodeValue = sku
          validateBarcode(input.template, barcodeValue)
          lines.push({
            lineId,
            refId: product.id,
            kind: 'item',
            name: product.printName?.trim() || product.name,
            sku,
            barcodeValue: input.template.barcodeFormat === 'none' ? '' : barcodeValue,
            unit: product.unit,
            pricePaise: product.salePricePaise,
            mrpPaise: product.mrpPaise,
            ...(requested.batchNumber?.trim() ? { batchNumber: requested.batchNumber.trim() } : {}),
            ...(requested.manufacturedAt ? { manufacturedAt: requested.manufacturedAt } : {}),
            ...(requested.expiryAt ? { expiryAt: requested.expiryAt } : {}),
            ...(requested.netQuantity?.trim() ? { netQuantity: requested.netQuantity.trim() } : {}),
            requestedQty: requested.requestedQty,
            printedQty: 0,
            appliedQty: 0,
            damagedQty: 0,
            returnedQty: 0,
          })
          continue
        }

        const customerSnapshot = await transaction.get(
          db.collection('customers').doc(requested.refId),
        )
        if (!customerSnapshot.exists) {
          throw new OperationError('failed-precondition', 'A selected account no longer exists.')
        }
        const customer: Customer = {
          ...(customerSnapshot.data() as Customer),
          id: customerSnapshot.id,
        }
        if (!customer.active) {
          throw new OperationError('failed-precondition', `${customer.name} is inactive.`)
        }
        if (customer.outletIds.length > 0 && !customer.outletIds.includes(input.outletId)) {
          throw new OperationError('failed-precondition', `${customer.name} is outside this outlet.`)
        }
        validateBarcode(input.template, customer.id)
        lines.push({
          lineId,
          refId: customer.id,
          kind: 'account',
          name: customer.name,
          sku: customer.phone || customer.id,
          barcodeValue: input.template.barcodeFormat === 'none' ? '' : customer.id,
          addressLine: firstAddressLine(customer),
          phone: customer.phone,
          requestedQty: requested.requestedQty,
          printedQty: 0,
          appliedQty: 0,
          damagedQty: 0,
          returnedQty: 0,
        })
      }

      const job: LabelPrintJob = {
        id: jobRef.id,
        jobNumber: makeLabelJobNumber(outlet.code),
        jobType: input.jobType,
        outletId: input.outletId,
        departmentId: input.departmentId ?? '',
        template: input.template,
        lines,
        requestedQty: requestedTotal,
        printedQty: 0,
        reprintQty: 0,
        appliedQty: 0,
        damagedQty: 0,
        returnedQty: 0,
        unaccountedQty: 0,
        status: 'requested',
        reconciliationStatus: 'open',
        printedByName: actorName,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)

      const eventRef = db.collection('labelEvents').doc(`created-${jobRef.id}`)
      const event: LabelEvent = {
        id: eventRef.id,
        jobId: jobRef.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'created',
        lines: [],
        note: input.note?.trim() || '',
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(eventRef, event)

      return { jobId: job.id, jobNumber: job.jobNumber }
    })
  }

  if (input.action === 'confirm') {
    requirePermission(profile, 'labelsManage')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const jobSnapshot = await transaction.get(jobRef)
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)
      if (job.status !== 'requested') {
        throw new OperationError(
          'failed-precondition',
          'Printed quantities are already confirmed. Record a reprint instead.',
        )
      }

      let confirmedTotal = 0
      const eventLines: LabelEvent['lines'] = []
      const updates = new Map<string, number>()
      for (const line of input.lines) {
        const jobLine = findLine(job, line.lineId)
        if (line.quantity > jobLine.requestedQty) {
          throw new OperationError(
            'invalid-argument',
            `${jobLine.name}: confirmed quantity cannot exceed the requested ${jobLine.requestedQty}.`,
          )
        }
        confirmedTotal += line.quantity
        if (line.quantity > 0) {
          updates.set(line.lineId, line.quantity)
          eventLines.push({ lineId: line.lineId, quantity: line.quantity })
        }
      }
      if (confirmedTotal === 0) {
        throw new OperationError('invalid-argument', 'Confirm at least one printed label, or cancel the job.')
      }

      job = applyTotals({
        ...job,
        lines: job.lines.map((line) => ({
          ...line,
          printedQty: line.printedQty + (updates.get(line.lineId) ?? 0),
        })),
        status: 'printed',
        printedByName: actorName,
        confirmedAt: now,
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })

      const eventId = randomUUID()
      const event: LabelEvent = {
        id: eventId,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'confirmed',
        lines: eventLines,
        note: input.note?.trim() || '',
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(db.collection('labelEvents').doc(eventId), event)
      return summary(job)
    })
  }

  if (input.action === 'reprint') {
    requirePermission(profile, 'labelsManage')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const jobSnapshot = await transaction.get(jobRef)
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)
      if (job.status === 'closed') {
        throw new OperationError('failed-precondition', 'Reopen this job before reprinting labels.')
      }
      if (job.status !== 'printed') {
        throw new OperationError('failed-precondition', 'Confirm the original print output first.')
      }

      let reprintTotal = 0
      const updates = new Map<string, number>()
      const eventLines: LabelEvent['lines'] = []
      for (const line of input.lines) {
        findLine(job, line.lineId)
        if (line.quantity === 0) continue
        reprintTotal += line.quantity
        updates.set(line.lineId, line.quantity)
        eventLines.push({ lineId: line.lineId, quantity: line.quantity })
      }
      if (reprintTotal === 0) {
        throw new OperationError('invalid-argument', 'Enter the quantity that was reprinted.')
      }

      job = applyTotals({
        ...job,
        lines: job.lines.map((line) => ({
          ...line,
          printedQty: line.printedQty + (updates.get(line.lineId) ?? 0),
        })),
        reprintQty: job.reprintQty + reprintTotal,
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })

      const eventId = randomUUID()
      const event: LabelEvent = {
        id: eventId,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'reprinted',
        lines: eventLines,
        reason: input.reason.trim(),
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(db.collection('labelEvents').doc(eventId), event)
      return summary(job)
    })
  }

  if (input.action === 'void') {
    requirePermission(profile, 'labelsReconcile')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const eventRef = db.collection('labelEvents').doc(input.eventId)
      const eventsQuery = db
        .collection('labelEvents')
        .where('jobId', '==', input.jobId)
      const jobSnapshot = await transaction.get(jobRef)
      const eventSnapshot = await transaction.get(eventRef)
      const jobEvents = await transaction.get(eventsQuery)
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)
      if (job.status === 'closed') {
        throw new OperationError('failed-precondition', 'Reopen this job before correcting print events.')
      }
      if (!eventSnapshot.exists) throw new OperationError('not-found', 'This print event no longer exists.')
      const original = { ...(eventSnapshot.data() as LabelEvent), id: eventSnapshot.id }
      if (original.jobId !== job.id) {
        throw new OperationError('invalid-argument', 'This event belongs to another print job.')
      }
      if (original.kind !== 'confirmed' && original.kind !== 'reprinted') {
        throw new OperationError('failed-precondition', 'Only a print confirmation or reprint can be voided.')
      }
      const alreadyVoided = jobEvents.docs.some(
        (doc) => (doc.data() as LabelEvent).voidsEventId === original.id,
      )
      if (alreadyVoided) {
        throw new OperationError('already-exists', 'This print event has already been voided.')
      }

      const reductions = new Map(
        original.lines.map((line) => [line.lineId, line.quantity]),
      )
      const nextLines = job.lines.map((line) => ({
        ...line,
        printedQty: line.printedQty - (reductions.get(line.lineId) ?? 0),
      }))
      for (const line of nextLines) {
        if (line.printedQty < 0) {
          throw new OperationError('failed-precondition', 'Voiding this event would make printed quantities negative.')
        }
        if (line.appliedQty + line.damagedQty + line.returnedQty > line.printedQty) {
          throw new OperationError(
            'failed-precondition',
            `${line.name}: physical usage is already recorded against these labels. Correct the usage first.`,
          )
        }
      }

      job = applyTotals({
        ...job,
        lines: nextLines,
        reprintQty: Math.max(
          0,
          job.reprintQty - (original.kind === 'reprinted' ? original.lines.reduce((sum, line) => sum + line.quantity, 0) : 0),
        ),
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      job.status = job.printedQty > 0 ? 'printed' : 'requested'

      const voidId = randomUUID()
      const voidEvent: LabelEvent = {
        id: voidId,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'voided',
        lines: [],
        voidsEventId: original.id,
        reason: input.reason.trim(),
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(db.collection('labelEvents').doc(voidId), voidEvent)
      return summary(job)
    })
  }

  if (input.action === 'usage') {
    requirePermission(profile, 'labelsManage')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const usageRef = db.collection('labelEvents').doc(input.requestId)
      const [jobSnapshot, usageSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(usageRef),
      ])
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)

      const category = usageCategory(input.usageAction)
      if (usageSnapshot.exists) {
        const existing = usageSnapshot.data() as LabelEvent
        if (
          existing.jobId !== job.id
          || existing.lineId !== input.lineId
          || existing.category !== category
          || existing.quantity !== input.quantity
          || existing.kind !== 'usage'
        ) {
          throw new OperationError('already-exists', 'This request identifier was already used for another label entry.')
        }
        return summary(job)
      }

      if (job.status !== 'printed') {
        throw new OperationError(
          'failed-precondition',
          job.status === 'closed'
            ? 'This job is closed. Reopen it before recording more labels.'
            : 'Confirm the printed quantity before recording label usage.',
        )
      }
      const jobLine = findLine(job, input.lineId)

      const nextLine: LabelJobLine = { ...jobLine }
      if (category === 'applied') nextLine.appliedQty += input.quantity
      if (category === 'damaged') nextLine.damagedQty += input.quantity
      if (category === 'returned') nextLine.returnedQty += input.quantity
      const accounted = nextLine.appliedQty + nextLine.damagedQty + nextLine.returnedQty
      if (accounted > nextLine.printedQty) {
        throw new OperationError(
          'failed-precondition',
          `${jobLine.name}: only ${Math.max(0, jobLine.printedQty - (jobLine.appliedQty + jobLine.damagedQty + jobLine.returnedQty))} printed labels remain unaccounted.`,
        )
      }

      job = applyTotals({
        ...job,
        lines: job.lines.map((line) => (line.lineId === input.lineId ? nextLine : line)),
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })

      const event: LabelEvent = {
        id: usageRef.id,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'usage',
        lines: [],
        lineId: jobLine.lineId,
        category,
        quantity: input.quantity,
        note: input.note?.trim() || '',
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(usageRef, event)
      return summary(job)
    })
  }

  if (input.action === 'adjust') {
    requirePermission(profile, 'labelsReconcile')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const jobSnapshot = await transaction.get(jobRef)
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)
      if (job.status === 'closed') {
        throw new OperationError('failed-precondition', 'Reopen this job before correcting quantities.')
      }
      const jobLine = findLine(job, input.lineId)

      const nextLine: LabelJobLine = { ...jobLine }
      if (input.category === 'applied') nextLine.appliedQty += input.delta
      if (input.category === 'damaged') nextLine.damagedQty += input.delta
      if (input.category === 'returned') nextLine.returnedQty += input.delta
      if (nextLine.appliedQty < 0 || nextLine.damagedQty < 0 || nextLine.returnedQty < 0) {
        throw new OperationError('failed-precondition', 'A correction cannot make a quantity negative.')
      }
      const accounted = nextLine.appliedQty + nextLine.damagedQty + nextLine.returnedQty
      if (accounted > nextLine.printedQty) {
        throw new OperationError(
          'failed-precondition',
          'This correction would account for more labels than were confirmed printed.',
        )
      }

      job = applyTotals({
        ...job,
        lines: job.lines.map((line) => (line.lineId === input.lineId ? nextLine : line)),
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })

      const eventId = randomUUID()
      const event: LabelEvent = {
        id: eventId,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'adjusted',
        lines: [],
        lineId: jobLine.lineId,
        category: input.category,
        quantity: input.delta,
        reason: input.reason.trim(),
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(db.collection('labelEvents').doc(eventId), event)
      return summary(job)
    })
  }

  if (input.action === 'close') {
    requirePermission(profile, 'labelsReconcile')
    return db.runTransaction(async (transaction) => {
      const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
      const jobSnapshot = await transaction.get(jobRef)
      if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
      let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
      requireJobScope(profile, job)
      if (job.status === 'closed') {
        throw new OperationError('failed-precondition', 'This print job is already closed.')
      }
      const totals = labelTotals(job.lines)
      if (totals.printed === 0) {
        throw new OperationError('failed-precondition', 'Confirm the printed quantity before closing this job.')
      }
      if (totals.unaccounted > 0 && !input.note?.trim()) {
        throw new OperationError(
          'invalid-argument',
          'Explain the unaccounted labels before closing with a discrepancy.',
        )
      }

      job = applyTotals({
        ...job,
        status: 'closed',
        reconciliationStatus: totals.unaccounted > 0 ? 'discrepancy' : 'reconciled',
        closedAt: now,
        closedByName: actorName,
        closeNote: input.note?.trim() || '',
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: profile.uid,
      })

      const eventId = randomUUID()
      const event: LabelEvent = {
        id: eventId,
        jobId: job.id,
        jobNumber: job.jobNumber,
        outletId: job.outletId,
        departmentId: job.departmentId,
        kind: 'closed',
        lines: [],
        note: input.note?.trim() || '',
        quantity: totals.unaccounted,
        actorName,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(jobRef, job)
      transaction.set(db.collection('labelEvents').doc(eventId), event)
      return summary(job)
    })
  }

  requirePermission(profile, 'labelsReconcile')
  return db.runTransaction(async (transaction) => {
    const jobRef = db.collection('labelPrintJobs').doc(input.jobId)
    const jobSnapshot = await transaction.get(jobRef)
    if (!jobSnapshot.exists) throw new OperationError('not-found', 'This print job no longer exists.')
    let job: LabelPrintJob = { ...(jobSnapshot.data() as LabelPrintJob), id: jobSnapshot.id }
    requireJobScope(profile, job)
    if (job.status !== 'closed') {
      throw new OperationError('failed-precondition', 'Only a closed print job can be reopened.')
    }

    job = {
      ...job,
      status: 'printed',
      reconciliationStatus: 'open',
      reopenedAt: now,
      reopenedByName: actorName,
      reopenReason: input.reason.trim(),
      lastActivityAt: now,
      updatedAt: now,
      updatedBy: profile.uid,
    }

    const eventId = randomUUID()
    const event: LabelEvent = {
      id: eventId,
      jobId: job.id,
      jobNumber: job.jobNumber,
      outletId: job.outletId,
      departmentId: job.departmentId,
      kind: 'reopened',
      lines: [],
      reason: input.reason.trim(),
      actorName,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: profile.uid,
      updatedBy: profile.uid,
    }
    transaction.set(jobRef, job)
    transaction.set(db.collection('labelEvents').doc(eventId), event)
    return summary(job)
  })
}
