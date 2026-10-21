export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function uniqueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function codeSuffix(length = 4): string {
  let result = ''
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < length; i += 1) {
    result += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return result
}

function dateStamp(date = new Date()): string {
  const year = String(date.getFullYear()).slice(2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function makeOrderNumber(outletCode: string, date = new Date()): string {
  return `ORD-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}

export function makeBookingNumber(outletCode: string, date = new Date()): string {
  return `BKG-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}

export function makeReceiptNumber(outletCode: string, date = new Date()): string {
  return `RCPT-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}
