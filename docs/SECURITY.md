# Security model and known limits

This document describes what the system enforces, what it does not, and which actions remain the owner's responsibility.

## 1. Core principles

- **Deny by default.** `firestore.rules` ends with a catch-all `allow read, write: if false`. Nothing is reachable unless a rule explicitly permits it.
- **Trusted server boundary.** The browser uses the Firebase client SDK for reads and permitted metadata writes. Authoritative order creation, cancellation, order payments and manual stock adjustments run through same-origin Netlify Functions with the Firebase Admin SDK isolated under `functions/`. No service-account key, Admin SDK credential or privileged code is shipped in the browser bundle. Staff-account removal remains a client write plus a manual Firebase Console step; see [STAFF_DELETION.md](STAFF_DELETION.md).
- **Rules plus Functions are the backend.** Role, outlet and department scope is read from the signed-in user's own `users/{uid}` document inside the rules and re-checked server-side after verifying the Firebase ID token. Client-supplied role, outlet, permission or actor fields are never trusted.
- **Public config is not a secret.** The six `VITE_FIREBASE_*` values identify the project. They are safe to ship and useless for reading data that the rules deny. Do not confuse them with credentials.
- **Least privilege for staff.** Department admins are scoped to their department. Managers and accountants are scoped to their outlet across departments. Super Admins are the only global role.

## 2. Identity and staff lifecycle

- Authentication is Firebase Email/Password. There is no public sign-up page.
- A signed-in account with no `users/{uid}` document sees an "account not linked" state and can read nothing.
- A profile with `active: false` is suspended: reads and writes fail even if the role and permissions are otherwise valid.
- Staff are created through single-use invitations stored in `invites/{token}`:
  - the token is the document ID, so it is the only lookup key;
  - invitations expire (`expiresAtMillis`) and can be revoked;
  - a pending invitation can only be accepted by the matching signed-in email;
  - the resulting profile must copy `role`, `permissions`, `outletIds` and `departmentIds` from the invitation, so a staff member cannot promote themselves during signup.
- Only a Super Admin can write staff profiles and invitations. `usersManage` grants staff-profile listing only; it does not grant invitation visibility or any invitation/staff write.
- A staff member may update only their own `displayName`, `phone`, `lastLoginAt` and `updatedAt`. Role, permissions, scope and `active` require a Super Admin.
- **Staff account removal** is a two-part operation. An active Super Admin removes a profile from the app: the app revokes access (`active: false`) before marking the profile deleted, rejects self-removal and the last active Super Admin, and retains the profile as a tombstone so historical attribution is not orphaned. It does **not** delete the Firebase Authentication sign-in record — that requires the Firebase Console and is requested from SHIELD Intelligence. The browser never receives Admin SDK credentials.
- The first Super Admin is seeded manually. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## 3. Authorization matrix

| Collection | Read | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| `business/main` | any active staff | `settingsManage` | `settingsManage` | never |
| `outlets` | any active staff | `outletsManage` | `outletsManage` | Super Admin |
| `departments` | any active staff | `departmentsManage` | `departmentsManage` | Super Admin |
| `products` | `productsView` + outlet + department | `productsManage` + outlet + department; tracked creation also needs `inventoryAdjust` and an equal opening/current count | `productsManage` + scope, but `stockQty`, `openingStock`, `trackStock` and `conversionFactor` are server/creation-only | Super Admin |
| `stockAdjustments` | `inventoryAdjust` + outlet + department, or Super Admin | trusted stock-adjustment endpoint only | never | never |
| `customers` | `customersView` + outlet | `customersManage` + outlet | same | Super Admin |
| `orders` | `ordersView`/`ordersManage`/`paymentsView` + outlet + department | trusted create-order endpoint only | `ordersManage` limited to non-cancel status, notes or print counts; cancellation and payment fields are server-only | Super Admin |
| `bookings` | `bookingsView`/`bookingsManage`/`paymentsView` + outlet + department | trusted create-booking and update-booking-fulfilment endpoints only | `bookingsManage` + scope, limited to status, cancellation, preparation/packing, instructions and timestamps; prices, totals, paid fields, source links, fulfilment and the delivery address are server-only | never |
| `bookingRevisions` | `bookingsView`/`bookingsManage` + outlet + department | trusted update-booking endpoint only | never | never |
| `payments` | `paymentsView` + outlet + department | trusted order/booking payment endpoints only | never | never |
| `productionTasks`, `productionEvents` | `productionView`/`productionManage` + outlet + department | trusted production endpoint only | never | never |
| `inventoryItems`, `inventoryMovements`, `inventoryCounts` | `inventoryView`/`inventoryManage`/`inventoryAdjust` + outlet + department | trusted inventory endpoint only | never | never |
| `deliveries`, `deliveryEvents` | `deliveryView`/`deliveryManage` + outlet + any responsible department | trusted delivery endpoint only | never | never |
| `expenses`, `cashSessions` | `financeView`/`financeManage` + outlet | trusted finance endpoint only | never | never |
| `users` | self, or `usersManage` for lists | Super Admin, or self via a valid pending invite | Super Admin, or a narrow self patch | Super Admin (profile tombstoned in the app) |
| `invites` | pending and unexpired by exact token, or Super Admin list/read | Super Admin | Super Admin, or the invited email accepting once | Super Admin |

Payment records, booking revisions and all operational history are append-only for every client role, including Super Admin. Trusted endpoints write them with the Admin SDK. Refunds are separate records with `type: 'refund'` and a positive amount, so the audit trail is preserved rather than mutating the original receipt.

## 4. What remains outside the trusted boundary

The trusted Functions path owns order creation/cancellation/payments, booking creation/editing/payments, manual product-stock adjustments, production queues, inventory movements/transfers/counts, delivery dispatch/completion/collections, expenses, cash sessions and the minimal staff directory. Each request verifies a Firebase ID token with Admin Auth (including revocation), derives the actor only from that token, loads the live profile, validates permission and outlet/department scope, validates the payload and performs the authoritative write in a Firestore transaction. Netlify Admin SDK writes bypass Firestore rules, so these server checks are mandatory and repeated independently of the UI. Direct client writes to orders, bookings, booking revisions, payments and every new operational collection are denied by `firestore.rules`. The following gaps remain deliberately outside this milestone:

- **Stock tracking and conversion changes are locked after creation.** A metadata edit cannot change `trackStock` or `conversionFactor`; both are preserved from the live product. Enabling tracking later, changing an issue factor, or converting existing balances needs a separate policy and migration because it can reinterpret stock meaning or future order consumption.
- **Initial stock at product creation is rules-gated but not server-audited.** A user with both `productsManage` and `inventoryAdjust` may create a tracked product only when `openingStock == stockQty` and both are non-negative. The product's `createdBy`, timestamps and opening balance are the audit trail for that initial count. Subsequent manual changes always go through the trusted stock-adjustment endpoint.
- **Booking prices and totals are server-authoritative.** Booking creation and priced edits re-read products, customer, outlet and tax mode, aggregate stock demand, preserve the paid amount, enforce a revision guard and append a `bookingRevisions` snapshot. A direct client booking create, priced update or payment write is denied.
- **Booking fulfilment and the delivery address are server-authoritative.** Both decide what is physically loaded, so direct client writes to `fulfillment` and `deliveryAddress` are denied by rules for every role. The trusted fulfilment operation records them and refreshes a delivery that has not been dispatched. A delivery created from an **order** still keeps the customer address that was on the record when it was created; that drift is an open issue, see [OPEN_ISSUES.md](OPEN_ISSUES.md) OI-001.
- **No adjustment-history screen yet.** `stockAdjustments` records are immutable and scoped reads are allowed, but no UI lists them. The collection is an audit trail, not a full inventory ledger or stock-take system.
- **Invoice numbering.** Invoice references shown on print documents are derived from the order or booking number. There is no government-compliant sequential invoice register or gap-free audit.
- **Print counts and non-authoritative timestamps.** `printCounts` and the timestamps on notes/status edits are written by the client. Authoritative creation, cancellation, payment and stock-adjustment timestamps come from the trusted Function server. Print counts remain an operational aid, not proof of physical printing.
- **Stock accuracy beyond order transactions.** Orders decrement stock and manual adjustments apply deltas inside Firestore transactions, so concurrent trusted writes do not overwrite each other. Concurrent ordering and concurrent adjustments are verified against the real emulator. Bookings check stock and do not reserve it.
- **Long-lived service-account credential.** Netlify is not Google infrastructure, so the Functions runtime uses a service-account key stored only in Netlify's server-side environment. It should be scoped to Firestore read/write and Firebase Auth read, rotated regularly, and never copied into the repository or frontend.
- **Price overrides are intentional.** Counter staff may still enter a unit price different from the catalogue sale price. The server validates that price against the live product and recomputes line discounts, order discounts, tax and totals. It does not force the catalogue sale price, because negotiated counter rates are an existing business behaviour.
- **App Check is not enforced.** Callable authentication proves a Firebase account, not that the request came from a genuine build of the app. Enable App Check before exposing the project to adversarial traffic.

For strict accounting or tamper-proof numbering, the remaining server work is a booking/payment migration, an inventory history UI/stock-take workflow, an append-only cross-domain audit log and a sequential invoice register. None of those are implicit features of this build.

## 5. Sensitive data policy

- **No Aadhaar numbers, ID scans or biometric data.** The data model has no field for them and this is intentional.
- **GSTIN and PAN are optional.** Collect them only when a business transaction (GST invoice, credit account) actually requires them.
- Customer phone and email are contact data, not identity proof.
- Payment records store mode, reference and amount. They are bookkeeping records, not card data. Do not paste card numbers, CVVs, UPI PINs or bank credentials into notes or references.
- Notes fields are free text. Staff should not record passwords, OTPs or private health information there.
- Product images are publicly readable. Do not upload confidential documents to the product image bucket.

## 6. Storage rules

`storage.rules` allows:

- public **read** of `product-images/{outletId}/{fileName}`, so the public site can render products;
- **write** only for active staff with `productsManage` for the outlet encoded in the path;
- a 4 MB per-object limit and `image/*` content type restriction;
- delete only for the same authorised staff;
- a deny-all catch-all for every other path.

Uploaded images are compressed in the browser before upload. The client-side 8 MB source limit is a convenience, not a security boundary; the 4 MB rule is the boundary.

## 7. Transport and browser hardening

`netlify.toml` sets:

- `Content-Security-Policy` restricted to self plus Firebase/Auth/Storage endpoints, with `object-src 'none'` and `base-uri 'self'`;
- `Strict-Transport-Security` with a one-year max age and subdomains;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: SAMEORIGIN`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` that disables camera, microphone and geolocation;
- immutable, one-year caching for hashed assets;
- SPA history fallback for the static site; trusted order/payment/stock operations are same-origin Netlify Functions, so their requests are covered by `connect-src 'self'` (staff removal remains a Firestore write plus a manual Firebase Console step);
- Netlify Function endpoints enforce POST/OPTIONS only, JSON content type, a 256 KB body limit, explicit CORS origins, Firebase ID token verification and structured safe errors;

CSV exports neutralise spreadsheet formula injection by prefixing cells that start with `=`, `+`, `-`, `@`, tab or carriage return.

## 8. Dependency audit status

`npm audit --omit=dev` reports **4 high-severity advisories** in `@grpc/grpc-js`, pulled in transitively by `firebase` → `@firebase/firestore`. Follow-up advice (`npm audit fix --force`) would downgrade `firebase` to 9.x and break the application, so it must not be applied blindly.

Assessment:

- The advisory concerns gRPC transport behaviour in Node server contexts (`getAuthContext` certificate handling and error-message propagation). The browser bundle uses the Firestore WebChannel transport; the gRPC dependency is not exercised as a Node server in this static app.
- Risk to the deployed SPA is therefore low, but the advisory must be tracked and resolved by upgrading Firebase when upstream ships a patched `@grpc/grpc-js` range.

Full `npm audit` also reports advisories in development-only tooling. Those tools are not shipped in `dist/`.

Actions taken or recommended:

- Keep `npm audit` in the release checklist.
- Upgrade Firebase as soon as a patched release is available.
- Do not vendor or patch `node_modules` by hand.

## 9. Emulator test coverage

`npm run emulators:test` runs the Firestore and Storage rules suites against the emulators with the real rules file. It starts the emulators with the `vishal-prem-rules-storage` project ID so Storage rules can resolve the seeded Firestore profiles through the cross-service `firestore.get` call:

- `tests/rules.test.ts` — base authorization behaviour;
- `tests/rules.security.test.ts` — escalation, invitation, cancellation, immutability and unmapped-collection regressions;
- `tests/rules.storage.test.ts` — product-image upload, content-type, size, read and delete restrictions.

`npm run emulators:test:functions` builds the Functions package and runs both `tests/functions.test.ts` (legacy callables) and `tests/functions.netlify.test.ts` (Netlify endpoints through a local HTTP server) against the real Auth, Firestore and Functions emulators. The combined suite covers:

- unauthenticated, malformed-token and out-of-scope callable/endpoint actors;
- forged totals and forged line stock snapshots;
- duplicate-line aggregation and overselling;
- two concurrent calls competing for the last unit, with exactly one success;
- request-ID idempotency for create and payment;
- cancellation retry and cancellation after product metadata changes;
- legacy orders without stock snapshots;
- stock-adjustment authorization, outlet and department scope, missing reasons, zero quantities, negative resulting balances, concurrent adjustments, retry idempotency and atomic audit records;
- payment-record and order-balance atomicity, including overpayment rejection;
- direct client order creation, cancellation, paid-field patches, order payment records and stock-adjustment records denied by rules;
- notes, print counts and non-cancel order status advancement remaining permitted, while direct booking creation, priced booking edits, booking fulfilment and delivery-address writes, and payment writes are denied;
- forged actor fields rejected by strict endpoint validation while writes use the token-derived UID;
- endpoint method, content-type, body-size and CORS restrictions;
- safe endpoint errors that do not disclose stacks, paths or credentials.

`tests/netlifyToken.test.ts` is a mocked verifier test for expired-token mapping and the revoked-token verification flag; it is not an emulator result.

The rules suites cover:

- unauthenticated access denied;
- signed-in users without a profile denied;
- inactive staff denied;
- Super Admin global reads;
- department admin scoped to own department and outlet, denied elsewhere;
- manager with no department assignments reading across departments in the outlet only;
- catalogue reads denied without `productsView`, and denied across departments for department admins;
- staff collection listing denied without `usersManage`, self-read allowed;
- staff cannot change their own role, permissions, outletIds, departmentIds or active flag;
- forged Super Admin profile creation denied, with or without an invitation;
- invitation acceptance: matching email, expiry, accepted status, role/scope forgery and extra fields denied;
- invitation listing, creation, update and deletion denied to every non-Super Admin, including `usersManage` holders; pending tokens remain readable only by exact link; accepted and expired invites unreadable;
- direct order creation and direct cancellation denied; non-cancel status changes must follow the legal flow and a cancelled order cannot be reopened;
- direct paid/balance/payment-status patches and direct order payment records denied;
- direct product `stockQty`, `openingStock`, `trackStock` and `conversionFactor` changes denied while ordinary metadata and critical-level edits remain permitted;
- tracked product creation denied without `inventoryAdjust`; initial stock must be non-negative and equal the opening count;
- direct create, update and delete of stock-adjustment records denied; adjustment-history reads scoped to `inventoryAdjust` holders;
- order `outletId`, `departmentId`, `createdBy`, lines, totals and stock-consumption snapshots are immutable after creation; `createdBy`/`updatedBy` must match the authenticated user on update;
- direct booking creation, priced booking edits, booking revisions and all payment records are denied to clients; only narrow booking operational fields remain writable;
- direct booking fulfilment and delivery-address writes are denied to clients for every role, including Super Admin; those fields are changed only by the trusted fulfilment operation, which also keeps a dispatchable delivery in step;
- production, inventory, delivery, expense and cash-session records are readable only with the matching permission and scope, and every client write is denied;
- business profile cannot be deleted, outlet edits need `outletsManage`, cross-outlet product creation denied;
- reads and writes to collections with no rule are denied even for a Super Admin;
- Storage uploads need an active, in-scope `productsManage` profile, an image content type and under 4 MB;
- Storage deletes follow the same rule; unmapped Storage paths are denied.

The emulator requires Java 21 or newer. On this machine `firebase-tools` resolves `java` from `PATH` before `JAVA_HOME`, so both must point at the newer JDK:

```bash
export JAVA_HOME=/usr/lib/jvm/java-25-openjdk
export PATH="$JAVA_HOME/bin:$PATH"
npm run emulators:test
npm run emulators:test:functions
```

Result of the last run: **85 Firestore rules tests passed** (2 files) and **37 Functions/endpoint emulator tests passed** (2 files) against the real `firestore.rules`, Firebase Auth/Firestore emulators and built Functions package. The Storage rules suite remains blocked in this environment by the emulator JAR, so it was not counted as a pass. **288 unit tests passed** (24 files), including the mocked token test.

## 10. Recommended hardening before real trading

1. Enable **Firebase App Check** (reCAPTCHA Enterprise or App Attest/Play Integrity for Capacitor) so only your clients can call Firebase and the trusted Functions endpoints.
2. Decide the policy for changing `trackStock`/`conversionFactor` after creation, and add a scoped adjustment-history or stock-take screen if the business needs one.
3. Move booking creation/editing/payments into the same trusted boundary if bookings become material to accounting.
4. Add a cross-domain append-only `auditLogs` collection for cancellations, refunds, role changes and price overrides; stock adjustments already have their own immutable `stockAdjustments` records.
5. Enable scheduled Firestore exports/backups and confirm a restore drill.
6. Keep invitation creation Super Admin-only, and prefer short invite expiry windows.
7. Review staff profiles monthly for accurate outlet and department scope.
8. Add monitoring/alerting on Firestore, Netlify Functions, legacy Firebase Functions and authentication failures.
9. Re-run `npm audit` and update dependencies on a schedule.

## 11. Reporting a problem

For a suspected data exposure: disable the affected staff profile (`active: false`), rotate the Firebase Auth password, review Firestore rules in the console, and check the Authentication and Firestore usage logs. If a rules gap is found, treat it as a code defect in `firestore.rules` and add a regression test to `tests/rules.security.test.ts` before the fix.
