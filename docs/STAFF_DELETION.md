# Staff account removal — no privileged backend

Status: **implemented in the app**. This flow needs no Firebase Cloud Function, no
Blaze-plan upgrade and no server-side credentials. No Firebase data, rules,
indexes or credentials were changed.

## 1. What the app can and cannot do

The web app is a static Vite SPA that uses only the Firebase client SDK. A
browser session **cannot** delete another person's Firebase Authentication user,
and it must never hold a service-account key. That is a hard platform
boundary, not a missing feature.

Removing a staff account therefore happens in two parts:

1. **In the app (a Super Admin):** revoke the person's workspace access and
   reduce their Firestore profile to a disabled tombstone. This is immediate and
   fully enforced by `firestore.rules`.
2. **Outside the app (SHIELD Intelligence):** permanently delete the Firebase
   Authentication sign-in record in the Firebase Console. The app tells the
   administrator the exact name, email and UID to send.

The app never claims the Authentication account was deleted; it only reports
what it actually did.

## 2. Trust boundary

| Runs in the browser | Runs in the Firebase Console |
| --- | --- |
| Collects the target profile and typed confirmation | An authorised operator deletes the Auth user |
| Checks the caller's stored role and the target profile | Confirmed against the name/email/UID supplied by the app |
| Revokes access (`active: false`) | — |
| Tombstones the profile (`deletionState: 'deleted'`) | — |
| Never sends a role or permission claim | — |

Authorization is read **only** from Firestore. A client-supplied role,
permission or email is never accepted as proof of authorization, and
`firestore.rules` independently allows a `users/{uid}` update only when the
caller's stored profile is an active `super_admin`.

## 3. Sequence and recovery

The two Firestore writes are not atomic. The order is chosen so any partial
failure leaves the account locked out rather than usable.

1. **Revoke workspace access**
   - Merge `active: false`, `deletionState: 'revoking'`, `deletionRequestedAt`,
     `deletionRequestedBy`, `updatedAt`, `updatedBy` into `users/{uid}`.
   - `firestore.rules` evaluates `active == true` on every request, so access
     stops immediately.
2. **Finalise the profile**
   - Merge `deletionState: 'deleted'`, `deletedAt`, `deletedBy`, an all-false
     `permissions` map and empty `outletIds`/`departmentIds`/`phone`.
   - The profile is **not** deleted. It is a tombstone so `createdBy`/`updatedBy`
     attribution on orders, bookings and payments still resolves to a name, and
     the SHIELD operator can identify the Firebase Auth account.

If step 2 fails after step 1, access is already revoked and the profile is
inactive. Retrying the removal is safe and finishes the tombstone.

| Failure point | Access | Sign-in | Result |
| --- | --- | --- | --- |
| before step 1 | unchanged | works | nothing changed |
| after step 1, before step 2 | revoked | still exists | retry; account cannot use the app |
| success | revoked | still exists | profile tombstoned; SHIELD request pending |

## 4. Guards

- Caller must have a stored profile with `active === true` and
  `role === 'super_admin'` (checked in the app **and** by `firestore.rules`).
- Self-removal is rejected.
- Removing a Super Admin is rejected when no other **active** Super Admin
  remains, so the workspace cannot lock itself out.
- The target profile and its confirmation email are validated before any write.
- No orders, bookings, payments, customers or invitations are deleted.
- Errors are plain and actionable; no internal detail is surfaced.

## 5. Files

| File | Purpose |
| --- | --- |
| `src/data/staffRemoval.ts` | Pure authorization/validation policy and the two write patches |
| `src/data/users.ts` | `removeStaffAccount()` — revoke, then finalise |
| `src/lib/support.ts` | The SHIELD Intelligence contact shown for Auth cleanup |
| `src/features/admin/UsersPage.tsx` | Confirmation UI, identity, states, removed-accounts list |
| `tests/staffDeletionPolicy.test.ts` | Policy regression tests |
| `tests/staffDeletionClient.test.ts` | Firestore write behaviour tests |

## 6. Removing the Authentication account (SHIELD Intelligence)

1. In Firebase Console → Authentication → Users, find the sign-in record by the
   email/UID shown in the app's **Removed accounts** list.
2. Delete the user. This is irreversible.
3. The Firestore tombstone is intentionally left in place for audit attribution;
   it is not shown as active staff.

The in-app flow never performs this step and never claims it did.

## 7. Known limits

- **Authentication removal is manual.** Until SHIELD removes the sign-in
  record, the person cannot use the app (their profile is inactive and rules
  deny everything) but the credential still exists.
- **Orphan Auth accounts.** Accounts with no `users/{uid}` row do not appear in
  the staff table. Remove them with the Firebase Console or
  `scripts/delete-staff-account.mjs`.
- **No restore path.** A removed profile is not restorable from the app; a
  replacement account must be invited again.
- **App Check is not enforced.** Enable it to raise the cost of scripted abuse;
  it does not affect this flow.
