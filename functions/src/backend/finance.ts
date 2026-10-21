import type {
  CashSession,
  Expense,
  Outlet,
  Payment,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { makeCashSessionNumber, makeExpenseNumber, serverNow } from '../utils'
import { requireOutletScope, requirePermission } from './context'
import { OperationError } from './errors'
import type { FinanceOperationInput } from './validation'

export interface FinanceOperationResult {
  expenseId?: string
  expenseNumber?: string
  sessionId?: string
  sessionNumber?: string
  status?: 'posted' | 'void' | 'open' | 'closed'
  expectedCashPaise?: number
  variancePaise?: number
}

function roundRupees(value: number): number {
  return Math.round(value)
}

function cashLockId(outletId: string, uid: string): string {
  return `${outletId}__${uid}`
}

async function requireExpense(profile: UserProfile, expenseId: string): Promise<Expense> {
  const snapshot = await getAdminDb().collection('expenses').doc(expenseId).get()
  if (!snapshot.exists) throw new OperationError('not-found', 'This expense no longer exists.')
  const expense = { ...(snapshot.data() as Expense), id: snapshot.id }
  requireOutletScope(profile, expense.outletId)
  return expense
}

async function requireCashSession(profile: UserProfile, sessionId: string): Promise<CashSession> {
  const snapshot = await getAdminDb().collection('cashSessions').doc(sessionId).get()
  if (!snapshot.exists) throw new OperationError('not-found', 'This cash session no longer exists.')
  const session = { ...(snapshot.data() as CashSession), id: snapshot.id }
  requireOutletScope(profile, session.outletId)
  return session
}

function cashMovement(payment: Payment, session: CashSession): number {
  if (payment.mode !== 'cash') return 0
  if (!payment.createdBy || payment.createdBy !== session.openedBy) return 0
  if (payment.receivedAt < session.openedAt) return 0
  return payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise
}

export async function financeOperationForActor(
  profile: UserProfile,
  input: FinanceOperationInput,
): Promise<FinanceOperationResult> {
  requirePermission(profile, 'financeManage')
  const db = getAdminDb()
  const now = serverNow()
  const actorName = profile.displayName?.trim() || profile.email || profile.uid

  if (input.action === 'expense_create') {
    requireOutletScope(profile, input.outletId)
    return db.runTransaction(async (transaction) => {
      const ref = db.collection('expenses').doc(input.requestId)
      const existing = await transaction.get(ref)
      if (existing.exists) {
        const expense = existing.data() as Expense
        requireOutletScope(profile, expense.outletId)
        return { expenseId: existing.id, expenseNumber: expense.expenseNumber, status: expense.status }
      }
      const outletSnapshot = await transaction.get(db.collection('outlets').doc(input.outletId))
      if (!outletSnapshot.exists) throw new OperationError('failed-precondition', 'The expense outlet no longer exists.')
      const outlet = outletSnapshot.data() as Outlet
      const expense: Expense = {
        id: ref.id,
        expenseNumber: makeExpenseNumber(outlet.code || 'OUT'),
        outletId: input.outletId,
        head: input.head,
        amountPaise: roundRupees(input.amountPaise),
        paidAt: new Date(input.paidAt).toISOString(),
        mode: input.mode,
        reference: input.reference?.trim() || '',
        notes: input.notes?.trim() || '',
        status: 'posted',
        actorName,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(ref, expense)
      return { expenseId: ref.id, expenseNumber: expense.expenseNumber, status: 'posted' as const }
    })
  }

  if (input.action === 'expense_void') {
    const expense = await requireExpense(profile, input.expenseId)
    if (expense.status === 'void') {
      throw new OperationError('failed-precondition', 'This expense is already void.')
    }
    return db.runTransaction(async (transaction) => {
      const ref = db.collection('expenses').doc(expense.id)
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists) throw new OperationError('not-found', 'This expense no longer exists.')
      const live = snapshot.data() as Expense
      if (live.status === 'void') {
        return { expenseId: live.id, expenseNumber: live.expenseNumber, status: 'void' as const }
      }
      transaction.update(ref, {
        status: 'void',
        voidReason: input.reason.trim(),
        voidedAt: now,
        voidedBy: profile.uid,
        updatedAt: now,
        updatedBy: profile.uid,
      })
      return { expenseId: live.id, expenseNumber: live.expenseNumber, status: 'void' as const }
    })
  }

  if (input.action === 'cash_open') {
    requireOutletScope(profile, input.outletId)
    const openSnapshot = await db
      .collection('cashSessions')
      .where('outletId', '==', input.outletId)
      .where('openedBy', '==', profile.uid)
      .where('status', '==', 'open')
      .limit(1)
      .get()
    if (!openSnapshot.empty) {
      throw new OperationError('failed-precondition', 'You already have an open cash session for this outlet.')
    }

    return db.runTransaction(async (transaction) => {
      const ref = db.collection('cashSessions').doc(input.requestId)
      const lockRef = db.collection('cashSessionLocks').doc(cashLockId(input.outletId, profile.uid))
      const existing = await transaction.get(ref)
      if (existing.exists) {
        const session = existing.data() as CashSession
        requireOutletScope(profile, session.outletId)
        return { sessionId: existing.id, sessionNumber: session.sessionNumber, status: session.status }
      }

      const lockSnapshot = await transaction.get(lockRef)
      if (lockSnapshot.exists) {
        const lock = lockSnapshot.data() as { status?: string }
        if (lock.status === 'open') {
          throw new OperationError('failed-precondition', 'You already have an open cash session for this outlet.')
        }
      }

      const outletSnapshot = await transaction.get(db.collection('outlets').doc(input.outletId))
      if (!outletSnapshot.exists) throw new OperationError('failed-precondition', 'The cash outlet no longer exists.')
      const outlet = outletSnapshot.data() as Outlet
      const session: CashSession = {
        id: ref.id,
        sessionNumber: makeCashSessionNumber(outlet.code || 'OUT'),
        outletId: input.outletId,
        openedBy: profile.uid,
        openedByName: actorName,
        openedAt: now,
        openingFloatPaise: roundRupees(input.openingFloatPaise),
        status: 'open',
        notes: input.notes?.trim() || '',
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      }
      transaction.set(ref, session)
      transaction.set(lockRef, {
        id: lockRef.id,
        outletId: input.outletId,
        openedBy: profile.uid,
        sessionId: ref.id,
        status: 'open',
        openedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      })
      return { sessionId: ref.id, sessionNumber: session.sessionNumber, status: 'open' as const }
    })
  }

  // cash_close
  const session = await requireCashSession(profile, input.sessionId)
  if (session.status === 'closed') {
    if (session.countedCashPaise === roundRupees(input.countedCashPaise)) {
      return {
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        status: 'closed' as const,
        expectedCashPaise: session.expectedCashPaise,
        variancePaise: session.variancePaise,
      }
    }
    throw new OperationError('failed-precondition', 'This cash session is already closed.')
  }
  if (session.openedBy !== profile.uid && !['super_admin', 'manager', 'accountant'].includes(profile.role)) {
    throw new OperationError('permission-denied', 'Only the person who opened this cash session can close it.')
  }

  return db.runTransaction(async (transaction) => {
    const ref = db.collection('cashSessions').doc(session.id)
    const lockRef = db.collection('cashSessionLocks').doc(cashLockId(session.outletId, session.openedBy))
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new OperationError('not-found', 'This cash session no longer exists.')
    const lockSnapshot = await transaction.get(lockRef)
    const live = snapshot.data() as CashSession
    if (live.status === 'closed') {
      return {
        sessionId: live.id,
        sessionNumber: live.sessionNumber,
        status: 'closed' as const,
        expectedCashPaise: live.expectedCashPaise,
        variancePaise: live.variancePaise,
      }
    }
    const paymentsSnapshot = await transaction.get(
      db.collection('payments')
        .where('outletId', '==', live.outletId)
        .where('mode', '==', 'cash')
        .where('createdBy', '==', live.openedBy)
        .where('receivedAt', '>=', live.openedAt),
    )
    const expected = paymentsSnapshot.docs.reduce((sum, item) => {
      return sum + cashMovement({ ...(item.data() as Payment), id: item.id }, live)
    }, live.openingFloatPaise)
    const counted = roundRupees(input.countedCashPaise)
    const variance = counted - expected
    const nowIso = serverNow()
    transaction.update(ref, {
      status: 'closed',
      closedAt: nowIso,
      countedCashPaise: counted,
      expectedCashPaise: expected,
      variancePaise: variance,
      handedOverTo: input.handedOverTo.trim(),
      notes: input.notes?.trim() || live.notes || '',
      updatedAt: nowIso,
      updatedBy: profile.uid,
    })
    if (lockSnapshot.exists) {
      const lock = lockSnapshot.data() as { status?: string; sessionId?: string }
      if (lock.status === 'open' && lock.sessionId === live.id) {
        transaction.update(lockRef, {
          status: 'closed',
          closedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: profile.uid,
        })
      }
    }
    return {
      sessionId: live.id,
      sessionNumber: live.sessionNumber,
      status: 'closed' as const,
      expectedCashPaise: expected,
      variancePaise: variance,
    }
  })
}
