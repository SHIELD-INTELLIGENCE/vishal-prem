import { z } from 'zod'
import { PAYMENT_MODES, bookingEditSchema, bookingFormSchema, orderFormSchema } from '../../../src/lib/validation'
import { OperationError } from './errors'

const documentId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, 'The request identifier is invalid.')

const productDocumentId = z
  .string()
  .trim()
  .min(1, 'Choose a product.')
  .max(128)
  .refine(
    (value) => !value.includes('/'),
    'The product identifier is invalid.',
  )

const orderStatus = z.enum([
  'draft',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
])

export const createOrderInputSchema = z
  .object({
    requestId: documentId,
    values: orderFormSchema.strict(),
  })
  .strict()

export const cancelOrderInputSchema = z
  .object({
    orderId: documentId,
    expectedStatus: orderStatus.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()

export const recordOrderPaymentInputSchema = z
  .object({
    requestId: documentId,
    orderId: documentId,
    amountPaise: z.number().int().positive().max(1_000_000_000),
    type: z.enum(['payment', 'refund']),
    mode: z.enum(PAYMENT_MODES),
    reference: z.string().trim().max(80).optional(),
    receivedAt: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid payment date.'),
    notes: z.string().trim().max(300).optional(),
  })
  .strict()

export const recordBookingPaymentInputSchema = z
  .object({
    requestId: documentId,
    bookingId: documentId,
    amountPaise: z.number().int().positive().max(1_000_000_000),
    type: z.enum(['payment', 'refund']),
    mode: z.enum(PAYMENT_MODES),
    reference: z.string().trim().max(80).optional(),
    receivedAt: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid payment date.'),
    notes: z.string().trim().max(300).optional(),
  })
  .strict()

export const adjustProductStockInputSchema = z
  .object({
    requestId: documentId,
    productId: productDocumentId,
    delta: z
      .number()
      .finite('Enter a valid stock adjustment quantity.')
      .min(-1_000_000, 'The adjustment is too large.')
      .max(1_000_000, 'The adjustment is too large.')
      .refine((value) => value !== 0, 'Enter a non-zero stock adjustment quantity.'),
    reason: z
      .string()
      .trim()
      .min(1, 'Enter a reason for the stock adjustment.')
      .max(500, 'Keep the reason under 500 characters.'),
  })
  .strict()

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>
export type RecordOrderPaymentInput = z.infer<typeof recordOrderPaymentInputSchema>
export type RecordBookingPaymentInput = z.infer<typeof recordBookingPaymentInputSchema>
export type AdjustProductStockInput = z.infer<typeof adjustProductStockInputSchema>

/**
 * Converts an existing untracked product into a stock-tracked product.
 *
 * This is deliberately a trusted operation rather than a normal product edit:
 * enabling tracking creates the first authoritative balance, so it needs the
 * same permission, scope checks and append-only audit trail as a stock
 * adjustment. The opening quantity may be zero.
 */
export const enableProductStockTrackingInputSchema = z
  .object({
    requestId: documentId,
    productId: productDocumentId,
    openingStock: z
      .number()
      .finite('Enter a valid opening stock.')
      .min(0, 'Opening stock cannot be negative.')
      .max(1_000_000, 'Opening stock is too large.'),
    criticalStock: z
      .number()
      .finite('Enter a valid critical level.')
      .min(0, 'Critical level cannot be negative.')
      .max(1_000_000, 'Critical level is too large.')
      .optional(),
    reason: z
      .string()
      .trim()
      .min(1, 'Explain why stock tracking is being enabled.')
      .max(500, 'Keep the reason under 500 characters.'),
  })
  .strict()

export type EnableProductStockTrackingInput = z.infer<
  typeof enableProductStockTrackingInputSchema
>

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new OperationError(
      'invalid-argument',
      first?.message || 'Some submitted values are invalid.',
    )
  }
  return result.data
}

/* --------------------------------------------------------------------------
 * Production
 * ------------------------------------------------------------------------ */

const outletIdSchema = z.string().trim().min(1).max(128)
const taskIdSchema = z.string().trim().min(1).max(180)
const quantitySchema = z.number().finite().min(0).max(1_000_000)
const positiveQuantitySchema = z.number().finite().positive().max(1_000_000)

export const productionOperationInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync'),
    outletId: outletIdSchema,
  }).strict(),
  z.object({
    action: z.literal('assign'),
    taskId: taskIdSchema,
    assignedTo: z.string().trim().min(1).max(128),
  }).strict(),
  z.object({
    action: z.literal('start'),
    taskId: taskIdSchema,
  }).strict(),
  z.object({
    action: z.literal('progress'),
    taskId: taskIdSchema,
    completedDelta: positiveQuantitySchema,
    rejectedDelta: quantitySchema.optional(),
    reworkDelta: quantitySchema.optional(),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('quality'),
    taskId: taskIdSchema,
    qualityStatus: z.enum(['pending', 'passed', 'rejected', 'rework']),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('cancel'),
    taskId: taskIdSchema,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
])

/* --------------------------------------------------------------------------
 * Inventory
 * ------------------------------------------------------------------------ */

const inventoryMovementType = z.enum([
  'opening_balance',
  'purchase',
  'purchase_return',
  'issue',
  'consumption',
  'wastage',
  'customer_return',
  'supplier_return',
  'transfer_in',
  'transfer_out',
  'count_adjustment',
])

export const inventoryOperationInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_item'),
    requestId: documentId,
    name: z.string().trim().min(1).max(120),
    sku: z.string().trim().max(60).optional(),
    kind: z.enum(['raw_material', 'packaging']),
    outletId: outletIdSchema,
    departmentId: z.string().trim().min(1).max(128),
    unit: z.string().trim().min(1).max(24),
    criticalQty: quantitySchema.optional(),
    productId: productDocumentId.optional(),
    openingQty: quantitySchema.optional(),
  }).strict(),
  z.object({
    action: z.literal('movement'),
    requestId: documentId,
    itemId: documentId,
    type: inventoryMovementType,
    quantity: z.number().finite().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(1).max(500),
    reference: z.string().trim().max(120).optional(),
    occurredAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid movement date.'),
  }).strict(),
  z.object({
    action: z.literal('transfer'),
    requestId: documentId,
    fromItemId: documentId,
    toItemId: documentId,
    quantity: positiveQuantitySchema,
    reason: z.string().trim().min(1).max(500),
    occurredAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid movement date.'),
  }).strict(),
  z.object({
    action: z.literal('count'),
    requestId: documentId,
    itemId: documentId,
    countedQty: quantitySchema,
    reason: z.string().trim().min(1).max(500),
    countedAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid count date.'),
  }).strict(),
  z.object({
    action: z.literal('update_item'),
    itemId: documentId,
    name: z.string().trim().min(1).max(120).optional(),
    sku: z.string().trim().max(60).optional(),
    criticalQty: quantitySchema.optional(),
    active: z.boolean().optional(),
  }).strict(),
])

/* --------------------------------------------------------------------------
 * Delivery
 * ------------------------------------------------------------------------ */

export const deliveryOperationInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    sourceType: z.enum(['order', 'booking']),
    sourceId: documentId,
  }).strict(),
  z.object({
    action: z.literal('assign'),
    deliveryId: documentId,
    assignedTo: z.string().trim().min(1).max(128),
  }).strict(),
  z.object({
    action: z.literal('dispatch'),
    deliveryId: documentId,
  }).strict(),
  z.object({
    action: z.literal('complete'),
    deliveryId: documentId,
    status: z.enum(['delivered', 'partially_delivered', 'failed', 'returned']),
    lines: z.array(z.object({
      lineId: z.string().trim().min(1).max(180),
      deliveredQty: quantitySchema,
      returnedQty: quantitySchema,
      damagedQty: quantitySchema,
    }).strict()).max(200),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('collect'),
    deliveryId: documentId,
    requestId: documentId,
    amountPaise: z.number().int().positive().max(1_000_000_000),
    mode: z.enum(PAYMENT_MODES),
    reference: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(300).optional(),
  }).strict(),
])

/* --------------------------------------------------------------------------
 * Finance
 * ------------------------------------------------------------------------ */

export const financeOperationInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('expense_create'),
    requestId: documentId,
    outletId: outletIdSchema,
    head: z.enum(['utilities', 'rent', 'salaries', 'transport', 'packaging', 'maintenance', 'marketing', 'other']),
    amountPaise: z.number().int().positive().max(1_000_000_000),
    paidAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid expense date.'),
    mode: z.enum(PAYMENT_MODES),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('expense_void'),
    expenseId: documentId,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    action: z.literal('cash_open'),
    requestId: documentId,
    outletId: outletIdSchema,
    openingFloatPaise: z.number().int().min(0).max(100_000_000),
    notes: z.string().trim().max(300).optional(),
  }).strict(),
  z.object({
    action: z.literal('cash_close'),
    sessionId: documentId,
    countedCashPaise: z.number().int().min(0).max(1_000_000_000),
    handedOverTo: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(300).optional(),
  }).strict(),
])

export type ProductionOperationInput = z.infer<typeof productionOperationInputSchema>
export type InventoryOperationInput = z.infer<typeof inventoryOperationInputSchema>
export type DeliveryOperationInput = z.infer<typeof deliveryOperationInputSchema>
export type FinanceOperationInput = z.infer<typeof financeOperationInputSchema>

export const staffDirectoryInputSchema = z
  .object({
    outletId: outletIdSchema,
    departmentId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export type StaffDirectoryInput = z.infer<typeof staffDirectoryInputSchema>

export const updateBookingInputSchema = z
  .object({
    bookingId: documentId,
    expectedRevision: z.number().int().min(0),
    values: bookingEditSchema,
  })
  .strict()

export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>

export const createBookingInputSchema = z
  .object({
    requestId: documentId,
    values: bookingFormSchema,
  })
  .strict()

export type CreateBookingInput = z.infer<typeof createBookingInputSchema>

/**
 * Fulfilment and delivery address for an existing booking. These fields drive
 * what is physically loaded, so they are only changed through this trusted
 * operation; direct client writes to them are denied by the Firestore rules.
 */
export const updateBookingFulfilmentInputSchema = z
  .object({
    bookingId: documentId,
    fulfillment: z.enum(['pickup', 'delivery']),
    deliveryAddress: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'delivery' && !value.deliveryAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Add a delivery address, or switch to pickup.',
      })
    }
  })

export type UpdateBookingFulfilmentInput = z.infer<typeof updateBookingFulfilmentInputSchema>

/* --------------------------------------------------------------------------
 * Labels
 * ------------------------------------------------------------------------ */

const labelTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    type: z.enum(['item', 'account']),
    widthMm: z.number().finite().min(25).max(150),
    heightMm: z.number().finite().min(10).max(100),
    marginMm: z.number().finite().min(0).max(10),
    columns: z.number().int().min(1).max(4),
    showName: z.boolean(),
    showSku: z.boolean(),
    showPrice: z.boolean(),
    showMrp: z.boolean(),
    showAddress: z.boolean(),
    showPhone: z.boolean(),
    showUnit: z.boolean().optional(),
    showBatch: z.boolean().optional(),
    showMfgDate: z.boolean().optional(),
    showExpiryDate: z.boolean().optional(),
    barcodeFormat: z.enum(['code128', 'none']),
  })
  .strict()

const labelDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date.')

const labelLineIdSchema = z.string().trim().min(1).max(180)

const labelPrintLinesSchema = z
  .array(
    z
      .object({
        lineId: labelLineIdSchema,
        quantity: z.number().int().min(0).max(500),
      })
      .strict(),
  )
  .min(1)
  .max(50)

export const labelOperationInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      requestId: documentId,
      jobType: z.enum(['item', 'account']),
      outletId: outletIdSchema,
      departmentId: z.string().trim().max(128).optional(),
      template: labelTemplateSchema,
      lines: z
        .array(
          z
            .object({
              refId: z.string().trim().min(1).max(128),
              requestedQty: z.number().int().min(1).max(500),
              batchNumber: z.string().trim().max(60).optional(),
              manufacturedAt: labelDateSchema.optional(),
              expiryAt: labelDateSchema.optional(),
              netQuantity: z.string().trim().max(40).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(50),
      note: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('confirm'),
      jobId: documentId,
      lines: labelPrintLinesSchema,
      note: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('reprint'),
      jobId: documentId,
      lines: labelPrintLinesSchema,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('void'),
      jobId: documentId,
      eventId: documentId,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('usage'),
      requestId: documentId,
      jobId: documentId,
      lineId: labelLineIdSchema,
      usageAction: z.enum(['apply', 'damage', 'return_unused']),
      quantity: z.number().int().min(1).max(500),
      note: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('adjust'),
      jobId: documentId,
      lineId: labelLineIdSchema,
      category: z.enum(['applied', 'damaged', 'returned']),
      delta: z
        .number()
        .int()
        .min(-500)
        .max(500)
        .refine((value) => value !== 0, 'Enter a non-zero correction.'),
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('close'),
      jobId: documentId,
      note: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('reopen'),
      jobId: documentId,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
])

export type LabelOperationInput = z.infer<typeof labelOperationInputSchema>

/* --------------------------------------------------------------------------
 * Purchases and supplier payments
 * ------------------------------------------------------------------------ */

const purchaseTreatment = z.enum([
  'regular',
  'exempt',
  'nil_rated',
  'zero_rated',
  'reverse_charge',
  'stock_transfer',
])

const isoDateInput = z
  .string()
  .trim()
  .min(8)
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), 'Enter a valid date and time.')

export const purchaseOperationInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('post'),
      requestId: documentId,
      outletId: outletIdSchema,
      departmentId: z.string().trim().min(1).max(128),
      supplierId: z.string().trim().max(128).optional(),
      invoiceNumber: z.string().trim().min(1).max(80),
      invoiceDate: isoDateInput,
      receivedAt: isoDateInput,
      taxTreatment: purchaseTreatment,
      supplyType: z.enum(['intra_state', 'inter_state']),
      itcClaimable: z.boolean(),
      notes: z.string().trim().max(500).optional(),
      lines: z
        .array(
          z
            .object({
              itemType: z.enum(['inventory', 'product']),
              itemId: z.string().trim().min(1).max(128),
              quantity: z.number().finite().positive().max(1_000_000),
              ratePaise: z.number().int().min(0).max(1_000_000_000),
              discountPercent: z.number().finite().min(0).max(100),
              taxPercent: z.number().finite().min(0).max(100),
              taxInclusive: z.boolean(),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel'),
      purchaseId: documentId,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('supplier_payment'),
      requestId: documentId,
      supplierId: z.string().trim().min(1).max(128),
      outletId: outletIdSchema,
      amountPaise: z.number().int().positive().max(1_000_000_000),
      mode: z.enum(PAYMENT_MODES),
      reference: z.string().trim().max(80).optional(),
      paidAt: isoDateInput,
      notes: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('void_payment'),
      paymentId: documentId,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
])

export type PurchaseOperationInput = z.infer<typeof purchaseOperationInputSchema>
