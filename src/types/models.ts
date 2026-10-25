/** Domain types. All monetary values are integer paise. Dates are ISO-8601 strings. */

export type ISO = string
export type ID = string

export type RoleCode =
  | 'super_admin'
  | 'cake_admin'
  | 'sweets_admin'
  | 'hot_admin'
  | 'gajak_admin'
  | 'manager'
  | 'accountant'

export type PermissionKey =
  | 'dashboardView'
  | 'outletsManage'
  | 'departmentsManage'
  | 'productsView'
  | 'productsManage'
  | 'inventoryView'
  | 'inventoryManage'
  | 'inventoryAdjust'
  | 'customersView'
  | 'customersManage'
  | 'ordersView'
  | 'ordersManage'
  | 'ordersCancel'
  | 'bookingsView'
  | 'bookingsManage'
  | 'paymentsView'
  | 'paymentsManage'
  | 'productionView'
  | 'productionManage'
  | 'deliveryView'
  | 'deliveryManage'
  | 'financeView'
  | 'financeManage'
  | 'reportsView'
  | 'usersManage'
  | 'settingsManage'
  | 'busyView'
  | 'labelsView'
  | 'labelsManage'
  | 'labelsReconcile'
  | 'purchasesView'
  | 'purchasesManage'

export type PermissionMap = Record<PermissionKey, boolean>

export interface BaseDoc {
  id: ID
  createdAt: ISO
  updatedAt: ISO
  createdBy?: ID
  updatedBy?: ID
}

export interface Business {
  id: 'main'
  name: string
  legalName: string
  tagline: string
  phone: string
  email: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  pin: string
  gstin?: string
  pricesIncludeTax: boolean
  defaultTaxPercent: number
  invoicePrefix: string
  upiId?: string
  receiptFooter?: string
  printer: {
    receiptWidth: '80mm' | 'a5'
    kitchenWidth: '80mm'
    packingSlipSize: 'a5'
  }
  busy: {
    status: 'not_connected'
    notes: string
  }
  updatedAt: ISO
}

export interface Outlet extends BaseDoc {
  code: string
  name: string
  address: string
  phone: string
  email?: string
  gstin?: string
  active: boolean
}

export interface Department extends BaseDoc {
  code: string
  name: string
  description?: string
  outletIds: ID[]
  color: string
  active: boolean
}

export type PricingMode = 'fixed' | 'per_kg' | 'per_box' | 'cake_lb'

export interface CakeSize {
  label: string
  pounds: number
  pricePaise: number
}

export interface Product extends BaseDoc {
  name: string
  alias?: string
  /** Optional stock-keeping code. Barcode labels encode this, else the id. */
  sku?: string
  printName: string
  group: string
  category: string
  departmentId: ID
  outletIds: ID[]
  pricingMode: PricingMode
  unit: string
  altUnit?: string
  conversionFactor?: number
  packagingUnit?: string
  boxQuantity?: number
  cakeSizes?: CakeSize[]
  salePricePaise: number
  purchasePricePaise?: number
  mrpPaise?: number
  minSalePricePaise?: number
  discountPercent?: number
  taxPercent: number
  taxCategory?: string
  hsn?: string
  trackStock: boolean
  openingStock?: number
  stockQty?: number
  criticalStock?: number
  batchTracking?: boolean
  expiryTracking?: boolean
  description?: string
  imageUrl?: string
  imagePath?: string
  active: boolean
  available: boolean
}

/**
 * Immutable audit entry for one manual stock adjustment. The product's
 * `stockQty` remains the authoritative balance; this record is history only.
 */
export interface StockAdjustment extends BaseDoc {
  productId: ID
  productName: string
  departmentId: ID
  outletIds: ID[]
  unit: string
  delta: number
  previousStockQty: number
  resultingStockQty: number
  reason: string
  actorName: string
  /**
   * `manual` is a normal signed adjustment. `enable_tracking` is the audited
   * first balance recorded when an existing untracked product is converted to
   * stock tracking. Both use the same append-only audit collection.
   */
  source: 'manual' | 'enable_tracking'
}

/* --------------------------------------------------------------------------
 * Production
 * ------------------------------------------------------------------------ */

export type ProductionTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type ProductionQualityStatus = 'pending' | 'passed' | 'rejected' | 'rework'

/**
 * One production obligation linked to a single order or booking line. The
 * source line remains the commercial record; completed/rejected quantities and
 * every amendment are recorded here so production history survives edits.
 */
export interface ProductionTask extends BaseDoc {
  sourceType: 'order' | 'booking'
  sourceId: ID
  sourceNumber: string
  lineId: ID
  outletId: ID
  departmentId: ID
  productId: ID
  productName: string
  unit: string
  requiredQty: number
  completedQty: number
  rejectedQty: number
  reworkQty: number
  dueAt: ISO
  status: ProductionTaskStatus
  qualityStatus: ProductionQualityStatus
  priority: 'normal' | 'urgent'
  assignedTo?: ID
  assignedToName?: string
  notes?: string
  startedAt?: ISO
  completedAt?: ISO
}

export interface ProductionEvent extends BaseDoc {
  taskId: ID
  outletId: ID
  departmentId: ID
  action: 'created' | 'assigned' | 'started' | 'progress' | 'quality' | 'completed' | 'cancelled'
  quantity?: number
  note?: string
  actorName: string
}

/* --------------------------------------------------------------------------
 * Inventory (raw materials and packaging)
 * ------------------------------------------------------------------------ */

export type InventoryKind = 'raw_material' | 'packaging'
export type InventoryMovementType =
  | 'opening_balance'
  | 'purchase'
  | 'purchase_return'
  | 'issue'
  | 'consumption'
  | 'wastage'
  | 'customer_return'
  | 'supplier_return'
  | 'transfer_in'
  | 'transfer_out'
  | 'count_adjustment'

/**
 * An inventory item is owned by one outlet and one department. Finished
 * products are not duplicated here: they remain in `products`, linked by
 * `productId` when a display item is created.
 */
export interface InventoryItem extends BaseDoc {
  name: string
  sku?: string
  kind: InventoryKind
  outletId: ID
  departmentId: ID
  unit: string
  currentQty: number
  criticalQty?: number
  /** Optional link to an existing finished product master. */
  productId?: ID
  active: boolean
  lastMovementAt?: ISO
  openingRecordedAt?: ISO
}

export interface InventoryCount extends BaseDoc {
  requestId: ID
  itemId: ID
  itemName: string
  outletId: ID
  departmentId: ID
  unit: string
  recordedQty: number
  countedQty: number
  variance: number
  reason: string
  actorName: string
  countedAt: ISO
}

export interface InventoryMovement extends BaseDoc {
  requestId: ID
  itemId: ID
  itemName: string
  outletId: ID
  departmentId: ID
  unit: string
  type: InventoryMovementType
  /** Signed quantity: positive increases stock, negative decreases it. */
  quantity: number
  balanceBefore: number
  balanceAfter: number
  reason: string
  reference?: string
  occurredAt: ISO
  actorName: string
  sourceType?: 'manual' | 'transfer' | 'purchase' | 'purchase_cancel'
  sourceId?: ID
}

/* --------------------------------------------------------------------------
 * Delivery
 * ------------------------------------------------------------------------ */

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'dispatched'
  | 'delivered'
  | 'partially_delivered'
  | 'failed'
  | 'returned'

export type DeliveryReconciliationStatus = 'not_required' | 'pending'

export interface DeliveryLine {
  lineId: ID
  productId: ID
  name: string
  unit: string
  expectedQty: number
  deliveredQty: number
  returnedQty: number
  damagedQty: number
}

export interface Delivery extends BaseDoc {
  deliveryNumber: string
  sourceType: 'order' | 'booking'
  sourceId: ID
  sourceNumber: string
  outletId: ID
  departmentIds: ID[]
  customerName: string
  customerPhone?: string
  address: string
  scheduledAt: ISO
  status: DeliveryStatus
  lines: DeliveryLine[]
  assignedTo?: ID
  assignedToName?: string
  dispatchedAt?: ISO
  completedAt?: ISO
  collectedPaise: number
  paymentId?: ID
  notes?: string
  failureReason?: string
  /** Returned/damaged/undelivered quantities still need a documented policy decision. */
  reconciliationStatus?: DeliveryReconciliationStatus
  reconciliationNote?: string
}

export interface DeliveryEvent extends BaseDoc {
  deliveryId: ID
  outletId: ID
  departmentIds: ID[]
  action: 'created' | 'assigned' | 'dispatched' | 'completed' | 'collected' | 'source_updated'
  note?: string
  actorName: string
}

/* --------------------------------------------------------------------------
 * Finance
 * ------------------------------------------------------------------------ */

export type ExpenseHead =
  | 'utilities'
  | 'rent'
  | 'salaries'
  | 'transport'
  | 'packaging'
  | 'maintenance'
  | 'marketing'
  | 'other'

export interface Expense extends BaseDoc {
  expenseNumber: string
  outletId: ID
  head: ExpenseHead
  amountPaise: number
  paidAt: ISO
  mode: PaymentMode
  reference?: string
  notes?: string
  status: 'posted' | 'void'
  voidReason?: string
  voidedAt?: ISO
  voidedBy?: ID
  actorName: string
}

export interface CashSession extends BaseDoc {
  sessionNumber: string
  outletId: ID
  openedBy: ID
  openedByName: string
  openedAt: ISO
  openingFloatPaise: number
  status: 'open' | 'closed'
  closedAt?: ISO
  countedCashPaise?: number
  expectedCashPaise?: number
  variancePaise?: number
  handedOverTo?: string
  notes?: string
}

export interface Address {
  id: ID
  label: 'billing' | 'shipping' | 'other'
  line1: string
  line2?: string
  city: string
  state: string
  pin: string
}

export type AccountGroup =
  | 'retail_customer'
  | 'wholesale'
  | 'corporate'
  | 'party_planner'
  | 'supplier'
  | 'other'

export interface Customer extends BaseDoc {
  name: string
  alias?: string
  type: 'individual' | 'business'
  accountGroup: AccountGroup
  phone: string
  altPhone?: string
  email?: string
  addresses: Address[]
  state?: string
  pin?: string
  gstin?: string
  pan?: string
  openingBalancePaise: number
  creditLimitPaise?: number
  notes?: string
  outletIds: ID[]
  active: boolean
}

export type DiscountType = 'none' | 'percent' | 'amount'
export type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded'
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'

export interface OrderLine {
  id: ID
  productId: ID
  name: string
  printName: string
  departmentId: ID
  pricingMode: PricingMode
  quantity: number
  unit: string
  unitPricePaise: number
  discountPercent: number
  taxPercent: number
  notes?: string
  /**
   * Stock snapshot for this line. Present on orders created after the
   * edit-safety release; absent on older documents, which are treated as
   * unknown by future editing flows.
   */
  stockTracked?: boolean
  stockFactor?: number
  stockConsumed?: number
}

export interface LineTotals {
  basePaise: number
  discountPaise: number
  taxablePaise: number
  taxPaise: number
  totalPaise: number
}

export interface OrderTotals {
  subtotalPaise: number
  lineDiscountPaise: number
  orderDiscountPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  lines: Array<LineTotals & { id: ID }>
}

export type PrintDocType = 'receipt' | 'kitchen' | 'packing' | 'invoice'

export interface PrintCounts {
  receipt: number
  kitchen: number
  packing: number
  invoice: number
}

export interface Order extends BaseDoc {
  orderNumber: string
  outletId: ID
  departmentId: ID
  customerId?: ID
  customerName: string
  customerPhone?: string
  channel: 'counter' | 'phone' | 'online'
  orderType: 'takeaway' | 'delivery' | 'dine_in'
  status: OrderStatus
  paymentStatus: PaymentStatus
  lines: OrderLine[]
  subtotalPaise: number
  lineDiscountPaise: number
  orderDiscountPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paidPaise: number
  balancePaise: number
  pricesIncludeTax: boolean
  /**
   * Raw creation-form discount value: percent for `percent`, rupees for
   * `amount`. The resolved discount is stored separately in paise.
   */
  discountType?: DiscountType
  discountValue?: number
  revision?: number
  notes?: string
  pickupAt?: ISO
  cancelledAt?: ISO
  cancelReason?: string
  printCounts: PrintCounts
  createdBy: ID
  updatedBy: ID
}

export type EventType =
  | 'wedding'
  | 'birthday'
  | 'anniversary'
  | 'corporate'
  | 'catering'
  | 'festival'
  | 'other'

export type BookingStatus =
  | 'enquiry'
  | 'confirmed'
  | 'in_production'
  | 'ready'
  | 'completed'
  | 'cancelled'

export interface Booking extends BaseDoc {
  bookingNumber: string
  outletId: ID
  departmentIds: ID[]
  customerId: ID
  customerName: string
  customerPhone: string
  eventType: EventType
  eventDate: ISO
  eventTime: string
  bookingDate: ISO
  fulfillment: 'pickup' | 'delivery'
  deliveryAddress?: string
  status: BookingStatus
  paymentStatus: PaymentStatus
  lines: OrderLine[]
  subtotalPaise: number
  lineDiscountPaise: number
  orderDiscountPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paidPaise: number
  balancePaise: number
  pricesIncludeTax: boolean
  /**
   * Raw creation-form discount value: percent for `percent`, rupees for
   * `amount`. The resolved discount is stored separately in paise.
   */
  discountType?: DiscountType
  discountValue?: number
  revision?: number
  instructions?: string
  /** Reason recorded for the most recent in-production edit. */
  lastEditReason?: string
  preparationStatus: 'pending' | 'in_progress' | 'done'
  packingStatus: 'pending' | 'packed' | 'handed_over'
  cancellationReason?: string
  cancelledAt?: ISO
  createdBy: ID
  updatedBy: ID
}

/** Append-only snapshot of an edited booking total for audit. */
export interface BookingRevision extends BaseDoc {
  bookingId: ID
  outletId: ID
  departmentIds: ID[]
  revision: number
  reason: string
  beforeTotalPaise: number
  afterTotalPaise: number
  paidPaise: number
  actorName: string
}

export interface Payment extends BaseDoc {
  receiptNumber: string
  outletId: ID
  departmentIds: ID[]
  orderId?: ID
  bookingId?: ID
  deliveryId?: ID
  customerId?: ID
  customerName: string
  amountPaise: number
  type: 'payment' | 'refund'
  mode: PaymentMode
  reference?: string
  receivedAt: ISO
  notes?: string
  createdBy: ID
}

export interface UserProfile {
  uid: ID
  displayName: string
  email: string
  phone?: string
  role: RoleCode
  permissions: PermissionMap
  outletIds: ID[]
  departmentIds: ID[]
  active: boolean
  createdAt: ISO
  updatedAt: ISO
  lastLoginAt?: ISO
  inviteToken?: string
  /**
   * Set by the Super Admin staff-removal flow (`revoke access`, then
   * `finalise`). A profile is kept as a tombstone (`deletionState: 'deleted'`)
   * so historical createdBy/updatedBy attribution still resolves to a name and
   * the Firebase Authentication account can be removed later. Only an active
   * Super Admin may write these fields; see `firestore.rules`.
   */
  deletionState?: 'revoking' | 'failed' | 'deleted'
  deletionRequestedAt?: ISO
  deletionRequestedBy?: ID
  deletionFailedAt?: ISO
  deletedAt?: ISO
  deletedBy?: ID
}

export interface Invite {
  id: ID
  token: ID
  email: string
  displayName: string
  role: RoleCode
  permissions: PermissionMap
  outletIds: ID[]
  departmentIds: ID[]
  status: 'pending' | 'accepted' | 'revoked'
  createdAt: ISO
  expiresAt: ISO
  expiresAtMillis: number
  createdBy: ID
  acceptedUid?: ID
  acceptedAt?: ISO
}

export interface BusinessSnapshot {
  business: Business | null
  outlets: Outlet[]
  departments: Department[]
}

/* --------------------------------------------------------------------------
 * Label printing and physical label accountability
 *
 * A print job records what was *requested*. A separate confirmation records
 * what the operator says was actually printed. Physical application is
 * recorded later against the same job. The browser print dialog is never
 * treated as proof of physical output.
 * ------------------------------------------------------------------------ */

export type LabelType = 'item' | 'account'
export type LabelBarcodeFormat = 'code128' | 'none'
export type LabelJobStatus = 'requested' | 'printed' | 'closed'
export type LabelReconciliationStatus = 'open' | 'reconciled' | 'discrepancy'

/** Immutable snapshot of the layout used for one print job. */
export interface LabelTemplateSnapshot {
  name: string
  type: LabelType
  widthMm: number
  heightMm: number
  marginMm: number
  columns: number
  showName: boolean
  showSku: boolean
  showPrice: boolean
  showMrp: boolean
  showAddress: boolean
  showPhone: boolean
  /** Weight or selling quantity (for example `500 g` or `1 kg`). */
  showUnit?: boolean
  /** Batch / lot number supplied by the operator for this print job. */
  showBatch?: boolean
  /** Manufacturing date supplied by the operator. Never derived from stock. */
  showMfgDate?: boolean
  /** Expiry or use-by date supplied by the operator. Never invented. */
  showExpiryDate?: boolean
  barcodeFormat: LabelBarcodeFormat
}

export interface LabelJobLine {
  lineId: ID
  /** Product id for item labels, customer id for account labels. */
  refId: ID
  kind: LabelType
  name: string
  sku: string
  /** Value encoded into the barcode. Empty when the format is `none`. */
  barcodeValue: string
  unit?: string
  pricePaise?: number
  mrpPaise?: number
  /**
   * Operator-entered variable label details. They are copied onto the job at
   * creation and are never inferred from stock, sales or an earlier job.
   */
  batchNumber?: string
  manufacturedAt?: string
  expiryAt?: string
  /** Optional display override such as `500 g`; defaults to `unit`. */
  netQuantity?: string
  addressLine?: string
  phone?: string
  requestedQty: number
  /** Quantities derived from the immutable event ledger and cached here. */
  printedQty: number
  appliedQty: number
  damagedQty: number
  returnedQty: number
}

export interface LabelPrintJob extends BaseDoc {
  jobNumber: string
  jobType: LabelType
  outletId: ID
  /** Empty for outlet-wide account labels. */
  departmentId: ID
  template: LabelTemplateSnapshot
  lines: LabelJobLine[]
  requestedQty: number
  /** Confirmed physical output, including reprints. */
  printedQty: number
  /** Portion of `printedQty` that came from a reprint event. */
  reprintQty: number
  appliedQty: number
  damagedQty: number
  returnedQty: number
  /** printed − applied − damaged − returned. Never auto-classified. */
  unaccountedQty: number
  status: LabelJobStatus
  reconciliationStatus: LabelReconciliationStatus
  printedByName: string
  confirmedAt?: ISO
  closedAt?: ISO
  closedByName?: string
  closeNote?: string
  reopenedAt?: ISO
  reopenedByName?: string
  reopenReason?: string
  lastActivityAt: ISO
}

export type LabelEventKind =
  | 'created'
  | 'confirmed'
  | 'reprinted'
  | 'voided'
  | 'usage'
  | 'adjusted'
  | 'closed'
  | 'reopened'

export type LabelUsageCategory = 'applied' | 'damaged' | 'returned'

export interface LabelEventLine {
  lineId: ID
  quantity: number
}

/**
 * Append-only label ledger. Print confirmations, reprints, voids, physical
 * usage and reconciliation corrections all live here. Corrections never
 * rewrite an earlier event; they add a new one that points at it.
 */
export interface LabelEvent extends BaseDoc {
  jobId: ID
  jobNumber: string
  outletId: ID
  departmentId: ID
  kind: LabelEventKind
  /** Print quantities for confirmed/reprinted events. */
  lines: LabelEventLine[]
  /** Set for usage and adjustment events. */
  lineId?: ID
  category?: LabelUsageCategory
  quantity?: number
  note?: string
  reason?: string
  /** Set on a `voided` event: the print event being cancelled. */
  voidsEventId?: ID
  actorName: string
  occurredAt: ISO
}

/* --------------------------------------------------------------------------
 * GST-aware purchases
 * ------------------------------------------------------------------------ */

/**
 * The tax treatment is a property of the voucher, not a label. Each value has
 * a different accounting consequence and they are never interchangeable.
 */
export type PurchaseTaxTreatment =
  | 'regular'
  | 'exempt'
  | 'nil_rated'
  | 'zero_rated'
  | 'reverse_charge'
  | 'stock_transfer'

/** Intra-state splits tax into CGST + SGST; inter-state uses IGST. */
export type GstSupplyType = 'intra_state' | 'inter_state'

export type PurchaseLineItemType = 'inventory' | 'product'

export interface PurchaseLine {
  id: ID
  itemType: PurchaseLineItemType
  itemId: ID
  name: string
  unit: string
  hsn?: string
  quantity: number
  ratePaise: number
  discountPercent: number
  taxPercent: number
  /** Rate already contains tax; the tax is extracted rather than added. */
  taxInclusive: boolean
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
}

export interface Purchase extends BaseDoc {
  purchaseNumber: string
  supplierId: ID
  supplierName: string
  supplierGstin?: string
  supplierState?: string
  invoiceNumber: string
  invoiceDate: ISO
  receivedAt: ISO
  outletId: ID
  departmentId: ID
  taxTreatment: PurchaseTaxTreatment
  supplyType: GstSupplyType
  reverseCharge: boolean
  taxInclusive: boolean
  /**
   * Whether input tax credit is claimed for this voucher. It is an explicit
   * operator decision; the app does not infer statutory eligibility.
   */
  itcClaimable: boolean
  lines: PurchaseLine[]
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  /** Reverse-charge tax is a liability of the buyer, not payable to the supplier. */
  rcmTaxPaise: number
  totalPaise: number
  payablePaise: number
  status: 'posted' | 'cancelled'
  cancelledAt?: ISO
  cancelledBy?: ID
  cancelReason?: string
  notes?: string
  actorName: string
}

/** Money paid to a supplier. Separate from customer receipts. */
export interface SupplierPayment extends BaseDoc {
  paymentNumber: string
  supplierId: ID
  supplierName: string
  outletId: ID
  amountPaise: number
  mode: PaymentMode
  reference?: string
  paidAt: ISO
  notes?: string
  status: 'posted' | 'void'
  voidReason?: string
  voidedAt?: ISO
  voidedBy?: ID
  actorName: string
}
