import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Business, Department, OrderLine, Outlet } from '@/types/models'
import { calculateLine } from '@/lib/calculations'
import { formatINR, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'

export type SheetWidth = '80mm' | 'a5' | 'a4'

const PAGE_RULES: Record<SheetWidth, string> = {
  '80mm': 'size: 80mm auto; margin: 3mm;',
  a5: 'size: A5; margin: 7mm;',
  a4: 'size: A4; margin: 10mm;',
}

const SHEET_WIDTHS: Record<SheetWidth, string> = {
  '80mm': 'max-w-[80mm] px-3 py-4 text-[11px]',
  a5: 'max-w-[148mm] px-6 py-6 text-[12px]',
  a4: 'max-w-[210mm] px-8 py-8 text-[12.5px]',
}

export function PrintSheet({
  width,
  title,
  children,
}: {
  width: SheetWidth
  title: string
  children: ReactNode
}) {
  return (
    <div className="print-page min-h-dvh bg-ivory-100 px-2 py-5 sm:px-6 print:bg-white print:p-0">
      <style>{`@media print { @page { ${PAGE_RULES[width]} } }`}</style>
      <div className={cn('print-sheet mx-auto w-full bg-white shadow-float print:shadow-none', SHEET_WIDTHS[width])}>
        <div className="sr-only">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function PrintToolbar({
  title,
  subtitle,
  backTo,
  onPrint,
  printLabel = 'Print',
}: {
  title: string
  subtitle?: string
  backTo: string
  onPrint?: () => void
  printLabel?: string
}) {
  return (
    <div className="no-print sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
          <Link to={backTo}>Back</Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-ink-500">{subtitle}</p>}
        </div>
        <p className="hidden text-[11px] text-ink-400 sm:block">Browser preview · verify paper and printer on site</p>
        {onPrint && (
          <Button size="sm" onClick={onPrint} leftIcon={<Printer className="h-3.5 w-3.5" />}>
            {printLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

export function PrintHeader({
  business,
  outlet,
  documentLabel,
  compact,
}: {
  business: Business | null
  outlet: Outlet
  documentLabel: string
  compact?: boolean
}) {
  const address = business
    ? [business.addressLine1, business.addressLine2, business.city, business.state, business.pin].filter(Boolean).join(', ')
    : outlet.address

  return (
    <header className={cn('border-b-2 border-ink-900 pb-3', compact ? 'space-y-2' : 'flex items-start justify-between gap-6')}>
      <div className={cn('flex items-start gap-3', compact && 'justify-center text-center')}>
        <LogoMark size={compact ? 40 : 54} />
        <div className={cn(compact && 'text-left')}>
          <p className={cn('font-display font-semibold leading-tight tracking-tight', compact ? 'text-[15px]' : 'text-2xl')}>
            {business?.name ?? 'Vishal Prem Bakery & Sweets'}
          </p>
          {business?.tagline && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{business.tagline}</p>}
          <p className="mt-1 text-[10.5px] leading-snug text-ink-600">{address}</p>
          <p className="text-[10.5px] text-ink-600">
            {[business?.phone ?? outlet.phone, business?.email].filter(Boolean).join(' · ')}
          </p>
          {business?.gstin && <p className="text-[10.5px] font-semibold text-ink-700">GSTIN: {business.gstin}</p>}
        </div>
      </div>
      <div className={cn(compact ? 'border-t border-ink-200 pt-2 text-center' : 'text-right')}>
        <p className={cn('font-bold uppercase tracking-[0.18em] text-brand-700', compact ? 'text-[10px]' : 'text-[11px]')}>{documentLabel}</p>
        <p className="mt-1 text-[11px] text-ink-600">{outlet.name}</p>
        <p className="text-[10px] text-ink-400">Outlet code {outlet.code}</p>
      </div>
    </header>
  )
}

export function PrintMeta({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  const grid = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2'
  return (
    <dl className={cn('mt-3 grid gap-x-4 gap-y-1.5', grid)}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{item.label}</dt>
          <dd className="min-w-0 flex-1 text-[11px] font-medium text-ink-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PrintLines({
  lines,
  showPrices,
  showTax,
}: {
  lines: OrderLine[]
  showPrices: boolean
  showTax?: boolean
}) {
  return (
    <table className="mt-3 w-full border-collapse text-left">
      <thead>
        <tr className="border-y border-ink-300">
          <th className="py-1.5 pr-2 text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Item</th>
          {showPrices && (
            <>
              <th className="w-12 py-1.5 pr-2 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Qty</th>
              <th className="w-16 py-1.5 pr-2 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Rate</th>
              {showTax && <th className="w-10 py-1.5 pr-2 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">GST</th>}
              <th className="w-20 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Amount</th>
            </>
          )}
          {!showPrices && <th className="w-16 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-wide text-ink-500">Qty</th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const totals = calculateLine(
            {
              quantity: line.quantity,
              unitPricePaise: line.unitPricePaise,
              discountPercent: line.discountPercent,
              taxPercent: line.taxPercent,
            },
            false,
          )
          return (
            <tr key={line.id} className="border-b border-dashed border-ink-200 align-top">
              <td className="py-1.5 pr-2">
                <p className="font-semibold text-ink-900">{line.printName || line.name}</p>
                <p className="text-[10px] text-ink-500">
                  {formatQuantity(line.quantity, line.unit)}
                  {line.discountPercent > 0 ? ` · ${line.discountPercent}% off` : ''}
                </p>
                {line.notes && <p className="text-[10px] italic text-ink-500">{line.notes}</p>}
              </td>
              {showPrices && (
                <>
                  <td className="py-1.5 pr-2 text-right align-top tabular-nums">{formatQuantity(line.quantity)}</td>
                  <td className="py-1.5 pr-2 text-right align-top tabular-nums">{formatINR(line.unitPricePaise)}</td>
                  {showTax && <td className="py-1.5 pr-2 text-right align-top tabular-nums">{line.taxPercent}%</td>}
                  <td className="py-1.5 text-right align-top font-semibold tabular-nums">{formatINR(totals.totalPaise)}</td>
                </>
              )}
              {!showPrices && <td className="py-1.5 text-right align-top font-semibold tabular-nums">{formatQuantity(line.quantity, line.unit)}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function PrintTotals({
  rows,
  total,
  compact,
}: {
  rows: Array<{ label: string; value: ReactNode; muted?: boolean }>
  total: { label: string; value: ReactNode }
  compact?: boolean
}) {
  return (
    <div className={cn('mt-3 border-t border-ink-300 pt-2', compact ? 'space-y-1' : 'ml-auto w-full max-w-xs space-y-1')}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 text-[11px]">
          <span className={cn('text-ink-500', row.muted && 'italic')}>{row.label}</span>
          <span className="font-medium tabular-nums text-ink-800">{row.value}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-ink-900 pt-1.5 text-[13px] font-bold">
        <span>{total.label}</span>
        <span className="tabular-nums">{total.value}</span>
      </div>
    </div>
  )
}

export function PrintFooter({ business, note }: { business: Business | null; note?: string }) {
  return (
    <footer className="mt-4 border-t border-ink-200 pt-2 text-center text-[9.5px] leading-relaxed text-ink-500">
      {note && <p className="font-medium text-ink-600">{note}</p>}
      {business?.receiptFooter && <p className="mt-1">{business.receiptFooter}</p>}
      <p className="mt-1">Generated from the Vishal Prem management system. Browser print preview is not proof of physical output.</p>
    </footer>
  )
}

export function TaxBreakdown({ lines, orderDiscountPaise, pricesIncludeTax }: { lines: OrderLine[]; orderDiscountPaise: number; pricesIncludeTax: boolean }) {
  const groups = new Map<number, { taxablePaise: number; taxPaise: number }>()
  for (const line of lines) {
    const totals = calculateLine(
      {
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        discountPercent: line.discountPercent,
        taxPercent: line.taxPercent,
      },
      pricesIncludeTax,
    )
    const current = groups.get(line.taxPercent) ?? { taxablePaise: 0, taxPaise: 0 }
    groups.set(line.taxPercent, {
      taxablePaise: current.taxablePaise + totals.taxablePaise,
      taxPaise: current.taxPaise + totals.taxPaise,
    })
  }

  const subtotal = Array.from(groups.values()).reduce((sum, item) => sum + item.taxablePaise, 0)
  const factor = subtotal > 0 ? Math.max(0, (subtotal - orderDiscountPaise) / subtotal) : 0

  return (
    <table className="mt-3 w-full border-collapse text-[10px]">
      <thead>
        <tr className="border-y border-ink-300">
          <th className="py-1 text-left font-bold uppercase tracking-wide text-ink-500">GST rate</th>
          <th className="py-1 text-right font-bold uppercase tracking-wide text-ink-500">Taxable value</th>
          <th className="py-1 text-right font-bold uppercase tracking-wide text-ink-500">Tax</th>
        </tr>
      </thead>
      <tbody>
        {Array.from(groups.entries())
          .sort(([a], [b]) => a - b)
          .map(([rate, group]) => (
            <tr key={rate} className="border-b border-ink-100">
              <td className="py-1">{rate}%</td>
              <td className="py-1 text-right tabular-nums">{formatINR(Math.round(group.taxablePaise * factor))}</td>
              <td className="py-1 text-right tabular-nums">{formatINR(Math.round(group.taxPaise * factor))}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

export function departmentLabel(departments: Department[], id: string): string {
  return departments.find((department) => department.id === id)?.name ?? 'Department'
}

export function PrintLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ivory-100">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
        Preparing document…
      </div>
    </div>
  )
}

export function PrintUnavailable({ title, message, backTo }: { title: string; message: string; backTo: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ivory-100 px-4">
      <div className="surface-card max-w-md p-6 text-center">
        <p className="font-display text-xl font-semibold">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{message}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={backTo}>Go back</Link>
        </Button>
      </div>
    </div>
  )
}
