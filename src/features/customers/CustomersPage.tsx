import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Download, Plus, SearchX, UsersRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { customersQuery } from '@/data/queries'
import type { Customer } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatINR, titleCase } from '@/lib/format'

export function CustomersPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet } = useWorkspace()
  const navigate = useNavigate()
  const [group, setGroup] = useState('all')
  const [state, setState] = useState('all')

  const outletId = selectedOutletId ?? ''
  const customers = useCollectionData<Customer>(
    () => (outletId ? customersQuery(outletId, 500) : null),
    [outletId],
    Boolean(outletId),
  )

  const rows = useMemo(() => {
    return customers.rows.filter((customer) => {
      if (group !== 'all' && customer.accountGroup !== group) return false
      if (state === 'active' && !customer.active) return false
      if (state === 'inactive' && customer.active) return false
      if (state === 'business' && customer.type !== 'business') return false
      return true
    })
  }, [customers.rows, group, state])

  const summary = useMemo(() => ({
    total: customers.rows.length,
    active: customers.rows.filter((customer) => customer.active).length,
    business: customers.rows.filter((customer) => customer.type === 'business').length,
    receivable: customers.rows.reduce((sum, customer) => sum + Math.min(0, customer.openingBalancePaise), 0),
  }), [customers.rows])

  const columns: DataColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Customer / party',
      accessor: (customer) => customer.name,
      sortable: true,
      render: (customer) => (
        <div>
          <p className="font-semibold text-ink-900">{customer.name}</p>
          <p className="text-[11px] text-ink-500">{customer.alias || (customer.type === 'business' ? 'Business account' : 'Individual')}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      accessor: (customer) => `${customer.phone} ${customer.email}`,
      render: (customer) => (
        <div>
          <p className="text-xs font-medium text-ink-700">{customer.phone || 'No phone'}</p>
          <p className="truncate text-[11px] text-ink-500">{customer.email || 'No email'}</p>
        </div>
      ),
    },
    {
      key: 'group',
      header: 'Group',
      accessor: (customer) => titleCase(customer.accountGroup),
      sortable: true,
      hideBelow: 'lg',
      render: (customer) => <Badge tone="neutral">{titleCase(customer.accountGroup)}</Badge>,
    },
    {
      key: 'location',
      header: 'Location',
      accessor: (customer) => `${customer.state} ${customer.pin}`,
      hideBelow: 'xl',
      render: (customer) => <span className="text-xs text-ink-600">{[customer.state, customer.pin].filter(Boolean).join(' · ') || '—'}</span>,
    },
    {
      key: 'tax',
      header: 'GSTIN / PAN',
      accessor: (customer) => customer.gstin || customer.pan,
      hideBelow: 'lg',
      render: (customer) => <span className="font-mono text-[11px] text-ink-600">{customer.gstin || customer.pan || '—'}</span>,
    },
    {
      key: 'balance',
      header: 'Opening balance',
      accessor: (customer) => customer.openingBalancePaise,
      sortable: true,
      align: 'right',
      csvValue: (customer) => (customer.openingBalancePaise / 100).toFixed(2),
      render: (customer) => (
        <div className="text-right">
          <p className={`font-semibold tabular-nums ${customer.openingBalancePaise < 0 ? 'text-brand-700' : 'text-ink-800'}`}>{formatINR(customer.openingBalancePaise)}</p>
          <p className="text-[10px] text-ink-500">{customer.openingBalancePaise > 0 ? 'Advance / credit' : customer.openingBalancePaise < 0 ? 'Outstanding' : 'Settled'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (customer) => (customer.active ? 'Active' : 'Inactive'),
      render: (customer) => <Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (customer) => (
        <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link to={`/admin/customers/${customer.id}`}>View</Link>
        </Button>
      ),
    },
  ]

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing customer accounts." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Customers & parties"
        description={`Contacts, addresses and tax details for ${selectedOutlet?.name ?? 'this outlet'}. Aadhaar numbers are deliberately not collected.`}
        help="customers"
        actions={
          hasPermission(profile, 'customersManage') ? (
            <Button asChild leftIcon={<Plus className="h-4 w-4" />}><Link to="/admin/customers/new">New customer</Link></Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Accounts', value: summary.total.toString() },
          { label: 'Active', value: summary.active.toString() },
          { label: 'Business / party', value: summary.business.toString() },
          { label: 'Opening outstanding', value: formatINR(Math.abs(summary.receivable), { compact: true }) },
        ].map((item) => (
          <div key={item.label} className="surface-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{item.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(customer) => customer.id}
        loading={customers.loading}
        error={customers.error}
        onRetry={customers.reload}
        searchPlaceholder="Search name, phone, email, GSTIN or city…"
        searchFields={(customer) => [customer.name, customer.alias, customer.phone, customer.altPhone, customer.email, customer.gstin, customer.pan, customer.state, customer.notes, ...customer.addresses.map((address) => `${address.line1} ${address.city} ${address.pin}`)]}
        exportFilename={`customers-${selectedOutlet?.code ?? 'outlet'}.csv`}
        emptyTitle="No customer accounts yet"
        emptyDescription="Create accounts for regulars, parties and corporate buyers so bookings and payments can be linked."
        emptyHelp="customers"
        emptyAction={
          hasPermission(profile, 'customersManage') ? (
            <Button asChild size="sm" leftIcon={<UsersRound className="h-4 w-4" />}><Link to="/admin/customers/new">Create an account</Link></Button>
          ) : undefined
        }
        onRowClick={(customer) => navigate(`/admin/customers/${customer.id}`)}
        mobileTitle={(customer) => customer.name}
        mobileSubtitle={(customer) => `${customer.phone || 'No phone'} · ${titleCase(customer.accountGroup)}`}
        mobileMeta={(customer) => (
          <>
            <Badge tone={customer.active ? 'success' : 'neutral'}>{customer.active ? 'Active' : 'Inactive'}</Badge>
            <span>{formatINR(customer.openingBalancePaise)}</span>
            {customer.gstin && <span className="font-mono text-[10px]">{customer.gstin}</span>}
          </>
        )}
        rowActions={(customer) => (
          <Button asChild size="sm" variant="ghost" aria-label={`View ${customer.name}`}><Link to={`/admin/customers/${customer.id}`}><ArrowRight className="h-4 w-4" /></Link></Button>
        )}
        toolbar={
          <>
            <select value={group} onChange={(event) => setGroup(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Account group">
              <option value="all">All groups</option>
              {['retail_customer', 'wholesale', 'corporate', 'party_planner', 'supplier', 'other'].map((value) => (
                <option key={value} value={value}>{titleCase(value)}</option>
              ))}
            </select>
            <select value={state} onChange={(event) => setState(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Account state">
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="business">Business only</option>
            </select>
            {(group !== 'all' || state !== 'all') && (
              <Button size="sm" variant="ghost" onClick={() => { setGroup('all'); setState('all') }} leftIcon={<SearchX className="h-3.5 w-3.5" />}>Reset</Button>
            )}
          </>
        }
        initialSort={{ key: 'name', direction: 'asc' }}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <Download className="h-3 w-3" /> CSV exports contain the filtered, sorted records visible in this table. Store customer data responsibly.
      </p>
    </div>
  )
}
