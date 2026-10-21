import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function serverNow(): string {
  return new Date().toISOString()
}

function codeSuffix(length = 4): string {
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += ALPHABET[randomInt(0, ALPHABET.length)]
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

export function makeDeliveryNumber(outletCode: string, date = new Date()): string {
  return `DEL-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}

export function makeExpenseNumber(outletCode: string, date = new Date()): string {
  return `EXP-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}

export function makeCashSessionNumber(outletCode: string, date = new Date()): string {
  return `CASH-${outletCode}-${dateStamp(date)}-${codeSuffix(4)}`
}
