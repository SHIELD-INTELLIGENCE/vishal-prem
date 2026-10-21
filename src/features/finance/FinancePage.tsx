import { useMemo, useState } from 'react'
import { format, isToday, parseISO, startOfMonth } from 'date-fns'
import {
  Banknote,
  ClipboardCopy,
  Download,
  Plus,
  ReceiptText,
  Scale,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { bookingsQuery, customersQuery, ordersQuery, paymentsQuery } from '@/data/queries'
import { cashSessionsQuery, expensesQuery } from '@/data/operationsQueries'
import { closeCashSession, createExpense, openCashSession, voidExpense } from '@/data/finance'
import { buildPartyStatement, type PartyStatement } from '@/lib/partyLedger'
import type {
  Booking,
  CashSession,
  Customer,
  Expense,
  ExpenseHead,
  Order,
  Payment,
  PaymentMode,
} from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { downloadCsv } from '@/lib/csv'
import { capLabels } from '@/lib/dataCompleteness'
import { formatDate, formatDateTime, formatINR, titleCase } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { uniqueId } from '@/lib/utils'

const EXPENSE_HEADS: Array<{ value: ExpenseHead; label: string }> = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'rent', label: 'Rent' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'transport', label: 'Transport' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
]

const FINANCE_READ_CAPS = {
  orders: 500,
  bookings: 500,
  payments: 1000,
  customers: 500,
  expenses: 500,
  sessions: 200,
} as const

export function FinancePage() {
  const { profile } = useAuth()
  const { selectedOutlet } = useWorkspace()
  const [tab, setTab] = useState('overview')
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [cashOpen, setCashOpen] = useState(false)
  const [closeSession, setCloseSession] = useState<CashSession | null>(null)

  const outletId = selectedOutlet?.id ?? ''
  const ordersState = useCollectionData<Order>(
    () => (profile && outletId ? ordersQuery(outletId, profile, FINANCE_READ_CAPS.orders + 1) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const bookingsState = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsQuery(outletId, profile, FINANCE_READ_CAPS.bookings + 1) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const paymentsState = useCollectionData<Payment>(
    () => (profile && outletId ? paymentsQuery(outletId, profile, FINANCE_READ_CAPS.payments + 1) : null),
    [outletId, profile?.uid, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )
  const customersState = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, FINANCE_READ_CAPS.customers + 1) : null),
    [outletId],
    Boolean(outletId),
  )
  const expensesState = useCollectionData<Expense>(
    () => (outletId ? expensesQuery(outletId, FINANCE_READ_CAPS.expenses + 1) : null),
    [outletId],
    Boolean(outletId),
  )
  const sessionsState = useCollectionData<CashSession>(
    () => (outletId ? cashSessionsQuery(outletId, FINANCE_READ_CAPS.sessions + 1) : null),
    [outletId],
    Boolean(outletId),
  )

  const capped = capLabels([
    { label: 'orders', loaded: ordersState.rows.length, cap: FINANCE_READ_CAPS.orders },
    { label: 'bookings', loaded: bookingsState.rows.length, cap: FINANCE_READ_CAPS.bookings },
    { label: 'payments', loaded: paymentsState.rows.length, cap: FINANCE_READ_CAPS.payments },
    { label: 'party accounts', loaded: customersState.rows.length, cap: FINANCE_READ_CAPS.customers },
    { label: 'expenses', loaded: expensesState.rows.length, cap: FINANCE_READ_CAPS.expenses },
    { label: 'cash sessions', loaded: sessionsState.rows.length, cap: FINANCE_READ_CAPS.sessions },
  ])
  const dataIncomplete = capped.length > 0
  const cappedSet = new Set(capped)
  const orders = ordersState.rows.slice(0, FINANCE_READ_CAPS.orders)
  const bookings = bookingsState.rows.slice(0, FINANCE_READ_CAPS.bookings)
  const payments = paymentsState.rows.slice(0, FINANCE_READ_CAPS.payments)
  const customers = customersState.rows.slice(0, FINANCE_READ_CAPS.customers)
  const expenses = expensesState.rows.slice(0, FINANCE_READ_CAPS.expenses)
  const sessions = sessionsState.rows.slice(0, FINANCE_READ_CAPS.sessions)

  const statements = useMemo(() => {
    return customers
      .map((customer) => ({
        customer,
        statement: buildPartyStatement(customer, orders, bookings, payments),
      }))
      .filter((item) => item.statement.closingBalancePaise !== 0 || item.statement.entries.length > 0)
  }, [customers, orders, bookings, payments])

  const outstanding = statements.filter((item) => item.statement.closingBalancePaise > 0)
  const stats = useMemo(() => {
    const todayPayments = payments.filter((payment) => isToday(parseISO(payment.receivedAt)))
    const collections = todayPayments.reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amountPaise : payment.amountPaise), 0)
    const monthStart = startOfMonth(new Date())
    const monthExpenses = expenses
      .filter((expense) => expense.status === 'posted' && parseISO(expense.paidAt) >= monthStart)
      .reduce((sum, expense) => sum + expense.amountPaise, 0)
    return {
      outstanding: outstanding.reduce((sum, item) => sum + item.statement.closingBalancePaise, 0),
      outstandingParties: outstanding.length,
      collections,
      monthExpenses,
      openSessions: sessions.filter((session) => session.status === 'open').length,
    }
  }, [outstanding, payments, expenses, sessions])

  const selectedStatement: PartyStatement | null = statementCustomer
    ? buildPartyStatement(statementCustomer, orders, bookings, payments)
    : null
  const outstandingIncomplete = cappedSet.has('orders')
    || cappedSet.has('bookings')
    || cappedSet.has('payments')
    || cappedSet.has('party accounts')

  const expenseColumns: DataColumn<Expense>[] = [
    { key: 'number', header: 'Expense', accessor: (expense) => expense.expenseNumber, render: (expense) => <span className="font-semibold">{expense.expenseNumber}</span>, sortable: true },
    { key: 'date', header: 'Paid', accessor: (expense) => expense.paidAt, render: (expense) => formatDate(expense.paidAt), sortable: true },
    { key: 'head', header: 'Head', accessor: (expense) => titleCase(expense.head) },
    { key: 'amount', header: 'Amount', accessor: (expense) => expense.amountPaise, render: (expense) => formatINR(expense.amountPaise), align: 'right', sortable: true },
    { key: 'mode', header: 'Mode', accessor: (expense) => titleCase(expense.mode), hideBelow: 'md' },
    { key: 'notes', header: 'Notes', accessor: (expense) => expense.notes, hideBelow: 'lg' },
    { key: 'status', header: 'Status', accessor: (expense) => expense.status, render: (expense) => <Badge tone={expense.status === 'posted' ? 'success' : 'neutral'}>{titleCase(expense.status)}</Badge> },
  ]

  const sessionColumns: DataColumn<CashSession>[] = [
    { key: 'number', header: 'Session', accessor: (session) => session.sessionNumber, render: (session) => <span className="font-semibold">{session.sessionNumber}</span>, sortable: true },
    { key: 'opened', header: 'Opened', accessor: (session) => session.openedAt, render: (session) => formatDateTime(session.openedAt), sortable: true },
    { key: 'staff', header: 'Opened by', accessor: (session) => session.openedByName, hideBelow: 'md' },
    { key: 'float', header: 'Opening float', accessor: (session) => session.openingFloatPaise, render: (session) => formatINR(session.openingFloatPaise), align: 'right', hideBelow: 'lg' },
    { key: 'expected', header: 'Expected cash', accessor: (session) => session.expectedCashPaise ?? 0, render: (session) => session.expectedCashPaise === undefined ? '—' : formatINR(session.expectedCashPaise), align: 'right', hideBelow: 'lg' },
    { key: 'variance', header: 'Variance', accessor: (session) => session.variancePaise ?? 0, render: (session) => session.variancePaise === undefined ? '—' : <span className={session.variancePaise === 0 ? 'text-sage-700' : 'font-semibold text-brand-700'}>{formatINR(session.variancePaise)}</span>, align: 'right' },
    { key: 'status', header: 'Status', accessor: (session) => session.status, render: (session) => <StatusBadge status={session.status} /> },
  ]

  if (!hasPermission(profile, 'financeView')) {
    return <ErrorState title="Finance is not available" message="Your role does not include View finance." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={selectedOutlet?.name}
        title="Finance"
        description={dataIncomplete
          ? 'Party statements, outstanding balances, expenses and cash sessions. One or more source registers reached their load cap, so balances on this screen are incomplete.'
          : 'Party statements, outstanding balances, expenses and cash sessions. Statements are derived from the original orders, bookings and receipts, so historical attribution is preserved.'}
        help="finance"
        actions={
          hasPermission(profile, 'financeManage') ? (
            <>
              <Button onClick={() => setExpenseOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Record expense</Button>
              <Button variant="outline" onClick={() => setCashOpen(true)} leftIcon={<WalletCards className="h-4 w-4" />}>Open cash session</Button>
            </>
          ) : undefined
        }
      />

      {dataIncomplete && (
        <div className="rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-ink-700" role="status">
          <p className="font-semibold">Balances are incomplete</p>
          <p className="mt-1 text-xs leading-relaxed">
            These registers reached their safe load cap: {capped.join(', ')}. Do not use this screen for collection,
            reminders or reconciliation. Narrow the outlet scope or open the source register before relying on a balance.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={outstandingIncomplete ? 'Outstanding (incomplete)' : 'Outstanding'} value={outstandingIncomplete ? 'Incomplete' : formatINR(stats.outstanding)} hint={outstandingIncomplete ? 'Source data is capped' : `${stats.outstandingParties} parties with a balance`} tone="brand" icon={<Scale className="h-4 w-4" />} loading={paymentsState.loading} />
        <StatCard label={cappedSet.has('payments') ? 'Collected today (incomplete)' : 'Collected today'} value={cappedSet.has('payments') ? 'Incomplete' : formatINR(stats.collections)} hint="Receipts less refunds" tone="sage" icon={<Banknote className="h-4 w-4" />} loading={paymentsState.loading} />
        <StatCard label={cappedSet.has('expenses') ? 'Expenses this month (incomplete)' : 'Expenses this month'} value={cappedSet.has('expenses') ? 'Incomplete' : formatINR(stats.monthExpenses)} hint="Posted expenses only" tone="gold" icon={<ReceiptText className="h-4 w-4" />} loading={expensesState.loading} />
        <StatCard label={cappedSet.has('cash sessions') ? 'Open cash sessions (incomplete)' : 'Open cash sessions'} value={cappedSet.has('cash sessions') ? 'Incomplete' : stats.openSessions} hint="Need a counted handover" icon={<WalletCards className="h-4 w-4" />} loading={sessionsState.loading} />
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Outstanding', icon: <Scale className="h-4 w-4" /> },
          { id: 'expenses', label: 'Expenses', icon: <ReceiptText className="h-4 w-4" /> },
          { id: 'cash', label: 'Cash sessions', icon: <WalletCards className="h-4 w-4" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        ordersState.error || bookingsState.error || paymentsState.error ? (
          <ErrorState message={ordersState.error ?? bookingsState.error ?? paymentsState.error ?? ''} onRetry={() => { ordersState.reload(); bookingsState.reload(); paymentsState.reload() }} help="finance" />
        ) : (
          <DataTable
            rows={outstanding}
            columns={[
              { key: 'party', header: 'Party', accessor: (row) => row.customer.name, render: (row) => <div><p className="font-semibold">{row.customer.name}</p><p className="text-[11px] text-ink-500">{row.customer.phone || row.customer.accountGroup}</p></div>, sortable: true },
              { key: 'billed', header: 'Billed', accessor: (row) => row.statement.billedPaise, render: (row) => formatINR(row.statement.billedPaise), align: 'right', hideBelow: 'md' },
              { key: 'received', header: 'Received', accessor: (row) => row.statement.receivedPaise, render: (row) => formatINR(row.statement.receivedPaise), align: 'right', hideBelow: 'md' },
              { key: 'balance', header: 'Outstanding', accessor: (row) => row.statement.closingBalancePaise, render: (row) => <span className="font-semibold text-brand-700">{formatINR(row.statement.closingBalancePaise)}</span>, align: 'right', sortable: true },
            ]}
            getRowId={(row) => row.customer.id}
            loading={customersState.loading || paymentsState.loading}
            searchPlaceholder="Search party or phone…"
            searchFields={(row) => [row.customer.name, row.customer.phone, row.customer.accountGroup]}
            exportFilename={dataIncomplete ? undefined : `party-outstanding-${format(new Date(), 'yyyy-MM-dd')}.csv`}
            emptyTitle={dataIncomplete ? 'Outstanding list incomplete' : 'No outstanding balances'}
            emptyDescription={dataIncomplete
              ? 'The source registers reached their load cap. This empty result cannot be treated as proof that no party owes money.'
              : 'A party appears here when derived debits exceed recorded receipts and refunds.'}
            mobileTitle={(row) => row.customer.name}
            mobileSubtitle={(row) => `${formatINR(row.statement.closingBalancePaise)} outstanding`}
            rowActions={(row) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="outline" onClick={() => setStatementCustomer(row.customer)}>Statement</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dataIncomplete}
                  title={dataIncomplete ? 'Balances are incomplete; reminders are disabled.' : undefined}
                  onClick={() => {
                    const text = `Namaste ${row.customer.name},\n\nOur records show ${formatINR(row.statement.closingBalancePaise)} outstanding as of ${formatDate(new Date())} for ${selectedOutlet?.name ?? 'our outlet'}.\n\nPlease review the statement or contact us if a payment is missing.\n\nThank you.`
                    navigator.clipboard?.writeText(text).then(
                      () => toast.success('Reminder copied to clipboard'),
                      () => toast.error('Could not copy the reminder'),
                    )
                  }}
                  leftIcon={<ClipboardCopy className="h-3.5 w-3.5" />}
                >
                  Reminder
                </Button>
              </div>
            )}
            caption={dataIncomplete
              ? 'Incomplete: one or more source registers reached the load cap. These balances are not authoritative for collection or reconciliation.'
              : 'Outstanding is opening balance + orders/bookings − receipts + refunds. It does not invent GST, tax filing or accounting integrations.'}
          />
        )
      ) : tab === 'expenses' ? (
        <DataTable
          rows={expensesState.rows}
          columns={expenseColumns}
          getRowId={(expense) => expense.id}
          loading={expensesState.loading}
          searchPlaceholder="Search expense, head or notes…"
          searchFields={(expense) => [expense.expenseNumber, expense.head, expense.notes, expense.reference]}
          exportFilename={`expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No expenses recorded"
          emptyDescription="Record utilities, rent, transport and other outlet expenses. Voiding preserves the original record."
          emptyAction={hasPermission(profile, 'financeManage') ? <Button onClick={() => setExpenseOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>Record first expense</Button> : undefined}
          mobileTitle={(expense) => expense.expenseNumber}
          mobileSubtitle={(expense) => `${titleCase(expense.head)} · ${formatINR(expense.amountPaise)}`}
          mobileMeta={(expense) => <Badge tone={expense.status === 'posted' ? 'success' : 'neutral'}>{titleCase(expense.status)}</Badge>}
          rowActions={(expense) => hasPermission(profile, 'financeManage') && expense.status === 'posted' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const reason = window.prompt('Why is this expense being voided?')
                if (!reason?.trim()) return
                voidExpense(expense.id, reason)
                  .then(() => toast.success('Expense voided'))
                  .catch((error) => toast.error(friendlyFirebaseError(error)))
              }}
            >
              Void
            </Button>
          ) : undefined}
        />
      ) : (
        <DataTable
          rows={sessionsState.rows}
          columns={sessionColumns}
          getRowId={(session) => session.id}
          loading={sessionsState.loading}
          searchPlaceholder="Search session, staff or handover…"
          searchFields={(session) => [session.sessionNumber, session.openedByName, session.handedOverTo, session.notes]}
          exportFilename={`cash-sessions-${format(new Date(), 'yyyy-MM-dd')}.csv`}
          emptyTitle="No cash sessions"
          emptyDescription="Open a session before collecting cash, then close it with a counted handover to record variance."
          emptyAction={hasPermission(profile, 'financeManage') ? <Button onClick={() => setCashOpen(true)} leftIcon={<WalletCards className="h-4 w-4" />}>Open first session</Button> : undefined}
          mobileTitle={(session) => session.sessionNumber}
          mobileSubtitle={(session) => `${session.openedByName} · ${formatDateTime(session.openedAt)}`}
          mobileMeta={(session) => <StatusBadge status={session.status} />}
          rowActions={(session) => hasPermission(profile, 'financeManage') && session.status === 'open' ? (
            <Button size="sm" variant="outline" onClick={() => setCloseSession(session)}>Close</Button>
          ) : undefined}
        />
      )}

      <PartyStatementDialog
        customer={statementCustomer}
        statement={selectedStatement}
        incomplete={dataIncomplete}
        onClose={() => setStatementCustomer(null)}
      />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} outletId={outletId} />
      <OpenCashDialog open={cashOpen} onOpenChange={setCashOpen} outletId={outletId} />
      <CloseCashDialog session={closeSession} onClose={() => setCloseSession(null)} />
    </div>
  )
}

function PartyStatementDialog({ customer, statement, incomplete, onClose }: { customer: Customer | null; statement: PartyStatement | null; incomplete: boolean; onClose: () => void }) {
  if (!customer || !statement) return null

  function exportStatement() {
    downloadCsv(
      `party-statement-${customer!.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      statement!.entries,
      [
        { header: 'Date', value: (entry) => entry.date },
        { header: 'Reference', value: (entry) => entry.referenceNumber },
        { header: 'Description', value: (entry) => entry.description },
        { header: 'Debit (INR)', value: (entry) => entry.type === 'debit' ? (entry.amountPaise / 100).toFixed(2) : '' },
        { header: 'Credit (INR)', value: (entry) => entry.type === 'credit' ? (entry.amountPaise / 100).toFixed(2) : '' },
      ],
    )
  }

  return (
    <Dialog
      open={Boolean(customer)}
      onOpenChange={(open) => { if (!open) onClose() }}
      title={`Statement · ${customer.name}`}
      description={`${customer.phone || 'No phone'} · Opening ${formatINR(statement.openingBalancePaise)} · Closing ${formatINR(statement.closingBalancePaise)}${incomplete ? ' · Incomplete data' : ''}`}
      size="xl"
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={exportStatement} disabled={incomplete} title={incomplete ? 'Source data is capped; export is disabled.' : undefined} leftIcon={<Download className="h-4 w-4" />}>Export statement</Button></>}
    >
      <div className="space-y-4">
        {incomplete && (
          <div className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs leading-relaxed text-ink-700" role="status">
            Incomplete statement: one or more source registers reached their load cap. Do not use this closing balance for collection, reminders or reconciliation.
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Opening</p><p className="mt-1 font-semibold">{formatINR(statement.openingBalancePaise)}</p></div>
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Billed</p><p className="mt-1 font-semibold">{formatINR(statement.billedPaise)}</p></div>
          <div className="rounded-xl bg-ivory-100 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Received</p><p className="mt-1 font-semibold text-sage-700">{formatINR(statement.receivedPaise)}</p></div>
          <div className="rounded-xl bg-brand-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Closing</p><p className="mt-1 font-semibold text-brand-800">{formatINR(statement.closingBalancePaise)}</p></div>
        </div>
        {statement.entries.length === 0 ? (
          <EmptyState compact title="No ledger entries" description="Orders, bookings, receipts and refunds will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b border-ink-200 text-left text-[10px] font-bold uppercase tracking-wider text-ink-500">
                <tr><th className="pb-2">Date</th><th className="pb-2">Reference</th><th className="pb-2">Description</th><th className="pb-2 text-right">Debit</th><th className="pb-2 text-right">Credit</th><th className="pb-2 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(() => {
                  let running = 0
                  return statement.entries.map((entry) => {
                    running += entry.type === 'debit' ? entry.amountPaise : -entry.amountPaise
                    return (
                      <tr key={entry.id}>
                        <td className="py-2">{formatDate(entry.date)}</td>
                        <td className="py-2 font-medium">{entry.referenceNumber}</td>
                        <td className="py-2 text-ink-600">{entry.description}</td>
                        <td className="py-2 text-right tabular-nums">{entry.type === 'debit' ? formatINR(entry.amountPaise) : '—'}</td>
                        <td className="py-2 text-right tabular-nums">{entry.type === 'credit' ? formatINR(entry.amountPaise) : '—'}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{formatINR(running)}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-500">Payments are linked to their order or booking, so they are already allocated. The statement does not alter historic paid or balance fields.</p>
      </div>
    </Dialog>
  )
}

function ExpenseDialog({ open, onOpenChange, outletId }: { open: boolean; onOpenChange: (open: boolean) => void; outletId: string }) {
  const [head, setHead] = useState<ExpenseHead>('utilities')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter an amount greater than zero.')
      return
    }
    setBusy(true)
    try {
      await createExpense({
        requestId: uniqueId(),
        outletId,
        head,
        amountPaise: Math.round(Number(amount) * 100),
        paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
        mode,
        reference: reference || undefined,
        notes: notes || undefined,
      })
      toast.success('Expense recorded')
      setAmount('')
      setReference('')
      setNotes('')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Record expense" description="Expenses are posted records, not hard-deleted. A mistake is voided with a reason." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy}>Post expense</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Head" value={head} onChange={(event) => setHead(event.target.value as ExpenseHead)} options={EXPENSE_HEADS} />
        <TextField label="Amount (₹)" required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <TextField label="Paid on" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
        <SelectField label="Mode" value={mode} onChange={(event) => setMode(event.target.value as PaymentMode)} options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'other', label: 'Other' }]} />
        <TextField label="Reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} containerClassName="sm:col-span-2" />
        <TextareaField label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} containerClassName="sm:col-span-2" />
      </div>
    </Dialog>
  )
}

function OpenCashDialog({ open, onOpenChange, outletId }: { open: boolean; onOpenChange: (open: boolean) => void; outletId: string }) {
  const [floatAmount, setFloatAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await openCashSession({
        requestId: uniqueId(),
        outletId,
        openingFloatPaise: Math.round((Number(floatAmount) || 0) * 100),
        notes: notes || undefined,
      })
      toast.success('Cash session opened')
      setNotes('')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Open cash session" description="One open session per person and outlet. Cash receipts recorded by you are counted at close." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy}>Open session</Button></>}>
      <div className="space-y-3">
        <TextField label="Opening float (₹)" type="number" min="0" step="0.01" value={floatAmount} onChange={(event) => setFloatAmount(event.target.value)} />
        <TextareaField label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
      </div>
    </Dialog>
  )
}

function CloseCashDialog({ session, onClose }: { session: CashSession | null; onClose: () => void }) {
  const [counted, setCounted] = useState('')
  const [handedTo, setHandedTo] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  if (!session) return null

  async function submit() {
    if (counted === '' || !handedTo.trim()) {
      toast.error('Enter the counted cash and the person receiving it.')
      return
    }
    setBusy(true)
    try {
      const result = await closeCashSession({
        sessionId: session!.id,
        countedCashPaise: Math.round(Number(counted) * 100),
        handedOverTo: handedTo,
        notes: notes || undefined,
      })
      toast.success(`Cash session closed. Variance ${formatINR(result.variancePaise ?? 0)}.`)
      onClose()
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(session)} onOpenChange={(open) => { if (!open) onClose() }} title={`Close ${session.sessionNumber}`} description="Expected cash is calculated from cash receipts recorded by the session owner after it opened. Variance is preserved." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Close session</Button></>}>
      <div className="space-y-3">
        <TextField label="Counted cash (₹)" required type="number" min="0" step="0.01" value={counted} onChange={(event) => setCounted(event.target.value)} />
        <TextField label="Handed over to" required value={handedTo} onChange={(event) => setHandedTo(event.target.value)} maxLength={120} />
        <TextareaField label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
      </div>
    </Dialog>
  )
}
