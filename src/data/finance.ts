import { callTrustedOperation } from '@/lib/functions'
import type { ExpenseHead, PaymentMode } from '@/types/models'

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('financeOperation', body)
}

export async function createExpense(input: {
  requestId: string
  outletId: string
  head: ExpenseHead
  amountPaise: number
  paidAt: string
  mode: PaymentMode
  reference?: string
  notes?: string
}) {
  return run<{ expenseId: string; expenseNumber: string; status: 'posted' }>({ action: 'expense_create', ...input })
}

export async function voidExpense(expenseId: string, reason: string) {
  return run<{ expenseId: string; expenseNumber: string; status: 'void' }>({ action: 'expense_void', expenseId, reason })
}

export async function openCashSession(input: {
  requestId: string
  outletId: string
  openingFloatPaise: number
  notes?: string
}) {
  return run<{ sessionId: string; sessionNumber: string; status: 'open' }>({ action: 'cash_open', ...input })
}

export async function closeCashSession(input: {
  sessionId: string
  countedCashPaise: number
  handedOverTo: string
  notes?: string
}) {
  return run<{
    sessionId: string
    sessionNumber: string
    status: 'closed'
    expectedCashPaise: number
    variancePaise: number
  }>({ action: 'cash_close', ...input })
}
