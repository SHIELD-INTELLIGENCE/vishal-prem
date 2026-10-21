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
  /** Things that must already exist or be true before the workflow can start. */
  prerequisites?: string[]
  steps: string[]
  fields?: HelpField[]
  after?: string
  mistakes?: string[]
  limitations?: string[]
  /** Workflows that are deliberately not decided or not automated in this build. */
  pending?: string[]
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

export interface TrainingPath {
  title: string
  audience: string
  description: string
  articleIds: string[]
}

/** Ordered onboarding paths shown on the Help centre home. */
export const TRAINING_PATHS: TrainingPath[] = [
  {
    title: 'Counter and front desk',
    audience: 'New counter staff',
    description: 'Take orders, move them through preparation, record money and print the right document.',
    articleIds: ['navigation', 'switch-outlet', 'orders', 'order-status', 'payments', 'printing'],
  },
  {
    title: 'Kitchen and production',
    audience: 'Department operators and supervisors',
    description: 'Read the department queue, record batches, quality decisions and material movements.',
    articleIds: ['departments', 'production', 'inventory', 'order-status'],
  },
  {
    title: 'Delivery desk',
    audience: 'Dispatch staff and delivery supervisors',
    description: 'Create a delivery, assign a driver, dispatch, record the outcome and collect at the door.',
    articleIds: ['deliveries', 'delivery-reconciliation', 'payments', 'cash-sessions'],
  },
  {
    title: 'Finance and owner',
    audience: 'Accountants, managers and owners',
    description: 'Read outstanding balances, statements, cash sessions, reports and accounting exports.',
    articleIds: ['finance', 'cash-sessions', 'reports', 'accounting-export', 'data-limits'],
  },
  {
    title: 'Workspace administrator',
    audience: 'Super Admins',
    description: 'Set up the workspace, outlets, departments, staff access and business defaults.',
    articleIds: ['getting-started', 'outlet-admin', 'department-admin', 'staff', 'settings'],
  },
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Set up the workspace for the first time',
    category: 'Getting started',
    summary: 'Create the business, two outlets and the four standard departments, then add the first products and people.',
    keywords: ['setup', 'first run', 'business', 'outlet', 'department', 'bootstrap', 'super admin', 'install'],
    permission: 'Super Admin only for the setup screen',
    what:
      'First-run setup creates the workspace record, two outlets and the four standard departments. It is a one-time action. The first Super Admin account is created outside this setup screen.',
    when: [
      'The workspace is empty and no business record exists.',
      'The app sends a signed-in Super Admin to the setup screen.',
      'You are commissioning a new outlet or a new installation.',
    ],
    prerequisites: [
      'A Firebase project is already connected to the app.',
      'A Super Admin account already exists. Ask the technical owner to run the bootstrap process if it does not.',
      'You are signed in as that Super Admin. Ordinary staff cannot run setup.',
    ],
    steps: [
      'Open /admin/login and sign in with the Super Admin email and password.',
      'If the workspace is empty, the app opens the setup screen automatically. Otherwise open /admin/setup directly.',
      'Enter Business name and Legal / invoice name. These appear on documents.',
      'Enter phone, email, address, city, state and PIN code.',
      'Review Outlet 1 and Outlet 2. Give each a name and a short code, for example VP1 and VP2.',
      'Select Create workspace and wait for the success message.',
      'Open Settings and confirm the tax default, invoice prefix and receipt paper.',
      'Open Outlets and Departments to confirm the records that setup created.',
      'Add products and customer accounts, then invite staff.',
    ],
    fields: [
      { label: 'Business name', meaning: 'The trading name shown inside the workspace and on reports.' },
      { label: 'Legal / invoice name', meaning: 'The legal name printed on invoices and receipts.' },
      { label: 'Outlet code', meaning: 'Short prefix used in order, booking, expense and delivery numbers.' },
      { label: 'PIN code', meaning: 'Six-digit Indian PIN code. It is used on the business address.' },
    ],
    after:
      'Setup creates the business record, two outlets and the departments Cake, Sweets, Hot Section and Gajak. All four departments are available at both outlets. The defaults are: prices exclude GST, 5% tax, invoice prefix VP, receipt 80 mm, kitchen ticket 80 mm, packing slip A5, and BUSY status not connected.',
    mistakes: [
      'Expecting a demo catalogue. Setup does not create products, customers or staff.',
      'Entering a phone number with +91. The app normalises it, but enter the 10-digit number to avoid confusion.',
      'Assuming outlet codes are unique. The app does not enforce uniqueness.',
      'Trying to run setup a second time. Once the business record exists, setup redirects to the dashboard.',
    ],
    limitations: [
      'Setup has no rollback or reset button. The business record cannot be deleted from the interface.',
      'Setup creates the four standard departments automatically. Do not create them again unless you intentionally want duplicates.',
      'The first Super Admin cannot be created from the public interface. It requires the documented bootstrap process.',
      'This Help cannot repair Firebase configuration or security rules. Those are technical-owner actions.',
    ],
  },
  {
    id: 'training',
    title: 'Train a new staff member',
    category: 'Getting started',
    summary: 'A role-based training path, what to practise first, and what a trainee must never do unsupervised.',
    keywords: ['training', 'onboarding', 'new staff', 'practice', 'checklist', 'learning', 'trainee'],
    what:
      'The Help centre includes five training paths. There is no separate training mode or sandbox inside the live workspace, so training must use real work under supervision.',
    when: [
      'A new employee starts on the counter, kitchen, delivery desk, finance or administration.',
      'An existing employee changes role or outlet.',
      'You need a repeatable induction instead of informal handover.',
    ],
    prerequisites: [
      'The trainee has an active staff profile and the correct outlet and department scope.',
      'A supervisor with the same or broader permissions is available.',
      'The trainee understands that live records affect real stock, money and reports.',
    ],
    steps: [
      'Open Help centre and choose the training path that matches the job.',
      'Work through the guides in the order shown. Do not skip Navigation, Switch outlets and the daily checklist.',
      'Watch the supervisor complete one real transaction from start to finish.',
      'Repeat the transaction under supervision, then reverse or correct it using the documented method if it is wrong.',
      'For counter staff, practise an order, an advance, a later payment, a print and a cancellation on a supervised real order.',
      'For kitchen staff, practise a production sync, a partial batch, a quality decision and an inventory movement.',
      'For delivery staff, practise creating a delivery, assigning, dispatching, recording an outcome and collecting payment.',
      'For finance staff, practise a statement, an expense, a cash session and a report export without changing historical records.',
      'For administrators, practise an invitation, a role change, an outlet edit and a department deactivation on a non-critical record.',
      'Finish with the Data safety guide. The trainee should be able to name every action that cannot be undone.',
    ],
    after:
      'The trainee should be able to complete the normal workflow without help, explain what each status means, and know when to stop and ask.',
    mistakes: [
      'Creating fake orders, payments or customers in the live workspace. They affect stock, cash and reports.',
      'Training with a real customer phone number or address in a test record.',
      'Letting a trainee cancel, refund, delete or remove access before they can explain the consequence.',
      'Giving a trainee Super Admin access because it is easier than configuring the right scope.',
    ],
    limitations: [
      'There is no in-app quiz, simulation or practice workspace.',
      'Training paths are static guides. They do not track completion.',
      'A staff member with a view-only role can read the guides but cannot practise the write steps.',
    ],
  },
  {
    id: 'daily-checklist',
    title: 'Open, run and close the day',
    category: 'Getting started',
    summary: 'The short operational checklist for the counter, kitchen, delivery desk and cash handover.',
    keywords: ['daily', 'opening', 'closing', 'checklist', 'handover', 'cash', 'day end', 'shift'],
    what:
      'This is the practical day routine. It does not replace the detailed guides, but it prevents the most common omissions.',
    when: ['At the start of a shift.', 'At handover between staff.', 'Before closing the outlet.'],
    prerequisites: [
      'You are signed in with an active profile.',
      'The correct outlet is selected in the top bar.',
      'You know which departments and permissions your role covers.',
    ],
    steps: [
      'Opening: select the outlet in the top bar. The selector is only visible on tablet and desktop widths.',
      'Open Dashboard and read the four stat cards. They use the latest loaded records for the outlet, not a date-bounded report.',
      'Open Production, choose the department and select Refresh from orders if the queue looks stale.',
      'Open Deliveries and review Pending, Assigned and Dispatched work. Check the scheduled time and address.',
      'Open Finance, Cash sessions. Open a session before taking cash, or confirm that your session is already open.',
      'During the day: enter orders with the correct department and customer. Record advances immediately.',
      'Advance production one step at a time. Do not mark Ready until the work is actually ready.',
      'Create a delivery only from an eligible delivery order or booking. Assign and dispatch before the vehicle leaves.',
      'Record the delivery outcome with delivered, returned and damaged quantities. Do not leave a dispatched delivery open overnight without a note.',
      'Closing: close every delivery that has returned, then record any collection against the correct source.',
      'Close your cash session with a counted handover. Check the variance instead of ignoring it.',
      'Open Reports for the day or month. Investigate cancelled orders, refunds and pending reconciliations before handover.',
    ],
    after:
      'The outlet has no unexplained open delivery, no unclosed cash session for your login, and every cash or digital receipt is recorded against its source.',
    mistakes: [
      'Working in the wrong outlet. Every list, total and document follows the selected outlet.',
      'Closing cash before all cash receipts for the session are recorded.',
      'Leaving a delivery at Dispatched because the outcome is awkward. Record the outcome and note, even if reconciliation is pending.',
      'Using yesterday\'s report as today\'s cash proof.',
    ],
    limitations: [
      'There is no automatic day-close or shift-close process.',
      'Dashboard cards are not a complete accounting close.',
      'A cash session covers only cash recorded by its opener, not every cash payment at the outlet.',
      'Failed, returned and partially delivered work can remain pending reconciliation. There is no in-app resolution button.',
    ],
  },
  {
    id: 'navigation',
    title: 'Find your way around the app',
    category: 'Getting started',
    summary: 'Sidebar groups, the top bar, the command palette and contextual Help links.',
    keywords: ['navigation', 'sidebar', 'menu', 'top bar', 'help', 'palette', 'jump', 'mobile'],
    permission: 'Each page has its own permission. Hidden pages are not necessarily broken.',
    what:
      'The sidebar is grouped by business area. The top bar carries the outlet selector, the Jump to palette, a New order shortcut and the account menu. Page headers carry a Help for this page link.',
    when: ['You cannot find a screen.', 'A colleague sees a page that you do not see.', 'You need Help for the page you are on.'],
    prerequisites: ['You are signed in and the workspace gate has loaded.'],
    steps: [
      'Use the sidebar groups: Overview, Orders & Bookings, Operations, Catalogue, Customers, Reports, Business Management, Administration and Help & Support.',
      'Open Dashboard for the outlet snapshot, then use the area menus for detailed work.',
      'Use the outlet selector in the top bar to change the working outlet. It is hidden on small phone widths.',
      'Use Jump to or Ctrl/Cmd+K to search page names and quick actions. It also lists department workspaces.',
      'Use the account menu for Account settings, Keyboard shortcuts, Settings where permitted, and Sign out.',
      'Select Help for this page in a page header to open the matching guide. On error cards, select See troubleshooting help.',
      'Use Help centre search for a task, field label or error word. Select a training path if you are new.',
    ],
    after:
      'You should know where the outlet selector is, how to reach Help from the page you are on, and why a missing page usually means a permission or scope gap.',
    mistakes: [
      'Looking for global record search. The top bar palette searches pages and actions, not order or customer records.',
      'Assuming a hidden page is a bug. The sidebar filters by permission and scope.',
      'Using a phone and expecting the outlet selector. It is hidden below the small breakpoint.',
    ],
    limitations: [
      'The outlet selector has no mobile alternative.',
      'The command palette hides the Payments page behind the Record a payment quick action.',
      'The palette does not search Help articles.',
      'An unknown Help article id silently returns to the Help index instead of showing an error.',
    ],
  },
  {
    id: 'switch-outlet',
    title: 'Switch between outlets',
    category: 'Getting started',
    summary: 'Change the working outlet and understand which records follow it.',
    keywords: ['outlet', 'switch', 'location', 'store', 'scope', 'selector'],
    permission: 'Only outlets on your staff profile. Super Admins see every outlet.',
    what:
      'The selected outlet controls the records, totals and documents on almost every page. The choice is stored on this device, not on the staff profile.',
    when: ['You move between the two outlets.', 'A list looks empty or wrong.', 'You are entering an order for a different location.'],
    prerequisites: ['Your staff profile lists the outlet. A Super Admin must add you to a new outlet first.'],
    steps: [
      'Find the outlet selector in the top bar. It is visible on tablet and desktop widths.',
      'Choose the outlet you are physically working in.',
      'Confirm the outlet name in the page header or the list description.',
      'Reload the page if a list still appears to show the previous outlet.',
      'Remember that the choice persists on this device until you change it or clear browser storage.',
    ],
    after:
      'Orders, bookings, payments, production, inventory, deliveries, finance, reports and exports use the selected outlet. Products and customer accounts can be shared across outlets.',
    mistakes: [
      'Entering an order in the wrong outlet. Cancellation is the only correction for a completed order.',
      'Assuming a shared customer shows all outlet history. The customer page reads the first outlet on the account only.',
      'Trying to switch outlet on a phone. The selector is not rendered there.',
    ],
    limitations: [
      'There is no mobile outlet switcher.',
      'Staff cannot add themselves to an outlet.',
      'The selected outlet is device-local. A different browser can start on a different outlet.',
      'A customer shared across outlets shows only the first outlet\'s orders, bookings and payments on the customer page.',
    ],
  },
  {
    id: 'departments',
    title: 'Understand departments and the department workspace',
    category: 'Getting started',
    summary: 'Departments decide who prepares an item, who can see it and which workspace a team uses.',
    keywords: ['department', 'cake', 'sweets', 'hot', 'gajak', 'workspace', 'queue', 'scope'],
    permission: 'View dashboard (dashboardView) to read the workspace. Department admin pages need Manage departments (departmentsManage).',
    what:
      'Every product belongs to one department. A booking can span several departments. Staff are scoped to departments, and each department has a workspace with its queue, products and upcoming parties.',
    when: ['You need to see a department queue.', 'A product is missing from order entry.', 'A staff member cannot see the right work.'],
    prerequisites: [
      'The department exists, is active and is assigned to the selected outlet.',
      'The product belongs to the department and is sold at the outlet.',
      'Your profile includes the department, unless your role is outlet-wide.',
    ],
    steps: [
      'Open Catalogue, Departments to see the full list and colours.',
      'Open a department workspace from the department card, the sidebar command palette, or /admin/departments/:departmentId.',
      'Use the department pills to switch between departments in the workspace.',
      'Read Open orders, Ready to hand over, Department products and Upcoming parties.',
      'Open Order queue, Department products or Upcoming party bookings to work the department.',
      'Select New order to start an order with the department preselected.',
      'Use Production for the department queue, and Inventory for raw materials and packaging held by that department.',
    ],
    after:
      'The department workspace shows only the selected outlet and department. Use it as the team board, not as a replacement for Finance or Reports.',
    mistakes: [
      'Creating a product with the wrong department. It will not appear in the right order and production queues.',
      'Deactivating a department that still has active products or open work.',
      'Assigning a department to no outlet. The form requires at least one outlet.',
    ],
    limitations: [
      'Department deletion is Super-Admin-only and only offered when the usage check finds no products, orders or bookings. Used departments should be deactivated.',
      'The usage check is an interface safeguard; do not test deletion on live records.',
      'A department admin cannot adjust finished-product stock by default.',
    ],
  },
  {
    id: 'roles',
    title: 'Roles, permissions and outlet scope',
    category: 'Getting started',
    summary: 'What the default roles can do, how overrides work, and why a page may be hidden.',
    keywords: ['role', 'permission', 'super admin', 'manager', 'accountant', 'scope', 'access', 'override'],
    permission: 'Manage staff & permissions (usersManage). Role and scope changes are Super-Admin-only.',
    what:
      'A role is a template. Each staff profile also has outlets, departments and a permission map. The effective permission is the profile value, and the Super Admin bypasses normal checks.',
    when: ['You are deciding which role to give a new employee.', 'A staff member can see a page but cannot save.', 'You need to explain why an action is denied.'],
    fields: [
      { label: 'Super Admin', meaning: 'Every permission, both outlets, all departments. Can change staff, settings, outlets and departments.' },
      { label: 'Cake / Sweets / Hot Section / Gajak Admin', meaning: 'Day-to-day operations for that department: orders, bookings, payments, products, inventory, production, deliveries and reports. No finance, settings, staff, outlets or department administration.' },
      { label: 'Outlet Manager', meaning: 'Outlet-wide operations across departments, including finance, reports and accounting export. No staff, settings, outlets or department administration.' },
      { label: 'Accountant', meaning: 'Reads orders and customers, records payments, reads inventory, production and deliveries, manages finance, reports and accounting export. No product, order, booking or delivery management.' },
    ],
    steps: [
      'Open Administration, Staff & permissions.',
      'Read the role column and the scope summary before opening Edit.',
      'Remember that department admins only see their assigned departments. Managers and accountants are outlet-wide.',
      'Use Invite staff for a new person. Choose the role, outlets, departments and any per-person permission overrides.',
      'Use Edit for an existing person. Changing the role resets permissions to that role\'s defaults and replaces department scope for department roles.',
      'Check the effective pages after saving. A hidden sidebar item usually means the permission or scope is missing.',
    ],
    after:
      'The person can sign in and see only the outlets, departments and pages allowed by the profile. Firestore rules enforce the same boundary even if a page is reached directly.',
    mistakes: [
      'Giving Super Admin to avoid configuring scope. It removes every operational boundary.',
      'Changing a role and assuming old overrides remain. They are reset.',
      'Giving inventoryAdjust to a department admin without understanding that finished stock is global across outlets.',
      'Expecting usersManage alone to allow role, outlet, department or permission changes. Those writes are Super-Admin-only in the rules.',
    ],
    limitations: [
      'A role change resets permission overrides and, for department roles, department scope.',
      'The Accountant role can record payments but has no Access party bookings, so it cannot reach the booking payment dialog at all.',
      'The Outlet Manager and Accountant roles do not have inventoryAdjust by default.',
      'The interface hides pages, but the Firestore rules are the final authority.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Read the dashboard',
    category: 'Getting started',
    summary: 'What the four cards, the getting-started checklist and the queues do and do not tell you.',
    keywords: ['dashboard', 'stats', 'sales', 'outstanding', 'getting started', 'queue', 'overview'],
    permission: 'View dashboard (dashboardView)',
    what:
      'The dashboard is an outlet snapshot. It has no date-range control and no export. The four cards use the latest loaded records for the selected outlet.',
    when: ['You start a shift.', 'You need a quick operational read before opening reports.', 'A new workspace needs the setup checklist.'],
    prerequisites: ['An active profile and at least one assigned outlet.'],
    steps: [
      'Select the correct outlet in the top bar.',
      'Read Sales booked today, This month, Open orders and Outstanding.',
      'Read the small hint under each card. Outstanding means loaded order and booking balances, not a full ledger close.',
      'If you are a Super Admin, use Getting started to verify business details, outlets, departments, products, a customer, the first sale, a payment and staff.',
      'Use New order or New booking if your permissions allow it.',
      'Scroll to the queue, upcoming bookings, department mix and low-stock panels. Open the source page for detail.',
      'Open Reports for a date-bounded total and CSV export. Do not use the dashboard cards as a GST or accounting return.',
    ],
    after:
      'You have a quick operational picture. For collection, reconciliation, tax or audit work, open Finance or Reports.',
    mistakes: [
      'Treating This month as a complete month close. It is built from loaded records.',
      'Using Outstanding as a party statement. Open Finance for statements and caps warnings.',
      'Ignoring the low-stock panel because it is based only on tracked products with a critical level.',
    ],
    limitations: [
      'No date range, comparison period or export on the dashboard.',
      'Cards are based on loaded records and are not a complete accounting close.',
      'The Getting started checklist is shown to Super Admins only.',
      'Dashboard errors show a troubleshooting link, but other pages may show their own error state.',
    ],
  },
  {
    id: 'orders',
    title: 'Create an order',
    category: 'Daily operations',
    summary: 'Enter a counter, takeaway, delivery or dine-in order with server-priced lines, stock and an optional advance.',
    keywords: ['order', 'counter', 'takeaway', 'delivery', 'dine in', 'advance', 'stock', 'new order'],
    permission: 'Create & edit orders (ordersManage). An advance also needs Record payments (paymentsManage).',
    what:
      'The order form records a sale for one outlet and one department. The server re-reads products, prices, tax and stock, so the browser cannot set its own totals.',
    when: ['A customer places a counter or phone order.', 'A delivery order must be prepared and dispatched.', 'A walk-in sale needs a receipt.'],
    prerequisites: [
      'An outlet is selected and assigned to you.',
      'At least one active department is in your scope for that outlet.',
      'The products exist, are active, are available and are sold at the outlet.',
      'Business settings exist and the product has a valid price.',
      'If you take an advance, you hold paymentsManage.',
    ],
    steps: [
      'Open Orders and select New order.',
      'Choose the Department. This controls which products can be sold.',
      'Choose Order type: Takeaway, Delivery or Dine in. Choose Channel: Counter or Phone.',
      'Optionally set Pickup / delivery time.',
      'Optionally choose a Customer account, or enter a walk-in customer name and phone.',
      'Add each product line. Enter Quantity, review Rate, add a line Discount % and an optional Line note.',
      'Add Order notes and an order discount if needed.',
      'If money is taken now, enter Advance received, Payment mode and Payment reference. The advance cannot exceed the total.',
      'Select Save order. Wait for the server response before printing.',
      'Open the new order and print Receipt, Kitchen, Packing or Invoice as needed.',
    ],
    after:
      'The order is created as Confirmed with a server number. Tracked products are deducted from stock immediately. An advance creates a normal payment and receipt in the same transaction. The order appears in the Orders list and the department queue.',
    mistakes: [
      'Choosing the wrong department. The product list and production queue will be wrong.',
      'Using an advance without paymentsManage. Save without the advance and collect later.',
      'Ignoring the stock warning. The server stops an order that exceeds available stock.',
      'Trying to correct lines later. There is no priced order edit. Cancel and re-enter, or record a refund after completion.',
      'Assuming a customer account is required. It is optional for orders, unlike party bookings.',
    ],
    limitations: [
      'New orders start as Confirmed. Draft is not reachable from this form.',
      'After creation, only notes, status and print counts can be changed through the normal interface. Prices, lines, discounts and tax cannot be edited.',
      'Stock is deducted at creation, before the order is completed.',
      'The order form does not verify that a selected customer account still exists; use an active account.',
      'List and export data are capped at the newest 500 loaded orders.',
    ],
  },
  {
    id: 'order-status',
    title: 'Move an order through statuses, cancel it and print',
    category: 'Daily operations',
    summary: 'Advance one step at a time, cancel with stock restoration, and use the right document.',
    keywords: ['order status', 'preparing', 'ready', 'complete', 'cancel', 'stock', 'print', 'receipt'],
    permission: 'Create & edit orders to advance; Cancel orders to cancel.',
    what:
      'An order moves Confirmed, Preparing, Ready, Completed. Cancellation is a separate trusted action that restores stock for tracked products and keeps the order in history.',
    when: ['The kitchen starts or finishes an order.', 'The customer collects it.', 'The order must be cancelled.', 'A document must be reprinted.'],
    prerequisites: ['The order exists and belongs to your outlet and department.', 'You hold the permission for the action you are taking.'],
    steps: [
      'Open the order from Orders or the department workspace.',
      'Use the next-action button: Start preparing, Mark ready or Complete order. The app does not allow skipping a step.',
      'To cancel, select Cancel order. Enter a Cancellation reason. The reason is optional in the form but a default is recorded if it is blank.',
      'Read the warning if money is already recorded. Cancelling does not refund it.',
      'Confirm the cancellation. The order remains visible as Cancelled.',
      'Use Receipt, Kitchen, Packing or Invoice for the required document. The browser print dialog is the final print step.',
      'Use Edit order notes if only the note changes. Lines and totals are locked.',
    ],
    after:
      'Confirmed, Preparing and Ready orders can be cancelled. Completed and already cancelled orders cannot. Cancellation restores stock for products that were tracked, using the line snapshots saved at creation. Paid money remains until a refund is recorded separately.',
    mistakes: [
      'Trying to jump from Confirmed to Ready. Only the next valid step is offered.',
      'Cancelling to correct a line before collecting. The order cannot be reopened; re-enter it.',
      'Assuming cancellation refunds the customer. Record a refund separately.',
      'Printing before the order is saved or before line changes are confirmed.',
      'Deleting an order in the Firebase console. It does not restore stock and leaves payments orphaned.',
    ],
    destructive:
      'Cancellation is permanent. The order cannot be reopened. Paid money is not refunded automatically.',
    limitations: [
      'An old order without saved stock snapshots cannot be cancelled until stock is reconciled manually. The server fails closed instead of guessing.',
      'Only order documents record print counts, and only for users with ordersManage. Booking and payment prints are not counted.',
      'There is no order revision history.',
      'Order deletion is not offered in the interface, but the authorization rules allow a Super Admin to hard-delete. Do not use it.',
    ],
  },
  {
    id: 'bookings',
    title: 'Create a party booking',
    category: 'Daily operations',
    summary: 'Record a wedding, birthday, catering or corporate booking with departments, an advance and a delivery address.',
    keywords: ['booking', 'party', 'wedding', 'birthday', 'catering', 'corporate', 'advance', 'event'],
    permission: 'Manage party bookings (bookingsManage). Picking a party account needs View customers & parties (customersView).',
    what:
      'A booking is a future sale for a customer. It can span several departments and does not deduct stock. The server re-prices the lines, checks stock availability and records an optional advance.',
    when: ['A customer books a party or event.', 'A catering order is planned for a future date.', 'A delivery booking needs an address and a load.'],
    prerequisites: [
      'An active customer account exists for the outlet. Bookings cannot use a walk-in name.',
      'The outlet is selected and assigned to you.',
      'At least one active department and its products are available.',
      'Business settings exist and you hold bookingsManage.',
    ],
    steps: [
      'Open Party bookings and select New booking.',
      'Choose the Customer account, Event type, Event date and Event time.',
      'Choose Fulfilment: Pickup or Delivery. A delivery requires a Delivery address.',
      'Select the departments the event needs.',
      'Add product lines with Quantity, Rate, line Discount % and Line note.',
      'Add Booking instructions and an order discount if needed.',
      'Record an Advance received, Payment mode and Payment reference if money is taken now. The advance cannot exceed the total.',
      'Select Save booking. Open the booking to print Quotation, Confirmation, Ops slip or Invoice.',
      'Use Add payment for later receipts. Use Edit booking only while the booking is editable.',
    ],
    after:
      'The booking is created as Confirmed with revision 1. Stock is checked but not reserved or deducted. An advance creates a payment and receipt. The booking appears in the party list and in upcoming work.',
    mistakes: [
      'Using a walk-in name. A customer account is required.',
      'Expecting stock to be reserved. Another sale can consume the stock before the event.',
      'Recording a delivery booking without an address.',
      'Trying to change the customer after payments exist. Refund the paid amount first.',
    ],
    limitations: [
      'Bookings do not reserve stock, production capacity or a vehicle.',
      'Bookings do not deduct stock even when completed.',
      'Cancellation is permanent and does not refund money automatically.',
      'The booking list and create picker are capped at 500 and 400 loaded records respectively.',
    ],
  },
  {
    id: 'booking-edits',
    title: 'Edit a booking and read revision history',
    category: 'Daily operations',
    summary: 'Correct lines and prices before Ready, record a reason in production, and audit every change.',
    keywords: ['edit booking', 'revision', 'history', 'ready', 'price', 'paid', 'dispatch', 'change'],
    permission: 'Manage party bookings (bookingsManage)',
    what:
      'A booking edit is a trusted operation. The server re-reads products, re-prices the lines, checks stock for the new demand and writes an append-only revision snapshot.',
    when: ['The customer changes quantities or products.', 'A price or discount needs correction.', 'A delivery address or instruction changes before the load is final.', 'Only the collection method or the delivery address needs to change.'],
    prerequisites: [
      'The booking is in Enquiry, Confirmed or In production. A Ready booking is locked.',
      'The booking revision matches the one you loaded. Refresh if someone else changed it.',
      'The new total is not below the amount already paid.',
      'If the customer changes, no payment has been recorded.',
    ],
    steps: [
      'Open the booking and select Edit booking. The button is hidden when the booking is not editable.',
      'Change the customer, event details, fulfilment, departments, lines, instructions or discount.',
      'If the booking is In production, enter an Edit reason. It is mandatory in that status.',
      'Review the recalculated total and balance before saving.',
      'Select Save changes. If the revision is stale, refresh and repeat.',
      'Open the Edit history tab to read Revision, Date, Reason, Before, After and By.',
      'If a delivery record already exists and has not been dispatched, the save also refreshes that delivery: the load, address, schedule, customer and departments are updated and a Source updated entry is added to the delivery history.',
      'To change only the collection method or the address, use the Fulfilment card on the booking screen instead. It saves on the server, works even for a Ready booking, and does not reprice the booking or change its revision.',
    ],
    after:
      'The booking keeps the same id and number, increments its revision and adds a revision snapshot. Paid money and receipts are not changed. Stock is checked for the revised demand but not deducted. A delivery that has not been dispatched is kept in step with the revised booking.',
    mistakes: [
      'Trying to edit a Ready booking. It is locked by the server even if the browser still shows an old page.',
      'Reducing the total below the paid amount. Refund the difference first.',
      'Changing the customer while money is recorded. Refund first.',
      'Editing after dispatch. The server rejects it and the delivery is already on the road.',
      'Switching fulfilment to Pickup while a delivery record exists. The server refuses it until that delivery is closed.',
      'Changing the delivery address from the Fulfilment card and expecting the load or the price to change with it. That card only changes the collection method and the address.',
      'Trying to change fulfilment or the delivery address with a direct database write. The app denies it. Both changes go through the server.',
    ],
    limitations: [
      'Editable statuses are Enquiry, Confirmed and In production. Ready, Completed and Cancelled are locked.',
      'A delivery dispatch blocks edits through the trusted operation.',
      'Fulfilment cannot be changed while a delivery record exists, because the delivery was created for a delivery booking.',
      'Fulfilment and the delivery address can only be changed by the server. A direct write to the booking document is denied by the rules.',
      'The Fulfilment card cannot change the load, the price, the customer or the event details. Use Edit booking for those.',
      'A booking edit refreshes a delivery that is still pending or assigned. It does not change a delivery that is already dispatched or closed.',
      'The last 50 revisions are displayed; older revisions may exist but are not shown.',
      'The server checks stock only for the new demand. It does not reserve it.',
    ],
  },
  {
    id: 'production',
    title: 'Work the production queue',
    category: 'Daily operations',
    summary: 'Refresh from orders, assign staff, record partial batches and quality, and understand what completion does not do.',
    keywords: ['production', 'queue', 'batch', 'quality', 'rework', 'rejected', 'sync', 'department'],
    permission: 'View production (productionView). Changing work needs Manage production (productionManage).',
    what:
      'Production tasks are generated from order and booking lines. Sync is manual. The task tracks required, completed, rejected and rework quantities, assignment, quality and history.',
    when: ['The kitchen starts the day.', 'A batch finishes or is rejected.', 'A task needs an owner or a quality decision.'],
    prerequisites: [
      'The source order or booking is Confirmed, Preparing/In production or Ready.',
      'The line has a department.',
      'You hold productionManage for sync, assignment, progress, quality or cancel.',
    ],
    steps: [
      'Open Operations, Production. Choose the department and status filter.',
      'Select Refresh from orders. This reads both orders and bookings and creates or refreshes tasks. The label is narrower than the behaviour.',
      'Open a task with Update. Read Required, Completed and Remaining.',
      'Choose a Staff member and select Save assignment.',
      'For a Pending task, select Start work if you want to mark it started. Recording progress also marks it in progress.',
      'Enter Completed now, Rejected and Rework. Completed now must be positive; rejected and rework cannot exceed required and rework cannot exceed rejected.',
      'Add a Note and select Record progress. Reaching Required completes the task and auto-passes quality if it was pending.',
      'Use Quality decision to set Pending, Passed, Rejected or Rework before the task is completed if the final quality matters.',
      'Use Cancel this task with a mandatory reason only when the work will not be done.',
      'Read History for actions, actors and timestamps. It shows the newest 80 events.',
    ],
    after:
      'The task keeps append-only events. A completed task stays completed. A cancelled task is terminal and is not recreated by sync. Production completion does not add finished stock or consume raw materials.',
    mistakes: [
      'Expecting automatic sync. There is no scheduler or trigger.',
      'Recording rejected or rework without a positive completed quantity. The API rejects it.',
      'Trying to restore a cancelled task. Create a new source line instead.',
      'Assuming completed work consumes inventory. It does not; record material movements separately.',
      'Relying on priority changing. Priority is set when the task is created, not recalculated.',
    ],
    limitations: [
      'The page loads 600 tasks and 80 events. There is no cap warning on the page.',
      'Sync reads up to 20,000 records per collection. Above that it fails and reports no incomplete sync as complete.',
      'A task can be completed with a pending quality only through edge cases. Normal completion auto-passes pending quality.',
      'Refresh from orders is visible to view-only users but the server requires productionManage.',
      'Department workspaces links to a route that needs departmentsManage, which most production managers do not have.',
      'A task cannot record rejected-only or rework-only quantities. Record the accepted portion and explain the rest in the quality note.',
    ],
  },
  {
    id: 'inventory',
    title: 'Track raw materials, packaging and finished stock',
    category: 'Daily operations',
    summary: 'Create items, record movements, count stock, transfer between locations and adjust finished products.',
    keywords: ['inventory', 'stock', 'raw material', 'packaging', 'wastage', 'transfer', 'count', 'adjust'],
    permission: 'View inventory (inventoryView). Posting movements, counts and transfers needs Manage inventory (inventoryManage). Finished-product adjustment needs Adjust finished stock (inventoryAdjust).',
    what:
      'Inventory is an append-only ledger for raw materials and packaging, held per outlet and department. Finished products stay in the product master and use a separate trusted stock adjustment.',
    when: ['Goods arrive or are issued.', 'A physical count differs from the ledger.', 'Stock moves between departments or locations.', 'Finished-product stock needs correction.'],
    prerequisites: [
      'The outlet and department are in your scope.',
      'The item exists, is active and uses the right base unit.',
      'You hold inventoryManage for movements, counts, transfers and new items.',
      'You hold inventoryAdjust for finished-product stock, which only Super Admin has by default.',
    ],
    steps: [
      'Open Operations, Inventory. Use the four tabs: Stock items, Movement ledger, Stock counts and Finished products.',
      'Create an item with New item: Item name, Kind, Department, Base unit, optional SKU, Opening quantity and Critical level.',
      'Use Movement on an item. Choose Movement type, Quantity, Reference, Occurred at and a mandatory Reason.',
      'Use Count for a physical count. Enter Counted quantity and Reason. A non-zero variance posts a count-adjustment movement.',
      'Use Transfer to move stock between two items. Choose From item, To item, Quantity and Reason. Units must match and the locations must differ.',
      'Use Finished products and Adjust only if you hold inventoryAdjust. Enter a signed Quantity change and a Reason.',
      'Read Stock counts and Movement ledger to audit what happened. The ledger is read-only.',
    ],
    after:
      'The item balance changes atomically with the movement. Counts replace the recorded quantity and create a variance record. Transfers create paired out and in movements. Finished-product adjustments write a separate audit record and do not edit price or catalogue data.',
    mistakes: [
      'Using Opening balance after the item is live. Use a purchase, count or adjustment with a clear reason.',
      'Transferring between two items in the same department. The server treats that as the same location and rejects it.',
      'Trying to transfer across outlets from this page. The picker lists items from the selected outlet only.',
      'Assuming a count creates a session. Counts are per-item records.',
      'Expecting a department admin to use Transfer. A single-department admin cannot satisfy the different-location rule.',
    ],
    limitations: [
      'The page loads 600 items, 1,500 movements, 400 counts and 500 products. There is no cap warning on the page.',
      'A single item balance cannot go below zero or above 1,000,000 units. A movement is rejected as a whole if it would break either limit.',
      'There is no item edit or deactivate screen, even though the backend supports an update action.',
      'There is no per-item movement history screen; use the full ledger and search.',
      'Finished-product stock is global across outlets. A manager of one outlet cannot adjust a product shared with another outlet.',
      'The Occurred at default comes from the browser clock and can be shifted by timezone. Check it before saving.',
      'An item created with opening zero may accept a later Opening balance movement. Do not use that as a correction; use a count.',
      'The Finished products tab can appear empty for a user without productsView because its query error is not shown.',
    ],
  },
  {
    id: 'deliveries',
    title: 'Create, dispatch and close a delivery',
    category: 'Daily operations',
    summary: 'Assign, dispatch, record delivered, returned and damaged quantities, and collect against the source.',
    keywords: ['delivery', 'dispatch', 'driver', 'assign', 'delivered', 'returned', 'damaged', 'collection'],
    permission: 'View deliveries (deliveryView). Changing work needs Manage deliveries (deliveryManage). Collection also needs Record payments (paymentsManage).',
    what:
      'A delivery is a separate operational record linked to one delivery order or delivery booking. It snapshots the lines, address and schedule. It does not change stock or the source paid totals unless you collect a payment.',
    when: ['A delivery order is ready to leave.', 'A driver must be assigned or a load dispatched.', 'The customer receives, refuses or returns goods.', 'Cash is collected at the door.'],
    prerequisites: [
      'The source order is a Delivery order in Confirmed, Preparing or Ready, or the booking is a Delivery booking in Confirmed, In production or Ready.',
      'The source must not already have a delivery. One delivery is allowed per source, and a repeated create attempt returns the existing delivery.',
      'The outlet and at least one source department are in your scope.',
      'You hold deliveryManage. Collection also needs paymentsManage.',
    ],
    steps: [
      'Open Deliveries and select Create delivery.',
      'Choose an eligible Order or booking. The dialog shows customer, scheduled time and outstanding balance.',
      'Select Create delivery. Status starts Pending.',
      'Open Manage. Choose a Staff member and select Save assignment. Status becomes Assigned when it was Pending.',
      'If you use dispatch, select Dispatch. The server requires an assignee and moves the status to Dispatched. Dispatch re-checks the delivery against its source order or booking first, so a delivery that no longer matches cannot leave the outlet.',
      'Before closing, enter Delivered, Returned and Damaged for each line. Delivered plus returned plus damaged cannot exceed Expected.',
      'Choose Outcome: Delivered in full, Partially delivered, Failed or Returned. Add a Note if useful.',
      'Select Save delivery outcome. Read the reconciliation banner if it appears.',
      'To collect, use Collect cash / payment. Enter Amount, Mode and optional Reference. The payment posts against the source order or booking.',
      'You may collect more than once. Each collection posts its own receipt and the amount cannot exceed the remaining source balance.',
      'Read History for the audit trail. Create, assign, dispatch, complete and collect events are stored.',
    ],
    after:
      'Delivered in full requires every line to be fully delivered. Failed requires zero delivered. Returned requires at least one returned quantity. Partially delivered requires some but not all delivered. Completion does not cancel, refund or restock the source. A non-delivered outcome, or any returned or damaged quantity, creates a pending reconciliation state.',
    mistakes: [
      'Leaving a delivery at Dispatched after the driver returns. Record the actual outcome.',
      'Using Failed while entering delivered quantities. The server rejects it.',
      'Assuming dispatch is mandatory. The outcome can be saved from Pending or Assigned too, but the operational trail is weaker.',
      'Expecting completion to update stock or the source balance. Only a collection updates the source financials.',
      'Trying to create a replacement delivery for the same source. One delivery per source is enforced by the deterministic record id.',
      'Treating Collected as the total paid on the order or booking. It only counts money collected through this delivery.',
    ],
    destructive:
      'A completed delivery cannot be reopened. There is no delete action. The record is the operational audit trail.',
    limitations: [
      'There is no proof, photo, signature or GPS capture.',
      'Collection is blocked for Failed and Returned, but allowed before dispatch and after a successful close.',
      'The list caption says cash collected here posts a normal receipt once only. The server in fact allows repeated collections until the source balance is used up, so do not read the caption as a hard limit.',
      'Completion does not change stock, order paid totals or booking paid totals.',
      'A booking edit refreshes a delivery that is still pending or assigned. If the delivery and the booking ever disagree, dispatch is refused until the booking is saved again through Edit booking or the Fulfilment card.',
      'Returned, damaged and undelivered quantities are left pending reconciliation. There is no resolution button.',
      'The page loads 500 deliveries, 400 orders, 400 bookings and 80 events. There is no cap warning.',
      'A booking delivery can be accessed through any one matching department, and that grants access to the whole delivery.',
      'The assignee list is outlet-wide; the server does not require the driver to belong to the delivery department.',
      'A delivery created from an order keeps the customer address that was on the customer record when it was created. A later address change does not reach the delivery, so check the address before dispatching.',
      'The collection note and reference input do not show the server limits. Keep notes short and references under 80 characters.',
    ],
    pending: [
      'Failed, returned, partially delivered and damaged quantities are marked pending reconciliation under the approved policy. No stock, refund or source-balance correction is automatic.',
      'There is no in-app restock, write-off or reconciliation-resolution workflow. The owner or accountant must decide the manual treatment outside this delivery record.',
    ],
  },
  {
    id: 'delivery-reconciliation',
    title: 'Handle a failed, returned or partial delivery',
    category: 'Daily operations',
    summary: 'What the pending reconciliation state means, what the app does not change, and what staff must not do.',
    keywords: ['reconciliation', 'failed delivery', 'returned', 'damaged', 'restock', 'write off', 'refund', 'pending'],
    permission: 'Manage deliveries (deliveryManage) to record the outcome. Refunds need Record payments (paymentsManage).',
    what:
      'A delivery that is not fully delivered is recorded with a pending reconciliation status. The approved policy is deliberately manual: the app does not restock, write off, refund or change the source paid totals.',
    when: ['The customer refuses a delivery.', 'The driver returns goods.', 'Some lines are damaged or short.', 'A partial delivery needs follow-up.'],
    prerequisites: [
      'The delivery exists and is open, assigned or dispatched.',
      'You know the actual delivered, returned and damaged quantities.',
      'You understand that the delivery outcome is permanent.',
    ],
    steps: [
      'Open the delivery and select Manage.',
      'If the source booking was cancelled before the load left, the delivery can no longer be dispatched. Close it as Failed or Returned anyway so the reconciliation is recorded.',
      'Enter the actual Delivered, Returned and Damaged quantities for every line.',
      'Choose the honest Outcome. Use Delivered in full only when every line is complete. Use Partially delivered, Failed or Returned otherwise.',
      'Add a Note with the reason and any customer reference.',
      'Save the delivery outcome. The app records the lines and marks reconciliation pending when required.',
      'Tell the manager or accountant that reconciliation is pending. Do not silently change stock or paid totals.',
      'If a refund is approved, record it through the source order or booking payment workflow, not by editing the delivery or Firestore.',
      'If stock is returned to saleable condition, the owner must approve the inventory movement or count. Do not post it as a delivery side effect.',
    ],
    after:
      'The delivery remains in the list with its outcome. Stock and source paid totals are unchanged. The delivery cannot be reopened. The manager or accountant must decide the restock, write-off and refund treatment outside the delivery record.',
    mistakes: [
      'Cancelling the source order to make the delivery disappear. That changes the sale and stock separately.',
      'Editing Firestore to change reconciliationStatus or stock.',
      'Recording a refund against the delivery record instead of the source order or booking.',
      'Leaving the delivery open because the outcome is commercially unresolved.',
      'Assuming a returned item is back in stock. It is not.',
    ],
    destructive:
      'The delivery outcome is permanent. The app does not reverse stock or payments when a delivery is closed.',
    limitations: [
      'There is no in-app resolution action for reconciliationStatus.',
      'The app does not track a restock, write-off or damaged-goods location.',
      'A returned delivery cannot be replaced by a new delivery for the same source because one delivery per source is enforced.',
      'The exact accounting treatment remains a manual owner or accountant decision. This guide does not invent a policy.',
    ],
    pending: [
      'The approved policy is to keep these cases pending and reconcile manually. The app has no approved automatic restock, write-off, refund or source-balance adjustment for a failed, returned or partial delivery.',
      'How the manual adjustment should be evidenced in the books is not encoded in the delivery workflow. Agree it with the owner or accountant before posting correction entries.',
    ],
  },
  {
    id: 'payments',
    title: 'Record payments and refunds',
    category: 'Daily operations',
    summary: 'Take an advance or later payment, refund money, print a receipt and understand the limits.',
    keywords: ['payment', 'refund', 'advance', 'receipt', 'cash', 'upi', 'card', 'balance', 'paid'],
    permission: 'View payments (paymentsView). Recording needs Record payments (paymentsManage).',
    what:
      'Payments are append-only records linked to an order or booking. The Payments page is a read-only register. New money is recorded from the order or booking detail screen.',
    when: ['A customer pays an advance.', 'A balance is settled later.', 'Money is refunded.', 'A receipt must be reprinted.'],
    prerequisites: [
      'The order or booking exists and is not cancelled for a new payment.',
      'You hold paymentsManage.',
      'The source outlet and department are in your scope.',
      'The amount is not above the outstanding balance or, for a refund, above the amount already paid.',
    ],
    steps: [
      'Open the order or booking and select Record payment or Add payment.',
      'Choose Transaction type: Payment received or Refund paid out.',
      'Enter Amount (₹). The full balance is prefilled for a payment; change it if the customer pays less.',
      'Choose Payment mode. Enter the Date & time.',
      'Enter the UPI / card reference, or the Refund reference. Add Notes if useful.',
      'Select the confirm action. Wait for the receipt number in the toast.',
      'Open Payments to review the register and print a receipt. The page itself cannot create a record.',
      'For a refund, use the same dialog and choose Refund paid out. Refunds remain possible after cancellation.',
    ],
    after:
      'A payment reduces the balance and a refund increases it. Payment status becomes Paid when the balance reaches zero, Partial when some money is paid, Unpaid when nothing is paid, and Refunded only when the full paid amount has been refunded and paid is exactly zero. Each entry has a receipt number and a printable receipt.',
    mistakes: [
      'Trying to create a payment from the Payments page. It is read-only.',
      'Entering a refund larger than the amount paid. The server rejects it.',
      'Taking a payment on a cancelled order or booking. New payments are blocked; refunds are still allowed.',
      'Assuming Refunded means any refund. A partial refund leaves the status Partial or Paid depending on the remaining paid amount.',
      'Deleting a payment to correct a mode. Payment records are immutable; add a corrective entry with a note.',
    ],
    destructive:
      'Payments and refunds are permanent and cannot be edited or deleted by any role. A receipt is a financial record.',
    limitations: [
      'There is no standalone payment or unlinked receipt entry.',
      'Payment records cannot be voided or edited. Correct with a refund, a new payment and a clear note.',
      'A cancelled order or booking shows a receipt without a cancelled marker on the print page.',
      'The Payments register and the order payment list are capped at 500 loaded rows; order detail payments are capped at 300.',
      'Duplicate protection is by request id. An ambiguous retry with a new id can create a second payment if balance remains.',
      'Payment amounts are in paise internally. Use the rupee fields in the interface, not raw paise.',
    ],
  },
  {
    id: 'printing',
    title: 'Print order, booking and payment documents',
    category: 'Daily operations',
    summary: 'Which document to use, where the link is, and what the app does and does not record.',
    keywords: ['print', 'receipt', 'kitchen', 'packing', 'invoice', 'quotation', 'confirmation', 'ops slip'],
    permission: 'Order and booking prints need the matching view permission. Print counts need Create & edit orders (ordersManage).',
    what:
      'Documents are browser pages. The browser print dialog is the final step; the app has no direct printer connection. Order documents record print counts; booking and payment documents do not.',
    when: ['The kitchen needs a ticket.', 'The customer needs a receipt or invoice.', 'A booking needs a quotation or confirmation.', 'A payment receipt is requested.'],
    prerequisites: ['The order, booking or payment exists and is in your outlet scope.', 'You hold the matching view permission.'],
    steps: [
      'Open the order or booking detail. Use the document buttons in the header.',
      'Order documents: Receipt, Kitchen, Packing and Invoice.',
      'Booking documents: Quotation, Confirmation, Ops slip and Invoice.',
      'Payment receipts: open Payments, find the receipt and open its Receipt link, or open the receipt from the order payment list.',
      'Check the paper size in Settings. Only the receipt paper is selectable; kitchen tickets are fixed at 80 mm and packing slips at A5.',
      'Use the browser print dialog to choose the printer and copies.',
      'For an order reprint, the print count on the order detail increases after the print action when you hold ordersManage.',
    ],
    after:
      'The document opens in a new tab or print view. Order print counts are updated for order documents. Booking and payment prints leave no count.',
    mistakes: [
      'Looking for a booking print count. Only order documents are counted.',
      'Assuming the invoice button is missing. It is present in the order header in this build.',
      'Changing the kitchen or packing paper in Settings. Those sizes are fixed.',
      'Printing a cancelled payment receipt as proof that money is still valid. The receipt has no cancelled marker; check the source record.',
    ],
    limitations: [
      'There is no direct printer integration, spooler or reprint audit for bookings or payments.',
      'Order print counts only increment when the user holds ordersManage.',
      'A recorded print event is not proof of a physical print. Check the printer separately.',
      'A booking invoice uses the print date, not the event or booking date.',
      'Payment receipts do not show a cancelled or void badge.',
    ],
  },
  {
    id: 'products',
    title: 'Create and maintain products',
    category: 'Catalogue',
    summary: 'Build the product master with departments, outlets, prices, units, stock tracking and images.',
    keywords: ['product', 'catalogue', 'item', 'price', 'unit', 'stock', 'outlet', 'active', 'available'],
    permission: 'View catalogue (productsView). Create and edit needs Manage catalogue (productsManage). Adjusting an existing stock balance needs Adjust finished stock (inventoryAdjust).',
    what:
      'A product is the sellable item used by orders, bookings and production. It belongs to one department and can be sold at one or more outlets.',
    when: ['Adding a new menu item.', 'Changing a price or availability.', 'Retiring an item.', 'Setting up stock tracking.'],
    prerequisites: [
      'The department exists and is active.',
      'The outlet exists and is in your scope.',
      'You hold productsManage. Adjusting the live stock balance later needs inventoryAdjust.',
    ],
    steps: [
      'Open Catalogue, Products and search before creating a duplicate.',
      'Select New product or open an existing product and choose Edit.',
      'Complete Identity: Product name, Alias, Print name, Group, Category, Department and Available at outlets.',
      'Complete Pricing and units: Pricing mode, Selling unit, Sale price, optional MRP, purchase price and minimum sale price, default discount, tax, HSN and alternate units.',
      'Add cake size prices if the product uses cake price per pound.',
      'For a tracked product, enable stock tracking, record opening stock at creation and set a critical level. Conversion factor is locked after creation.',
      'Add a description and product image if useful.',
      'Keep Product is active on to keep it in the catalogue. Use Currently available for a temporary sell-out.',
      'Select Create product or Save changes.',
    ],
    after:
      'The product appears in order and booking pickers for its outlets and department. Deactivated products remain in history but are not offered for new sales. Stock-tracked products appear in Inventory, Finished products.',
    mistakes: [
      'Turning Active off to hide an item for a day. Use Currently available instead.',
      'Selecting an outlet outside your scope. The form shows all outlets, but the save is rejected.',
      'Trying to change tracking or conversion after creation. They are locked.',
      'Setting conversion factor to zero. It must be greater than zero.',
      'Expecting the product to be deleted. There is no delete control; deactivate it.',
    ],
    limitations: [
      'The product list loads 500 records. Bulk Activate and Deactivate apply to selected loaded products.',
      'No batch or expiry tracking controls are exposed even though fields exist in the data model.',
      'The outlet checkbox list is not filtered to your scope. Out-of-scope outlets fail at save.',
      'Sell this product does not preselect the product on the order form.',
      'Finished-product stock is global across outlets.',
      'There is no product delete control. Deactivate instead.',
    ],
  },
  {
    id: 'product-pricing',
    title: 'Set product prices, units and tax',
    category: 'Catalogue',
    summary: 'Choose the pricing mode, unit, conversion, minimum price, tax and discount rules.',
    keywords: ['price', 'pricing', 'unit', 'kg', 'box', 'cake', 'tax', 'discount', 'mrp', 'conversion'],
    permission: 'Manage catalogue (productsManage)',
    what:
      'Pricing is stored in paise and converted to rupees in the interface. The pricing mode decides how quantity is interpreted; the business tax mode decides whether entered prices include GST.',
    when: ['Creating a product.', 'Changing a menu price.', 'Setting a minimum acceptable price.', 'Changing the tax rate or discount default.'],
    prerequisites: ['The product exists or is being created.', 'You know the selling unit and whether the price includes tax.'],
    steps: [
      'Open the product form and go to Pricing and units.',
      'Choose Pricing mode: Fixed price per unit, Price per kilogram, Price per box or Cake price per pound.',
      'Choose the Selling unit. A per-kilogram mode requires a unit containing kg. A cake-per-pound product requires cake sizes and an lb unit.',
      'Enter Sale price. Optionally add MRP, Purchase price and Minimum sale price.',
      'Set the Default line discount and Tax percent. Confirm the business setting Selling prices include GST.',
      'Add an Alternate unit and Conversion factor only if the product is sold in more than one unit. The factor must be greater than zero.',
      'Add Packaging unit and Pieces per box for box-based pricing.',
      'Save and test the product in a real order before relying on it.',
    ],
    after:
      'Order and booking lines use the product price and tax at the time of sale. Existing lines keep their captured price even if the product changes later.',
    mistakes: [
      'Setting Minimum sale price above Sale price. The form rejects it.',
      'Using a zero conversion factor. It is invalid.',
      'Assuming the tax default is a filing rate. It is an operational estimate, not a GST return.',
      'Changing a product price and expecting old orders to update. They keep their captured lines.',
    ],
    limitations: [
      'There is no price-history screen in Help or the product page.',
      'Tax is an operational estimate from product settings. It is not a filed GST return.',
      'The conversion factor and stock tracking are locked after creation.',
      'The order form and server enforce the minimum sale price and stock rules.',
    ],
  },
  {
    id: 'product-images',
    title: 'Add or replace a product image',
    category: 'Catalogue',
    summary: 'Upload a JPEG, PNG or WebP image, or use an image URL, within the supported limits.',
    keywords: ['image', 'photo', 'upload', 'jpeg', 'png', 'webp', 'url', 'storage'],
    permission: 'Manage catalogue (productsManage)',
    what:
      'A product can have one image, stored in Firebase Storage under the outlet path. The browser resizes and compresses the upload before saving.',
    when: ['A new product needs a picture.', 'An old picture is replaced.', 'The image URL is broken.'],
    prerequisites: ['The product exists and you hold productsManage.', 'You have a JPEG, PNG or WebP image that is not larger than 8 MB.'],
    steps: [
      'Open the product form and find Product image.',
      'Select Upload image or Replace image and choose the file.',
      'Wait for the preview. The app resizes to a maximum of 1200 px and converts to JPEG.',
      'Alternatively, paste an image URL in Or use an image URL.',
      'Save the product. The image is referenced only after the product save succeeds.',
      'If the save fails after the upload, check the warning. The image may exist in Storage without being attached.',
    ],
    after:
      'The product detail and catalogue show the new image. Replacing an image does not remove the previous file from Storage automatically.',
    mistakes: [
      'Uploading a file larger than 8 MB. It is rejected before upload.',
      'Assuming a PDF or SVG is supported. Use JPEG, PNG or WebP.',
      'Saving the product before the upload finishes.',
      'Forgetting that a failed save can leave an orphaned image in Storage.',
    ],
    limitations: [
      'The compressed image must be under 4 MB.',
      'The app converts the image to JPEG; transparency is not preserved.',
      'There is no image library or bulk media manager.',
      'Replacing an image does not delete the old file.',
    ],
  },
  {
    id: 'customers',
    title: 'Create and use customer and party accounts',
    category: 'Customers & parties',
    summary: 'Keep contact, address, tax and opening-balance details for orders, bookings and statements.',
    keywords: ['customer', 'party', 'account', 'address', 'gstin', 'credit', 'opening balance', 'statement'],
    permission: 'View customers & parties (customersView). Create and edit needs Manage customers & parties (customersManage).',
    what:
      'Customer accounts hold contact details, up to four addresses, tax identifiers, an opening balance and a display-only credit limit. Bookings require an active account; orders can use a walk-in name.',
    when: ['A new retail or party customer appears.', 'A business account needs GSTIN or PAN.', 'A customer is shared with another outlet.'],
    prerequisites: ['The outlet is selected and in your scope.', 'You hold customersManage to create or edit.'],
    steps: [
      'Open Customers & parties and select New customer.',
      'Enter Name / party name, optional Alias, Account type and Account group.',
      'Enter Mobile number or Email. At least one is required.',
      'Choose Accounts at outlets. Only choose outlets in your scope.',
      'Add up to four addresses with Label, PIN code, Address line 1, Address line 2, City and State.',
      'For a business account, enter GSTIN or PAN. At least one is required.',
      'Enter Opening balance, optional Credit limit and Internal notes.',
      'Keep Account is active on. Save the account.',
      'Open the account to see Order value, Booking value, Received (net), Outstanding and recent history.',
    ],
    after:
      'The account appears in order and booking pickers for its outlets. The customer page shows recent orders, bookings and payments, but only for the first outlet on the account.',
    mistakes: [
      'Creating a business account without GSTIN or PAN. The form rejects it.',
      'Entering neither phone nor email. The form rejects it.',
      'Assuming the credit limit blocks a sale. It is displayed only.',
      'Expecting New order from the customer page to preselect the customer. It does not.',
      'Assuming all outlet history appears. Only the first outlet is queried.',
    ],
    limitations: [
      'The customer list loads 500 records.',
      'Credit limit is display-only and never blocks a sale. Opening balance is an informational record that is included in party statements and is not auto-settled by new payments.',
      'A shared customer shows history for the first outlet only. If that outlet is outside your scope, the page can fail.',
      'The outlet checkbox list is not filtered to your scope. Out-of-scope outlets fail at save.',
      'There is no delete control. Deactivate the account instead.',
      'Two addresses with the same label can collide in the data model. Use distinct labels.',
    ],
  },
  {
    id: 'reports',
    title: 'Read sales and operational reports',
    category: 'Money & reports',
    summary: 'Sales, department mix, payment modes, order status and operational tabs, with their limits.',
    keywords: ['report', 'sales', 'tax', 'department', 'payment mode', 'production', 'inventory', 'delivery', 'csv'],
    permission: 'View reports (reportsView)',
    what:
      'Reports combine active orders and bookings for the selected outlet and date range. The page also has operational tabs for production, inventory, deliveries, finance and party activity, depending on your permissions.',
    when: ['You need a daily, weekly, monthly or custom sales view.', 'You need a CSV for analysis.', 'You need an operational register for the period.'],
    prerequisites: ['An outlet is selected and in your scope.', 'You hold reportsView. Individual operational tabs need their own view permissions.'],
    steps: [
      'Open Reports. Read the outlet and date range in the header.',
      'Choose Last 7 days, Last 30 days, Last 90 days, This month or Custom. For Custom, set From and To.',
      'Read Sales value, Average order, Net received and Tax estimate. Tax is an operational estimate, not a GST return.',
      'Review Daily sales, Department mix, Top products, Payment modes, Order status and Period totals.',
      'Use Orders CSV, Bookings CSV and Payments CSV for the current range. These include loaded records and your permission scope.',
      'Scroll to Operational reports and choose Production, Inventory, Deliveries, Finance or Party activity if permitted.',
      'Read the cap warning if it appears. Narrow the date range before relying on totals or exports.',
    ],
    after:
      'The report reflects active orders and bookings created in the range, payments received in the range, and the selected outlet and department scope. CSV files download locally; nothing is written to BUSY.',
    mistakes: [
      'Using Tax estimate as a GST filing. It is not.',
      'Comparing the previous-period badge as a complete comparison. It is based on loaded records.',
      'Exporting a range that hit the cap and treating the CSV as complete.',
      'Assuming bookings use the event date in sales reports. Sales charts use the booking creation date.',
      'Assuming every export uses the same column format. Check the headers before combining files.',
    ],
    limitations: [
      'Main report caps: 2,000 orders, 2,000 payments and 1,000 bookings per range. The page warns when a cap is reached.',
      'Operational caps: 600 production tasks, 1,500 inventory movements, 500 deliveries, 500 expenses, 200 cash sessions and 500 party accounts. The page warns for the ones it tracks.',
      'Sales cards exclude cancelled orders and bookings. The order and booking CSV exports include the loaded records, including cancelled ones.',
      'The previous-period badge is not a reliable complete comparison when data is capped.',
      'Reports are per selected outlet. They are not a consolidated both-outlet statement.',
    ],
  },
  {
    id: 'finance',
    title: 'Read party balances, statements and expenses',
    category: 'Money & reports',
    summary: 'Outstanding balances, statements, reminders, expenses and cash-session summaries.',
    keywords: ['finance', 'outstanding', 'statement', 'reminder', 'expense', 'party', 'balance', 'ledger'],
    permission: 'View finance (financeView) to read. Manage finance (financeManage) to record expenses or cash sessions.',
    what:
      'Finance derives party statements from orders, bookings, payments and refunds. It does not rewrite the original records. It also holds expenses and cash sessions.',
    when: ['A customer asks for a statement.', 'You need the outstanding list.', 'An expense is paid.', 'You need a cash handover summary.'],
    prerequisites: ['An outlet is selected.', 'You hold financeView. Recording needs financeManage.', 'The party has an account and activity in the loaded records.'],
    steps: [
      'Open Operations, Finance. Read the four cards: Outstanding, Collected today, Expenses this month and Open cash sessions.',
      'If Balances are incomplete appears, stop using the screen for collection or reconciliation and narrow the scope.',
      'Open Outstanding and select Statement for a party. Review Opening, Billed, Received and Closing.',
      'Use the reminder action only when the data is complete. It copies text; it does not send a message.',
      'Open Expenses to review posted and voided records. Use Record expense to post a new one, choose Head, Amount (₹), Paid on, Mode, an optional Reference and Notes, then select Post expense.',
      'Use Void on a posted expense and give a reason. The original expense record is kept.',
      'Open Cash sessions to review open and closed sessions. Use Open cash session and Close for handover.',
      'Export a statement only when the export button is enabled. A capped dataset disables it.',
    ],
    after:
      'A party closing balance equals opening balance plus active orders and bookings, minus payments, plus refunds. Statements and reminders are read-only. Expenses are posted or voided, never hard-deleted. Cash sessions preserve expected cash and variance.',
    mistakes: [
      'Using an incomplete outstanding list for collection. The page explicitly says not to.',
      'Voiding an expense to hide a mistake. Void with a reason; the record remains.',
      'Expecting a reminder to send itself. The app copies text for you to send.',
      'Editing a payment to fix a statement. Payments are immutable; use a refund or corrective entry.',
      'Using Finance as a full GST ledger. It is operational, not a tax return.',
    ],
    limitations: [
      'Finance caps: 500 orders, 500 bookings, 1,000 payments, 500 party accounts, 500 expenses and 200 cash sessions. The page warns and disables some actions.',
      'Statements cover the loaded records for the selected outlet and your department scope. Department-scoped users can lose receipts that have no department ids.',
      'Outstanding excludes parties with a zero closing balance and no entries. It is not a complete customer list.',
      'Reminders are copy-only.',
      'Expenses are outlet-level, not department-level.',
    ],
  },
  {
    id: 'cash-sessions',
    title: 'Open and close a cash session',
    category: 'Money & reports',
    summary: 'One session per person per outlet, expected cash from that person\'s cash receipts, and a counted handover.',
    keywords: ['cash', 'session', 'float', 'handover', 'variance', 'expected', 'close', 'drawer'],
    permission: 'Manage finance (financeManage)',
    what:
      'A cash session records an opening float and a counted handover. Expected cash is the float plus cash payments recorded by the session opener after it opened, minus their cash refunds. It is not an outlet-wide cash total.',
    when: ['You start taking cash.', 'You hand over the drawer at shift end.', 'A variance needs an explanation.'],
    prerequisites: [
      'You hold financeManage.',
      'The outlet is selected and in your scope.',
      'You do not already have an open session for that outlet.',
    ],
    steps: [
      'Open Finance, Cash sessions and select Open cash session.',
      'Enter Opening float (₹) and optional Notes. Select Open session.',
      'Take cash payments normally from orders, bookings or deliveries. They count only if you are the creator.',
      'At handover, select Close on your open session.',
      'Enter Counted cash (₹), Handed over to and optional Notes. Both the counted amount and the handover name are required.',
      'Select Close session. Read the variance in the success message.',
      'If the variance is not zero, explain it to the manager or accountant and follow the outlet cash policy.',
    ],
    after:
      'The session becomes Closed and stores opening float, expected cash, counted cash, variance and handover name. You can open a new session for the same outlet. Another cashier can have a separate open session at the same outlet.',
    mistakes: [
      'Assuming expected cash includes every cash payment at the outlet. It only includes cash created by the opener after the session opened.',
      'Taking a cash payment while signed in as a colleague. It will not count in your session.',
      'Leaving a session open across shifts. Close it with a counted handover.',
      'Trying to open a second session for the same outlet. One open session per person and outlet is enforced.',
      'Ignoring a negative variance. It means counted cash is below expected.',
    ],
    limitations: [
      'Cash sessions are per person and outlet, not per physical drawer or register.',
      'The expected calculation excludes cash payments created by other staff and cash received before the session opened.',
      'Only the opener or a Super Admin, Outlet Manager or Accountant can close the session.',
      'There is no session reopen. A closed session is final.',
      'The session list loads 200 records.',
    ],
  },
  {
    id: 'accounting-export',
    title: 'Export orders and payments for BUSY',
    category: 'Money & reports',
    summary: 'Download the two CSV files, understand the 2,000-row cap and what the export does not contain.',
    keywords: ['busy', 'accounting', 'export', 'csv', 'orders', 'payments', 'reconciliation', 'tally'],
    permission: 'Accounting exports (busyView)',
    what:
      'The Accounting export page produces two local CSV files: orders and payments for the selected outlet and date range. It is export-only. It does not connect to BUSY and does not export balances, ledgers or masters.',
    when: ['The accountant needs a sales and receipts file.', 'You are reconciling a period outside the app.', 'You need a CSV for a consultant.'],
    prerequisites: ['An active profile, an outlet selected in the top bar and busyView.', 'For department-scoped staff, at least one department.'],
    steps: [
      'Select the outlet in the top bar. The page itself has no outlet selector.',
      'Open Reports, Accounting export.',
      'Set From and To. The range includes both selected days. Both dates are required.',
      'Read the record counts and the boundary panel. Check the period and outlet before exporting.',
      'Select Export orders CSV or Export payments CSV. The file downloads locally.',
      'Repeat for the other file. The app does not detect overlapping or duplicate exports.',
      'Reconcile the row count against the period. If a file hits 2,000 rows, split the range and export again.',
    ],
    after:
      'Files are named vishal-prem-orders-<outlet>-<from>-to-<to>.csv and vishal-prem-payments-<outlet>-<from>-to-<to>.csv. Values are in rupees. Cells are protected against spreadsheet formula injection. Nothing is written to BUSY.',
    mistakes: [
      'Looking for a balances or ledger export. It does not exist.',
      'Looking for a BUSY connection status in Settings. There is no BUSY control there.',
      'Assuming the summary card equals the CSV row count. The card excludes cancelled orders; the CSV includes them.',
      'Exporting the same range twice and importing both files.',
      'Clearing a date input. The page expects both dates and has no graceful empty-date state.',
    ],
    limitations: [
      'Each export loads at most the newest 2,000 orders and 2,000 payments for the range. The cap is silent apart from the record count.',
      'The page has no preview table, status filter, row selection or export audit trail.',
      'Department-scoped staff may lose payments that have no department ids.',
      'Party bookings appear only through their payments; there is no booking export here.',
      'There is no balances, stock, ledger or master-data export.',
    ],
  },
  {
    id: 'outlet-admin',
    title: 'Manage outlets',
    category: 'Administration',
    summary: 'Create and edit outlet identity, contact details and active status. Outlets are not deleted.',
    keywords: ['outlet', 'store', 'location', 'code', 'gstin', 'active', 'deactivate', 'address'],
    permission: 'Manage outlets (outletsManage). By default only Super Admin has it.',
    what:
      'An outlet is a selling location. Every order, booking, payment, expense and delivery belongs to one outlet. The page edits identity and contact fields; department assignment is on the Departments page.',
    when: ['Opening a new location.', 'Changing an address, phone or GSTIN.', 'Closing a location temporarily.'],
    prerequisites: ['You hold outletsManage. By default this is Super Admin only.', 'You understand that the outlet code is used in document numbers.'],
    steps: [
      'Open Business Management, Outlets.',
      'Select New outlet, or Edit on an existing card.',
      'Enter Outlet name, Short code, Phone, Email, Address, GSTIN and Active outlet.',
      'Select Create outlet or Save outlet.',
      'Add the new outlet to staff profiles that need it. A new outlet is not automatically visible to existing non-Super-Admins.',
      'To stop using an outlet, turn Active outlet off. There is no delete control.',
      'Open Departments to change which departments are available at the outlet.',
    ],
    after:
      'The outlet appears in the selector for permitted staff. Its code prefixes new order, booking, expense and delivery numbers. Deactivation hides it from new work but keeps history.',
    mistakes: [
      'Assuming the short code is unique. The app does not enforce uniqueness.',
      'Expecting deactivation to check for open orders. It does not; finish open work first as an operating rule.',
      'Editing a code after documents exist. Historic numbers keep their old code; new numbers use the new one.',
      'Deleting an outlet in the Firebase console. There is no UI delete, and deletion can orphan history.',
    ],
    limitations: [
      'No delete control. Deactivate instead.',
      'The form does not prevent deactivating an outlet with open work.',
      'GSTIN is optional and format-checked only when entered.',
      'A new outlet must be added to each staff profile separately.',
    ],
  },
  {
    id: 'department-admin',
    title: 'Manage departments',
    category: 'Administration',
    summary: 'Create, edit, deactivate and safely remove unused departments.',
    keywords: ['department', 'create', 'edit', 'deactivate', 'delete', 'colour', 'outlet'],
    permission: 'Manage departments (departmentsManage). Delete is Super Admin only.',
    what:
      'Departments group products, staff scope and production work. A department must be assigned to at least one outlet. Used departments should be deactivated, not deleted.',
    when: ['A new production section opens.', 'A department changes colour or outlet coverage.', 'An unused department must be removed.'],
    prerequisites: ['You hold departmentsManage. Deletion also needs Super Admin.', 'You understand which products, orders and bookings reference the department.'],
    steps: [
      'Open Catalogue, Departments.',
      'Select New department, or Edit on a card.',
      'Enter Department name, Code, Colour, Active department, Description and Available at outlets.',
      'Select Create department or Save department.',
      'To remove an unused department, use the delete icon. The app checks products, orders and bookings.',
      'If usage is found, choose Deactivate instead. If usage is zero, type DELETE and confirm Delete permanently.',
      'Open the department workspace to check the queue and products after the change.',
    ],
    after:
      'The department appears in product, order and booking pickers for its outlets. Deactivation keeps history and removes it from new work. Deletion removes the record; it has no undo.',
    mistakes: [
      'Deleting a used department. The interface should block it, but deactivation is the safe action.',
      'Assigning no outlet. The form requires at least one.',
      'Changing a code that products or integrations rely on.',
      'Assuming department admin can delete. Deletion is Super-Admin-only.',
    ],
    destructive:
      'Deleting an unused department is permanent. Used departments cannot be deleted from the interface; deactivate them.',
    limitations: [
      'The usage check is an interface safeguard. Do not test deletion on live data.',
      'There is no cascade or restore.',
      'Department deletion does not remove historical references.',
    ],
  },
  {
    id: 'staff',
    title: 'Invite staff, assign roles and control permissions',
    category: 'Administration',
    summary: 'Invitations, role templates, per-person overrides, suspension and removal.',
    keywords: ['staff', 'user', 'invite', 'role', 'permission', 'suspend', 'remove', 'invitation', 'access'],
    permission: 'Manage staff & permissions (usersManage). Invitations and role/scope changes are Super-Admin-only.',
    what:
      'A staff profile links a Firebase sign-in account to a role, outlets, departments and permissions. Roles are templates; permissions can be overridden per person.',
    when: ['A new employee needs access.', 'Someone changes department or outlet.', 'An employee leaves and access must be removed.'],
    prerequisites: [
      'You hold usersManage. By default this is Super Admin only.',
      'For an invitation, you have the person\'s name and email.',
      'For a role or scope change, you understand that the role resets overrides.',
    ],
    steps: [
      'Open Administration, Staff & permissions.',
      'Select Invite staff. Enter Staff name, Email address, Role template and Invitation valid for (days).',
      'Choose at least one outlet. Department admins need at least one department.',
      'Review permissions. They start from the role template. Use Reset to role if you make a mistake.',
      'Select Create invitation. Copy the link from the post-create panel. Send it to the person.',
      'The person opens the link and creates a password. The invitation is single-use and expires.',
      'To edit, open the staff row. Change Display name, Phone, Role, outlets, departments, Account active or permissions.',
      'To suspend, turn Account active off and save. Firebase sign-in may still succeed, but the app blocks the workspace.',
      'To remove, use Revoke access & remove, type DELETE and confirm. Removal keeps the Auth user but clears the profile access.',
    ],
    after:
      'The staff member sees only the permitted pages and data. Suspended staff are blocked from the workspace. Removed staff appear under Removed accounts and cannot be restored in the app.',
    mistakes: [
      'Sending an invitation link from an old message instead of the link shown in the Invitations tab or the post-create panel. Both use the /admin/join link.',
      'Changing a role and expecting overrides to remain. They reset.',
      'Suspending the last Super Admin. Self-deactivation and self-demotion are blocked; plan a second Super Admin before removing one.',
      'Deleting a staff profile in Firebase Auth only. Use the in-app removal so the profile is revoked.',
      'Trying to remove a profile without an email. Add an email first.',
    ],
    destructive:
      'Removal revokes access and cannot be restored in the app. Suspension can be reversed by reactivating the profile. Invitations cannot be resent; create a new one.',
    limitations: [
      'Invitations are single-use and expire after the chosen 1-30 days, default 7. There is no resend.',
      'Changing a role resets permission overrides and, for department roles, department scope.',
      'The edit form has no full field validation; rely on the visible values and the server rules.',
      'Removal does not delete the Firebase Authentication user.',
      'There is no restore for a removed profile.',
      'The last active Super Admin cannot be removed or deactivated.',
    ],
  },
  {
    id: 'settings',
    title: 'Change business, tax and print settings',
    category: 'Administration',
    summary: 'Business identity, tax defaults, invoice prefix and receipt paper, with two separate save actions.',
    keywords: ['settings', 'business', 'tax', 'gst', 'invoice', 'prefix', 'printer', 'receipt', 'paper'],
    permission: 'Manage business settings (settingsManage). By default only Super Admin has it.',
    what:
      'Settings stores workspace-wide business identity, tax defaults and print preferences. It is not per outlet. Business profile and printing preferences are saved separately.',
    when: ['The legal name, address or phone changes.', 'The default tax rate changes.', 'Receipt paper changes.'],
    prerequisites: ['You hold settingsManage. By default this is Super Admin only.'],
    steps: [
      'Open Business Management, Settings.',
      'Edit Business profile: Business name, Legal / invoice name, Tagline, Phone, Email, GSTIN, address, City, State, PIN, UPI ID and Receipt footer.',
      'Select Save business profile. This saves the business and tax changes together, but it does not save printing changes.',
      'Edit Tax and invoicing: Default tax rate, Invoice prefix and Selling prices include GST.',
      'Select Save business profile once after the business and tax edits.',
      'In Printing, choose Receipt paper: 80 mm thermal roll or A5 sheet. Kitchen tickets are fixed at 80 mm and packing slips at A5.',
      'Select Save printing preferences separately.',
      'Check an order receipt and invoice after saving.',
    ],
    after:
      'New products use the default tax rate. New documents use the invoice prefix and paper settings. Historic records keep their captured values.',
    mistakes: [
      'Changing the receipt paper and expecting the business save to persist it. Use the separate save button.',
      'Trying to choose kitchen or packing paper. Those sizes are fixed.',
      'Looking for a BUSY integration status. Settings does not show one.',
      'Changing the invoice prefix and expecting old invoices to change. They do not.',
    ],
    limitations: [
      'Only receipt paper is selectable. Kitchen is 80 mm and packing is A5.',
      'BUSY status exists in the data but has no Settings control.',
      'Settings is workspace-wide, not per outlet.',
      'There is no settings history screen.',
    ],
  },
  {
    id: 'security',
    title: 'Password, sign-in and account security',
    category: 'Account & support',
    summary: 'Reset a password, understand unlinked and suspended states, and protect a shared device.',
    keywords: ['password', 'login', 'sign in', 'forgot', 'reset', 'suspended', 'unlinked', 'security', 'email'],
    permission: 'Public sign-in and reset. Account administration needs a Super Admin.',
    what:
      'Sign-in uses a staff email and password. The app has a reset-link flow, a workspace gate and status screens for an unlinked or suspended profile. There is no public sign-up.',
    when: ['A staff member forgets a password.', 'A new invitation is accepted.', 'A profile is not linked.', 'A device is shared.'],
    prerequisites: ['A Firebase account exists for the email.', 'A staff profile is linked to that account, unless you are accepting an invitation.'],
    steps: [
      'Open /admin/login. Enter Email address and Password and select Sign in.',
      'If the password is forgotten, select Forgot your password? Enter the email and send the reset link.',
      'Open the email and set a new password, then return to sign in.',
      'If Account not linked appears, copy the User ID and give it to the Super Admin. Do not create a second account.',
      'If Staff access is suspended appears, ask the Super Admin to review the profile. Signing in again will not fix it.',
      'Use the account menu to sign out on a shared device.',
      'A Super Admin can change a staff sign-in email from the staff profile where that control is available.',
    ],
    after:
      'The reset link changes the password. An unlinked or suspended profile cannot enter the workspace. Access changes take effect on the next profile read.',
    mistakes: [
      'Creating a second Firebase account with a different email. It will also be unlinked and fragments history.',
      'Sharing a password instead of inviting a separate staff profile.',
      'Assuming suspension deletes the Firebase account. It does not; workspace access is blocked.',
      'Using the browser back button after sign-out on a shared device.',
    ],
    limitations: [
      'There is no in-app password change form; use the reset email.',
      'There is no self-service account linking.',
      'Suspension does not disable the Firebase Authentication credential.',
      'The app cannot recover a deleted or unlinked account without a Super Admin and technical support.',
      'Contact ' + SHIELD_SUPPORT_EMAIL + ' only for account issues the workspace owner cannot resolve.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Fix common errors',
    category: 'Account & support',
    summary: 'Permission denied, empty lists, capped data, stale records and failed operations.',
    keywords: ['error', 'troubleshoot', 'permission denied', 'empty', 'stale', 'cap', 'failed', 'retry', 'support', 'index', 'rules', 'emulator'],
    permission: 'Varies by page. Error cards usually link to the matching guide.',
    what:
      'Most errors fall into five groups: permission or scope, missing prerequisite, capped data, stale data or a rejected business rule. Read the exact message before retrying.',
    when: ['A page is missing.', 'A list is empty.', 'A save fails.', 'A total looks wrong.', 'The app shows a retry card.'],
    prerequisites: ['You know the outlet, department and action you were attempting.', 'You have the exact on-screen message.'],
    steps: [
      'Check the selected outlet in the top bar. A wrong outlet explains many empty lists.',
      'Check your role, outlets and departments on Staff & permissions. A hidden page or empty list can be a scope gap.',
      'Read the exact toast or inline error. Do not retry a payment, refund or cancellation blindly.',
      'If the message mentions a cap or incomplete data, narrow the date range or open the source register. Do not use the total for reconciliation.',
      'If a revision or stale record error appears, refresh the record and repeat the action.',
      'If a stock or negative balance error appears, check the item, movement type and current balance.',
      'If a payment is rejected, check the balance, refund cap and source status.',
      'Retry once after a network error. If it still fails, send the page name, outlet, action and exact message to ' + SHIELD_SUPPORT_EMAIL + '.',
    ],
    after:
      'You either identify a permission, scope or prerequisite issue, correct the data, or have a reproducible message for support.',
    mistakes: [
      'Repeating a payment or refund without checking whether the first request succeeded.',
      'Editing Firestore to bypass a validation error.',
      'Giving Super Admin to solve a scoping problem.',
      'Treating a capped list as complete.',
    ],
    limitations: [
      'The app has no support ticket screen or automatic diagnostic upload.',
      'Some pages collapse multiple query errors into one message.',
      'Help cannot repair Firebase configuration, indexes or security rules.',
    ],
  },
  {
    id: 'data-safety',
    title: 'Destructive actions and data safety',
    category: 'Account & support',
    summary: 'What cannot be undone, what can be corrected, and which records must never be deleted.',
    keywords: ['delete', 'cancel', 'refund', 'danger', 'undo', 'audit', 'safe', 'immutable'],
    permission: 'Varies. Destructive actions usually need a manage permission or Super Admin.',
    what:
      'The app prefers status changes, reversals and append-only records over deletion. Some actions are permanent; others are corrected with a new record.',
    when: ['Before cancelling.', 'Before refunding.', 'Before removing staff.', 'Before deleting anything in Firebase.'],
    prerequisites: ['You understand the business consequence and have the required permission.'],
    steps: [
      'For a wrong order line before completion, cancel the order and re-enter it. Orders have no priced edit.',
      'For a wrong booking line before Ready, edit the booking with a reason. Ready and later statuses are locked.',
      'For a wrong payment, record a refund or a corrective payment with a note. Payments cannot be edited or deleted.',
      'For a wrong expense, void it with a reason. Do not hard-delete it.',
      'For a wrong inventory movement, record a corrective movement or count. The ledger is append-only.',
      'For a wrong production batch, record the correction before completion where possible. Cancelled and completed tasks have no normal reopen.',
      'For a wrong delivery outcome, there is no reopen. Escalate to the owner; do not delete the delivery.',
      'For a staff member who left, suspend first. Remove only when access must be revoked permanently.',
      'Never delete orders, payments, deliveries, stock movements or revisions directly in Firestore.',
    ],
    destructive:
      'Order and booking cancellation, refunds, delivery outcomes, production cancellation, department deletion, staff removal and setup are permanent or difficult to reverse. Read the confirmation.',
    limitations: [
      'There is no recycle bin or general undo.',
      'Some destructive deletes exist only in the security rules for a Super Admin, not in the interface. Do not use them.',
      'Deleting an order does not restore stock and can orphan payment records.',
      'Removed staff cannot be restored in the app.',
      'There is no database backup or restore button in the workspace.',
    ],
  },
  {
    id: 'search-shortcuts',
    title: 'Search, filters, exports and keyboard shortcuts',
    category: 'Account & support',
    summary: 'Find records, use the command palette and know which shortcut works where.',
    keywords: ['search', 'filter', 'sort', 'keyboard', 'shortcut', 'palette', 'export', 'csv'],
    permission: 'The page you are on still controls access.',
    what:
      'List pages search and filter loaded records. CSV export writes the filtered loaded rows. The command palette jumps to pages and actions. Keyboard shortcuts are a separate cheat sheet.',
    when: ['Finding an order by number or customer.', 'Switching pages without the mouse.', 'Exporting a filtered list.'],
    prerequisites: ['The page is open and its data has loaded.'],
    steps: [
      'Use the search box on a list page. It matches the fields listed in that table, not every field in the database.',
      'Use the status, date, department and payment filters. Filters apply before CSV export.',
      'Select a column heading to sort where sorting is supported.',
      'Use Ctrl/Cmd+K or the top-bar Jump to to open the command palette. Type a page or action name and press Enter.',
      'Use / to focus the first search field on a DataTable page. It also focuses the Help centre search box.',
      'Use G then D/O/B/P/C within one second for Dashboard, Orders, Bookings, Products or Customers.',
      'Use ? for the shortcut cheat sheet and Esc to close dialogs.',
      'Use the CSV export on a list only after checking the filter and the loaded row count.',
    ],
    after:
      'The list shows the filtered loaded records. CSV contains those filtered loaded rows, not necessarily the entire server register.',
    mistakes: [
      'Expecting the command palette to search order numbers or customer names. It searches page and action labels.',
      'Using / on Dashboard or Settings and expecting focus. Only table pages and the Help search expose the target.',
      'Assuming a shortcut checks permission. G sequences can land on an access-denied page.',
      'Treating a capped list export as a full-register export.',
    ],
    limitations: [
      'Search is client-side over loaded records.',
      'The command palette does not include Help articles and hides Payments behind Record a payment.',
      'There is no global record search.',
      'The palette and shortcut trigger are hidden on small screens; keyboard shortcuts still work with a hardware keyboard.',
      'CSV exports are capped by the same loaded rows as the table.',
    ],
  },
  {
    id: 'data-limits',
    title: 'Data caps and incomplete lists',
    category: 'Account & support',
    summary: 'Every major page loads a capped set. Know the limit before trusting a total or export.',
    keywords: ['cap', 'limit', 'incomplete', '2000', '500', '600', 'pagination', 'export', 'data'],
    permission: 'Varies by page.',
    what:
      'Most pages load a fixed number of the newest records and then search, sort and paginate in the browser. A capped list is not proof that older records do not exist.',
    when: ['A total looks low.', 'An old record is missing.', 'An export seems short.', 'A page shows an incomplete-data warning.'],
    prerequisites: ['You know which page and date range you are checking.'],
    fields: [
      { label: 'Orders / bookings / payments lists', meaning: '500 loaded records each. Order detail payments 300. Booking revisions 50.' },
      { label: 'Products / customers', meaning: '500 loaded records each.' },
      { label: 'Staff / invitations', meaning: '200 staff and 100 invitations.' },
      { label: 'Production', meaning: '600 tasks and 80 history events. Sync reads up to 20,000 records per collection and fails above that.' },
      { label: 'Inventory', meaning: '600 items, 1,500 movements, 400 counts and 500 products.' },
      { label: 'Deliveries', meaning: '500 deliveries, 400 orders, 400 bookings and 80 events.' },
      { label: 'Finance', meaning: '500 orders, 500 bookings, 1,000 payments, 500 parties, 500 expenses and 200 cash sessions.' },
      { label: 'Reports', meaning: '2,000 orders, 2,000 payments and 1,000 bookings. Operational tabs: 600 production, 1,500 inventory, 500 deliveries, 500 expenses, 200 sessions, 500 parties.' },
      { label: 'Accounting export', meaning: '2,000 orders and 2,000 payments per date range.' },
    ],
    steps: [
      'Check the page count or record count before using a total.',
      'Look for a warning. Reports and Finance warn; several operational pages do not.',
      'Narrow the outlet, department or date range. There is no server-side pagination beyond the cap.',
      'For an export, split the date range until each file is below the cap.',
      'For a missing old record, search the source register or report rather than assuming deletion.',
      'Never treat a capped outstanding or statement total as authoritative for collection.',
    ],
    after:
      'You know whether the screen is complete enough for the decision. If not, narrow the scope or use a different register.',
    mistakes: [
      'Assuming a blank list means no records. It can mean no records in the loaded set or no scope.',
      'Using a capped Finance balance for a reminder.',
      'Exporting a capped report without checking the warning.',
      'Asking for more rows by refreshing. Refresh reloads the same cap.',
    ],
    limitations: [
      'There is no server-side pagination or export job for most lists.',
      'Caps are not configurable in the interface.',
      'Some pages silently hide the cap; only Reports and Finance show a warning.',
      'Department-scoped queries use the first 10 department ids.',
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
      ...article.when,
      ...article.steps,
      ...(article.prerequisites ?? []),
      ...(article.fields ?? []).flatMap((field) => [field.label, field.meaning]),
      ...(article.after ? [article.after] : []),
      ...(article.mistakes ?? []),
      ...(article.limitations ?? []),
      ...(article.pending ?? []),
      ...(article.destructive ? [article.destructive] : []),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
