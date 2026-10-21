import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CreditCard,
  Package,
  Store,
  Users,
  X,
  ClipboardList,
  ChefHat,
} from 'lucide-react'
import type { Business, Department, Outlet } from '@/types/models'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'vp.gettingStarted.dismissed.v1'

interface GettingStartedProps {
  business: Business | null
  outlets: Outlet[]
  departments: Department[]
  productCount: number
  customerCount: number
  orderCount: number
  bookingCount: number
  paymentCount: number
  staffCount: number
  canManageStaff: boolean
  loading: boolean
}

interface Step {
  key: string
  title: string
  why: string
  to: string
  linkLabel: string
  complete: boolean
  optional?: boolean
}

export function GettingStarted({
  business,
  outlets,
  departments,
  productCount,
  customerCount,
  orderCount,
  bookingCount,
  paymentCount,
  staffCount,
  canManageStaff,
  loading,
}: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')
  const [expanded, setExpanded] = useState(true)

  if (dismissed || loading) return null

  const businessComplete = Boolean(
    business &&
      business.name.trim() &&
      business.legalName.trim() &&
      business.phone.trim() &&
      business.addressLine1.trim() &&
      business.city.trim() &&
      business.state.trim() &&
      business.pin.trim(),
  )

  const steps: Step[] = [
    {
      key: 'business',
      title: 'Verify business details',
      why: 'Your legal name, address and GSTIN appear on invoices and receipts.',
      to: '/admin/settings',
      linkLabel: 'Open settings',
      complete: businessComplete,
    },
    {
      key: 'outlets',
      title: 'Review your outlets',
      why: 'Every order, booking and payment belongs to one outlet. Confirm the name, code and address.',
      to: '/admin/outlets',
      linkLabel: 'Review outlets',
      complete: outlets.length > 0,
    },
    {
      key: 'departments',
      title: 'Review departments',
      why: 'Departments decide who prepares each item and which staff can see it.',
      to: '/admin/departments',
      linkLabel: 'Review departments',
      complete: departments.length > 0,
    },
    {
      key: 'products',
      title: 'Add products with prices and units',
      why: 'Order entry, bookings and printed slips read prices and units from the catalogue.',
      to: '/admin/products/new',
      linkLabel: 'Add a product',
      complete: productCount > 0,
    },
    {
      key: 'customers',
      title: 'Add a customer or party account',
      why: 'Customer accounts keep history together and are required for party bookings.',
      to: '/admin/customers/new',
      linkLabel: 'Add a customer',
      complete: customerCount > 0,
    },
    {
      key: 'first-sale',
      title: 'Create the first order or booking',
      why: 'A real order or party booking proves the catalogue, tax and printing settings work end to end.',
      to: orderCount === 0 && bookingCount === 0 ? '/admin/orders/new' : '/admin/orders',
      linkLabel: orderCount === 0 && bookingCount === 0 ? 'Create an order' : 'View orders',
      complete: orderCount + bookingCount > 0,
    },
    {
      key: 'payment',
      title: 'Record a payment or advance',
      why: 'Balances and payment status stay accurate when money is recorded against the order.',
      to: '/admin/payments',
      linkLabel: 'Open payments',
      complete: paymentCount > 0,
    },
    {
      key: 'staff',
      title: 'Invite staff when they need access',
      why: 'Staff accounts are scoped by outlet, department and permission. Do this only when needed.',
      to: '/admin/users',
      linkLabel: 'Manage staff',
      complete: staffCount > 0,
      optional: true,
    },
  ]

  const requiredSteps = steps.filter((step) => !step.optional)
  const completedRequired = requiredSteps.filter((step) => step.complete).length
  const allRequiredComplete = completedRequired === requiredSteps.length

  if (allRequiredComplete && dismissed) return null

  const percent = Math.round((completedRequired / requiredSteps.length) * 100)

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  return (
    <section
      className="surface-card overflow-hidden border-brand-200/70"
      aria-labelledby="getting-started-title"
    >
      <div className="flex flex-col gap-3 bg-gradient-to-br from-brand-50/80 via-white to-ivory-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-brand-200">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id="getting-started-title" className="font-display text-lg font-semibold text-ink-950">
              {allRequiredComplete ? 'Getting started is complete' : 'Getting started'}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
              {allRequiredComplete
                ? 'The workspace has the essentials. You can hide this guide.'
                : `${completedRequired} of ${requiredSteps.length} essentials done. Steps complete automatically when real records exist.`}
            </p>
            {!allRequiredComplete && (
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="h-1.5 w-40 overflow-hidden rounded-full bg-ink-200"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Workspace setup progress"
                >
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-[10px] font-bold text-ink-500">{percent}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-white hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            aria-expanded={expanded}
            aria-controls="getting-started-steps"
            aria-label={expanded ? 'Collapse getting started' : 'Expand getting started'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-2 text-ink-400 transition hover:bg-white hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            aria-label="Dismiss getting started guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <ul id="getting-started-steps" className="divide-y divide-ink-100">
          {steps.map((step) => {
            const disabled = step.key === 'staff' && !canManageStaff
            const Icon = STEP_ICONS[step.key] ?? Circle
            return (
              <li
                key={step.key}
                className={cn(
                  'flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between',
                  step.complete && 'bg-sage-50/30',
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1',
                      step.complete
                        ? 'bg-sage-600 text-white ring-sage-600'
                        : 'bg-white text-ink-400 ring-ink-200',
                    )}
                    aria-hidden
                  >
                    {step.complete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                      {step.title}
                      {step.optional && (
                        <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-500">
                          Optional
                        </span>
                      )}
                      <span className="sr-only">{step.complete ? ' — complete' : ' — not complete'}</span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{step.why}</p>
                  </div>
                </div>
                {!disabled && (
                  <div className="ml-9 flex shrink-0 items-center gap-2 self-start sm:ml-0 sm:self-auto">
                    {step.complete && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-700">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Done
                      </span>
                    )}
                    <Link
                      to={step.to}
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {step.complete ? 'Review' : step.linkLabel}
                    </Link>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const STEP_ICONS: Record<string, typeof Circle> = {
  business: Building2,
  outlets: Store,
  departments: ChefHat,
  products: Package,
  customers: Users,
  'first-sale': ClipboardList,
  payment: CreditCard,
  staff: Users,
}
