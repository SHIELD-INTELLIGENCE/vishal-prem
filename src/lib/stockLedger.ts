/**
 * Pure stock-ledger domain logic.
 *
 * This module deliberately has no Firebase imports and no persistence model.
 * A ledger consumer supplies stock items, department locations and signed
 * movements; the functions below validate them and calculate balances.
 *
 * Quantities are stored as JavaScript numbers but all arithmetic is performed
 * in integer millionths of a base unit. Values are rounded half away from zero
 * to six decimal places when they enter the domain. This matches the existing
 * app's fractional quantity usage while preventing binary floating-point drift
 * from accumulating across movements.
 */

export const STOCK_QUANTITY_SCALE = 1_000_000

const MAX_STOCK_QUANTITY = Number.MAX_SAFE_INTEGER / STOCK_QUANTITY_SCALE

export const STOCK_DEPARTMENTS = {
  cakePastry: 'cake_pastry',
  sweets: 'sweets',
  hotSection: 'hot_section',
  gajak: 'gajak',
} as const

/** A stock location is the department that physically owns the quantity. */
export type StockDepartmentId = string

export interface StockLocation {
  departmentId: StockDepartmentId
}

/** Base units are part of the identity; quantities in different units never mix. */
export interface StockItem {
  itemId: string
  baseUnit: string
}

export const STOCK_MOVEMENT_TYPES = [
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
  'sale_deduction',
  'sale_reversal',
] as const

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

export type StockMovementDirection = 'increase' | 'decrease' | 'either'

/**
 * Signed quantity convention: positive increases usable stock, negative
 * decreases it. The type determines which direction is valid.
 */
export const STOCK_MOVEMENT_DIRECTIONS: Record<
  StockMovementType,
  StockMovementDirection
> = {
  opening_balance: 'increase',
  purchase: 'increase',
  purchase_return: 'decrease',
  issue: 'decrease',
  consumption: 'decrease',
  wastage: 'decrease',
  customer_return: 'increase',
  supplier_return: 'decrease',
  transfer_in: 'increase',
  transfer_out: 'decrease',
  count_adjustment: 'either',
  sale_deduction: 'decrease',
  sale_reversal: 'increase',
}

export interface StockSourceReference {
  /** Source kind such as order, purchase, transfer or physical count. */
  type: string
  /** Identifier of the source document inside that source kind. */
  documentId: string
}

export interface StockMovement {
  id: string
  location: StockLocation
  item: StockItem
  type: StockMovementType
  /** Signed base-unit quantity. */
  quantity: number
  /** Original event time, used for ordered reconstruction and audit display. */
  occurredAt?: string
  /** Human-readable justification, especially for adjustments and wastage. */
  reason?: string
  /** Staff member responsible for the movement. */
  actorId?: string
  /** Link back to the document that caused this movement, when one exists. */
  source?: StockSourceReference
  /** Stable duplicate-suppression key supplied by the source workflow. */
  idempotencyKey?: string
}

export interface StockBalance {
  location: StockLocation
  item: StockItem
  quantity: number
}

export interface CountVariance {
  countedQuantity: number
  recordedQuantity: number
  variance: number
  direction: 'surplus' | 'shortage' | 'match'
}

export interface LowStockThreshold {
  quantity: number
  unit: string
}

export type NegativeStockPolicy = 'reject' | 'allow'

export interface ReconciliationDiscrepancy {
  location: StockLocation
  item: StockItem
  expectedQuantity: number
  suppliedQuantity: number
  /** Supplied minus expected. Positive means the supplied balance is higher. */
  difference: number
}

export interface ReconciliationReport {
  matched: boolean
  discrepancies: ReconciliationDiscrepancy[]
}

export interface CreateTransferMovementsInput {
  id: string
  item: StockItem
  from: StockLocation
  to: StockLocation
  /** Positive magnitude in the item's base unit. */
  quantity: number
  occurredAt?: string
  reason?: string
  actorId?: string
  idempotencyKey?: string
}

export interface TransferMovements {
  outbound: StockMovement
  inbound: StockMovement
}

function fail(message: string): never {
  throw new Error(message)
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} is required.`)
  }
}

function roundSigned(value: number): number {
  const sign = value < 0 ? -1 : 1
  return sign * Math.round(Math.abs(value))
}

function toMicros(value: number, label = 'Quantity'): number {
  if (!Number.isFinite(value)) fail(`${label} must be a finite number.`)
  if (Math.abs(value) > MAX_STOCK_QUANTITY) fail(`${label} is too large.`)
  const micros = roundSigned(value * STOCK_QUANTITY_SCALE)
  if (!Number.isSafeInteger(micros)) fail(`${label} is too large.`)
  return micros
}

function fromMicros(value: number): number {
  return value === 0 ? 0 : value / STOCK_QUANTITY_SCALE
}

/**
 * Quantizes a quantity to six decimal places, half away from zero.
 * Use this only at the domain boundary; internal calculations use integer
 * millionths.
 */
export function roundStockQuantity(value: number): number {
  return fromMicros(toMicros(value))
}

export function stockBalanceKey(location: StockLocation, item: StockItem): string {
  return JSON.stringify([location.departmentId, item.itemId, item.baseUnit])
}

export function movementDirection(type: StockMovementType): StockMovementDirection {
  return STOCK_MOVEMENT_DIRECTIONS[type]
}

function validateLocation(location: StockLocation): void {
  requireText(location.departmentId, 'Department id')
}

function validateItem(item: StockItem): void {
  requireText(item.itemId, 'Item id')
  requireText(item.baseUnit, 'Base unit')
}

function validateTimestamp(value: string): void {
  requireText(value, 'Movement timestamp')
  if (Number.isNaN(Date.parse(value))) fail('Movement timestamp must be a valid date.')
}

function validateSource(source: StockSourceReference): void {
  requireText(source.type, 'Source type')
  requireText(source.documentId, 'Source document id')
}

/**
 * Validates a movement and returns a normalized copy. A movement with an
 * invalid direction, zero quantity, malformed identifiers or an invalid
 * timestamp is rejected rather than silently corrected.
 */
export function validateStockMovement(movement: StockMovement): StockMovement {
  requireText(movement.id, 'Movement id')
  validateLocation(movement.location)
  validateItem(movement.item)
  if (!STOCK_MOVEMENT_TYPES.includes(movement.type)) {
    fail(`Unknown stock movement type: ${String(movement.type)}.`)
  }

  const micros = toMicros(movement.quantity, 'Movement quantity')
  if (micros === 0) fail('Movement quantity must not be zero.')

  const direction = movementDirection(movement.type)
  if (direction === 'increase' && micros < 0) {
    fail(`${movement.type} must increase stock; quantity cannot be negative.`)
  }
  if (direction === 'decrease' && micros > 0) {
    fail(`${movement.type} must decrease stock; quantity cannot be positive.`)
  }

  if (movement.occurredAt !== undefined) validateTimestamp(movement.occurredAt)
  if (movement.source !== undefined) validateSource(movement.source)
  if (movement.idempotencyKey !== undefined) {
    requireText(movement.idempotencyKey, 'Idempotency key')
  }

  return {
    ...movement,
    location: { ...movement.location },
    item: { ...movement.item },
    quantity: fromMicros(micros),
  }
}

export function createOpeningBalanceMovement(
  movement: Omit<StockMovement, 'type' | 'quantity'> & { quantity: number },
): StockMovement {
  return validateStockMovement({ ...movement, type: 'opening_balance' })
}

/**
 * Applies one movement to a balance. The default policy rejects any result
 * below zero; callers must explicitly pass `allow` to opt into negative stock.
 */
export function applyStockMovement(
  currentQuantity: number,
  movement: StockMovement,
  policy: NegativeStockPolicy = 'reject',
): number {
  if (policy !== 'reject' && policy !== 'allow') fail('Unknown negative-stock policy.')
  const current = toMicros(currentQuantity, 'Current balance')
  const normalized = validateStockMovement(movement)
  const next = current + toMicros(normalized.quantity)
  if (!Number.isSafeInteger(next)) fail('Resulting balance is too large.')
  if (next < 0 && policy === 'reject') {
    fail(
      `${movement.type} would make ${movement.item.itemId} negative in ${movement.location.departmentId}.`,
    )
  }
  return fromMicros(next)
}

function validateMovementSet(movements: readonly StockMovement[]): StockMovement[] {
  const ids = new Set<string>()
  const idempotencyKeys = new Set<string>()
  return movements.map((movement) => {
    const normalized = validateStockMovement(movement)
    if (ids.has(normalized.id)) fail(`Duplicate stock movement id: ${normalized.id}.`)
    ids.add(normalized.id)
    if (normalized.idempotencyKey) {
      if (idempotencyKeys.has(normalized.idempotencyKey)) {
        fail(`Duplicate stock idempotency key: ${normalized.idempotencyKey}.`)
      }
      idempotencyKeys.add(normalized.idempotencyKey)
    }
    return normalized
  })
}

/**
 * Calculates balances from an ordered movement set starting at zero. Opening
 * balances must be supplied as opening_balance movements; historical orders
 * are never inferred.
 */
export function calculateStockBalances(
  movements: readonly StockMovement[],
  policy: NegativeStockPolicy = 'reject',
): StockBalance[] {
  const normalized = validateMovementSet(movements)
  const balances = new Map<string, StockBalance>()

  for (const movement of normalized) {
    const key = stockBalanceKey(movement.location, movement.item)
    const current = balances.get(key)
    const quantity = applyStockMovement(current?.quantity ?? 0, movement, policy)
    balances.set(key, {
      location: { ...movement.location },
      item: { ...movement.item },
      quantity,
    })
  }

  return Array.from(balances.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, balance]) => balance)
}

/**
 * Converts a quantity between two units. `factor` is the number of destination
 * base units in one source unit. A factor is required whenever the units differ
 * and must be positive and finite.
 */
export function convertQuantity({
  quantity,
  fromUnit,
  toUnit,
  factor,
}: {
  quantity: number
  fromUnit: string
  toUnit: string
  factor?: number
}): number {
  requireText(fromUnit, 'Source unit')
  requireText(toUnit, 'Destination unit')
  const micros = toMicros(quantity, 'Quantity')

  if (fromUnit === toUnit) {
    if (factor !== undefined && factor !== 1) {
      fail('Conversion factor must be 1 when the units are the same.')
    }
    return fromMicros(micros)
  }

  if (factor === undefined) fail('A conversion factor is required when units differ.')
  if (!Number.isFinite(factor)) fail('Conversion factor must be a finite number.')
  if (factor <= 0) fail('Conversion factor must be greater than zero.')

  const converted = roundSigned(micros * factor)
  if (!Number.isSafeInteger(converted)) fail('Converted quantity is too large.')
  return fromMicros(converted)
}

/**
 * Creates the paired movements for a department transfer. The source movement
 * is negative, the destination movement is positive, and the signed total is
 * always zero. Only cross-department transfers are valid because the
 * department is the stock location in this domain.
 */
export function createTransferMovements(
  input: CreateTransferMovementsInput,
): TransferMovements {
  requireText(input.id, 'Transfer id')
  validateItem(input.item)
  validateLocation(input.from)
  validateLocation(input.to)
  if (input.from.departmentId === input.to.departmentId) {
    fail('Transfer source and destination must be different departments.')
  }
  if (input.idempotencyKey !== undefined) {
    requireText(input.idempotencyKey, 'Idempotency key')
  }

  const micros = toMicros(input.quantity, 'Transfer quantity')
  if (micros <= 0) fail('Transfer quantity must be greater than zero.')
  const quantity = fromMicros(micros)
  const source: StockSourceReference = { type: 'transfer', documentId: input.id }
  const common = {
    item: { ...input.item },
    occurredAt: input.occurredAt,
    reason: input.reason,
    actorId: input.actorId,
    source,
  }

  const outbound = validateStockMovement({
    ...common,
    id: `${input.id}:out`,
    location: { ...input.from },
    type: 'transfer_out',
    quantity: -quantity,
    idempotencyKey: input.idempotencyKey
      ? `${input.idempotencyKey}:out`
      : undefined,
  })
  const inbound = validateStockMovement({
    ...common,
    id: `${input.id}:in`,
    location: { ...input.to },
    type: 'transfer_in',
    quantity,
    idempotencyKey: input.idempotencyKey
      ? `${input.idempotencyKey}:in`
      : undefined,
  })

  return { outbound, inbound }
}

export function calculateCountVariance({
  countedQuantity,
  recordedQuantity,
}: {
  countedQuantity: number
  recordedQuantity: number
}): CountVariance {
  const counted = toMicros(countedQuantity, 'Counted quantity')
  if (counted < 0) fail('Counted quantity cannot be negative.')
  const recorded = toMicros(recordedQuantity, 'Recorded quantity')
  const variance = counted - recorded
  return {
    countedQuantity: fromMicros(counted),
    recordedQuantity: fromMicros(recorded),
    variance: fromMicros(variance),
    direction: variance > 0 ? 'surplus' : variance < 0 ? 'shortage' : 'match',
  }
}

function normalizeBalance(balance: StockBalance): StockBalance {
  validateLocation(balance.location)
  validateItem(balance.item)
  return {
    location: { ...balance.location },
    item: { ...balance.item },
    quantity: fromMicros(toMicros(balance.quantity, 'Balance quantity')),
  }
}

/**
 * Low stock means the balance is at or below the threshold, matching the
 * existing product low-stock convention. The threshold must use the item's
 * base unit.
 */
export function isLowStock(
  balance: StockBalance,
  threshold: LowStockThreshold,
): boolean {
  const normalized = normalizeBalance(balance)
  requireText(threshold.unit, 'Threshold unit')
  if (threshold.unit !== normalized.item.baseUnit) {
    fail(
      `Threshold unit ${threshold.unit} does not match item base unit ${normalized.item.baseUnit}.`,
    )
  }
  const thresholdMicros = toMicros(threshold.quantity, 'Low-stock threshold')
  if (thresholdMicros < 0) fail('Low-stock threshold cannot be negative.')
  return toMicros(normalized.quantity, 'Balance quantity') <= thresholdMicros
}

/**
 * Recalculates expected balances from movements and compares them with the
 * supplied balances. Discrepancies are returned, never repaired.
 */
export function reconcileStockBalances({
  movements,
  suppliedBalances,
  policy = 'reject',
}: {
  movements: readonly StockMovement[]
  suppliedBalances: readonly StockBalance[]
  policy?: NegativeStockPolicy
}): ReconciliationReport {
  const expected = calculateStockBalances(movements, policy)
  const expectedByKey = new Map(
    expected.map((balance) => [stockBalanceKey(balance.location, balance.item), balance]),
  )

  const suppliedByKey = new Map<string, StockBalance>()
  for (const balance of suppliedBalances) {
    const normalized = normalizeBalance(balance)
    const key = stockBalanceKey(normalized.location, normalized.item)
    if (suppliedByKey.has(key)) fail(`Duplicate supplied balance: ${key}.`)
    suppliedByKey.set(key, normalized)
  }

  const keys = new Set([...expectedByKey.keys(), ...suppliedByKey.keys()])
  const discrepancies: ReconciliationDiscrepancy[] = []

  for (const key of keys) {
    const expectedBalance = expectedByKey.get(key)
    const suppliedBalance = suppliedByKey.get(key)
    const source = expectedBalance ?? suppliedBalance
    if (!source) continue

    const expectedMicros = toMicros(expectedBalance?.quantity ?? 0, 'Expected balance')
    const suppliedMicros = toMicros(suppliedBalance?.quantity ?? 0, 'Supplied balance')
    if (expectedMicros === suppliedMicros) continue

    discrepancies.push({
      location: { ...source.location },
      item: { ...source.item },
      expectedQuantity: fromMicros(expectedMicros),
      suppliedQuantity: fromMicros(suppliedMicros),
      difference: fromMicros(suppliedMicros - expectedMicros),
    })
  }

  discrepancies.sort((first, second) =>
    stockBalanceKey(first.location, first.item).localeCompare(
      stockBalanceKey(second.location, second.item),
    ),
  )

  return { matched: discrepancies.length === 0, discrepancies }
}
