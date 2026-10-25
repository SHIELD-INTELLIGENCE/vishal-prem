# Vishal Prem Bakery & Sweets — Management System

> **Simple explanation:** Think of this as the shop's digital register. The counter staff write orders, the kitchen sees what to make, the store sees what is left, and the owner sees the money and reports. The public website is at `/`; the staff-only workspace is at `/admin`. It is **not** connected to BUSY.

Internal management system for two outlets, four production departments and the people who run them. The private workspace lives under `/admin`; the root path `/` is reserved for the public website. This is not connected to BUSY.

## The short version

| What you want to do | Where it happens |
| --- | --- |
| Take a counter order | Orders |
| Take a party booking | Bookings |
| See what the kitchen must make | Production |
| Check raw material, packing or finished stock | Inventory |
| Print price/barcode labels or customer account labels | Labels |
| Record a purchase bill from a supplier | Purchases |
| Send a delivery | Deliveries |
| See udhaar, expenses and cash in the drawer | Finance |
| See sales, tax estimate and CSV reports | Reports |
| Add staff, outlets or departments | Staff & permissions, Outlets, Departments |
| Change shop settings | Settings |

The detailed sections below are for the person who runs or maintains the system. The exact commands are kept exactly as they are so nobody has to guess.

- Cake, Sweets, Hot Section and Gajak departments
- Counter orders with preparation lifecycle
- Party bookings with trusted creation/editing, advances, balances, production and packing status
- Customer and party accounts without intrusive identity collection
- Products with fixed, per-kg, per-box and cake-pound pricing, optional SKU/barcode code, and one canonical catalogue record shared by orders, purchasing, inventory and labels
- Trusted stock-tracking conversion for existing products, with an explicit audited opening balance (zero allowed)
- Department production queues with partial completion and quality history
- Raw-material, packaging and finished-product stock ledgers per outlet and department
- Delivery assignment, dispatch, outcomes, returns and door collections
- Party statements, outstanding reminders, expenses and cash-session reconciliation
- Cash/UPI/card payments and refunds
- Reports and filtered CSV exports across sales, production, inventory, delivery, finance and parties, with a reusable date-range and column-selection dialog
- Inventory-balance, production, item/party analysis and GST working reports built only from persisted documents
- Print jobs for item/barcode and account labels with MRP, unit, batch/lot, manufacturing/expiry dates, confirmation, reprint events and applied/damaged/returned reconciliation
- GST-aware purchase vouchers, supplier ledgers, supplier payments and stock receipts
- Printable receipts, kitchen tickets, packing slips, quotations, confirmations, invoices and payment receipts
- Role, outlet and department authorization enforced in Firestore rules
- Static Vite build suitable for Netlify and future Capacitor packaging

## Stack

- React 19 + TypeScript + Vite 8
- React Router 7 (browser history)
- Tailwind CSS 4 with a warm ivory / red / gold brand system
- Firebase Authentication (email/password), Firestore, and same-origin Netlify Functions using the Firebase Admin SDK
- Firebase Storage for optional product images
- React Hook Form + Zod
- Recharts for reporting charts
- Vitest, `@firebase/rules-unit-testing` and the Firebase emulator suite

## Prerequisites

- Node.js 22 or newer
- npm
- A Firebase project (the supplied client config targets `vishal-prem`)
- Firebase CLI for rules/index deployment and emulators
- Netlify CLI for `npm run dev` (Netlify Dev serves the SPA and the real Netlify Functions together)
- Java 21 or newer for the Firestore emulator

## Quick start

```bash
npm install
cp .env.example .env.local
# fill the six VITE_FIREBASE_* values, then:
npm run dev
```

`npm run dev` starts **Netlify Dev**, which serves the Vite SPA and the real
`/.netlify/functions/*` endpoints from one origin at <http://localhost:8888>.
Use that URL for the app. `npm run dev:vite` is the SPA-only fallback; trusted
writes will return a 404 there because Vite does not run Netlify Functions.

If the Netlify CLI is not installed:

```bash
npm install -g netlify-cli
```

Authenticated local functions need server-only Firebase Admin credentials
(`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` or
`FIREBASE_SERVICE_ACCOUNT_JSON`). Never put them in a `VITE_*` variable. The
emulator workflow is in [docs/FUNCTIONS.md](docs/FUNCTIONS.md#local-development).

Before the app can hold data, the Firebase project must have:

1. Firestore enabled in Native mode
2. Email/Password authentication enabled
3. The rules and indexes in this repository deployed
4. One manually seeded Super Admin profile

The exact console and CLI sequence is in [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md). Account-level actions are intentionally left to the project owner.

After signing in as the first Super Admin, open `/admin/setup` to create the business profile, both outlets and the four departments.

## Routes

The public website owns `/`. Every management screen, including sign-in and first-run setup, lives under `/admin` so the two trees cannot be confused.

| Path | Purpose |
| --- | --- |
| `/` | Public landing page (reserved for takeaway ordering and business information) |
| `/admin` | Dashboard |
| `/admin/orders`, `/admin/orders/new`, `/admin/orders/:id` | Counter orders |
| `/admin/bookings`, `/admin/bookings/new`, `/admin/bookings/:id`, `/admin/bookings/:id/edit` | Party bookings, including trusted priced edits |
| `/admin/payments` | Payments and refunds |
| `/admin/production` | Department production queue |
| `/admin/inventory` | Raw-material, packaging and finished-stock ledger |
| `/admin/labels/items`, `/admin/labels/accounts` | Item/barcode and account label print setup |
| `/admin/labels/usage`, `/admin/labels/reconciliation` | Physical label usage and printed-versus-accounted reconciliation |
| `/admin/purchases`, `/admin/purchases/new` | GST purchase vouchers, supplier balances and supplier payments |
| `/admin/deliveries` | Delivery assignment, dispatch and closing |
| `/admin/finance` | Party statements, expenses and cash sessions |
| `/admin/customers`, `/admin/customers/new`, `/admin/customers/:id` | Customer and party accounts |
| `/admin/products`, `/admin/products/new`, `/admin/products/:id` | Product catalogue |
| `/admin/departments`, `/admin/departments/:departmentId` | Departments and department workspaces |
| `/admin/outlets` | Outlet locations |
| `/admin/users` | Staff, roles and invitations |
| `/admin/reports` | Reports and exports |
| `/admin/reports/business` | Inventory, production, item/party analysis and GST working reports |
| `/admin/busy` | Accounting CSV export |
| `/admin/settings` | Business and system settings |
| `/admin/help` | Help centre |
| `/admin/login`, `/admin/forgot-password`, `/admin/join/:token` | Authentication and invitation acceptance |
| `/admin/print/...` | Printable documents |

Every `/admin` route except the sign-in, password-reset and invitation screens requires an authenticated, linked, active staff profile, and each screen additionally checks its own permission.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Netlify Dev: Vite SPA plus real `/.netlify/functions/*` on port 8888 |
| `npm run dev:netlify` | Explicit alias for `netlify dev` |
| `npm run dev:vite` | Vite SPA only; Netlify Functions are **not** served |
| `npm run build` | Type-check and produce `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint flat config across the repository |
| `npm test` | Unit tests for routing, permissions, validation, calculations and CSV |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:rules` | Firestore rules tests (requires a running emulator) |
| `npm run test:functions` | Legacy callable and Netlify endpoint tests (requires running emulators) |
| `npm run functions:build` | Build the Firebase Functions package |
| `npm run emulators` | Auth, Firestore, Functions and Storage emulators |
| `npm run emulators:test` | Start Firestore and Storage, run rules tests, shut down |
| `npm run emulators:test:functions` | Start Auth/Firestore/Functions, run callable/endpoint tests, shut down |
| `npm run seed:emulator` | Seed a local emulator workspace and Super Admin |
| `npm run bootstrap:super-admin` | Provision the first Super Admin in a real project (dry run unless `--confirm`) |

On this machine the emulator needs a newer JDK than the system default. `firebase-tools` reads `java` from `PATH`, so put the newer JDK first as well:

```bash
export JAVA_HOME=/usr/lib/jvm/java-25-openjdk
export PATH="$JAVA_HOME/bin:$PATH"
npm run emulators:test
```

## Project structure

```text
src/
  auth/          AuthProvider, WorkspaceProvider, guards, permissions
  components/    Shared UI, shell, dialogs, print chrome
  data/          Firestore repositories and live queries
  features/      Public landing, dashboard, orders, bookings, payments,
                 customers, products, production, inventory, deliveries,
                 finance, admin, reports, settings, busy, help, print
  lib/           Firebase, calculations, validation, formatting, CSV
  types/         Canonical domain model
tests/           Unit tests, Firestore rules tests and Storage rules tests
firestore.rules  Deny-by-default authorization
storage.rules    Product image write restrictions
```

## Authorization model

| Role | Scope |
| --- | --- |
| Super Admin | Both outlets, all departments, staff, settings and reports |
| Cake / Sweets / Hot / Gajak Admin | Assigned outlet(s) and assigned department only |
| Outlet Manager | Assigned outlet, across all departments; no staff or settings access |
| Accountant | Assigned outlet, money and reporting; no catalogue writes |

Managers and accountants are deliberately department-wide inside their assigned outlets, matching their operating responsibility. Department admins remain tightly scoped. All access is evaluated from the signed-in user's `users/{uid}` document in Firestore rules, and the trusted Netlify Functions re-check the live profile, permission, outlet and department scope server-side after verifying the Firebase ID token. Client arguments are never trusted for role or scope. `inventoryAdjust` is separate from `productsManage` and is not granted to ordinary catalogue roles by default.

Label printing uses `labelsView`, `labelsManage` (create, confirm, reprint and record usage) and `labelsReconcile` (close, reopen and correct with a reason). Purchases use `purchasesView` and `purchasesManage`; supplier payments additionally require `financeManage`. Department operators can print and post purchases for their own department but cannot reconcile label jobs or manage outlet-level supplier payments.

Detailed threat model and limits: [docs/SECURITY.md](docs/SECURITY.md). Trusted operations and endpoint contracts: [docs/FUNCTIONS.md](docs/FUNCTIONS.md).

## Money, dates and records

- All money is stored as integer paise. Display and form input convert at the edge.
- Dates are ISO-8601 strings; event dates are `yyyy-MM-dd`.
- Tax can be added on top of prices or extracted from tax-inclusive prices, per business setting.
- Trusted order creation decrements tracked stock and writes the order inside one Firestore transaction. Cancellation restores stock from the immutable line snapshots. Manual adjustments use a separate trusted endpoint, require `inventoryAdjust` and a reason, and write an immutable audit record. Bookings check stock but do not reserve it.
- Aadhaar numbers and identity documents are deliberately not part of the model. GSTIN and PAN are optional and should only be collected when a business transaction requires them.

## Help and training

`/admin/help` is the operational guide for the workspace. It carries one article per module, five role-based training paths, a daily open/run/close checklist, and a data-limits reference. Each article states the permission it needs, the prerequisites, the numbered steps with the real UI labels, the expected result, the common mistakes, the hard limits, and any workflow that is still unresolved.

Unresolved workflows are shown as **Still unresolved** rather than described as settled. The current one is delivery reconciliation: a failed, returned, partially delivered or damaged delivery is recorded with a pending reconciliation status, and the app does not restock, write off, refund or change the source paid totals. The manual treatment is an owner or accountant decision, and there is no in-app resolution action.

Known defects that are documented but **not** fixed are recorded in [docs/OPEN_ISSUES.md](docs/OPEN_ISSUES.md). The current entry is OI-001: a delivery created from an order keeps the customer address that was on the record when it was created, so a later address change does not reach the delivery.

## Printing

Print routes render browser documents from saved records:

- `/admin/print/order/:id/receipt|kitchen|packing|invoice`
- `/admin/print/booking/:id/quotation|confirmation|kitchen|invoice`
- `/admin/print/payment/:id`

The print dialog is the system browser dialog. Thermal 80 mm output, A5 scaling, margins and printer drivers are **not verified** in this build. Order print events are counted only when the user has order-management permission. There is no ESC/POS, Bluetooth or native Android printing integration.

## BUSY accounting

BUSY is **not connected**. The `/admin/busy` page exports dated CSV files for orders and payments for manual import or reconciliation. There is no hidden sync, API credential or background job. A real integration would require a separate reviewed server component.

## Testing status

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm test` | 417 unit tests pass (includes stock-to-zero and stock invariant tests, trusted-endpoint 404/structured-error handling, legacy profile permission normalization, canonical product identity/visibility, CSV date-range/column/export validation, label, GST, inventory, analysis and GST-report domain tests, public/admin route tests, Help content and Help-centre interaction tests, error classification and mocked token error mapping) |
| `npm run lint` | Pass, no warnings |
| `npm run build` | Pass; production bundle emits a chunk-size advisory |
| `npm run functions:build` | Pass |
| Firestore and Storage rules emulator | 111 tests pass against the real `firestore.rules` and `storage.rules`, including label job/event, purchase and supplier-payment list-query scope and legacy Super Admin profiles without a stored permission map |
| Functions emulator | 75 callable/endpoint tests pass against real Auth, Firestore and Functions emulators, including stock-to-zero, legacy Super Admin authorization, label authentication/validation, label batch/date validation, product stock-tracking conversion, purchase lifecycles and a local HTTP server in front of the Netlify handlers |
| Netlify Dev endpoint smoke test | `POST http://127.0.0.1:8888/.netlify/functions/label-operation` returns `401` JSON for an unauthenticated request, proving the real endpoint is served instead of Vite's HTML 404 |
| Physical printer | Not tested |
| Real Firebase project flows | Firestore rules deployed to `vishal-prem` on 2026-10-25; composite indexes still need deployment by a project owner/editor because the local service account lacks `datastore.indexes.create` |

The build is verified as a static SPA plus Firebase Functions/Netlify Function source and tests. The SPA and trusted Functions have not been deployed to Netlify. The Firestore rules were deployed to `vishal-prem` on 2026-10-25, but the composite indexes in `firestore.indexes.json` still require deployment by a project owner/editor. The existing `dist/` drag-and-drop cannot publish Netlify Functions; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the required approval gate.

## Deployment

The build output is `dist/`. `netlify.toml` supplies the SPA rewrite, immutable asset caching, security headers and a CSP aligned with Firebase endpoints. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

SHIELD Source-Available License — no redistribution. This repository is proprietary client work.
