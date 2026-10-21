import { describe, expect, it } from 'vitest'
import {
  bookingFormSchema,
  businessSettingsSchema,
  isValidGstin,
  isValidPan,
  isValidPin,
  normalizePhone,
  orderFormSchema,
  productSchema,
} from '@/lib/validation'

describe('phone, tax and address validators', () => {
  it('normalises Indian mobile numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210')
    expect(normalizePhone('09876543210')).toBe('9876543210')
    expect(normalizePhone('98765-43210')).toBe('9876543210')
  })

  it('validates GSTIN, PAN and PIN formats', () => {
    expect(isValidGstin('09ABCDE1234F1Z5')).toBe(true)
    expect(isValidGstin('09ABCDE1234F1X5')).toBe(false)
    expect(isValidPan('ABCDE1234F')).toBe(true)
    expect(isValidPan('ABCD1234F')).toBe(false)
    expect(isValidPin('208001')).toBe(true)
    expect(isValidPin('020801')).toBe(false)
  })
})

describe('orderFormSchema', () => {
  const base = {
    outletId: 'outlet-1',
    departmentId: 'dept-cake',
    customerName: 'Meera Sharma',
    orderType: 'takeaway' as const,
    channel: 'counter' as const,
    lines: [
      {
        productId: 'product-1',
        quantity: 1,
        unitPrice: 650,
        discountPercent: 0,
        notes: '',
      },
    ],
    discountType: 'none' as const,
    discountValue: 0,
    advanceAmount: 0,
    paymentMode: 'cash' as const,
  }

  it('accepts a valid order', () => {
    const result = orderFormSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('requires at least one line', () => {
    const result = orderFormSchema.safeParse({ ...base, lines: [] })
    expect(result.success).toBe(false)
  })

  it('rejects a negative rate or over-100% line discount', () => {
    const result = orderFormSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0], unitPrice: -1, discountPercent: 101 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid phone when one is supplied', () => {
    const result = orderFormSchema.safeParse({ ...base, customerPhone: '12345' })
    expect(result.success).toBe(false)
  })
})

describe('bookingFormSchema', () => {
  const base = {
    outletId: 'outlet-1',
    customerId: 'customer-1',
    eventType: 'wedding' as const,
    eventDate: '2026-11-20',
    eventTime: '18:00',
    fulfillment: 'pickup' as const,
    departmentIds: ['dept-cake'],
    lines: [{ productId: 'product-1', quantity: 2, unitPrice: 550, discountPercent: 0, notes: '' }],
    discountType: 'none' as const,
    discountValue: 0,
    advanceAmount: 1000,
    paymentMode: 'upi' as const,
  }

  it('accepts a linked booking', () => {
    expect(bookingFormSchema.safeParse(base).success).toBe(true)
  })

  it('requires a customer account and responsible department', () => {
    expect(bookingFormSchema.safeParse({ ...base, customerId: '' }).success).toBe(false)
    expect(bookingFormSchema.safeParse({ ...base, departmentIds: [] }).success).toBe(false)
  })
})

describe('businessSettingsSchema', () => {
  const base = {
    name: 'Vishal Prem Bakery & Sweets',
    legalName: 'Vishal Prem Bakery & Sweets',
    phone: '9876543210',
    addressLine1: '12 Civil Lines',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    pin: '208001',
    pricesIncludeTax: false,
    defaultTaxPercent: 5,
    invoicePrefix: 'VP',
  }

  it('accepts a valid business profile', () => {
    expect(businessSettingsSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a malformed GSTIN and PIN', () => {
    expect(businessSettingsSchema.safeParse({ ...base, gstin: 'BADGSTIN' }).success).toBe(false)
    expect(businessSettingsSchema.safeParse({ ...base, pin: '123' }).success).toBe(false)
  })
})

describe('productSchema', () => {
  const base = {
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    group: 'Sweets',
    category: 'Mithai',
    departmentId: 'dept-sweets',
    outletIds: ['outlet-1'],
    pricingMode: 'per_kg' as const,
    unit: 'kg',
    salePrice: 720,
    taxPercent: 5,
    discountPercent: 0,
    trackStock: true,
    stockQty: 10,
    criticalStock: 3,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
  }

  it('accepts a per-kg product', () => {
    expect(productSchema.safeParse(base).success).toBe(true)
  })

  it('requires at least one outlet', () => {
    expect(productSchema.safeParse({ ...base, outletIds: [] }).success).toBe(false)
  })

  it('requires cake sizes for cake-lb pricing', () => {
    const result = productSchema.safeParse({ ...base, pricingMode: 'cake_lb', unit: 'lb', cakeSizes: [] })
    expect(result.success).toBe(false)
  })
})
