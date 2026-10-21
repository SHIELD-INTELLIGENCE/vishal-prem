# Trusted operations

All authoritative writes are served by Netlify Functions and call the Firebase Admin SDK on the server. The browser never owns order, booking, payment, stock, production, delivery or finance balances.

| Netlify endpoint | Legacy callable | Purpose |
| --- | --- | --- |
| `/.netlify/functions/create-order` | `createOrder` | Validates the actor, reads live catalogue/business data, recomputes prices/tax/discounts/totals, aggregates stock by product, and atomically writes the order, stock decrements and advance payment. |
| `/.netlify/functions/cancel-order` | `cancelOrder` | Reads the live order, restores stock from immutable line snapshots, and makes repeat cancellations idempotent. Legacy orders without snapshots are rejected for manual reconciliation. |
| `/.netlify/functions/record-order-payment` | `recordOrderPayment` | Writes the payment record and the order paid/balance/status fields in one transaction. Retrying the same request id returns the original receipt. |
| `/.netlify/functions/adjust-product-stock` | `adjustProductStock` | Reads the live product balance, applies one signed manual adjustment with a mandatory reason, and atomically updates the product and writes an immutable `stockAdjustments` audit record. |
| `/.netlify/functions/create-booking` | - | Reads the live outlet, customer, products and business tax mode; validates prices, stock and departments; computes totals; writes the booking and any advance payment with a receipt number in one transaction. |
| `/.netlify/functions/update-booking` | - | Revalidates prices, discounts, tax, totals, stock and scope; preserves the paid amount; enforces a revision guard; and writes an append-only `bookingRevisions` snapshot with actor attribution. |
| `/.netlify/functions/update-booking-fulfilment` | - | Records the collection method and the delivery address on the server. Direct client writes to those two fields are denied by the Firestore rules, so this is the only way to change them. It leaves prices, totals, paid money and the revision history untouched, and refreshes a delivery that has not been dispatched. |
| `/.netlify/functions/record-booking-payment` | - | Writes a booking receipt/refund and the booking paid/balance/status fields atomically. Retries return the original receipt. |
| `/.netlify/functions/production-operation` | - | Syncs confirmed source lines into department tasks, assigns staff, starts work, records partial completion, quality, rework, cancellation and event history. |
| `/.netlify/functions/inventory-operation` | - | Creates raw-material/packaging items, posts append-only movements, physical counts, atomic transfers and metadata changes with idempotency and no-negative enforcement. |
| `/.netlify/functions/delivery-operation` | - | Creates a delivery from an eligible order/booking, assigns and dispatches staff, closes delivered/partial/failed/returned outcomes, and posts door collections once. |
| `/.netlify/functions/finance-operation` | - | Creates/voids expenses and opens/closes cash sessions with server-calculated expected cash and variance. |
| `/.netlify/functions/staff-directory` | - | Returns a minimal, permission-checked staff list for assignment controls without exposing permissions or email addresses. |

The frontend calls only the Netlify endpoints. The Firebase callables are retained as thin wrappers over the same shared operation layer for rollback compatibility; they are not a second implementation of the business rules. Booking, production, inventory, delivery and finance operations have no legacy callable because they were introduced after the Netlify migration.

## Authentication and authorization

Every Netlify endpoint:

- accepts `POST` only (plus `OPTIONS` for CORS preflight);
- requires `Content-Type: application/json`;
- rejects request bodies above 256 KB;
- requires `Authorization: Bearer <Firebase ID token>`;
- verifies the token with Firebase Admin Auth **including the revoked-token check**;
- derives the actor UID only from the verified token;
- loads the live `users/{uid}` profile and rejects missing, inactive or malformed profiles;
- checks permission, outlet scope and department scope on the server.

A Netlify header, client-supplied UID, unverified JWT payload or request body field is never authentication. The service-account credential exists only in the Netlify Functions environment and is never exposed to the browser.

## Contracts

All inputs are validated at the server boundary. The actor is never accepted as an input. The four original contracts are shown below; the newer domains use strict discriminated-union schemas in `functions/src/backend/validation.ts` and are documented by their operation names (`sync`, `assign`, `start`, `progress`, `quality`, `cancel`; `create_item`, `movement`, `transfer`, `count`, `update_item`; `create`, `assign`, `dispatch`, `complete`, `collect`; `expense_create`, `expense_void`, `cash_open`, `cash_close`).

```ts
createOrder({
  requestId: string, // also the order document id, 8-128 safe characters
  values: OrderFormValues,
})

cancelOrder({
  orderId: string,
  expectedStatus?: OrderStatus,
  reason?: string,
})

recordOrderPayment({
  requestId: string, // also the payment document id
  orderId: string,
  amountPaise: number, // positive integer
  type: 'payment' | 'refund',
  mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other',
  reference?: string,
  receivedAt: string, // ISO date-time
  notes?: string,
})

adjustProductStock({
  requestId: string, // also the stockAdjustments/audit document id
  productId: string,
  delta: number, // finite, non-zero; positive adds, negative removes
  reason: string, // mandatory, maximum 500 characters
})
```

`createOrder` deliberately does not accept order totals, line snapshots, actor ids, outlet settings or business tax mode. The client may still enter a counter unit price; the server validates it against the live product's `minSalePricePaise` and recomputes all totals.

`adjustProductStock` deliberately does not accept the actor, current balance, resulting balance or timestamp. It requires `inventoryAdjust`, checks every assigned outlet and the product department, reads the live product inside the transaction and rejects a negative resulting balance. The request id is the audit-record id, so a retry returns the original result rather than applying twice. The product's `stockQty` remains the single authoritative balance; the audit record is history, not a second ledger.

## Error contract

Failures return JSON with a stable code and an operator-safe message:

```json
{
  "error": {
    "code": "failed-precondition",
    "message": "Product X has only 2 kg in stock."
  }
}
```

| Code | HTTP status |
| --- | --- |
| `unauthenticated` | 401 |
| `permission-denied` | 403 |
| `invalid-argument` | 400 |
| `not-found` | 404 |
| `already-exists` | 409 |
| `failed-precondition` | 412 |
| `method-not-allowed` | 405 |
| `unsupported-media-type` | 415 |
| `payload-too-large` | 413 |
| `internal` | 500 |

Unexpected failures are logged server-side. The response never includes a stack trace, Firestore path, token, credential or raw Admin SDK error.

## Source layout

```text
netlify/functions/
  create-order.mts
  cancel-order.mts
  record-order-payment.mts
  adjust-product-stock.mts
  create-booking.mts
  update-booking.mts
  update-booking-fulfilment.mts
  record-booking-payment.mts
  production-operation.mts
  inventory-operation.mts
  delivery-operation.mts
  finance-operation.mts
  staff-directory.mts

functions/src/backend/
  context.ts       live profile, permission and scope checks
  errors.ts        transport-neutral operation error codes
  orders.ts        createOrderForActor, cancelOrderForActor
  bookings.ts      createBookingForActor, updateBookingForActor, updateBookingFulfilmentForActor
  payments.ts      order and booking payment operations
  products.ts      adjustProductStockForActor
  production.ts    queue, progress and quality operations
  inventory.ts     item, movement, transfer and count operations
  delivery.ts      dispatch, completion and collection operations
  finance.ts       expense and cash-session operations
  directory.ts     minimal staff directory
  validation.ts    strict Zod input schemas

functions/src/netlify/
  http.ts          POST/CORS/size/auth/error pipeline
  token.ts         Firebase ID token verification boundary

functions/src/
  admin.ts         lazy Admin SDK initialization and credentials
  orders.ts        legacy Firebase callable wrappers
  payments.ts      legacy Firebase callable wrapper
  products.ts      legacy Firebase callable wrapper
  index.ts         legacy callable exports
```

Shared pure domain code remains in `src/lib/orderOperations.ts`, `src/lib/paymentOperations.ts`, `src/lib/stockOperations.ts`, `src/lib/calculations.ts`, `src/lib/validation.ts` and `src/auth/permissions.ts`. Browser and server therefore use the same calculation and permission rules.

## Local verification

```bash
npm run functions:build
npm test
JAVA_HOME=/usr/lib/jvm/java-25-openjdk PATH="/usr/lib/jvm/java-25-openjdk/bin:$PATH" npm run emulators:test:functions
```

`tests/functions.test.ts` verifies the legacy callables against the real Auth, Firestore and Functions emulators. `tests/functions.netlify.test.ts` starts a local HTTP server in front of the Netlify handlers and verifies the real endpoint shape against the real Auth and Firestore emulators:

- missing, malformed and unprofiled tokens;
- forged actor fields rejected by strict validation;
- token-derived actor attribution;
- permission and outlet/department scope;
- duplicate-line overselling;
- concurrent last-unit ordering;
- creation, advance-payment and payment retry idempotency;
- cancellation retry and legacy snapshot rejection;
- stock-adjustment permission, reason, negative balance, retry and concurrency;
- atomic product/audit writes;
- trusted booking creation, advance idempotency, revision-guarded edit, price validation and append-only revision history;
- production sync/idempotency, start, partial progress, over-completion rejection and event history;
- inventory opening balance, movement idempotency, no-negative rejection, atomic transfer and physical count variance;
- delivery create/dispatch/close, duplicate-close rejection, door collection and duplicate-payment protection;
- expense idempotency/void, cash open/close, expected cash and variance;
- minimal staff directory scope and payload;
- method, media type, body-size and CORS rejection;
- safe error payloads.

`tests/netlifyToken.test.ts` is a **mocked** verifier test for expired-token mapping and revocation-check invocation. It is not emulator verification. Expired-token behaviour against a real Firebase project remains unverified because the emulator cannot issue arbitrarily expired production-signed ID tokens.

The emulator requires Java 21 or newer. On this machine `firebase-tools` resolves `java` from `PATH` before `JAVA_HOME`, so both must point at the newer JDK.

## Remaining work

- `trackStock` and `conversionFactor` are locked after product creation. Changing either on an existing product needs a separate policy decision because it can reinterpret live stock quantities or future order consumption. Metadata edits preserve the current values.
- Stock adjustment records are readable by scoped `inventoryAdjust` holders and Super Admins, but there is no adjustment-history screen yet. Records are written and retained for audit.
- Booking creation, priced edits, fulfilment updates and booking payments are trusted server operations; direct client writes to bookings, booking revisions and payment records are denied by rules.
- Recipes, automatic ingredient consumption, stock valuation, batch/expiry tracking, purchase-indent approval, route optimization, statutory tax filing and accounting integrations are not implemented.
- App Check is not enforced. Enable it before treating Firebase ID token authentication as client integrity.
- Netlify Functions, rules and production environment variables are **not deployed** from this workspace.
- Manual publishing of Functions alongside the static site is not supported by the current `dist/` drag-and-drop process. See [DEPLOYMENT.md](DEPLOYMENT.md).
