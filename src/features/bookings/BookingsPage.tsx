import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, CalendarHeart, Download, Plus, SearchX } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { bookingsQuery } from '@/data/queries'
import type { Booking } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatDate, formatINR, formatRelative, todayInput } from '@/lib/format'
import { BOOKING_STATUS_LABELS } from '@/lib/calculations'

export function BookingsPage() {
  const { profile } = useAuth()
  const { selectedOutletId, selectedOutlet, departments } = useWorkspace()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [windowFilter, setWindowFilter] = useState('upcoming')
  const [department, setDepartment] = useState('all')

  const outletId = selectedOutletId ?? ''
  const bookings = useCollectionData<Booking>(
    () => (profile && outletId ? bookingsQuery(outletId, profile, 500) : null),
    [profile?.uid, outletId, profile?.role, profile?.departmentIds.join(',')],
    Boolean(profile && outletId),
  )

  const rows = useMemo(() => {
    const today = todayInput()
    return bookings.rows.filter((booking) => {
      if (status !== 'all' && booking.status !== status) return false
      if (department !== 'all' && !booking.departmentIds.includes(department)) return false
      if (windowFilter === 'upcoming' && (booking.eventDate < today || ['completed', 'cancelled'].includes(booking.status))) return false
      if (windowFilter === 'past' && booking.eventDate >= today) return false
      return true
    })
  }, [bookings.rows, status, department, windowFilter])

  const summary = useMemo(() => {
    const active = rows.filter((booking) => booking.status !== 'cancelled')
    return {
      count: rows.length,
      value: active.reduce((sum, booking) => sum + booking.totalPaise, 0),
      outstanding: active.reduce((sum, booking) => sum + Math.max(0, booking.balancePaise), 0),
      next: active
        .filter((booking) => booking.eventDate >= todayInput())
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0],
    }
  }, [rows])

  const columns: DataColumn<Booking>[] = [
    {
      key: 'booking',
      header: 'Booking',
      accessor: (booking) => booking.bookingNumber,
      sortable: true,
      render: (booking) => (
        <div>
          <p className="font-semibold text-ink-900">{booking.bookingNumber}</p>
          <p className="text-[11px] capitalize text-ink-500">{booking.eventType} · {booking.fulfillment}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      accessor: (booking) => booking.customerName,
      sortable: true,
      render: (booking) => (
        <div>
          <p className="font-medium text-ink-800">{booking.customerName}</p>
          <p className="text-[11px] text-ink-500">{booking.customerPhone || 'No phone'}</p>
        </div>
      ),
    },
    {
      key: 'eventDate',
      header: 'Event',
      accessor: (booking) => booking.eventDate,
      sortable: true,
      render: (booking) => (
        <div>
          <p className="text-xs font-medium text-ink-800">{formatDate(booking.eventDate)}</p>
          <p className="text-[11px] text-ink-500">{booking.eventTime} · {formatRelative(booking.eventDate)}</p>
        </div>
      ),
    },
    {
      key: 'departments',
      header: 'Departments',
      accessor: (booking) => booking.departmentIds.length,
      hideBelow: 'xl',
      render: (booking) => (
        <div className="flex max-w-[190px] flex-wrap gap-1">
          {booking.departmentIds.slice(0, 3).map((id) => (
            <Badge key={id} tone="neutral">{departments.find((item) => item.id === id)?.name ?? 'Department'}</Badge>
          ))}
          {booking.departmentIds.length > 3 && <span className="text-[10px] text-ink-400">+{booking.departmentIds.length - 3}</span>}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Value',
      accessor: (booking) => booking.totalPaise,
      sortable: true,
      align: 'right',
      csvValue: (booking) => (booking.totalPaise / 100).toFixed(2),
      render: (booking) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatINR(booking.totalPaise)}</p>
          {booking.balancePaise > 0 && <p className="text-[10px] text-brand-700">{formatINR(booking.balancePaise)} due</p>}
        </div>
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      accessor: (booking) => booking.paymentStatus,
      hideBelow: 'md',
      render: (booking) => <StatusBadge status={booking.paymentStatus} />,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (booking) => booking.status,
      sortable: true,
      render: (booking) => <StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status]} />,
    },
    {
      key: 'actions',
      header: '',
      render: (booking) => (
        <Button asChild size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link to={`/admin/bookings/${booking.id}`}>View</Link>
        </Button>
      ),
    },
  ]

  if (!selectedOutletId) {
    return <EmptyState title="No outlet selected" description="Assign an outlet to your profile before viewing bookings." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Party bookings"
        description={`Wedding, birthday, corporate and catering bookings for ${selectedOutlet?.name ?? 'this outlet'}. Advances and balances are tracked per booking.`}
        actions={
          hasPermission(profile, 'bookingsManage') ? (
            <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
              <Link to="/admin/bookings/new">New booking</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Bookings shown', value: summary.count.toString() },
          { label: 'Value', value: formatINR(summary.value, { compact: true }) },
          { label: 'Outstanding', value: formatINR(summary.outstanding, { compact: true }) },
          { label: 'Next event', value: summary.next ? formatDate(summary.next.eventDate) : '—' },
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
        getRowId={(booking) => booking.id}
        loading={bookings.loading}
        error={bookings.error}
        onRetry={bookings.reload}
        searchPlaceholder="Search booking number, customer, phone or event…"
        searchFields={(booking) => [booking.bookingNumber, booking.customerName, booking.customerPhone, booking.eventType, booking.instructions, booking.deliveryAddress]}
        exportFilename={`party-bookings-${selectedOutlet?.code ?? 'outlet'}-${format(new Date(), 'yyyyMMdd')}.csv`}
        emptyTitle={windowFilter === 'upcoming' ? 'No upcoming bookings' : 'No bookings found'}
        emptyDescription="Party bookings will appear here. Create one to track event details, items, advances and preparation."
        emptyHelp="bookings"
        emptyAction={
          hasPermission(profile, 'bookingsManage') ? (
            <Button asChild size="sm" leftIcon={<CalendarHeart className="h-4 w-4" />}><Link to="/admin/bookings/new">Create a booking</Link></Button>
          ) : undefined
        }
        onRowClick={(booking) => navigate(`/admin/bookings/${booking.id}`)}
        mobileTitle={(booking) => booking.bookingNumber}
        mobileSubtitle={(booking) => `${booking.customerName} · ${formatDate(booking.eventDate)}`}
        mobileMeta={(booking) => (
          <>
            <StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status]} />
            <StatusBadge status={booking.paymentStatus} />
            <span>{formatINR(booking.totalPaise)}</span>
          </>
        )}
        rowActions={(booking) => (
          <Button asChild size="sm" variant="ghost" aria-label={`View ${booking.bookingNumber}`}><Link to={`/admin/bookings/${booking.id}`}><ArrowRight className="h-4 w-4" /></Link></Button>
        )}
        toolbar={
          <>
            <select value={windowFilter} onChange={(event) => setWindowFilter(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Time window">
              <option value="upcoming">Upcoming</option>
              <option value="past">Past events</option>
              <option value="all">All dates</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Booking status">
              <option value="all">All statuses</option>
              {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {departments.length > 1 && (
              <select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700" aria-label="Department">
                <option value="all">All departments</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            {(status !== 'all' || windowFilter !== 'upcoming' || department !== 'all') && (
              <Button size="sm" variant="ghost" onClick={() => { setStatus('all'); setWindowFilter('upcoming'); setDepartment('all') }} leftIcon={<SearchX className="h-3.5 w-3.5" />}>
                Reset
              </Button>
            )}
          </>
        }
        initialSort={{ key: 'eventDate', direction: 'asc' }}
      />

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <Download className="h-3 w-3" /> CSV exports contain the filtered, sorted records visible in this table.
      </p>
    </div>
  )
}
