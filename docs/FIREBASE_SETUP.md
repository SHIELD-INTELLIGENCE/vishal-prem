# Firebase setup — exact manual steps

This application cannot create its own Firebase project, enable services, deploy rules or bootstrap its first administrator. Those are account-level actions and must be performed by the project owner. This guide lists every step in order.

The supplied client configuration already points at the `vishal-prem` project, but a project name in an env file proves nothing. Verify each step in the Firebase console before entering real data.

## 1. Register the web app and copy the client config

1. Open <https://console.firebase.google.com/> and select the `vishal-prem` project.
2. Project settings (gear icon) → **General** → *Your apps*.
3. If no web app exists, click the `</>` icon and register one. Nickname it anything, for example `management-web`. Do not enable Firebase Hosting if Netlify will be used.
4. Copy the `firebaseConfig` object values into `.env.local`:

```bash
cp .env.example .env.local
```

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=vishal-prem.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=vishal-prem
VITE_FIREBASE_STORAGE_BUCKET=vishal-prem.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These values are public identifiers, not secrets. They do not secure anything. Security comes from Firestore rules plus the trusted Functions endpoints.

Never commit a service-account JSON, Admin SDK private key or any `*-firebase-adminsdk-*.json` file to this repository, expose it through a `VITE_*` variable, or place it in Firestore. The Netlify Functions runtime needs a server-only service-account credential stored in Netlify environment variables scoped to **Functions**; see [DEPLOYMENT.md](DEPLOYMENT.md#2-environment-variables).

## 2. Enable Email/Password authentication

1. Build → **Authentication** → *Get started*.
2. Sign-in method → **Email/Password** → Enable → Save.
3. Leave anonymous, phone and social providers disabled unless a specific need appears.
4. Settings → **Authorized domains**: add the Netlify domain (for example `vishal-prem.netlify.app` and any custom domain) when you deploy. Localhost is already authorised for development.

There is no public sign-up screen. Staff are created through single-use invitations from **Staff & permissions**.

## 3. Enable Firestore in Native mode

1. Build → **Firestore Database** → *Create database*.
2. Choose **Native mode** (not Datastore).
3. Choose the region closest to the outlets. This cannot be changed later without a migration.
4. Start in production mode. The rules in this repository will replace the default deny rules.

Realtime Database is **not** used by this application. If the project only has Realtime Database enabled, the app will fail to load profiles and must not be used for real data.

## 4. (Optional) Enable Storage for product images

1. Build → **Storage** → *Get started*.
2. Use the default bucket.
3. Product photos are compressed in the browser to 1200 px JPEG before upload, maximum 8 MB source, stored under `product-images/{outletId}/{uuid}.jpg`.
4. Images are publicly readable by design so the public site can render them. Do not upload confidential documents to this bucket.

If Storage is not enabled, product image upload will fail but the rest of the system still works.

## 5. Deploy rules, indexes and trusted Functions

Install and authenticate the Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
firebase use vishal-prem
```

Deploy the authoritative Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage   # only if Storage is enabled
```

The frontend's trusted order/payment/stock operations are **Netlify Functions**, not Firebase Functions. They are built and bundled by Netlify from `netlify/functions/` and need server-only Firebase Admin credentials in the Netlify Functions environment. See [DEPLOYMENT.md](DEPLOYMENT.md) and [FUNCTIONS.md](FUNCTIONS.md).

The Firebase callables under `functions/` remain as rollback compatibility and share the same operation layer. They are optional for the Netlify deployment. If they are retained on Firebase, install/build and deploy them separately:

```bash
npm --prefix functions ci
npm --prefix functions run build
firebase deploy --only functions
```

The `firebase.json` predeploy hook builds `functions/` automatically. Legacy Functions use Node 22 and `us-central1`, and deploying them requires the Blaze plan. Do not deploy the legacy callables as a substitute for the Netlify endpoints.

For local development:

```bash
npm run functions:build
npm run emulators   # auth, firestore, functions, storage for legacy callables/rules
```

Index creation can take a few minutes. Composite queries used by the lists and reports will fail with a console link until the indexes finish building. The exact index definitions are in `firestore.indexes.json`.

## 6. Create the first Super Admin

This one profile must be created by hand or with the bootstrap script. Every later staff member is invited from inside the app. The full runbook, including the guarded `scripts/bootstrap-super-admin.mjs` procedure, is in [BOOTSTRAP_SUPER_ADMIN.md](BOOTSTRAP_SUPER_ADMIN.md).

The manual console path:

1. Authentication → **Users** → *Add user*. Create the owner account with an email and a strong password. Copy the generated **User UID**. (If the account already exists, open it and copy the UID — do not create a second account.)
2. Firestore → **Data** → Start collection `users` (if it does not exist).
3. Add a document whose **Document ID is the UID** you copied.
4. Add these fields exactly:

```json
{
  "uid": "PASTE_FIREBASE_AUTH_UID",
  "displayName": "Owner Name",
  "email": "owner@example.com",
  "role": "super_admin",
  "permissions": {
    "dashboardView": true,
    "ordersView": true,
    "ordersManage": true,
    "ordersCancel": true,
    "bookingsView": true,
    "bookingsManage": true,
    "paymentsView": true,
    "paymentsManage": true,
    "productsView": true,
    "productsManage": true,
    "inventoryAdjust": true,
    "customersView": true,
    "customersManage": true,
    "reportsView": true,
    "departmentsManage": true,
    "outletsManage": true,
    "usersManage": true,
    "settingsManage": true,
    "busyView": true
  },
  "outletIds": [],
  "departmentIds": [],
  "active": true,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`outletIds` is intentionally empty at this point. The workspace has no outlets yet, and Super Admin rules do not depend on outlet scope.

5. Sign in to the app with that account. The first screen is `/admin/setup`.
6. Complete setup. The wizard creates the business profile, two outlets and the four departments.
7. Return to the `users/{UID}` document and set `outletIds` to the two outlet document IDs, then set `updatedAt`. Super Admin access already works without this, but keeping the scope accurate makes later audits and exports correct.

If you see **“Account not linked to the workspace”**, the `users/{UID}` document is missing or its ID does not match the Auth UID. Use the copy button on that screen and compare the values exactly.

## 7. Verify the workspace

1. Dashboard loads with the outlet selector in the top bar.
2. **Outlets** shows both outlets with the four departments assigned.
3. **Settings** opens and saves the business profile.
4. **Staff & permissions** can create an invite link for a department admin.
5. Firestore → **Rules** shows the deployed ruleset with a recent publish time.

## 8. Local emulator workflow

```bash
npm run emulators        # auth :9099, firestore :8080, functions :5001, storage :9199, UI :4000
npm run seed:emulator    # creates a local workspace and super admin
```

Set the emulator flags in `.env.local`:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_EMULATOR_HOST=127.0.0.1
VITE_AUTH_EMULATOR_PORT=9099
VITE_FIRESTORE_EMULATOR_PORT=8080
VITE_STORAGE_EMULATOR_PORT=9199
```

The Firebase Emulator Suite does not run Netlify Functions. Endpoint tests start a local HTTP server in front of the Netlify handlers and connect it to the Auth/Firestore emulators. For frontend development against a separately running Functions server, set `VITE_FUNCTIONS_BASE_URL` to that server's function base URL; leave it unset for Netlify production.

The seed script prints the local sign-in credentials when it finishes. Emulator data is local to your machine and is discarded when the emulator is shut down unless you use `--import`/`--export-on-exit`.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| “Firebase configuration required” screen | Missing or placeholder `VITE_FIREBASE_*` values | Fill `.env.local`, restart the dev server |
| “Could not load the workspace” | Firestore not enabled, or rules not deployed | Enable Firestore Native mode and deploy `firestore.rules` |
| “Account not linked to the workspace” | No `users/{uid}` document | Create it using the Auth UID as the document ID |
| “Staff access is suspended” | `users/{uid}.active` is false | Set it to `true` from a Super Admin account |
| `permission-denied` on lists | Role, outlet or department scope does not match the record | Check the profile's role, `outletIds` and `departmentIds` |
| `unavailable` when saving an order or payment | Netlify Functions not deployed, or the local Functions server is not running | Deploy the Functions through the approved Netlify workflow, or point `VITE_FUNCTIONS_BASE_URL` at a local server |
| `permission-denied` | Endpoint re-check failed for permission, origin or outlet/department scope | Check the live `users/{uid}` profile and allowed CORS origins; do not trust stale UI state |
| `failed-precondition` | A business rule rejected the write (stock, legacy snapshots, overpayment) | Read the message shown in the form; refresh and reconcile if stock is involved |
| Query fails with a console index link | Composite index still building | Wait, or deploy `firestore.indexes.json` |
| `auth/operation-not-allowed` | Email/Password provider disabled | Enable it in Authentication → Sign-in method |
| Invite link says expired | Invite `expiresAtMillis` passed | Create a new invite |
| Product image upload fails | Storage not enabled or rules not deployed | Enable Storage and deploy `storage.rules` |
| Print output is misaligned | Browser/printer scaling, not an app setting | Adjust the printer driver; see the printing limits in the README |

## 10. What must never be done

- Do not commit `.env.local`, service-account files or private keys.
- Do not disable Firestore rules to “make it work”.
- Do not collect Aadhaar numbers or identity documents in this system.
- Do not hand out invite links publicly; each link creates a real staff account.
- Do not claim BUSY is connected. It is not.

The full authorization model and its limits are documented in [SECURITY.md](SECURITY.md).
