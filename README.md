# Vishal Prem Bakery & Sweets — Management System

Internal management system for two outlets, four production departments and the people who run them. The private workspace lives under `/admin`; the root path `/` is reserved for the public website. This is not connected to BUSY.

- Cake, Sweets, Hot Section and Gajak departments
- Counter orders with preparation lifecycle
- Party bookings with trusted creation/editing, advances, balances, production and packing status
- Customer and party accounts without intrusive identity collection
- Products with fixed, per-kg, per-box and cake-pound pricing
- Department production queues with partial completion and quality history
- Raw-material, packaging and finished-product stock ledgers per outlet and department
- Delivery assignment, dispatch, outcomes, returns and door collections
- Party statements, outstanding reminders, expenses and cash-session reconciliation
- Cash/UPI/card payments and refunds
- Reports and filtered CSV exports across sales, production, inventory, delivery, finance and parties
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
- Java 21 or newer for the Firestore emulator

## Quick start

```bash
npm install
cp .env.example .env.local
# fill the six VITE_FIREBASE_* values, then:
npm run dev
```

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
| `/admin/deliveries` | Delivery assignment, dispatch and closing |
| `/admin/finance` | Party statements, expenses and cash sessions |
| `/admin/customers`, `/admin/customers/new`, `/admin/customers/:id` | Customer and party accounts |
| `/admin/products`, `/admin/products/new`, `/admin/products/:id` | Product catalogue |
| `/admin/departments`, `/admin/departments/:departmentId` | Departments and department workspaces |
| `/admin/outlets` | Outlet locations |
| `/admin/users` | Staff, roles and invitations |
| `/admin/reports` | Reports and exports |
| `/admin/busy` | Accounting CSV export |
| `/admin/settings` | Business and system settings |
| `/admin/help` | Help centre |
| `/admin/login`, `/admin/forgot-password`, `/admin/join/:token` | Authentication and invitation acceptance |
| `/admin/print/...` | Printable documents |

Every `/admin` route except the sign-in, password-reset and invitation screens requires an authenticated, linked, active staff profile, and each screen additionally checks its own permission.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite development server |
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

Detailed threat model and limits: [docs/SECURITY.md](docs/SECURITY.md). Trusted operations and endpoint contracts: [docs/FUNCTIONS.md](docs/FUNCTIONS.md).

## Money, dates and records

- All money is stored as integer paise. Display and form input convert at the edge.
- Dates are ISO-8601 strings; event dates are `yyyy-MM-dd`.
- Tax can be added on top of prices or extracted from tax-inclusive prices, per business setting.
- Trusted order creation decrements tracked stock and writes the order inside one Firestore transaction. Cancellation restores stock from the immutable line snapshots. Manual adjustments use a separate trusted endpoint, require `inventoryAdjust` and a reason, and write an immutable audit record. Bookings check stock but do not reserve it.
- Aadhaar numbers and identity documents are deliberately not part of the model. GSTIN and PAN are optional and should only be collected when a business transaction requires them.

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
| `npm test` | 292 unit tests pass (includes public/admin route tests and mocked token error mapping) |
| `npm run lint` | Pass, no warnings |
| `npm run build` | Pass; production bundle emits a chunk-size advisory |
| `npm run functions:build` | Pass |
| Firestore rules emulator | 91 tests pass against the real `firestore.rules` |
| Functions emulator | 53 callable/endpoint tests pass against real Auth, Firestore and Functions emulators, including a local HTTP server in front of the Netlify handlers |
| Storage rules emulator | 13 tests pass against the real `storage.rules` |
| Physical printer | Not tested |
| Real Firebase project flows | Blocked until Firestore, trusted Functions, credentials and the first admin are configured |

The build is verified as a static SPA plus Firebase Functions/Netlify Function source and tests. Neither the SPA nor Functions/rules has been deployed to Netlify or Firebase from this workspace, and no claim is made that those hosting/account steps have been completed. The existing `dist/` drag-and-drop cannot publish Netlify Functions; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the required approval gate.

## Deployment

The build output is `dist/`. `netlify.toml` supplies the SPA rewrite, immutable asset caching, security headers and a CSP aligned with Firebase endpoints. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

SHIELD Source-Available License — no redistribution. This repository is proprietary client work.
