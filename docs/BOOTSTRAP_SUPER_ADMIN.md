# Bootstrapping the first Super Admin

> **Simple explanation:** A new shop has no manager yet. The system only lets an existing manager create staff, and it only lets an invited person join. So the **first** manager has to be entered by hand, once, by the owner. After that, every other staff member is invited from inside the app.

This runbook creates the **first** Super Admin profile in a real Firebase project.
It is a one-time, owner-run procedure. After it succeeds, every later staff
member is invited from inside the app.

## Why a manual bootstrap is required

Think of `firestore.rules` as the gatekeeper. For every request, the gatekeeper
looks at the caller's own `users/{uid}` card:

- `isActive()` checks whether the card exists and is switched on;
- `isSuper()` / `hasPerm()` check the role and permissions on that card.

On a brand-new project, nobody has a card yet. The `users` create rule only allows:

1. an existing Super Admin (`usersManage`), or
2. a person joining with a valid, unused invitation.

Both of those need a first manager who does not exist yet. That is why the first
Super Admin must be created outside the app. The app has no hidden button that
makes someone Super Admin, and this procedure does not add one.

## What you need before starting

In plain words: the shop's Firebase project must be open, the owner must already
have a login account, and you need the service-account key file that lets the
script talk to Firebase. Keep that key file outside the project folder, like you
would keep the shop's bank key outside the cash box.

1. **Firestore enabled** — Firebase Console → Build → Firestore Database →
   Create database → **Native mode**.
2. **Authentication enabled** — Email/Password provider.
3. **Rules and indexes deployed**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
4. **The owner's sign-in account exists** in Authentication. Copy its **UID**.
5. **A service account key** (option A only) from
   Project settings → Service accounts → Generate new private key. Store it
   outside the repository, for example `/secure/vishal-prem-sa.json`.

## Option A — guided script (recommended)

> **Simple explanation:** This is like a trusted accountant coming to your shop with a sealed letter. The script runs only on your computer, checks the owner's login, and writes the first manager card. It never asks for or stores the owner's password.

The script uses the Admin SDK in a trusted local process. It never ships to the
browser and never holds a password.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/secure/vishal-prem-sa.json
node scripts/bootstrap-super-admin.mjs \
  --uid <FIREBASE_AUTH_UID> \
  --email <OWNER_EMAIL>
```

The first run is a **dry run**: it prints exactly what it would write and stops.
Review it, then apply:

```bash
node scripts/bootstrap-super-admin.mjs \
  --uid <FIREBASE_AUTH_UID> \
  --email <OWNER_EMAIL> \
  --confirm
```

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--confirm` | Actually write. Without it the script is read-only. |
| `--force` | Replace an existing profile for the same UID. Without it the script refuses. |
| `--project <id>` | Override the project id (otherwise taken from the key). |
| `--service-account <path>` | Key path instead of the env var. |
| `--outlets a,b` | Set outlet ids explicitly instead of auto-detecting. |
| `--display-name "Name"` | Override the display name. |

### Safety properties

- Credentials are read from your machine only. Nothing is written into the
  repository, the static build or Netlify.
- It refuses to run without `--confirm`; a mistake cannot silently write.
- The UID is looked up in Firebase Authentication and **must exist**.
- The `--email` must match that Auth account, so it cannot grant Super Admin to a
  typo'd or arbitrary UID.
- It never asks for, receives or stores a password.
- It refuses to overwrite an existing profile without `--force`.
- It re-reads the document and verifies role, `active` and all 19 permissions
  before reporting success.

## Option B — Firebase Console (no tooling)

> **Simple explanation:** If you do not want to run a script, you can type the first manager's card by hand in the Firebase Console. This is slower and easier to mistype, so copy the UID and email carefully.

1. Firebase Console → Firestore Database → Data.
2. Create collection `users`, document id = the Auth **UID** (no slashes).
3. Add fields:

   | Field | Type | Value |
   | --- | --- | --- |
   | `uid` | string | the same UID |
   | `displayName` | string | owner name |
   | `email` | string | owner email, lowercase |
   | `phone` | string | `""` |
   | `role` | string | `super_admin` |
   | `permissions` | map | the 19 keys below, each `true` |
   | `outletIds` | array | outlet document ids (may be empty, see below) |
   | `departmentIds` | array | empty |
   | `active` | boolean | `true` |
   | `createdAt` | string | ISO timestamp |
   | `updatedAt` | string | ISO timestamp |

4. Permission keys (all `true`):
   `dashboardView`, `ordersView`, `ordersManage`, `ordersCancel`,
   `bookingsView`, `bookingsManage`, `paymentsView`, `paymentsManage`,
   `productsView`, `productsManage`, `inventoryAdjust`, `customersView`,
   `customersManage`, `reportsView`, `departmentsManage`, `outletsManage`,
   `usersManage`, `settingsManage`, `busyView`.

## Outlet ids and first-time setup

Super Admins are treated as global by the rules and by the app, so an empty
`outletIds` still works. To keep the document accurate:

1. Sign in as the Super Admin. An empty workspace redirects to `/admin/setup`, which
   creates the business profile, both outlets and the four departments.
2. Re-run the script with the real ids (auto-detected), or edit `outletIds` in
   the console:
   ```bash
   node scripts/bootstrap-super-admin.mjs --uid <UID> --email <EMAIL> --confirm --force
   ```

## Verification

The script verifies the Firestore document. Full sign-in verification is manual:

1. Open the app and sign in with the owner email.
2. The workspace loads (no "Account not linked" screen).
3. The dashboard renders, and the outlet selector lists both outlets.
4. Staff & permissions is reachable.

## What this procedure does **not** do

- It does not weaken `firestore.rules`.
- It does not create a client-side Super Admin path.
- It does not store a password or a key in the repository or the build.
- It does not touch BUSY or any external system.
