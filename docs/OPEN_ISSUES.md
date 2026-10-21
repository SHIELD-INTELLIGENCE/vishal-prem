# Open issues

Known defects and behaviour gaps that are **not fixed** in the current build. Each entry states the observable
behaviour, the operational risk, the interim instruction for staff, and the change that would close it. Nothing in
this file is implemented by the current code; it is a record of what is still outstanding.

Nothing here has been deployed. The workspace in this repository is the local build.

---

## OI-001 — Order-sourced delivery keeps a stale customer address

| Field | Value |
| --- | --- |
| Status | Open — documented, not fixed |
| Area | Deliveries / Customers |
| Severity | Medium — wrong address on a dispatch that is already loaded |
| Introduced by | Delivery snapshot design (`functions/src/backend/delivery.ts`, `customerAddress()`) |
| Tracked in | `src/features/help/helpContent.ts` → article `deliveries` |

### What happens

A delivery created from an **order** copies the customer's shipping address (or first address) into the delivery
record at creation time. That copy is a one-time snapshot:

- `deliveries/{deliveryId}.address` is written once, when the delivery is created.
- A later edit of the customer record (address, city, PIN) does **not** reach the delivery.
- The delivery can then be assigned and dispatched with the old address.

The same snapshot pattern exists for an **order** line set, but order lines cannot be edited after creation, so
the load itself cannot drift today. Only the address is affected.

A delivery created from a **booking** does not have this problem: the address comes from the booking, and the
trusted booking edit and the trusted fulfilment operation both refresh a delivery that has not been dispatched
(`assertDeliveryMatchesSource()` re-checks it at dispatch).

### Operational risk

A driver can be dispatched to an address the customer has already changed, which means goods are carried to the
wrong place, the delivery is closed against the wrong address, and the reconciliation record points at an address
the customer never confirmed. The delivery record itself is not wrong about what happened — it is wrong about
where the customer now lives.

### Interim instruction for staff

Before dispatching an order delivery, open the delivery and compare its address with the customer record. If they
differ, do not dispatch on the old address: correct the customer record first, then create the delivery for the
new order, or contact the customer and record the confirmed address in the delivery note before dispatch.

### Why it is not fixed in this change

Closing it properly means deciding what an order delivery's address should be over time, and that decision touches
order creation, the delivery snapshot, the dispatch check and the completion record. The current change was scoped
to the booking-side bypass, and a broad order-delivery rewrite was explicitly out of scope for it.

### Change that would close it

One of the following, each of which needs an owner decision first:

1. **Re-read the customer address at dispatch.** In `deliveryOperationForActor`, before a dispatch of an
   order-sourced delivery, re-read the customer record and refresh `address` when it differs, recording a
   `source_updated` delivery event. Smallest change, and it keeps the delivery truthful at the moment the load
   leaves. It must not silently change the address of a delivery that is already dispatched.
2. **Snapshot the address onto the order at order creation** and have the delivery copy the order, not the
   customer. The delivery then follows the sale, and an address change becomes an order-level decision. Larger
   change, clearer history.
3. **Refuse to dispatch** an order delivery whose address no longer matches the customer record, with the same
   fail-closed shape as the booking check. Strictest, and it needs a working remedy for the operator, which today
   would be "create a new order for the corrected address".

Option 1 is the smallest safe change and is consistent with the booking behaviour that was implemented. It is
recorded here, not built.

---

## OI-002 — Reconciliation of failed, returned and partial deliveries is manual by policy

| Field | Value |
| --- | --- |
| Status | Open by owner decision — behaviour is deliberate, not a defect |
| Area | Deliveries / Finance |
| Severity | Business process, not a fault |

A failed, returned, partially delivered or damaged delivery is recorded with `reconciliationStatus: 'pending'`.
The app does not restock, write off, refund or change the source paid totals, and there is no in-app action that
resolves the pending state. The manual treatment is an owner or accountant decision, and how the adjustment should
be evidenced in the books is not encoded in the delivery workflow.

This is documented in the Help centre under "Still unresolved" in the articles `deliveries` and
`delivery-reconciliation`. It is recorded here so that the gap is visible in one place, and it needs an owner
decision before any workflow is built.
