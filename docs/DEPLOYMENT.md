# Deployment — Netlify static frontend + Netlify Functions

The app is a static SPA built into `dist/`. Authoritative order, payment and stock operations run in Netlify Functions under `netlify/functions/` and use the Firebase Admin SDK. Firebase Auth and Firestore remain the identity and data layer.

`netlify.toml` supplies:

- build command `npm run build`;
- publish directory `dist`;
- Functions directory `netlify/functions` with the esbuild bundler;
- the SPA history fallback, immutable asset caching and security headers.

## 1. Netlify project settings

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 22 (`NODE_VERSION = "22"` in `netlify.toml`)
- **Functions directory:** `netlify/functions` (`[functions]` in `netlify.toml`)

The trusted endpoints are:

```text
/.netlify/functions/create-order
/.netlify/functions/cancel-order
/.netlify/functions/record-order-payment
/.netlify/functions/adjust-product-stock
```

They are same-origin with the SPA, so the browser CSP only needs `connect-src 'self'` for these calls. The existing Firebase endpoints remain in the CSP while the legacy Firebase callables are still present.

## 2. Environment variables

### Public client configuration

Set these in Netlify: **Site configuration → Environment variables**, scope **Builds**:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Vite inlines `VITE_*` values at build time. Changing one requires a new deploy. These are public identifiers, not secrets.

Leave `VITE_USE_FIREBASE_EMULATORS` unset or `false` in production.

`VITE_FUNCTIONS_BASE_URL` is only for local development against a separately running Functions server. Leave it unset in production so calls go to `/.netlify/functions`.

### Server-only Firebase Admin credentials

The Netlify Functions runtime is not Google infrastructure, so the Admin SDK needs an explicit service account. Set these in Netlify with scope **Functions**:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

`FIREBASE_PRIVATE_KEY` is the PEM private key from the service-account JSON. Paste it with escaped newlines (`\n`) if the Netlify UI does not preserve multiline values. The code converts escaped newlines to real newlines.

For a single-value alternative, `FIREBASE_SERVICE_ACCOUNT_JSON` may contain the complete service-account JSON. Component variables are preferred because they avoid multiline JSON parsing and keep each value smaller. If both forms are present, the three component variables take precedence.

Required service-account permissions should be least-privilege:

- Firestore read/write (`roles/datastore.user`);
- Firebase Auth read access for the revoked-token check (`roles/firebaseauth.viewer`).

Do not use an owner/editor key if a narrower role set works. Rotate the key on a schedule and immediately if it is exposed.

Rules:

- Never place the service-account JSON, private key or `FIREBASE_*` values in a `VITE_*` variable.
- Never commit a service-account file or private key to the repository.
- Never place them in `public/`, `dist/` or any frontend bundle.
- Netlify environment values are applied at deploy time; changing a server secret requires a new deploy.

### CORS origins

Same-origin production requests are covered automatically by Netlify's `URL` and deploy URLs. If the app is also served from a separate origin (for example a local Vite server or a custom review host), add a comma-separated allowlist with scope **Functions**:

```text
ALLOWED_APP_ORIGINS=http://localhost:5173,https://review.example.com
```

The endpoint rejects requests from any other browser origin. Non-browser callers do not send an `Origin` header but still need a valid Firebase ID token and are subject to the same server-side authorization checks.

## 3. Manual deployment workflow

**The existing `dist/` drag-and-drop is not sufficient.** A manual Netlify deploy of a prebuilt output folder publishes static files but does not build or bundle `netlify/functions/`. Do not describe dragging `dist/` as a full deployment of this backend.

The smallest supported workflow that avoids a local Netlify CLI is a **Git-connected Netlify site**:

1. Put the repository in a Git remote (the workspace is not currently a Git repository).
2. In Netlify, import that repository.
3. Set the base directory to the repository root, build command `npm run build`, publish directory `dist`.
4. Confirm Netlify detects the Functions directory from `netlify.toml`.
5. Trigger a deploy from the Netlify UI or push to the production branch.
6. Netlify runs the build, bundles the static frontend and the Functions, and publishes them together.

This is a change from the current drag-and-drop process and has not been approved or performed. Stop here for owner approval before connecting a repository or changing the production deployment method.

A single drag-and-drop of the project folder with a Netlify-run build might detect Functions, but that behaviour has not been verified for this repository and must not be claimed as supported until a real test deploy confirms it.

No deployment of the SPA, Netlify Functions, Firestore rules or Firebase Functions was performed from this workspace.

## 4. Firebase rules and legacy Functions

Firestore rules and indexes are still deployed through Firebase tooling by the project owner:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

The legacy Firebase callables remain in `functions/` as rollback compatibility and currently use the same shared operation layer as the Netlify endpoints. They do not need to be redeployed for the Netlify endpoint migration, and the frontend no longer calls them. Do not remove them until the Netlify endpoints have been verified in the deployed environment.

Booking creation, priced booking edits and booking payments are trusted Netlify operations. Firestore rules deny direct client booking creates, priced booking updates and payment writes; only narrow booking operational fields remain client-writable.

## 5. Authorize the deployed domain

Firebase Console → Authentication → Settings → **Authorized domains** → add:

- `your-site.netlify.app`
- your custom domain, if any
- any separate review host that signs users in

Without this, sign-in from that origin fails with `auth/unauthorized-domain`.

## 6. SPA deep links

`netlify.toml` rewrites document requests to `/index.html` with status `200`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Netlify Functions and static assets are matched before this catch-all. Verify after deployment:

- `/`
- `/admin/orders`
- `/admin/print/order/DOCUMENT_ID/receipt`
- `/admin/help`

## 7. Headers and CSP

`netlify.toml` sets strict transport security, `nosniff`, frame options, referrer policy, a restrictive permissions policy and a CSP limited to self plus Firebase Auth/Firestore/Storage endpoints. The trusted Netlify endpoints are same-origin.

If the domain or third-party API changes, extend the CSP deliberately rather than removing it.

## 8. Post-deploy verification

1. Confirm all four Functions appear in **Netlify → Functions** and that their environment variables are scoped to Functions.
2. Sign in as the Super Admin and confirm the dashboard loads.
3. Create a test order and confirm the order and stock decrement together.
4. Repeat the same create request and confirm no second order or stock deduction.
5. Cancel the order and confirm stock is restored once; repeat the cancellation and confirm it is a no-op.
6. Record a payment and confirm the payment record and order balance change together.
7. Grant `inventoryAdjust` to a test stock manager, adjust stock, and confirm the product and `stockAdjustments` record change together.
8. Confirm a direct client attempt to create an order, patch payment fields, change product stock or write `stockAdjustments` is still denied.
9. Confirm notes, print counts, status advancement and product metadata edits still work.
10. Check the browser console for CSP, CORS or Functions errors.
11. Confirm no server secret appears in the browser bundle, network response or Netlify build log.

## 9. Rollback

Netlify keeps deploy history. To roll back, open **Deploys**, select the last known-good deploy and choose **Publish deploy**.

If a rules change caused the incident, roll back `firestore.rules` separately with Firebase tooling. Do not roll back rules while leaving clients on an incompatible backend contract.

The current frontend depends on the Netlify endpoints. Rolling back to an older frontend that still calls Firebase callables requires that the legacy Functions package remains deployed.

## 10. Capacitor (not tested here)

The build is a static bundle, so Capacitor can wrap it, but the following must be verified on a real device:

```bash
npm run build
npm install @capacitor/core @capacitor/cli
npx cap init "Vishal Prem" in.vishalprem.management --web-dir=dist
npx cap add android
npx cap sync
```

Cautions:

- React Router uses browser history. Loading `index.html` from a `file://` origin can break routing; configure Capacitor to serve the bundle over its local server or use hash routing for the native wrapper only.
- Add the Android/iOS origin to Firebase authorized domains.
- The Netlify-hosted Functions are remote endpoints. A native build needs an absolute `VITE_FUNCTIONS_BASE_URL` and CORS allowance for its origin.
- App Check should be enabled for native builds.
- There is no native thermal printing, Bluetooth printing, push notification or background offline-sync implementation in this repository. Browser print preview is all that exists today.
- Keep Android permissions minimal. The app does not need camera, microphone or location for its current features.

## 11. What is not claimed

- No Netlify deployment has been performed from this workspace.
- Manual publishing of Functions alongside the static site is not available through the current `dist/` drag-and-drop process.
- The Git-connected workflow above is proposed and requires approval; it has not been configured here.
- No Capacitor project has been generated or built.
- No custom domain or TLS certificate has been configured.
- Physical printer behaviour is unverified.
- Production environment variables, service-account credentials and CORS origins have not been configured.
