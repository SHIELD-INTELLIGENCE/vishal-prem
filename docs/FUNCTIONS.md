# Trusted operations

> **Simple explanation:** Think of the browser as the shop counter and these functions as the back-room accountant. The counter can ask for an order, but the accountant checks the price, stock, customer and permissions before writing anything in the ledger. The counter is never allowed to write its own totals.

All authoritative writes are served by Netlify Functions and call the Firebase Admin SDK on the server. The browser never owns order, booking, payment, stock, production, delivery or finance balances.

> **Simple explanation of the table:** Each row is one back-room task. The "Netlify endpoint" is the current door; the "Legacy callable" is the old spare door kept for rollback.

| Netlify endpoint | Legacy callable | Purpose |
| --- | --- | --- |
| `/.netlify/functions/create-order` | `createOrder` | Validates the actor, reads live catalogue/business data, recomputes prices/tax/discounts/totals, aggregates stock by product, and atomically writes the order, stock decrements and advance payment. |
| `/.netlify/functions/cancel-order` | `cancelOrder` | Reads the live order, restores stock from immutable line snapshots, and makes repeat cancellations idempotent. Legacy orders without snapshots are rejected for manual reconciliation. |
| `/.netlify/functions/record-order-payment` | `recordOrderPayment` | Writes the payment record and the order paid/balance/status fields in one transaction. Retrying the same request id returns the original receipt. |
| `/.netlify/functions/adjust-product-stock` | `adjustProductStock` | Reads the live product balance, applies one signed manual adjustment with a mandatory reason, and atomically updates the product and writes an immutable `stockAdjustments` audit record. |
| `/.netlify/functions/enable-product-stock-tracking` | `enableProductStockTracking` | Converts an existing untracked product to stock control with an explicit opening balance (zero allowed), scope checks and an immutable `enable_tracking` audit record. |
| `/.netlify/functions/create-booking` | - | Reads the live outlet, customer, products and business tax mode; validates prices, stock and departments; computes totals; writes the booking and any advance payment with a receipt number in one transaction. |
| `/.netlify/functions/update-booking` | - | Revalidates prices, discounts, tax, totals, stock and scope; preserves the paid amount; enforces a revision guard; and writes an append-only `bookingRevisions` snapshot with actor attribution. |
| `/.netlify/functions/update-booking-fulfilment` | - | Records the collection method and the delivery address on the server. Direct client writes to those two fields are denied by the Firestore rules, so this is the only way to change them. It leaves prices, totals, paid money and the revision history untouched, and refreshes a delivery that has not been dispatched. |
| `/.netlify/functions/record-booking-payment` | - | Writes a booking receipt/refund and the booking paid/balance/status fields atomically. Retries return the original receipt. |
| `/.netlify/functions/production-operation` | - | Syncs confirmed source lines into department tasks, assigns staff, starts work, records partial completion, quality, rework, cancellation and event history. |
| `/.netlify/functions/inventory-operation` | - | Creates raw-material/packaging items, posts append-only movements, physical counts, atomic transfers and metadata changes with idempotency and no-negative enforcement. |
| `/.netlify/functions/delivery-operation` | - | Creates a delivery from an eligible order/booking, assigns and dispatches staff, closes delivered/partial/failed/returned outcomes, and posts door collections once. |
| `/.netlify/functions/finance-operation` | - | Creates/voids expenses and opens/closes cash sessions with server-calculated expected cash and variance. |
| `/.netlify/functions/label-operation` | - | Creates item/account print jobs from live products and customers, confirms physical output, records reprints and append-only usage, corrects with authorised adjustments, and closes/reopens jobs with reconciliation status. |
| `/.netlify/functions/purchase-operation` | - | Posts GST purchase vouchers from live supplier, item/product and business data, receives stock atomically, refuses duplicate posted invoices, cancels with stock reversal, and records or voids supplier payments. |
| `/.netlify/functions/staff-directory` | - | Returns a minimal, permission-checked staff list for assignment controls without exposing permissions or email addresses. |

The frontend calls only the Netlify endpoints. The Firebase callables are retained as thin wrappers over the same shared operation layer for rollback compatibility; they are not a second implementation of the business rules. Booking, production, inventory, delivery and finance operations have no legacy callable because they were introduced after the Netlify migration.

## Local development

> **Simple explanation:** Use the combined shop door, not the half-built one. Netlify Dev serves both the website and the back-room functions on port 8888. Vite alone serves only the website, so every serious action gets a 404.

The frontend calls same-origin `/.netlify/functions/*` routes. Vite alone does
not run those routes; running `vite` and opening port 5173 returns an HTML 404
for every trusted operation. That 404 used to be converted into a misleading
`internal` error. Use Netlify Dev:

```bash
npm run dev          # Netlify Dev: SPA + real Netlify Functions
npm run dev:netlify  # explicit alias
```

Netlify Dev starts the Vite command from `netlify.toml` on port 5173 and
serves the combined site on <http://localhost:8888>. Open **8888**, not 5173.
`npm run dev:vite` is SPA-only and is useful only for screens that do not call
trusted endpoints.

Requirements:

- Netlify CLI (`npm install -g netlify-cli`) for `npm run dev`.
- For authenticated local calls against the real Firebase project, server-only
  Admin credentials: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
  `FIREBASE_PRIVATE_KEY`, or `FIREBASE_SERVICE_ACCOUNT_JSON`. Export them in
  the shell or put them in `.env.local`; Netlify Dev passes them to the
  Functions process. **Never** use a `VITE_*` prefix and never commit the
  private key.
- If the browser calls a different origin directly (for example
  `VITE_FUNCTIONS_BASE_URL` points at port 8888 while the SPA runs on 5173),
  set `ALLOWED_APP_ORIGINS=http://localhost:5173,http://localhost:8888`.

### Emulator-backed local functions

The Firebase Emulator Suite runs the legacy callables; Netlify Dev runs the
Netlify Functions. They can be combined:

```bash
# Terminal 1: Auth, Firestore and the legacy Functions emulators
npm run emulators:functions

# Terminal 2: point the Netlify Functions Admin SDK at the emulators
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=vishal-prem \
VITE_USE_FIREBASE_EMULATORS=true \
npm run dev:netlify
```

Set `GCLOUD_PROJECT` to the same project id as `VITE_FIREBASE_PROJECT_ID`.
Seed the emulator in a third terminal with `npm run seed:emulator` if needed.

### Smoke test the real endpoint

```bash
curl -i -X POST http://127.0.0.1:8888/.netlify/functions/label-operation \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expected: HTTP `401` with JSON
`{"error":{"code":"unauthenticated","message":"Sign in before making this request."}}`.
A `404` with an HTML body means Vite is serving the request instead of Netlify
Dev. Do not treat that as an authentication or database failure.

A `401` from a real function is also not a missing endpoint. The function
received the request but could not verify the Firebase ID token. The usual
causes are missing server-only Admin credentials while the browser uses the real
Firebase project, or a mismatch where the browser uses the emulators but the
functions do not (or the reverse). Configure both sides consistently, then sign
in again.

If the browser reports **`@vitejs/plugin-react can't detect preamble`**, hard-reload
the page (Ctrl+Shift+R). Vite injects an inline React Fast Refresh preamble into
the dev HTML. The production CSP in `netlify.toml` blocks inline scripts, so
`vite.config.ts` serves a **development-only** CSP that allows the preamble and
local HMR/emulator connections. The production CSP remains strict. Seeing this
error usually means the browser is showing a stale tab or a page served outside
Netlify Dev.

## Authentication and authorization

> **Simple explanation:** Every back-room request must show a valid staff ID card. The back room checks the card, then checks the live staff file to see what that person is allowed to do. A name written on a slip of paper is not an ID card.

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

> **Simple explanation:** A contract is the order slip the counter is allowed to send. The back room rejects extra fields, missing fields, wrong types and anyone trying to write "I am the owner" on the slip. The actor is always taken from the verified ID card, never from the slip.

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

`enableProductStockTracking` is the only supported conversion path for a product created without stock tracking. It requires `inventoryAdjust`, checks every assigned outlet and the product department, refuses an already-tracked product, and writes the explicit opening balance plus an immutable audit record with `source: 'enable_tracking'`. A zero opening balance is valid and does not create fabricated history. The product document remains the single catalogue identity; purchasing, inventory and labels read that same document.

## Error contract

> **Simple explanation:** When something fails, the back room gives a short, safe reason — like "only 2 kg left" — not a full stack trace, password or document copy. The code tells the app what kind of failure it was.

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
| `resource-exhausted` | 429 |
| `unavailable` | 503 |
| `method-not-allowed` | 405 |
| `unsupported-media-type` | 415 |
| `payload-too-large` | 413 |
| `internal` | 500 |

Infrastructure failures are classified by
`functions/src/backend/firebaseErrorMapping.ts` before the generic
`internal` fallback:

- Firestore `failed-precondition` with an index message is returned as
  `failed-precondition` with an operator-safe “deploy the indexes and wait for
  them to finish building” message. A structured `diagnostic` may include the
  Firestore console index URL for developer tooling; the UI does not show that
  URL in production.
- `permission-denied`, `unavailable`, `resource-exhausted`, `not-found`,
  `already-exists` and invalid-argument failures keep distinct codes.
- A Firestore `failed-precondition` that is **not** index-related is not
  mislabeled as an index problem.
- Unexpected failures return `internal` with a short support `reference`. The
  server log contains the same reference plus the path and safe error metadata.

Example infrastructure response:

```json
{
  "error": {
    "code": "failed-precondition",
    "message": "This data needs a one-time Firestore index before it can load. An administrator must deploy the indexes and wait for them to finish building.",
    "reference": "ERR-7A3C19F2",
    "diagnostic": {
      "source": "firebase",
      "code": "9",
      "indexUrl": "https://console.firebase.google.com/..."
    }
  }
}
```

The response never includes a stack trace, token, credential, service-account
key or document contents. Raw Firestore error text is kept in server logs, not
returned to the browser.

The browser wrapper adds two transport-only codes that never come from the
server: `endpoint-not-found` (a 404 with no structured error, usually Vite
serving its SPA fallback instead of Netlify Dev) and `invalid-response` (a 2xx
response whose body is not JSON). Both include a local-development hint and are
covered by `tests/trustedFunctions.test.ts`.

## Source layout

> **Simple explanation:** `netlify/functions/` holds the front doors. `functions/src/backend/` holds the actual back-room work. The old Firebase callable wrappers live in `functions/src/` and share the same work, so there is only one set of business rules to maintain.

```text
netlify/functions/
  create-order.mts
  cancel-order.mts
  record-order-payment.mts
  adjust-product-stock.mts
  enable-product-stock-tracking.mts
  create-booking.mts
  update-booking.mts
  update-booking-fulfilment.mts
  record-booking-payment.mts
  production-operation.mts
  inventory-operation.mts
  delivery-operation.mts
  finance-operation.mts
  label-operation.mts
  purchase-operation.mts
  staff-directory.mts

functions/src/backend/
  context.ts       live profile, permission and scope checks
  errors.ts        transport-neutral operation error codes
  firebaseErrorMapping.ts  safe Firestore/gRPC error classification
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
- stock-adjustment permission, reason, zero-delta validation, positive balance to exactly zero, smaller positive balance, negative-result rejection, retry and concurrency;
- atomic product/audit writes;
- label endpoint unauthenticated rejection before validation or writes, and authenticated strict validation without creating a real job;
- Firestore index definitions for the label job/event, purchase and supplier-payment queries (`tests/firestoreIndexes.test.ts`);
- safe Firestore error classification and UI error mapping (`tests/errorHandling.test.ts`);
- trusted booking creation, advance idempotency, revision-guarded edit, price validation and append-only revision history;
- production sync/idempotency, start, partial progress, over-completion rejection and event history;
- inventory opening balance, movement idempotency, no-negative rejection, atomic transfer and physical count variance;
- delivery create/dispatch/close, duplicate-close rejection, door collection and duplicate-payment protection;
- expense idempotency/void, cash open/close, expected cash and variance;
- minimal staff directory scope and payload;
- method, media type, body-size and CORS rejection;
- safe error payloads.

`tests/trustedFunctions.test.ts` verifies the browser transport separately: a Vite HTML 404 becomes `endpoint-not-found`, a structured server error keeps its code/message/reference, and an unreadable success response becomes `invalid-response`.

`tests/netlifyToken.test.ts` is a **mocked** verifier test for expired-token mapping and revocation-check invocation. It is not emulator verification. Expired-token behaviour against a real Firebase project remains unverified because the emulator cannot issue arbitrarily expired production-signed ID tokens.

The emulator requires Java 21 or newer. On this machine `firebase-tools` resolves `java` from `PATH` before `JAVA_HOME`, so both must point at the newer JDK.

## Remaining work

- `conversionFactor` is locked after product creation. `trackStock` is creation-only through the normal form; converting an existing untracked product is supported only through the audited `enableProductStockTracking` operation, which requires an explicit opening balance and `inventoryAdjust`.
- Stock adjustment records are readable by scoped `inventoryAdjust` holders and Super Admins, but there is no adjustment-history screen yet. Records are written and retained for audit.
- Booking creation, priced edits, fulfilment updates and booking payments are trusted server operations; direct client writes to bookings, booking revisions and payment records are denied by rules.
- Recipes, automatic ingredient consumption, stock valuation, batch/expiry tracking, purchase-indent approval, route optimization, statutory tax filing and accounting integrations are not implemented.
- App Check is not enforced. Enable it before treating Firebase ID token authentication as client integrity.
- Netlify Functions and production environment variables are **not deployed** from this workspace. Firestore rules were deployed to `vishal-prem` on 2026-10-25; the composite indexes still need a project Owner/Editor.
- Manual publishing of Functions alongside the static site is not supported by the current `dist/` drag-and-drop process. See [DEPLOYMENT.md](DEPLOYMENT.md).
