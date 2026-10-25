import { z } from 'zod'

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const PIN_REGEX = /^[1-9][0-9]{5}$/
const PHONE_REGEX = /^[6-9][0-9]{9}$/

export const ROLE_VALUES = [
  'super_admin',
  'cake_admin',
  'sweets_admin',
  'hot_admin',
  'gajak_admin',
  'manager',
  'accountant',
] as const

export const PRICING_MODES = ['fixed', 'per_kg', 'per_box', 'cake_lb'] as const
export const PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'other'] as const
export const EVENT_TYPES = [
  'wedding',
  'birthday',
  'anniversary',
  'corporate',
  'catering',
  'festival',
  'other',
] as const
export const ACCOUNT_GROUPS = [
  'retail_customer',
  'wholesale',
  'corporate',
  'party_planner',
  'supplier',
  'other',
] as const

export function normalizePhone(value: string): string {
  return value.replace(/[^0-9]/g, '').replace(/^91(?=[6-9][0-9]{9}$)/, '').slice(-10)
}

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(normalizePhone(value))
}

export function isValidGstin(value: string): boolean {
  return GSTIN_REGEX.test(value.trim().toUpperCase())
}

export function isValidPan(value: string): boolean {
  return PAN_REGEX.test(value.trim().toUpperCase())
}

export function isValidPin(value: string): boolean {
  return PIN_REGEX.test(value.trim())
}

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
})
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const outletSchema = z.object({
  name: z.string().trim().min(2, 'Outlet name is required'),
  code: z
    .string()
    .trim()
    .min(2, 'A short outlet code is required')
    .max(10, 'Use 10 characters or fewer')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens only'),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone is required')
    .refine(isValidPhone, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  address: z.string().trim().min(5, 'Address is required'),
  gstin: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidGstin(value), 'Enter a valid 15-character GSTIN')
    .optional(),
  active: z.boolean(),
})
export type OutletValues = z.infer<typeof outletSchema>

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required'),
  code: z
    .string()
    .trim()
    .min(2, 'Department code is required')
    .max(24, 'Use 24 characters or fewer')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers or hyphens'),
  description: z.string().trim().max(240, 'Keep the description under 240 characters').optional(),
  outletIds: z.array(z.string()).min(1, 'Assign at least one outlet'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Choose a valid colour'),
  active: z.boolean(),
})
export type DepartmentValues = z.infer<typeof departmentSchema>

const cakeSizeSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  pounds: z.number().min(0.1).max(50),
  price: z.number().min(0, 'Price cannot be negative').max(1_000_000),
})

const rupeesField = (message: string) =>
  z
    .number({ invalid_type_error: message })
    .min(0, 'Amount cannot be negative')
    .max(10_000_000, 'Amount is too large')

export const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Product name is required'),
    alias: z.string().trim().max(60).optional(),
    sku: z
      .string()
      .trim()
      .max(48, 'Keep the SKU under 48 characters')
      .refine(
        (value) => value === '' || /^[\x20-\x7E]+$/.test(value),
        'Use printable characters only; the SKU may be encoded in a barcode.',
      )
      .optional(),
    printName: z.string().trim().min(1, 'Print name is required').max(40),
    group: z.string().trim().min(1, 'Group is required'),
    category: z.string().trim().min(1, 'Category is required'),
    departmentId: z.string().min(1, 'Choose a department'),
    outletIds: z.array(z.string()).min(1, 'Assign at least one outlet'),
    pricingMode: z.enum(PRICING_MODES),
    unit: z.string().trim().min(1, 'Selling unit is required'),
    altUnit: z.string().trim().max(20).optional(),
    conversionFactor: z.number().positive('Conversion must be greater than 0').optional(),
    packagingUnit: z.string().trim().max(20).optional(),
    boxQuantity: z.number().int().positive().optional(),
    cakeSizes: z.array(cakeSizeSchema).optional(),
    salePrice: rupeesField('Enter a sales price'),
    purchasePrice: rupeesField('Enter a valid purchase price').optional(),
    mrp: rupeesField('Enter a valid MRP').optional(),
    minSalePrice: rupeesField('Enter a valid minimum price').optional(),
    discountPercent: z.number().min(0).max(100),
    taxPercent: z.number().min(0).max(100),
    taxCategory: z.string().trim().max(40).optional(),
    hsn: z.string().trim().max(8, 'HSN/SAC is usually 4–8 characters').optional(),
    trackStock: z.boolean(),
    openingStock: z.number().min(0).max(1_000_000).optional(),
    stockQty: z.number().min(0).max(1_000_000).optional(),
    criticalStock: z.number().min(0).max(1_000_000).optional(),
    batchTracking: z.boolean(),
    expiryTracking: z.boolean(),
    description: z.string().trim().max(600).optional(),
    active: z.boolean(),
    available: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.salePrice <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salePrice'], message: 'Sales price must be greater than 0' })
    }
    if (value.minSalePrice !== undefined && value.minSalePrice > value.salePrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minSalePrice'], message: 'Minimum price cannot exceed sales price' })
    }
    if (value.pricingMode === 'per_box' && !value.boxQuantity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['boxQuantity'], message: 'Box quantity is required for per-box pricing' })
    }
    if (value.pricingMode === 'per_kg' && !value.unit.toLowerCase().includes('kg')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unit'], message: 'Per-kg products should use a kilogram unit (e.g. kg / 500 g)' })
    }
    if (value.pricingMode === 'cake_lb') {
      if (!value.cakeSizes || value.cakeSizes.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cakeSizes'], message: 'Add at least one cake size' })
      }
      if (!value.unit.toLowerCase().includes('lb')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unit'], message: 'Cake pricing should use a pound unit' })
      }
    }
    if (value.trackStock && value.stockQty === undefined && value.openingStock === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['openingStock'], message: 'Enter opening stock for a tracked product' })
    }
    if (value.batchTracking && !value.trackStock) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batchTracking'], message: 'Batch tracking requires stock tracking' })
    }
  })
export type ProductValues = z.infer<typeof productSchema>

export const addressSchema = z.object({
  label: z.enum(['billing', 'shipping', 'other']),
  line1: z.string().trim().min(3, 'Address line 1 is required'),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  pin: z.string().trim().refine(isValidPin, 'Enter a valid 6-digit PIN code'),
})

export const customerSchema = z
  .object({
    name: z.string().trim().min(2, 'Customer or party name is required'),
    alias: z.string().trim().max(60).optional(),
    type: z.enum(['individual', 'business']),
    accountGroup: z.enum(ACCOUNT_GROUPS),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || isValidPhone(value), 'Enter a valid 10-digit mobile number'),
    altPhone: z.string().trim().max(20).optional(),
    email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
    addresses: z.array(addressSchema).max(4),
    state: z.string().trim().max(60).optional(),
    pin: z
      .string()
      .trim()
      .refine((value) => value === '' || isValidPin(value), 'Enter a valid 6-digit PIN code')
      .optional(),
    gstin: z
      .string()
      .trim()
      .refine((value) => value === '' || isValidGstin(value), 'Enter a valid 15-character GSTIN')
      .optional(),
    pan: z
      .string()
      .trim()
      .refine((value) => value === '' || isValidPan(value), 'Enter a valid 10-character PAN')
      .optional(),
    openingBalance: z.number().min(-10_000_000).max(10_000_000),
    creditLimit: z.number().min(0).max(10_000_000).optional(),
    notes: z.string().trim().max(500).optional(),
    outletIds: z.array(z.string()).min(1, 'Assign at least one outlet'),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Add a phone number or email address' })
    }
    if (value.type === 'business' && !value.gstin && !value.pan) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstin'], message: 'Add a GSTIN or PAN for a business account' })
    }
  })
export type CustomerValues = z.infer<typeof customerSchema>

export const orderLineFormSchema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  quantity: z.number().positive('Quantity must be greater than 0').max(100_000),
  unitPrice: z.number().min(0).max(10_000_000),
  discountPercent: z.number().min(0).max(100),
  notes: z.string().trim().max(160).optional(),
})

export const orderFormSchema = z.object({
  outletId: z.string().min(1, 'Choose an outlet'),
  departmentId: z.string().min(1, 'Choose a department'),
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2, 'Customer name is required').max(80),
  customerPhone: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidPhone(value), 'Enter a valid 10-digit mobile number')
    .optional(),
  orderType: z.enum(['takeaway', 'delivery', 'dine_in']),
  channel: z.enum(['counter', 'phone']),
  notes: z.string().trim().max(500).optional(),
  pickupAt: z.string().optional(),
  lines: z.array(orderLineFormSchema).min(1, 'Add at least one product').max(200, 'Add at most 200 products'),
  discountType: z.enum(['none', 'percent', 'amount']),
  discountValue: z.number().min(0).max(10_000_000),
  advanceAmount: z.number().min(0).max(10_000_000),
  paymentMode: z.enum(PAYMENT_MODES),
  paymentReference: z.string().trim().max(80).optional(),
})
export type OrderFormValues = z.infer<typeof orderFormSchema>

export const bookingFormSchema = z.object({
  outletId: z.string().min(1, 'Choose an outlet'),
  customerId: z.string().min(1, 'Choose a customer or party account'),
  eventType: z.enum(EVENT_TYPES),
  eventDate: z.string().min(1, 'Choose the event date'),
  eventTime: z.string().min(1, 'Choose the event time'),
  fulfillment: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().trim().max(300).optional(),
  departmentIds: z.array(z.string()).min(1, 'Choose at least one responsible department'),
  instructions: z.string().trim().max(1000).optional(),
  lines: z.array(orderLineFormSchema).min(1, 'Add at least one product'),
  discountType: z.enum(['none', 'percent', 'amount']),
  discountValue: z.number().min(0).max(10_000_000),
  advanceAmount: z.number().min(0).max(10_000_000),
  paymentMode: z.enum(PAYMENT_MODES),
  paymentReference: z.string().trim().max(80).optional(),
})
export type BookingFormValues = z.infer<typeof bookingFormSchema>

/**
 * Editable booking details. Immutable fields such as the booking number,
 * outlet, status and payment totals are deliberately absent so a caller cannot
 * submit them as part of an edit.
 */
export const bookingEditLineSchema = orderLineFormSchema.extend({
  id: z.string().trim().min(1).optional(),
})

export const bookingEditSchema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer or party account'),
    eventType: z.enum(EVENT_TYPES),
    eventDate: z.string().min(1, 'Choose the event date'),
    eventTime: z.string().min(1, 'Choose the event time'),
    fulfillment: z.enum(['pickup', 'delivery']),
    deliveryAddress: z.string().trim().max(300).optional(),
    departmentIds: z.array(z.string().min(1)).min(1, 'Choose at least one responsible department'),
    instructions: z.string().trim().max(1000).optional(),
    lines: z.array(bookingEditLineSchema).min(1, 'Add at least one product'),
    // Optional so a legacy booking with no stored discount metadata can be
    // edited without inventing a percentage. The data layer falls back to the
    // stored fixed amount when both are omitted.
    discountType: z.enum(['none', 'percent', 'amount']).optional(),
    discountValue: z.number().min(0).max(10_000_000).optional(),
    editReason: z.string().trim().max(500, 'Keep the reason under 500 characters').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'delivery' && !value.deliveryAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Add a delivery address for a delivery booking',
      })
    }
    if (new Set(value.departmentIds).size !== value.departmentIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentIds'],
        message: 'Choose each department only once',
      })
    }
    const lineIds = value.lines.flatMap((line) => (line.id ? [line.id] : []))
    if (new Set(lineIds).size !== lineIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines'],
        message: 'Each existing line can only appear once',
      })
    }
    if ((value.discountType === undefined) !== (value.discountValue === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'Provide both the discount type and value, or neither',
      })
    }
  })
export type BookingEditValues = z.infer<typeof bookingEditSchema>

export const paymentFormSchema = z.object({
  amount: z.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be greater than 0').max(10_000_000),
  type: z.enum(['payment', 'refund']),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(80).optional(),
  receivedAt: z.string().min(1, 'Choose a date and time'),
  notes: z.string().trim().max(300).optional(),
})
export type PaymentValues = z.infer<typeof paymentFormSchema>

export const inviteSchema = z
  .object({
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
    displayName: z.string().trim().min(2, 'Staff name is required').max(60),
    role: z.enum(ROLE_VALUES),
    outletIds: z.array(z.string()).min(1, 'Assign at least one outlet'),
    departmentIds: z.array(z.string()),
    permissions: z.record(z.boolean()),
    expiresInDays: z.number().int().min(1).max(30),
  })
  .superRefine((value, ctx) => {
    if (value.role !== 'super_admin' && value.role !== 'manager' && value.role !== 'accountant' && value.departmentIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentIds'], message: 'Department admins need at least one department' })
    }
  })
export type InviteValues = z.infer<typeof inviteSchema>

export const joinSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Your name is required').max(60),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
export type JoinValues = z.infer<typeof joinSchema>

export const setupSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  legalName: z.string().trim().min(2, 'Legal name is required'),
  phone: z.string().trim().refine(isValidPhone, 'Enter a valid 10-digit phone number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  addressLine1: z.string().trim().min(5, 'Address is required'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  pin: z.string().trim().refine(isValidPin, 'Enter a valid 6-digit PIN code'),
  outletOneName: z.string().trim().min(2, 'First outlet name is required'),
  outletOneCode: z.string().trim().min(2).max(8),
  outletTwoName: z.string().trim().min(2, 'Second outlet name is required'),
  outletTwoCode: z.string().trim().min(2).max(8),
})
export type SetupValues = z.infer<typeof setupSchema>

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Business name is required'),
  legalName: z.string().trim().min(2, 'Legal name is required'),
  tagline: z.string().trim().max(100).optional(),
  phone: z.string().trim().refine(isValidPhone, 'Enter a valid 10-digit phone number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  addressLine1: z.string().trim().min(5, 'Address is required'),
  addressLine2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  pin: z.string().trim().refine(isValidPin, 'Enter a valid 6-digit PIN code'),
  gstin: z.string().trim().refine((value) => value === '' || isValidGstin(value), 'Enter a valid GSTIN').optional(),
  pricesIncludeTax: z.boolean(),
  defaultTaxPercent: z.number().min(0).max(100),
  invoicePrefix: z.string().trim().min(2).max(12),
  upiId: z.string().trim().max(80).optional(),
  receiptFooter: z.string().trim().max(200).optional(),
})
export type BusinessSettingsValues = z.infer<typeof businessSettingsSchema>
