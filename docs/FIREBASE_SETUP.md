# Firebase setup — exact manual steps

> **Simple explanation:** Firebase is the shop's record room. This guide opens the record room, switches on the lights, puts a gatekeeper at the door, and creates the first manager's key. The app cannot do these things by itself because they are owner-level actions, like opening a bank account.

This application cannot create its own Firebase project, enable services, deploy rules or bootstrap its first administrator. Those are account-level actions and must be performed by the project owner. This guide lists every step in order.

The supplied client configuration already points at the `vishal-prem` project, but a project name in an env file proves nothing. Verify each step in the Firebase console before entering real data.

## 1. Register the web app and copy the client config

> **Simple explanation:** This gives the website the shop's public address in Firebase. These values are not passwords; they only say which record room to visit.

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

> **Simple explanation:** This is the staff login door. There is no public sign-up; a manager sends a one-time invitation, like giving a new employee a sealed joining letter.

1. Build → **Authentication** → *Get started*.
2. Sign-in method → **Email/Password** → Enable → Save.
3. Leave anonymous, phone and social providers disabled unless a specific need appears.
4. Settings → **Authorized domains**: add the Netlify domain (for example `vishal-prem.netlify.app` and any custom domain) when you deploy. Localhost is already authorised for development.

There is no public sign-up screen. Staff are created through single-use invitations from **Staff & permissions**.

## 3. Enable Firestore in Native mode

> **Simple explanation:** Firestore is the main ledger cupboard. Choose Native mode, not the older Datastore mode. The region is like choosing which city's bank branch holds the records; it is hard to change later.

1. Build → **Firestore Database** → *Create database*.
2. Choose **Native mode** (not Datastore).
3. Choose the region closest to the outlets. This cannot be changed later without a migration.
4. Start in production mode. The rules in this repository will replace the default deny rules.

Realtime Database is **not** used by this application. If the project only has Realtime Database enabled, the app will fail to load profiles and must not be used for real data.

## 4. (Optional) Enable Storage for product images

> **Simple explanation:** Storage is the photo cupboard for product pictures. It is optional. Do not put private documents there, because product photos are meant to be shown publicly.

1. Build → **Storage** → *Get started*.
2. Use the default bucket.
3. Product photos are compressed in the browser to 1200 px JPEG before upload, maximum 8 MB source, stored under `product-images/{outletId}/{uuid}.jpg`.
4. Images are publicly readable by design so the public site can render them. Do not upload confidential documents to this bucket.

If Storage is not enabled, product image upload will fail but the rest of the system still works.

## 5. Deploy rules, indexes and trusted Functions

> **Simple explanation:** The rules are the gatekeeper's rulebook. The indexes are the quick-find registers. The Netlify Functions are the back-room staff who do the serious work. All three must be in place before the shop runs smoothly.

Install and authenticate the Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
firebase use vishal-prem
```

Deploy the authoritative Firestore rules and indexes. `.firebaserc` already
defaults to `vishal-prem`, but passing the project explicitly prevents a
deployment against the wrong project:

```bash
firebase deploy --only firestore:rules --project vishal-prem
firebase deploy --only firestore:indexes --project vishal-prem
firebase deploy --only storage --project vishal-prem   # only if Storage is enabled
```

The indexes in `firestore.indexes.json` are not active immediately. Open
Firebase Console → Firestore Database → **Indexes** and wait until every
composite index shows **READY**. An index that shows **Building** is not ready;
queries can still fail during that window. `firebase firestore:indexes
--project vishal-prem` also lists the deployed index state.

Index creation requires `datastore.indexes.create`. A Firebase Admin SDK
service-account key is not guaranteed to have that permission; if the deploy
returns `403`, authenticate the CLI with a project Owner/Editor account and
retry. Rules deployment uses a different permission and can succeed while
index deployment is still blocked.

The label event history query needs this composite index:

```text
labelEvents: jobId ASC, outletId ASC, occurredAt DESC
```

The department-scoped variant (`jobId`, `outletId`, `departmentId`,
`occurredAt DESC`) and the label job list indexes are also in the file. If a
screen says “This information is not ready yet” after a deployment, check the
index status first, then confirm the deployed project is `vishal-prem`.

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

> **Simple explanation:** This is the first manager's key. It must be made by hand because no manager exists yet to invite one. After this, the manager invites everyone else from inside the app.

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

> **Simple explanation:** The emulator is a practice shop on your own computer. You can create fake orders and fake staff without touching the real shop's records. When you close it, the practice data is usually gone.

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

The Firebase Emulator Suite runs the legacy callables, but it does **not** run
the Netlify Functions. Use Netlify Dev for the frontend so the real
`/.netlify/functions/*` routes are served:

```bash
npm run dev   # Netlify Dev; open http://localhost:8888, not 5173
```

`npm run dev:vite` serves only the SPA. Trusted writes will return a 404 HTML
page in that mode, which the UI now reports as a missing trusted endpoint
instead of a generic `internal` error.

To run the Netlify Functions against the Auth/Firestore emulators:

```bash
# Terminal 1
npm run emulators:functions

# Terminal 2
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=vishal-prem \
VITE_USE_FIREBASE_EMULATORS=true \
npm run dev:netlify
```

Set `GCLOUD_PROJECT` to the same project id as `VITE_FIREBASE_PROJECT_ID`. For
authenticated local calls against the real project instead of emulators,
provide server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
`FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_JSON`). Never use a
`VITE_*` prefix for these credentials.

Verify the endpoint is really Netlify Dev, not Vite:

```bash
curl -i -X POST http://127.0.0.1:8888/.netlify/functions/label-operation \
  -H 'Content-Type: application/json' -d '{}'
```

Expected: `401` with a JSON `unauthenticated` error. A `404` HTML response
means you are on the SPA-only server.

The seed script prints the local sign-in credentials when it finishes. Emulator data is local to your machine and is discarded when the emulator is shut down unless you use `--import`/`--export-on-exit`.

## 9. Troubleshooting

> **Simple explanation:** Match the symptom in the left column to the plain cause and fix. Do not switch off the gatekeeper to "make it work"; that is like removing the shop's locks because a key is missing.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| “Firebase configuration required” screen | Missing or placeholder `VITE_FIREBASE_*` values | Fill `.env.local`, restart the dev server |
| “Could not load the workspace” | Firestore not enabled, or rules not deployed | Enable Firestore Native mode and deploy `firestore.rules` |
| “Account not linked to the workspace” | No `users/{uid}` document | Create it using the Auth UID as the document ID |
| “Staff access is suspended” | `users/{uid}.active` is false | Set it to `true` from a Super Admin account |
| `permission-denied` on lists | Role, outlet or department scope does not match the record | Check the profile's role, `outletIds` and `departmentIds` |
| A trusted function returns 200 and writes a record, but the next screen says `permission-denied` | The function writes through the Admin SDK and bypasses rules; the browser reads directly through the deployed Firestore rules, which may not include the latest collection matches | Deploy `firestore.rules` and `firestore.indexes.json` to `vishal-prem`; editing the local files does not change production until they are deployed |
| `unavailable` when saving an order or payment | Netlify Functions not deployed, or the local Functions server is not running | Run `npm run dev` (Netlify Dev) and open port 8888, or deploy the Functions through the approved Netlify workflow |
| Trusted endpoint returns a 404 HTML page | The SPA-only Vite server is running instead of Netlify Dev | Stop `npm run dev:vite`; use `npm run dev` / `npm run dev:netlify` and open <http://localhost:8888> |
| `unauthenticated` (401) from a real function | The request reached the function, but Firebase ID-token verification/revocation failed | Set server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_JSON`), or run the browser and functions against the same emulator project; then sign in again |
| `internal` with a reference such as `ERR-...` | An unexpected server failure was caught safely | Search the Netlify Functions log for the same reference; the response intentionally omits the stack and document contents |
| `permission-denied` | Endpoint re-check failed for permission, origin or outlet/department scope | Check the live `users/{uid}` profile and allowed CORS origins; do not trust stale UI state |
| `failed-precondition` with a stock/legacy message | A business rule rejected the write (stock, legacy snapshots, overpayment) | Read the message shown in the form; refresh and reconcile if stock is involved |
| “This information is not ready yet” / “needs a one-time Firestore index” | A required composite index is missing or still building | Deploy `firestore.indexes.json` to `vishal-prem`, wait for **READY**, then retry |
| Query fails with a console index link | Composite index still building or deployed to another project | Check Console → Firestore → Indexes; confirm the project id and wait for **READY** |
| `failed-precondition` that is not about an index | The stored data is not in the required state, or a transaction was aborted | Reload and retry; if it continues, use the support reference and server log |
| `auth/operation-not-allowed` | Email/Password provider disabled | Enable it in Authentication → Sign-in method |
| Invite link says expired | Invite `expiresAtMillis` passed | Create a new invite |
| Product image upload fails | Storage not enabled or rules not deployed | Enable Storage and deploy `storage.rules` |
| Print output is misaligned | Browser/printer scaling, not an app setting | Adjust the printer driver; see the printing limits in the README |

## 10. What must never be done

> **Simple explanation:** These are the shop's safety rules. Breaking them is like leaving the cash box open or giving the master key to a stranger.

- Do not commit `.env.local`, service-account files or private keys.
- Do not disable Firestore rules to “make it work”.
- Do not collect Aadhaar numbers or identity documents in this system.
- Do not hand out invite links publicly; each link creates a real staff account.
- Do not claim BUSY is connected. It is not.

The full authorization model and its limits are documented in [SECURITY.md](SECURITY.md).
