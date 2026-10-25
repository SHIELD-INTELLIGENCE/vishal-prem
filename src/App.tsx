import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/auth/AuthProvider'
import { WorkspaceProvider } from '@/auth/WorkspaceProvider'
import { RequireAuth, RequirePermission } from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { WorkspaceGate } from '@/components/layout/WorkspaceGate'
import { ADMIN_BASE, ADMIN_FORGOT_PASSWORD, ADMIN_JOIN, ADMIN_LOGIN, ADMIN_SETUP } from '@/routing'
import type { PermissionKey } from '@/types/models'
import { LandingPage } from '@/features/public/LandingPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { JoinPage } from '@/features/auth/JoinPage'
import { SetupPage } from '@/features/auth/SetupPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { OrderDetailPage } from '@/features/orders/OrderDetailPage'
import { OrderFormPage } from '@/features/orders/OrderFormPage'
import { BookingsPage } from '@/features/bookings/BookingsPage'
import { BookingDetailPage } from '@/features/bookings/BookingDetailPage'
import { BookingFormPage } from '@/features/bookings/BookingFormPage'
import { BookingEditPage } from '@/features/bookings/BookingEditPage'
import { PaymentsPage } from '@/features/payments/PaymentsPage'
import { ProductionPage } from '@/features/production/ProductionPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { DeliveriesPage } from '@/features/deliveries/DeliveriesPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage'
import { CustomerFormPage } from '@/features/customers/CustomerFormPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { ProductDetailPage } from '@/features/products/ProductDetailPage'
import { ProductFormPage } from '@/features/products/ProductFormPage'
import { DepartmentsPage } from '@/features/admin/DepartmentsPage'
import { DepartmentWorkspacePage } from '@/features/departments/DepartmentWorkspacePage'
import { OutletsPage } from '@/features/admin/OutletsPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { BusinessReportsPage } from '@/features/reports/BusinessReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { BusyPage } from '@/features/busy/BusyPage'
import { HelpPage } from '@/features/help/HelpPage'
import { OrderPrintPage } from '@/features/print/OrderPrintPage'
import { BookingPrintPage } from '@/features/print/BookingPrintPage'
import { PaymentPrintPage } from '@/features/print/PaymentPrintPage'
import { LabelPrintSetupPage } from '@/features/labels/LabelPrintSetupPage'
import { LabelPrintPage } from '@/features/labels/LabelPrintPage'
import { LabelsPage } from '@/features/labels/LabelsPage'
import { LabelReconciliationPage } from '@/features/labels/LabelReconciliationPage'
import { PurchasesPage } from '@/features/purchases/PurchasesPage'
import { PurchaseFormPage } from '@/features/purchases/PurchaseFormPage'
import { NotFoundPage } from '@/features/NotFoundPage'

function Guarded({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  return <RequirePermission permission={permission}>{children}</RequirePermission>
}

function AppShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

/**
 * The route tree, exported separately from the providers so it can be rendered
 * under a memory router in tests.
 *
 * `/` is public. Everything management-related is under `/admin`; the auth
 * screens and first-run setup are admin paths too, so the public site never
 * hosts an authentication form.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public website */}
      <Route path="/" element={<LandingPage />} />

      {/* Admin access screens (public, but under /admin) */}
      <Route path={ADMIN_LOGIN} element={<LoginPage />} />
      <Route path={ADMIN_FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
      <Route path={`${ADMIN_JOIN}/:token`} element={<JoinPage />} />
      <Route
        path={ADMIN_SETUP}
        element={
          <RequireAuth>
            <SetupPage />
          </RequireAuth>
        }
      />

      {/* Protected management application */}
      <Route
        element={
          <RequireAuth>
            <WorkspaceGate />
          </RequireAuth>
        }
      >
        <Route
          path={`${ADMIN_BASE}/print/order/:id/:doc`}
          element={
            <Guarded permission="ordersView">
              <OrderPrintPage />
            </Guarded>
          }
        />
        <Route
          path={`${ADMIN_BASE}/print/booking/:id/:doc`}
          element={
            <Guarded permission="bookingsView">
              <BookingPrintPage />
            </Guarded>
          }
        />
        <Route
          path={`${ADMIN_BASE}/print/payment/:id`}
          element={
            <Guarded permission="paymentsView">
              <PaymentPrintPage />
            </Guarded>
          }
        />
        <Route
          path={`${ADMIN_BASE}/print/labels/:id`}
          element={
            <Guarded permission="labelsView">
              <LabelPrintPage />
            </Guarded>
          }
        />

        <Route path={ADMIN_BASE} element={<AppShellLayout />}>
          <Route
            index
            element={
              <Guarded permission="dashboardView">
                <DashboardPage />
              </Guarded>
            }
          />

          <Route
            path="orders"
            element={
              <Guarded permission="ordersView">
                <OrdersPage />
              </Guarded>
            }
          />
          <Route
            path="orders/new"
            element={
              <Guarded permission="ordersManage">
                <OrderFormPage />
              </Guarded>
            }
          />
          <Route
            path="orders/:id"
            element={
              <Guarded permission="ordersView">
                <OrderDetailPage />
              </Guarded>
            }
          />

          <Route
            path="bookings"
            element={
              <Guarded permission="bookingsView">
                <BookingsPage />
              </Guarded>
            }
          />
          <Route
            path="bookings/new"
            element={
              <Guarded permission="bookingsManage">
                <BookingFormPage />
              </Guarded>
            }
          />
          <Route
            path="bookings/:id"
            element={
              <Guarded permission="bookingsView">
                <BookingDetailPage />
              </Guarded>
            }
          />
          <Route
            path="bookings/:id/edit"
            element={
              <Guarded permission="bookingsManage">
                <BookingEditPage />
              </Guarded>
            }
          />

          <Route
            path="payments"
            element={
              <Guarded permission="paymentsView">
                <PaymentsPage />
              </Guarded>
            }
          />

          <Route
            path="customers"
            element={
              <Guarded permission="customersView">
                <CustomersPage />
              </Guarded>
            }
          />
          <Route
            path="customers/new"
            element={
              <Guarded permission="customersManage">
                <CustomerFormPage />
              </Guarded>
            }
          />
          <Route
            path="customers/:id"
            element={
              <Guarded permission="customersView">
                <CustomerDetailPage />
              </Guarded>
            }
          />
          <Route
            path="customers/:id/edit"
            element={
              <Guarded permission="customersManage">
                <CustomerFormPage />
              </Guarded>
            }
          />

          <Route
            path="products"
            element={
              <Guarded permission="productsView">
                <ProductsPage />
              </Guarded>
            }
          />
          <Route
            path="products/new"
            element={
              <Guarded permission="productsManage">
                <ProductFormPage />
              </Guarded>
            }
          />
          <Route
            path="products/:id"
            element={
              <Guarded permission="productsView">
                <ProductDetailPage />
              </Guarded>
            }
          />
          <Route
            path="products/:id/edit"
            element={
              <Guarded permission="productsManage">
                <ProductFormPage />
              </Guarded>
            }
          />

          <Route
            path="departments"
            element={
              <Guarded permission="departmentsManage">
                <DepartmentsPage />
              </Guarded>
            }
          />
          <Route
            path="departments/:departmentId"
            element={
              <Guarded permission="dashboardView">
                <DepartmentWorkspacePage />
              </Guarded>
            }
          />
          <Route
            path="outlets"
            element={
              <Guarded permission="outletsManage">
                <OutletsPage />
              </Guarded>
            }
          />
          <Route
            path="users"
            element={
              <Guarded permission="usersManage">
                <UsersPage />
              </Guarded>
            }
          />
          <Route
            path="production"
            element={
              <Guarded permission="productionView">
                <ProductionPage />
              </Guarded>
            }
          />
          <Route
            path="inventory"
            element={
              <Guarded permission="inventoryView">
                <InventoryPage />
              </Guarded>
            }
          />
          <Route
            path="labels/items"
            element={
              <Guarded permission="labelsView">
                <LabelPrintSetupPage jobType="item" />
              </Guarded>
            }
          />
          <Route
            path="labels/accounts"
            element={
              <Guarded permission="labelsView">
                <LabelPrintSetupPage jobType="account" />
              </Guarded>
            }
          />
          <Route
            path="labels/usage"
            element={
              <Guarded permission="labelsView">
                <LabelsPage />
              </Guarded>
            }
          />
          <Route
            path="labels/reconciliation"
            element={
              <Guarded permission="labelsView">
                <LabelReconciliationPage />
              </Guarded>
            }
          />
          <Route
            path="purchases"
            element={
              <Guarded permission="purchasesView">
                <PurchasesPage />
              </Guarded>
            }
          />
          <Route
            path="purchases/new"
            element={
              <Guarded permission="purchasesManage">
                <PurchaseFormPage />
              </Guarded>
            }
          />
          <Route
            path="deliveries"
            element={
              <Guarded permission="deliveryView">
                <DeliveriesPage />
              </Guarded>
            }
          />
          <Route
            path="finance"
            element={
              <Guarded permission="financeView">
                <FinancePage />
              </Guarded>
            }
          />
          <Route
            path="reports"
            element={
              <Guarded permission="reportsView">
                <ReportsPage />
              </Guarded>
            }
          />
          <Route
            path="reports/business"
            element={
              <Guarded permission="reportsView">
                <BusinessReportsPage />
              </Guarded>
            }
          />
          <Route
            path="busy"
            element={
              <Guarded permission="busyView">
                <BusyPage />
              </Guarded>
            }
          />
          <Route
            path="settings"
            element={
              <Guarded permission="settingsManage">
                <SettingsPage />
              </Guarded>
            }
          />
          <Route
            path="help"
            element={
              <Guarded permission="dashboardView">
                <HelpPage />
              </Guarded>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      {/* Unknown public paths and any admin path outside the guarded tree. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRoutes />

          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              className: 'font-sans text-sm',
            }}
          />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
