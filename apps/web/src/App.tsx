import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { LogisticsPage } from './pages/logistics/LogisticsPage';
import { MasterDataPage } from './pages/master-data/MasterDataPage';
import { PurchaseOrderDetailPage } from './pages/purchasing/PurchaseOrderDetailPage';
import { PurchaseOrdersPage } from './pages/purchasing/PurchaseOrdersPage';
import { RequisitionDetailPage } from './pages/requisitions/RequisitionDetailPage';
import { RequisitionFormPage } from './pages/requisitions/RequisitionFormPage';
import { RequisitionsPage } from './pages/requisitions/RequisitionsPage';
import { RfxDetailPage } from './pages/sourcing/RfxDetailPage';
import { SourcingPage } from './pages/sourcing/SourcingPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="master-data" element={<MasterDataPage />} />
          <Route path="logistics" element={<LogisticsPage />} />
          <Route path="sourcing" element={<SourcingPage />} />
          <Route path="sourcing/rfx/:id" element={<RfxDetailPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="requisitions" element={<RequisitionsPage />} />
          <Route path="requisitions/new" element={<RequisitionFormPage />} />
          <Route path="requisitions/:id" element={<RequisitionDetailPage />} />
          <Route path="requisitions/:id/edit" element={<RequisitionFormPage />} />
          <Route
            path="approvals"
            element={<RequisitionsPage key="approvals" initialScope="awaiting-my-approval" />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
