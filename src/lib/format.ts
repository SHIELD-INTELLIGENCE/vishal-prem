import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'

export function formatINR(paise: number, options?: { compact?: boolean }): string {
  const rupees = (Number.isFinite(paise) ? paise : 0) / 100
  if (options?.compact) {
    if (Math.abs(rupees) >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`
    if (Math.abs(rupees) >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)} L`
    if (Math.abs(rupees) >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees)
}

/** Parses "1,250.50", "₹1250.5" or a number into paise. Returns null when invalid. */
export function parseRupeeInput(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    return Math.round(value * 100)
  }
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const rupees = Number(cleaned)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return format(date, 'dd MMM yyyy')
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'dd MMM')
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return format(date, 'dd MMM yyyy, h:mm a')
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return format(date, 'h:mm a')
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function formatQuantity(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '0'
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 3,
  }).format(value)
  return unit ? `${formatted} ${unit}` : formatted
}

export function todayInput(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
