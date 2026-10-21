/**
 * User-facing help content. Every article describes functionality that exists in
 * this application at the time of writing. Internal engineering notes belong in
 * docs/, not here.
 */
import { SHIELD_SUPPORT_EMAIL } from '@/lib/support'

export type HelpCategory =
  | 'Getting started'
  | 'Daily operations'
  | 'Catalogue'
  | 'Customers & parties'
  | 'Money & reports'
  | 'Administration'
  | 'Account & support'

export interface HelpField {
  label: string
  meaning: string
}

export interface HelpArticle {
  id: string
  title: string
  category: HelpCategory
  summary: string
  keywords: string[]
  permission?: string
  what: string
  when: string[]
  steps: string[]
  fields?: HelpField[]
  after?: string
  mistakes?: string[]
  limitations?: string[]
  destructive?: string
}

export const HELP_CATEGORIES: HelpCategory[] = [
  'Getting started',
  'Daily operations',
  'Catalogue',
  'Customers & parties',
  'Money & reports',
  'Administration',
  'Account & support',
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Set up the workspace for the first time',
    category: 'Getting started',
    summary: 'The short path from a new install to taking the first real order.',
    keywords: ['setup', 'first run', 'install', 'business', 'outlets', 'departments', 'super admin'],
    permission: 'Super Admin only for the setup screen',
    what:
      'A new workspace starts empty. Setup creates the single business record and the first two outlets. Departments, products and customers are then added from their own pages.',
    when: [
      'On the first sign-in after the Super Admin profile exists.',
      'After restoring a database that has no business record.',
    ],
    steps: [
      'Sign in with the Super Admin account.',
      'If the setup screen appears, enter the business name, legal name, phone, email and full address. Use a 10-digit Indian mobile number and a 6-digit PIN code.',
      'Name the first two outlets and give each a short code. Codes are used on printed documents and in numbering.',
      'Submit setup. The workspace creates the business record, both outlets and the standard departments.',
      'Open Business Management → Outlets and confirm the addresses and phone numbers.',
      'Open Catalogue → Departments and confirm names, colours and outlet assignment.',
      'Add products with prices, units and stock rules.',
      'Add customers, then take the first order.',
      'Invite staff only when they actually need access.',
    ],
    after:
      'The dashboard becomes the daily starting point. The getting-started checklist on the dashboard marks each step complete only when real records exist.',
    mistakes: [
      'Running setup from a normal staff account — it is restricted to the Super Admin.',
      'Saving an outlet code with spaces or symbols; short alphanumeric codes work best.',
      'Skipping departments. Orders and bookings need a responsible department.',
      'Entering a landline or a number with +91 in the phone field. Use the 10-digit mobile number.',
    ],
    limitations: [
      'Setup creates two outlets. Add any further outlets from the Outlets page.',
      'Production starts without demo data. Nothing is created automatically for you.',
    ],
  },
  {
    id: 'navigation',
    title: 'Find your way around the app',
    category: 'Getting started',
    summary: 'How the sidebar, outlet switcher, account menu and search work.',
    keywords: ['sidebar', 'menu', 'navigation', 'collapsed', 'mobile', 'shortcut', 'search', 'account'],
    what:
      'The left sidebar groups every page you are allowed to use. The top bar holds the outlet switcher, global search, the shortcut palette and your account menu.',
    when: ['Whenever you are unsure where a feature lives.', 'When training a new staff member.'],
    steps: [
      'Use the group headings in the sidebar: Overview, Orders & Bookings, Catalogue, Customers, Reports, Business Management, Administration and Help & Support.',
      'The current page is highlighted with a red left marker and a tinted background.',
      'Select the chevron at the bottom of the sidebar to collapse it to icons. Hover or focus an icon to see its name.',
      'On a phone, open the menu button in the top bar. Navigation appears as a full drawer with labels.',
      'Use the outlet selector in the top bar to change location. Lists and totals refresh for that outlet.',
      'Open the account menu at the top right for profile, password, sign-in email, keyboard shortcuts, settings and sign-out.',
      'Use the help entry in the sidebar at any time; this page is searchable.',
    ],
    limitations: [
      'Only pages covered by your role and permissions appear. A missing page usually means your role does not include it.',
      'Outlet-scoped staff see only assigned outlets.',
    ],
  },
  {
    id: 'switch-outlet',
    title: 'Switch between outlets',
    category: 'Getting started',
    summary: 'The selected outlet controls which orders, bookings, payments and stock you see.',
    keywords: ['outlet', 'switch', 'location', 'branch', 'store'],
    what:
      'Every order, booking and payment belongs to one outlet. Products and customers can be shared across outlets, while staff access is assigned per outlet.',
    when: [
      'Starting work at a different branch.',
      'Checking a report for the other location.',
      'Before entering an order on behalf of another counter.',
    ],
    steps: [
      'Find the outlet selector in the top bar. It shows the current outlet name.',
      'Open it and choose the outlet you are working in.',
      'Wait for the page to refresh. The outlet name appears in page descriptions and printed documents.',
      'Create orders and bookings only after the correct outlet is selected.',
    ],
    after:
      'The choice is remembered on this device. Lists, dashboard totals, payment records and reports follow the selected outlet.',
    mistakes: [
      'Entering an order while the wrong outlet is selected. The order is recorded against the outlet shown in the top bar.',
      'Assuming reports combine both outlets — they are per outlet.',
    ],
    limitations: [
      'Super Admins can choose any outlet. Other staff see only outlets assigned to their profile.',
      'An outlet cannot be deleted; it can be marked inactive.',
    ],
  },
  {
    id: 'departments',
    title: 'Understand departments',
    category: 'Getting started',
    summary: 'Departments split the business into cake, sweets, hot food and gajak work.',
    keywords: ['department', 'cake', 'sweets', 'hot', 'gajak', 'scope', 'kitchen'],
    what:
      'A department is the production and responsibility area for a product and a booking. Department admins are limited to their own department and assigned outlets.',
    when: [
      'Deciding which department owns a new product.',
      'Assigning a department admin.',
      'Understanding why a staff member cannot see certain products.',
    ],
    steps: [
      'Open Catalogue → Departments to see the current list.',
      'Each department has a name, code, colour, description, outlet assignment and active flag.',
      'Products choose one department. Bookings can involve several departments at once.',
      'Staff with a department-admin role are limited to the departments on their profile.',
      'A Super Admin can delete a department only when no products, orders or bookings reference it. Otherwise deactivate it so history stays intact.',
    ],
    mistakes: [
      'Putting a product in the wrong department. Reports and kitchen tickets then split incorrectly.',
      'Deactivating a department that still has active products or open bookings.',
    ],
    limitations: [
      'Super Admins, outlet managers and accountants see all departments within their outlets.',
      'Department admins need at least one department on their profile.',
      'A department that is still referenced by products, orders or bookings cannot be deleted; deactivate it instead.',
    ],
  },
  {
    id: 'orders',
    title: 'Create an order',
    category: 'Daily operations',
    summary: 'Counter and phone orders with items, quantities, discounts and an optional advance.',
    keywords: ['order', 'new order', 'counter', 'phone', 'takeaway', 'delivery', 'dine in', 'discount', 'advance'],
    permission: 'Create & edit orders (ordersManage)',
    what:
      'An order records what a customer bought, which department prepares it, the price after discounts and tax, and any advance paid at the counter.',
    when: [
      'A walk-in customer buys at the counter.',
      'A customer orders by phone for pickup or delivery.',
      'A wholesale buyer needs a printed invoice.',
    ],
    steps: [
      'Confirm the correct outlet in the top bar.',
      'Open Orders & Bookings → Orders and select New order.',
      'Choose the responsible department and the order type (takeaway, delivery or dine-in).',
      'Enter the customer name and, optionally, a mobile number. Select an existing customer to link history.',
      'Add at least one product. Set quantity and unit price. Choose a discount percentage and add item notes where needed.',
      'Apply an order-level discount as a percentage or a fixed amount, if required.',
      'Enter any advance amount and choose the payment mode. Add a reference for UPI, card or bank transfer.',
      'Add kitchen notes and an optional pickup date and time.',
      'Save the order. The order number is generated automatically.',
    ],
    fields: [
      { label: 'Department', meaning: 'The team responsible for preparing the order. Required.' },
      { label: 'Customer name', meaning: 'Name printed on slips. Required; can be a walk-in name.' },
      { label: 'Customer phone', meaning: 'Optional 10-digit mobile number used to contact the customer.' },
      { label: 'Order type', meaning: 'Takeaway, delivery or dine-in. Affects the printed document wording.' },
      { label: 'Unit price', meaning: 'Rate per selling unit. The form rejects rates below a product’s minimum sale price.' },
      { label: 'Discount percent', meaning: 'Per-line discount applied before tax.' },
      { label: 'Order discount', meaning: 'Percentage or fixed amount applied to the whole order.' },
      { label: 'Advance', meaning: 'Money taken now. It is recorded as a payment and reduces the balance.' },
      { label: 'Pickup at', meaning: 'Optional date and time shown to the kitchen and customer.' },
    ],
    after:
      'The order appears in the Orders list with a preparation status and a separate payment status. Stock is reduced for products that track stock.',
    mistakes: [
      'Saving with no lines — at least one product is required.',
      'Using a selling unit that does not match the product pricing mode (for example, a cake priced per pound but sold as a piece).',
      'Forgetting to select the customer when they already have an account; history stays split.',
      'Entering an advance but leaving the payment mode blank.',
    ],
    limitations: [
      'Order numbers and totals are generated by the app. Do not type over printed numbers.',
      'Cancelling is irreversible and requires the Cancel orders permission.',
    ],
  },
  {
    id: 'order-status',
    title: 'Move an order through its statuses, cancel it and print',
    category: 'Daily operations',
    summary: 'Confirmed → Preparing → Ready → Completed, with cancellation before completion.',
    keywords: ['status', 'preparing', 'ready', 'completed', 'cancel', 'print', 'kitchen', 'packing', 'invoice', 'receipt'],
    permission: 'Create & edit orders to advance status; Cancel orders to cancel',
    what:
      'Preparation status and payment status are independent. An order can be paid before it is ready, or ready before it is paid.',
    when: [
      'The kitchen starts or finishes work.',
      'The customer collects the order.',
      'A customer cancels before collection.',
    ],
    steps: [
      'Open the order from the Orders list.',
      'Advance the status one step at a time: Confirmed → Preparing → Ready → Completed. New orders start as Confirmed.',
      'Use the print actions for a kitchen ticket, packing slip, customer invoice or payment receipt.',
      'To cancel, choose Cancel, enter a reason and confirm. Only orders that are not completed or already cancelled can be cancelled.',
      'Record any remaining payment from the order so the balance reaches zero.',
    ],
    after:
      'Completed and cancelled orders stay in history for reports. Cancelling a confirmed, preparing or ready order returns the stock that was deducted for products that track stock.',
    mistakes: [
      'Trying to jump from Confirmed directly to Ready. The app only allows the next valid step.',
      'Printing a kitchen ticket before confirming the items; reprint after changing lines.',
      'Cancelling instead of correcting a line. Cancellation is permanent.',
    ],
    destructive:
      'Cancelling is permanent. The order remains visible for audit but cannot be reopened. Record the reason accurately.',
    limitations: [
      'Completed and cancelled orders are final.',
      'The browser print dialog is used; choose the correct printer and paper size.',
    ],
  },
  {
    id: 'bookings',
    title: 'Create a party booking',
    category: 'Daily operations',
    summary: 'Birthdays, weddings, catering and bulk orders with a date, time and one or more departments.',
    keywords: ['booking', 'party', 'wedding', 'birthday', 'catering', 'event', 'bulk', 'advance', 'edit', 'revision'],
    permission: 'Manage party bookings (bookingsManage); view customers (customersView)',
    what:
      'A booking records products and departments for a future event. It is separate from a counter order and can involve several departments. It does not reserve stock or production capacity; check availability separately.',
    when: [
      'A customer books a cake for a birthday or anniversary.',
      'A family places a wedding or catering order.',
      'A corporate buyer places a bulk order for a fixed date.',
    ],
    steps: [
      'Confirm the outlet and open Orders & Bookings → Party bookings.',
      'Select New booking.',
      'Choose an existing customer or party account. A booking must be linked to a customer.',
      'Choose the event type, event date and event time.',
      'Choose pickup or delivery. For delivery, enter the full delivery address.',
      'Select every department that must prepare part of the order.',
      'Add products, quantities, prices and discounts. Add preparation instructions.',
      'Enter any advance and its payment mode, then save.',
      'Move the booking through Confirmed → In production → Ready → Completed as work progresses. New bookings start as Confirmed.',
      'To correct a party booking, open it and choose Edit booking. The server rechecks products, prices, stock, departments, tax and totals.',
      'Enter an edit reason when the booking is already in production, review the recalculated total and save.',
      'Open the Edit history tab on the booking to see each revision, reason, before/after total and staff name.',
      'Paid amounts cannot be changed from the edit screen; record a new payment or refund instead.',
    ],
    fields: [
      { label: 'Customer', meaning: 'Required party account. Create it first if it does not exist.' },
      { label: 'Event type', meaning: 'Wedding, birthday, anniversary, corporate, catering, festival or other.' },
      { label: 'Event date and time', meaning: 'When the customer needs the order, not when it is booked.' },
      { label: 'Fulfilment', meaning: 'Pickup at the outlet or delivery to an address.' },
      { label: 'Departments', meaning: 'At least one responsible department is required.' },
      { label: 'Advance', meaning: 'Recorded as a payment against the booking.' },
      { label: 'Edit reason', meaning: 'Required when changing a booking that is already in production. Stored with the revision.' },
    ],
    after:
      'The booking appears in the bookings list with its own status and balance. Payments recorded against it appear in Payments and on reports.',
    mistakes: [
      'Booking under a walk-in name instead of creating a party account; the booking cannot be saved without a customer.',
      'Choosing the booking date instead of the event date.',
      'Forgetting a department, so the kitchen does not see the work.',
    ],
    destructive:
      'Cancelling a booking is permanent. Completed bookings cannot be cancelled.',
    limitations: [
      'Bookings are per outlet. Products are limited to what the selected outlet carries.',
      'Bookings check stock when they are saved but do not reserve or consume it. Only a confirmed order deducts stock.',
      'Editing a booking recalculates prices, discounts, tax and balance on the trusted server path, enforces a revision guard and appends an audit revision. It cannot rewrite received payments or posted stock history.',
      'A booking total cannot be reduced below the amount already paid. Refund the difference through Payments first.',
    ],
  },
  {
    id: 'production',
    title: 'Work the production queue',
    category: 'Daily operations',
    summary: 'Turn confirmed order and booking lines into department work, then record partial completion, quality and history.',
    keywords: ['production', 'kitchen', 'queue', 'department', 'task', 'assign', 'completed', 'quality', 'rework', 'reject'],
    permission: 'View production (productionView); Manage production (productionManage)',
    what:
      'Production tasks are created from real order and booking lines. Each task carries a department, required quantity, due time and assignment. Progress, rejected quantity and quality decisions are appended to task history rather than overwriting it.',
    when: [
      'The kitchen or department needs a queue for confirmed orders and party bookings.',
      'Work is completed in several batches and the remaining quantity must stay visible.',
      'A supervisor needs to record who made a quality decision.',
    ],
    steps: [
      'Confirm the outlet in the top bar, then open Operations → Production.',
      'Choose Refresh from orders. New tasks are created only for eligible confirmed or open source lines; existing tasks are updated, not duplicated.',
      'Filter by status or department. Due-today and overdue tasks are highlighted.',
      'Open Update on a task to assign a staff member who belongs to that outlet and department.',
      'Choose Start work, then record partial completion, rejected quantity and rework quantity as batches finish.',
      'Set a quality decision and note when the department has inspected the work.',
      'Use the History section to see each action, quantity, actor and timestamp.',
    ],
    fields: [
      { label: 'Required quantity', meaning: 'Copied from the source order or booking line and preserved for accountability.' },
      { label: 'Completed now', meaning: 'Positive quantity completed in this update. It cannot exceed the remaining quantity.' },
      { label: 'Rejected quantity', meaning: 'Quantity that failed and does not count as completed.' },
      { label: 'Rework quantity', meaning: 'Quantity sent back for correction; it remains visible in history.' },
      { label: 'Quality status', meaning: 'Pending, passed, rejected or rework, recorded with your staff name.' },
    ],
    after:
      'The production page and operational report show the updated remaining quantity and quality decision. A cancelled task stays in history and is never deleted.',
    mistakes: [
      'Recording the whole order as completed when only one batch is ready. Add partial quantities instead.',
      'Using a free-text staff name. Assign an actual active staff profile so scope and attribution remain valid.',
      'Cancelling a task to hide a mistake. Cancel only when the work is genuinely not required, and give a reason.',
    ],
    limitations: [
      'Production is linked to order and booking lines. Recipes, automatic ingredient consumption, machine capacity and staff rostering are not implemented.',
      'Refreshing the queue does not create work for draft or cancelled source lines.',
      'Quality is a recorded decision, not a laboratory or food-safety workflow.',
    ],
  },
  {
    id: 'inventory',
    title: 'Track raw materials, packaging and finished stock',
    category: 'Daily operations',
    summary: 'Use the append-only stock ledger for purchases, issues, consumption, returns, wastage, transfers and physical counts.',
    keywords: ['inventory', 'stock', 'raw material', 'packaging', 'purchase', 'wastage', 'transfer', 'count', 'low stock', 'ledger'],
    permission: 'View inventory (inventoryView); Manage inventory (inventoryManage); Adjust finished products (inventoryAdjust)',
    what:
      'Raw materials and packaging are tracked per outlet and department in their own ledger. Finished products stay in the product catalogue and use the existing trusted stock-adjustment action. Every balance change is a movement with an actor, reason and timestamp.',
    when: [
      'Goods arrive from a supplier or are issued to a production department.',
      'Material is consumed, wasted, returned by a customer or returned to a supplier.',
      'A physical count differs from the ledger and must be reconciled.',
      'A supervisor needs to check low-stock items or export the movement history.',
    ],
    steps: [
      'Open Operations → Inventory.',
      'Create a raw-material or packaging item with its department, base unit, opening quantity and optional critical level.',
      'Open Movement on an item. Choose the movement type, enter the quantity, reason and optional supplier or invoice reference.',
      'Use Transfer to move stock between two items atomically. Both items must use the same base unit.',
      'Use Count to enter a physical count. A variance posts an audited count-adjustment movement with your name.',
      'Review the Movement ledger and Stock counts tabs. Use CSV to export the filtered register.',
      'For a finished product, open Finished products and use Adjust. The product master, price and catalogue record are not duplicated.',
    ],
    fields: [
      { label: 'Base unit', meaning: 'The unit used for every movement of that item, such as kg, litre or piece.' },
      { label: 'Critical level', meaning: 'Optional low-stock threshold shown on the item list.' },
      { label: 'Movement type', meaning: 'Purchase, issue, consumption, wastage, customer return, supplier return, purchase return, opening or count adjustment.' },
      { label: 'Balance after', meaning: 'The server-calculated balance immediately after the movement.' },
    ],
    after:
      'On-hand balances, low-stock warnings and movement history update from the ledger. Negative stock is rejected and retries with the same request are prevented.',
    mistakes: [
      'Editing a spreadsheet instead of recording a movement. The app balance and the ledger would no longer agree.',
      'Using the wrong base unit for a transfer. Transfers require matching units.',
      'Recording a purchase as a physical count when a supplier invoice exists. Counts are for reconciliation, not normal receipts.',
    ],
    limitations: [
      'There is no ingredient recipe or automatic consumption from orders. Consumption and issues must be recorded explicitly.',
      'Stock valuation, batch numbers, expiry dates and purchase-indent approval are not implemented.',
      'Historical movements cannot be edited or deleted. Correct a mistake with an audited adjustment or count and a clear reason.',
    ],
  },
  {
    id: 'deliveries',
    title: 'Assign, dispatch and close a delivery',
    category: 'Daily operations',
    summary: 'Track delivery and return quantities, responsible staff, timestamps and cash collected on the road.',
    keywords: ['delivery', 'dispatch', 'driver', 'delivered', 'returned', 'damaged', 'collection', 'handover', 'reconcile'],
    permission: 'View deliveries (deliveryView); Manage deliveries (deliveryManage)',
    what:
      'A delivery record is created from an eligible delivery order or delivery booking. It keeps the source number, item lines, assignee, dispatch and completion times, delivery outcome, returned or damaged quantity, and any payment collected.',
    when: [
      'A delivery order or party booking is ready to leave the outlet.',
      'A driver must be assigned and dispatch time recorded.',
      'The customer receives only part of the order or returns items.',
      'Cash or another payment is collected at the door.',
    ],
    steps: [
      'Open Orders & Bookings → Deliveries.',
      'Choose Create delivery and select an eligible order or booking. A source with an existing delivery is not listed again.',
      'Open Manage, assign an active staff member, then choose Dispatch when the vehicle leaves.',
      'Enter delivered, returned and damaged quantities for every line and choose the outcome: delivered, partially delivered, failed or returned.',
      'If money is collected, enter the amount, mode and reference and choose Collect payment.',
      'Review the History section for assignment, dispatch, completion and collection entries.',
    ],
    fields: [
      { label: 'Scheduled at', meaning: 'When the delivery is due to leave or arrive, copied from the source.' },
      { label: 'Delivered quantity', meaning: 'Quantity actually handed to the customer; it cannot exceed the expected line quantity.' },
      { label: 'Returned / damaged', meaning: 'Quantity that did not complete successfully and remains visible for reconciliation.' },
      { label: 'Collected', meaning: 'Payment posted against the original order or booking with a normal receipt number.' },
    ],
    after:
      'Closing a delivery records the outcome but does not cancel or refund the sale. Payment collection updates the source balance once, with duplicate protection.',
    mistakes: [
      'Closing every delivery as delivered when some items came back. Enter the returned quantity.',
      'Recording the same cash twice. Check the source payment list before collecting again.',
      'Creating a second delivery for the same source. The create list already hides sources with a delivery record.',
    ],
    limitations: [
      'Route planning, driver mobile apps, signatures, photos and live GPS are not implemented.',
      'A failed or returned delivery does not automatically reverse stock or issue a refund; handle those through their own trusted workflows.',
      'Delivery history is append-only and cannot be deleted from the app.',
    ],
  },
  {
    id: 'payments',
    title: 'Record advances, payments and refunds',
    category: 'Daily operations',
    summary: 'How balances update and where receipts come from.',
    keywords: ['payment', 'advance', 'balance', 'outstanding', 'refund', 'cash', 'upi', 'card', 'receipt'],
    permission: 'Record payments (paymentsManage)',
    what:
      'Payments reduce an order or booking balance. Each payment gets a receipt number and can be printed. Refunds increase the outstanding balance.',
    when: [
      'A customer pays an advance while ordering.',
      'A customer settles the balance on collection or delivery.',
      'Money is returned for a cancelled or reduced order.',
    ],
    steps: [
      'Open the order or booking and choose the payment action.',
      'Enter the amount in rupees, the date and time, and the payment mode.',
      'Add a reference for UPI, card or bank transfer so it can be reconciled.',
      'Save. The paid amount, balance and payment status update immediately.',
      'Open Payments & refunds to see all records and print a receipt.',
       'For a refund, enter a refund record with the reason in the notes.',
    ],
    fields: [
      { label: 'Amount', meaning: 'Amount in rupees. Must be greater than zero.' },
      { label: 'Type', meaning: 'Payment reduces the balance; refund increases it.' },
      { label: 'Mode', meaning: 'Cash, UPI, card, bank transfer or other.' },
      { label: 'Reference', meaning: 'Transaction ID or note for non-cash payments.' },
      { label: 'Received at', meaning: 'Date and time the money changed hands.' },
    ],
    after:
      'Payment status becomes Paid when the balance reaches zero, Partial when some money is received, and Refunded when refunds exceed payments.',
    mistakes: [
      'Recording a payment twice because the list had not refreshed. Check the receipt list first.',
      'Using a refund to correct a wrong payment mode. Add a note instead of deleting history.',
      'Forgetting the reference on UPI payments, which makes reconciliation harder.',
    ],
    destructive:
      'Refunds are permanent financial records. Confirm the amount and reason before saving.',
    limitations: [
      'Payments are always linked to an order or booking. Unlinked payment records can be viewed but are not created here.',
      'There is no online payment gateway integration; the app records money received elsewhere.',
    ],
  },
  {
    id: 'printing',
    title: 'Print kitchen tickets, packing slips, invoices and receipts',
    category: 'Daily operations',
    summary: 'Which document to use, and what each one contains.',
    keywords: ['print', 'kitchen ticket', 'packing slip', 'invoice', 'receipt', 'printer', 'paper', 'a5', '80mm'],
    what:
      'The app prints four order documents plus payment receipts using the browser print dialog.',
    when: [
      'The kitchen needs a preparation ticket.',
      'Packing needs an item checklist.',
      'The customer needs a GST-style invoice.',
      'A payment needs a receipt.',
    ],
    steps: [
      'Open an order or booking.',
      'Choose the document: kitchen ticket, packing slip, invoice or receipt.',
      'A print view opens in a new tab. Use the browser print action.',
      'Select the printer and paper size; the business settings define the recommended sizes.',
      'For a payment receipt, open Payments & refunds and use the receipt action on the row.',
    ],
    after:
      'The app records how many times each document type was printed. Reprinting is safe.',
    mistakes: [
      'Using the browser back button instead of closing the print tab.',
      'Printing an invoice before confirming the order details.',
    ],
    limitations: [
      'Printing depends on the device and printer. There is no direct printer integration.',
      'Receipt and kitchen widths are recommended in Settings → Printing; the browser still controls the final page.',
    ],
  },
  {
    id: 'products',
    title: 'Create and manage products',
    category: 'Catalogue',
    summary: 'The product master that feeds order entry, bookings and printed names.',
    keywords: ['product', 'catalogue', 'menu', 'item', 'search', 'active', 'available', 'department', 'stock', 'adjust'],
    permission: 'Manage catalogue (productsManage); stock setup also needs Adjust stock (inventoryAdjust)',
    what:
      'A product defines the name customers see, the name printed in the kitchen, its department, price, tax and stock behaviour.',
    when: [
      'Adding a new item to the menu.',
      'Changing a price.',
      'Marking an item unavailable for the day.',
      'Retiring an old item.',
    ],
    steps: [
      'Open Catalogue → Products.',
      'Use the search and filters to check whether the product already exists.',
      'Select New product, or open an existing product and choose Edit.',
      'Enter the product name, print name, group, category and department.',
      'Choose the outlets that sell it.',
      'Set the pricing mode, selling unit and sale price.',
      'Add optional MRP, purchase price, minimum sale price, tax and discount values.',
      'If the item is counted, a staff member with Adjust stock enables tracking and records the opening stock once at creation. Set the critical level.',
      'Add a description and image if useful.',
      'Keep Active on to make it usable. Keep Available on unless it is temporarily sold out.',
      'Save.',
    ],
    after:
      'The product appears in order and booking item pickers for its outlets and department.',
    mistakes: [
      'Turning Active off to hide an item for a day. Use Available instead; Active retires the item from pickers.',
      'Forgetting to tick the outlet, so the product never appears at the counter.',
      'Changing the price without checking open orders; existing lines keep the price captured when they were added.',
    ],
    limitations: [
      'Unit names must match the pricing mode: per-kg units contain “kg”, per-pound cake units contain “lb”.',
      'Deleting is not offered; deactivate instead so history stays intact.',
      'Stock tracking and the conversion factor are locked after creation. Existing stock is changed only through the separate Adjust stock action, which records the reason.',
    ],
  },
  {
    id: 'product-pricing',
    title: 'Product units, prices, categories and stock',
    category: 'Catalogue',
    summary: 'What each pricing and stock field actually controls.',
    keywords: ['price', 'unit', 'kg', 'box', 'cake', 'tax', 'hsn', 'stock', 'critical', 'mrp', 'discount', 'adjust'],
    permission: 'Manage catalogue (productsManage); stock setup and adjustments need Adjust stock (inventoryAdjust)',
    what:
      'Pricing mode decides how quantity is interpreted. Stock tracking decides whether orders check and reduce inventory.',
    when: [
      'A cake is sold by weight or by pound.',
      'Sweets are sold by kilogram and packed by box.',
      'An item must be counted and low-stock warnings are needed.',
    ],
    steps: [
      'Choose Fixed price per unit for pieces, Price per kilogram for loose weight, Price per box for packed boxes, or Cake price per pound for cakes.',
      'Set the selling unit to match: piece, kg, box or lb.',
      'For weight or box sales, set an alternate unit and conversion factor if stock is consumed differently from the selling unit.',
      'For box pricing, enter pieces per box.',
      'For cake pricing, add a size row for each pound option with its price.',
      'Set sale price, tax percent and optional HSN/SAC.',
      'For a new counted item, enable Track stock, set opening stock and a critical level, then save.',
      'For an existing product, open its detail page and use Adjust stock when the physical count changes.',
      'Check the product appears with the expected price in order entry.',
    ],
    fields: [
      { label: 'Pricing mode', meaning: 'Fixed, per kg, per box or cake per pound.' },
      { label: 'Selling unit', meaning: 'The unit typed at the counter. Must match the mode.' },
      { label: 'Conversion factor', meaning: 'Stock units consumed per selling unit.' },
      { label: 'Minimum sale price', meaning: 'Order entry refuses a lower rate.' },
      { label: 'Tax percent', meaning: 'Applied per line unless prices already include tax.' },
      { label: 'Critical level', meaning: 'Low-stock warnings appear at or below this number.' },
    ],
    after:
      'Order lines use the product mode to calculate totals. Stock quantities change for tracked products.',
    mistakes: [
      'Using a “piece” unit with per-kg pricing, which produces confusing printed quantities.',
      'Setting a conversion factor of zero; it is treated as one.',
      'Tracking stock but never entering opening stock, so the first sale shows negative stock.',
    ],
    limitations: [
      'Tax is calculated per line using the line tax percent. Business-level tax defaults are only defaults.',
      'Stock changes come from confirmed orders (deduction), order cancellation (restoration) and the reason-recorded Adjust stock action. Bookings only check availability. Tracking and conversion are locked after creation, and there is no adjustment-history or stock-take screen yet.',
    ],
  },
  {
    id: 'product-images',
    title: 'Add product images',
    category: 'Catalogue',
    summary: 'Upload a file or paste a hosted image URL.',
    keywords: ['image', 'photo', 'upload', 'storage', 'url', 'picture'],
    permission: 'Manage catalogue (productsManage)',
    what:
      'A product image helps counter staff confirm the right item. Images are optional.',
    when: ['Adding a new cake or premium item.', 'Replacing an outdated photo.'],
    steps: [
      'Open the product form.',
      'In the Product image section, either upload a JPG, PNG or WebP file or paste a hosted image URL.',
      'Wait for the preview to appear.',
      'Save the product.',
    ],
    after: 'The image appears in the product list and product header where space allows.',
    mistakes: [
      'Uploading a very large file; resize it first for faster uploads.',
      'Pasting a page URL instead of a direct image URL.',
    ],
    limitations: [
      'Uploads require Firebase Storage to be configured for the project. If upload fails, use a hosted image URL instead.',
      'Images are not used on printed receipts.',
    ],
  },
  {
    id: 'customers',
    title: 'Create and manage customers and party accounts',
    category: 'Customers & parties',
    summary: 'Customer records hold contact details, addresses, credit terms and history.',
    keywords: ['customer', 'party', 'account', 'phone', 'address', 'gstin', 'credit', 'wholesale'],
    permission: 'Manage customers & parties (customersManage)',
    what:
      'A customer account links orders, bookings and payments to one person or business. Party accounts are the same record used for event bookings.',
    when: [
      'A repeat customer wants their history tracked.',
      'A business needs GST details on invoices.',
      'A party booking must be created.',
    ],
    steps: [
      'Open Customers → Customers & parties.',
      'Search by name, phone or alias before creating a duplicate.',
      'Select New customer.',
      'Choose individual or business and an account group.',
      'Enter the name, phone and optional alternate phone and email.',
      'Add a billing or shipping address if delivery or GST invoicing is needed.',
      'Enter GSTIN, PAN, state and PIN for business accounts.',
      'Set an opening balance only when migrating an existing ledger; otherwise leave it at zero.',
      'Set a credit limit if the customer is allowed to pay later.',
      'Tick the outlets that may serve this customer and keep Active on.',
      'Save.',
    ],
    after: 'The customer becomes selectable on orders and bookings and their history is visible from the customer page.',
    mistakes: [
      'Creating a second record for the same phone number. Search first.',
      'Using the opening balance as a discount; it is a ledger starting point.',
      'Forgetting to assign the outlet, so staff cannot select the customer.',
    ],
    limitations: [
      'Deleting a customer with history is not supported; deactivate the account instead.',
      'Credit limits are recorded but do not hard-block an order in the current build.',
    ],
  },
  {
    id: 'reports',
    title: 'Read reports and sales summaries',
    category: 'Money & reports',
    summary: 'Date-bounded sales, production, inventory, delivery, finance and party summaries with CSV export.',
    keywords: ['report', 'sales', 'summary', 'date range', 'export', 'csv', 'department', 'production', 'inventory', 'delivery', 'finance', 'party'],
    permission: 'View reports (reportsView), plus the matching view permission for each workflow',
    what:
      'Reports summarise orders, bookings and payments for the selected outlet and date range. The operational report tabs add production, inventory, delivery, finance and party activity when your role has the matching view permission. Values are in rupees on screen and CSV.',
    when: [
      'Closing the day or week.',
      'Checking department performance.',
      'Sharing sales figures with the owner or accountant.',
    ],
    steps: [
      'Confirm the correct outlet in the top bar.',
      'Open Reports.',
      'Choose the date range.',
      'Review the sales totals, department split and payment mix. Sales value includes active party bookings as well as orders.',
      'Open the operational report tabs you can access and review their filtered tables.',
      'Use the CSV action on each report or table to download the same filtered rows.',
      'If a report-limit warning appears, narrow the date range before relying on the totals or export.',
    ],
    after: 'CSV files download to the device and can be opened in a spreadsheet or imported into accounting software.',
    mistakes: [
      'Comparing a report from one outlet with another outlet’s counter.',
      'Using a range that starts after the orders were recorded.',
    ],
    limitations: [
      'Reports cover the selected outlet only.',
      'Cancelled orders and bookings are excluded from active sales totals but remain in history.',
      'Party activity in a report covers the selected period plus the party opening balance; open Finance for the current all-time outstanding list and reminders.',
      'Large ranges are capped in the browser. A warning appears when the loaded data reached a report limit.',
      'There is no scheduled email report.',
    ],
  },
  {
    id: 'finance',
    title: 'Check party balances, expenses and cash sessions',
    category: 'Money & reports',
    summary: 'Follow outstanding balances from real orders, bookings and receipts, record expenses and reconcile a cash drawer.',
    keywords: ['finance', 'party', 'outstanding', 'statement', 'receipt', 'advance', 'expense', 'cash', 'session', 'variance', 'reminder'],
    permission: 'View finance (financeView); Manage finance (financeManage)',
    what:
      'The Finance page derives each party statement from the original orders, bookings, receipts, refunds and opening balance. It also records outlet expenses and person-by-person cash sessions. It does not create a second ledger that could double-count history.',
    when: [
      'A party asks how much is still owed.',
      'The owner needs an outstanding list or a reminder message.',
      'An expense must be recorded or a mistaken expense voided.',
      'A cashier needs to open a drawer, then count and hand over cash at the end of a shift.',
    ],
    steps: [
      'Open Operations → Finance.',
      'Review the Outstanding tab. Open Statement on a party to see opening balance, bills, receipts, refunds, running balance and a downloadable CSV.',
      'Use Reminder to copy a short payment reminder to the clipboard; review it before sending.',
      'Open Expenses, choose Record expense, enter the head, amount, date, mode and reference. To correct a posted expense, use Void with a reason instead of deleting it.',
      'Open Cash sessions and choose Open cash session with the opening float.',
      'At the end of the shift choose Close, enter the counted cash and the person receiving it. Expected cash and variance are preserved.',
    ],
    fields: [
      { label: 'Outstanding', meaning: 'Opening balance plus active orders and bookings, less receipts, plus refunds.' },
      { label: 'Statement debit / credit', meaning: 'Debits are amounts billed or refunded; credits are money received.' },
      { label: 'Expense head', meaning: 'Utilities, rent, salaries, transport, packaging, maintenance, marketing or other.' },
      { label: 'Opening float', meaning: 'Cash already in the drawer when the session opens.' },
      { label: 'Variance', meaning: 'Counted cash minus expected cash. A negative value means the drawer is short.' },
    ],
    after:
      'Party statements, expense lists, cash session history and the finance report update from the saved records. Financial history is not hard-deleted.',
    mistakes: [
      'Trying to clear a balance by editing a historic order. Record the actual receipt or refund instead.',
      'Closing a cash session without counting the drawer. Variance depends on a real count.',
      'Expecting the reminder to send automatically. It is copied to the clipboard for you to send.',
    ],
    limitations: [
      'Outstanding reminders are copy-only; there is no SMS or WhatsApp integration.',
      'There is no GST return, tax filing or live accounting integration. Expense heads are operational records, not a statutory chart of accounts.',
      'Expected cash counts cash receipts recorded by the person who opened the session after it opened. Non-cash payments are excluded.',
    ],
  },
  {
    id: 'accounting-export',
    title: 'Export accounting data for BUSY',
    category: 'Money & reports',
    summary: 'Download orders, payments and balances as CSV for manual import into BUSY.',
    keywords: ['busy', 'accounting', 'export', 'csv', 'tally', 'integration', 'sales register'],
    permission: 'Accounting exports (busyView)',
    what:
      'The accounting export produces CSV files from real orders and payments. It does not connect live to BUSY.',
    when: [
      'Month-end accounting.',
      'Handing sales and payment data to the accountant.',
      'Reconciling cash and digital collections.',
    ],
    steps: [
      'Open Reports → Accounting export in the sidebar.',
      'Choose the outlet and date range.',
      'Download the orders export and the payments export.',
      'Import the files into your accounting process or share them with the accountant.',
      'Keep the exported files with the matching date range for audit.',
    ],
    after: 'Files download locally. Nothing is written back to BUSY automatically.',
    mistakes: [
      'Expecting a live BUSY sync. The current integration is export-only and marked not connected in Settings.',
      'Exporting overlapping ranges twice and double-counting in accounting.',
    ],
    limitations: [
      'BUSY is not connected. Settings shows the integration status as not connected.',
      'Column layout is designed for manual mapping, not a guaranteed BUSY import template.',
    ],
  },
  {
    id: 'outlet-admin',
    title: 'Add and edit outlets',
    category: 'Administration',
    summary: 'Outlet name, code, address, phone, GSTIN and active status.',
    keywords: ['outlet', 'branch', 'address', 'gstin', 'code', 'active', 'admin'],
    permission: 'Manage outlets (outletsManage)',
    what: 'Outlets are the physical selling locations. Every order, booking and payment belongs to one.',
    when: ['Opening a new branch.', 'Correcting an address or GSTIN.', 'Closing a branch temporarily.'],
    steps: [
      'Open Business Management → Outlets.',
      'Select New outlet or Edit on an existing row.',
      'Enter the name and a short unique code.',
      'Enter the address, 10-digit phone, email and optional GSTIN.',
      'Keep Active on while the outlet is trading.',
      'Save. The outlet appears in the top-bar switcher for permitted staff.',
    ],
    after: 'Super Admins see the outlet immediately. Other staff need it added to their profile outlet list.',
    mistakes: [
      'Reusing a code that already exists.',
      'Deactivating an outlet with open orders. Finish or cancel them first.',
    ],
    limitations: [
      'Outlets are deactivated, not deleted, so historical orders stay valid.',
      'Staff outlet access is managed from Staff & permissions, not from the outlet form.',
    ],
  },
  {
    id: 'department-admin',
    title: 'Add and edit departments',
    category: 'Administration',
    summary: 'Department code, name, colour and outlet assignment.',
    keywords: ['department', 'admin', 'colour', 'code', 'outlet', 'active'],
    permission: 'Manage departments (departmentsManage)',
    what: 'Departments define production responsibility and drive permission scoping for department admins.',
    when: ['Adding a new production line.', 'Changing which outlet a department serves.', 'Retiring a department.'],
    steps: [
      'Open Catalogue → Departments.',
      'Select New department or Edit.',
      'Enter a short code, a clear name and an optional description.',
      'Choose the outlets where the department operates.',
      'Pick a colour used in lists and badges.',
      'Keep Active on while it is in use.',
      'Save.',
    ],
    after: 'The department appears in product, order and booking pickers for its outlets.',
    mistakes: [
      'Assigning a department to no outlet, which hides it from those outlets.',
      'Deactivating a department that still has active products.',
    ],
    limitations: [
      'Department admins are scoped to the departments listed on their staff profile.',
      'Departments that are still referenced by products, orders or bookings cannot be deleted; deactivate them instead.',
    ],
  },
  {
    id: 'staff',
    title: 'Invite staff, assign roles and control permissions',
    category: 'Administration',
    summary: 'Invitations, role templates, per-person overrides and suspension.',
    keywords: ['staff', 'user', 'invite', 'role', 'permission', 'suspend', 'deactivate', 'link'],
    permission: 'Manage staff & permissions (usersManage)',
    what:
      'A staff profile links a Firebase sign-in account to a role, outlets, departments and permissions. Roles are templates; permissions can be overridden per person.',
    when: [
      'A new employee needs access.',
      'Someone changes department or outlet.',
      'An employee leaves and access must be removed.',
    ],
    steps: [
      'Open Administration → Staff & permissions.',
      'Select Invite staff.',
      'Enter the staff name, email and choose a role.',
      'Choose at least one outlet and, for department admins, at least one department.',
      'Review the permission list. It starts from the role template and can be adjusted.',
      'Set how many days the invitation stays valid, then create it.',
      'Copy the invite link and send it to the staff member. They open it, set a password and join.',
      'Use Edit on a staff row to change role, scope, permissions or active status.',
      'To block someone temporarily, turn off “Account active” (suspended). Sign-in is blocked on the next check and the change is reversible.',
      'To revoke access, a Super Admin uses Edit → Revoke access & remove profile. Workspace access stops immediately and the staff profile is disabled. The person’s name, email and UID are shown to send to SHIELD Intelligence for permanent sign-in removal.',
    ],
    after:
      'The invited person signs in through the link and lands in the workspace with the assigned access. The UID is created by Firebase and linked to the profile.',
    mistakes: [
      'Sending the invite link to the wrong email; the invite is bound to the address entered.',
      'Granting a permission the person does not need. Review the list instead of accepting defaults.',
      'Suspending the last Super Admin; the app prevents a Super Admin from removing their own Super Admin access.',
      'Trying to remove the last active Super Admin; the app refuses so the workspace cannot lock itself out.',
    ],
    destructive:
      'Suspending blocks access but keeps the account and can be reversed. Removing a staff account revokes workspace access immediately and disables the profile; it cannot be undone from the app. It does not delete the Firebase sign-in record — request that from SHIELD Intelligence. The staff profile is kept as a deleted record, and orders, bookings, payments and their attribution are unchanged. Revoking an invitation only prevents it from being used. None of these delete sales history.',
    limitations: [
      'The first Super Admin must be created in Firestore manually; invitations cannot create the first account.',
      'Staff cannot change their own role, permissions or active status.',
      `Removing a staff profile does not remove the Firebase Authentication account. A Super Admin must email SHIELD Intelligence (${SHIELD_SUPPORT_EMAIL}) to request permanent sign-in removal in the Firebase Console.`,
      'Only an active Super Admin can remove another staff account, and the app refuses to remove the last active Super Admin.',
      'Firebase Authentication is the source of truth for sign-in identity; Firestore stores the workspace profile.',
    ],
  },
  {
    id: 'settings',
    title: 'Change business settings, tax defaults and printing',
    category: 'Administration',
    summary: 'Business identity, invoice numbering, tax defaults, UPI details and printer widths.',
    keywords: ['settings', 'business', 'gstin', 'invoice', 'prefix', 'tax', 'printing', 'upi', 'footer', 'busy'],
    permission: 'Manage business settings (settingsManage)',
    what:
      'Business settings are the single record used on printed documents and as defaults for new orders and products.',
    when: [
      'Changing the business phone or address.',
      'Updating GSTIN or invoice prefix.',
      'Changing the UPI ID printed for payment.',
      'Adjusting receipt or kitchen paper width.',
    ],
    steps: [
      'Open Business Management → Settings.',
      'Update the business name, legal name, tagline, phone, email and address.',
      'Enter GSTIN and the invoice prefix used on documents.',
      'Set whether prices include tax and the default tax percent.',
      'Enter the UPI ID and receipt footer shown to customers.',
      'Choose receipt, kitchen ticket and packing slip paper sizes.',
      'Save. New documents use the updated values.',
    ],
    after: 'Printed documents and new order defaults use the new values. Historical records keep the values captured when they were created.',
    mistakes: [
      'Changing the invoice prefix mid-year, which makes numbering look inconsistent.',
      'Turning on “prices include tax” without checking existing product prices.',
      'Leaving the legal name blank, which weakens invoices.',
    ],
    limitations: [
      'There is one business record for the workspace.',
      'The BUSY integration status is informational in this build; export is manual.',
    ],
  },
  {
    id: 'security',
    title: 'Account security and sign-in problems',
    category: 'Account & support',
    summary: 'Change your password or sign-in email, and recover access safely.',
    keywords: ['password', 'email', 'security', 'sign in', 'login', 'reset', 'verification', 'reauth'],
    what:
      'Sign-in identity is managed by Firebase Authentication. Your workspace profile stores the name, contact number, role and access scope.',
    when: [
      'You need a new password.',
      'The owner’s sign-in email changes.',
      'A password reset email does not arrive.',
      'A staff member cannot sign in.',
    ],
    steps: [
      'Open the account menu at the top right and choose Account settings.',
      'To change the password, open Password & security. Enter the current password, then the new password twice.',
      'If you do not know the current password, use Send reset link and follow the email from Firebase.',
      'To delete your own account, open Password & security → Delete account. Type DELETE, enter your current password and confirm. Records you created stay for audit.',
      'To change the sign-in email, open the Sign-in email section (Super Admin). Enter the new address and current password.',
      'Open the verification link sent to the new address. The sign-in email does not change until it is verified.',
      'Return to Account settings and select Check verification status to update the workspace email record.',
      'If sign-in fails, confirm the exact email, check spam for the reset mail, and ask a Super Admin to confirm the profile is active.',
    ],
    after:
      'The UID stays the same after an email change, so history and permissions remain linked. A password change takes effect on the next sign-in. Deleting an account signs it out immediately.',
    mistakes: [
      'Changing only the Firestore email. Sign-in uses Firebase Authentication, so the two must be synchronised through the supported flow.',
      'Sharing the reset link or password with another person.',
      'Assuming a verification email changes the address immediately; it changes only after the link is opened.',
    ],
    limitations: [
      'A fully automatic Firestore email sync requires a trusted backend. This build updates the workspace email when the Super Admin checks verification status in Account settings.',
      'Provider-based sign-in accounts (for example Google) must manage credentials with that provider.',
      'Super Admin accounts cannot be deleted from the app, to prevent locking the workspace out. Remove one in the Firebase Console after a replacement exists.',
      'Passwords are never stored in the business database.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshoot errors, loading failures and missing indexes',
    category: 'Account & support',
    summary: 'What each common error means and what to do next.',
    keywords: ['error', 'loading', 'index', 'firestore', 'permission', 'offline', 'failed precondition', 'not linked'],
    what:
      'Most failures fall into four groups: permissions, network, missing configuration (including indexes), or missing records.',
    when: ['A page shows an error card.', 'Data does not load.', 'A save is rejected.'],
    steps: [
      'Read the message on screen. It names the category without exposing internal details.',
      'For “You do not have permission”, ask a Super Admin to check your role and outlet/department scope.',
      'For “service is unreachable”, check the connection and retry. The app also shows cached data when available.',
      'For “This information is not ready yet” with an index message, the database needs its one-time index deployment. Ask the administrator to deploy the Firestore indexes; retry after it finishes building.',
      'For “Account not linked to the workspace”, the signed-in Firebase account has no staff profile. A Super Admin must create or restore it.',
      'For “record no longer exists”, the item was removed or the link is old. Return to the list and reopen it.',
      'Use the retry action on the error card after fixing the cause.',
    ],
    after: 'Successful reloads show live data again. Do not enter duplicate records while a page is failing.',
    mistakes: [
      'Refreshing repeatedly while an index is still building.',
      'Assuming missing data means an index; check permission and filters first.',
      'Creating a second account instead of fixing the linked profile.',
    ],
    limitations: [
      'Index deployment and Firebase configuration are administrator actions outside the business interface.',
      'The app cannot repair security rules or create staff profiles from the browser.',
    ],
  },
  {
    id: 'data-safety',
    title: 'Destructive actions and data safety',
    category: 'Account & support',
    summary: 'What cannot be undone, and how to correct mistakes safely.',
    keywords: ['delete', 'cancel', 'refund', 'danger', 'undo', 'audit', 'safe'],
    what:
      'Financial and production history is retained. The app prefers status changes and deactivation over deletion.',
    when: ['Before cancelling an order or booking.', 'Before refunding money.', 'Before suspending a staff account.'],
    steps: [
      'Check the lines before saving. New orders and bookings start as Confirmed and cannot be edited afterwards.',
      'For a wrong price before completion, cancel and re-enter the order; after completion, record a refund.',
      'For a wrong payment, record an adjustment or refund with a clear note; do not delete history.',
      'For an item that is no longer sold, set it inactive instead of deleting it.',
      'For a staff member who left, suspend the profile. Their history remains attributed correctly.',
      'Use the confirmation dialog and read the consequence before confirming.',
    ],
    destructive:
      'Cancelling orders/bookings is permanent. Refunds are permanent financial records. Suspending staff blocks access immediately.',
    limitations: [
      'There is no recycle bin or undo for cancelled orders, refunds or suspended accounts.',
      'Only a Super Admin can restore access or correct a profile.',
    ],
  },
  {
    id: 'search-shortcuts',
    title: 'Search, filters and keyboard shortcuts',
    category: 'Account & support',
    summary: 'Faster ways to find records and move around.',
    keywords: ['search', 'filter', 'sort', 'keyboard', 'shortcut', 'palette'],
    what:
      'List pages have search, filters and sortable columns. The shortcut palette jumps to pages and actions.',
    when: ['Finding an order by number or customer.', 'Switching pages without the mouse.'],
    steps: [
      'Use the search box on a list page. It matches the fields shown in that list.',
      'Use the filter controls to narrow by status, payment, department or date.',
      'Select a column heading to sort where sorting is supported.',
      'Open the keyboard shortcut palette from the top bar or the account menu.',
      'Use the displayed key combinations to jump to common pages.',
      'Press Escape to close dialogs and drawers.',
    ],
    limitations: [
      'Search is client-side over the records loaded for the selected outlet and filters.',
      'There is no full-text search across historical documents.',
    ],
  },
]

export function helpArticleById(id: string | null): HelpArticle | undefined {
  if (!id) return undefined
  return HELP_ARTICLES.find((article) => article.id === id)
}

export function searchHelp(query: string): HelpArticle[] {
  const term = query.trim().toLowerCase()
  if (!term) return HELP_ARTICLES
  const words = term.split(/\s+/)
  return HELP_ARTICLES.filter((article) => {
    const haystack = [
      article.title,
      article.summary,
      article.what,
      article.category,
      ...article.keywords,
      ...article.steps,
      ...(article.fields ?? []).flatMap((field) => [field.label, field.meaning]),
      ...(article.mistakes ?? []),
      ...(article.limitations ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
