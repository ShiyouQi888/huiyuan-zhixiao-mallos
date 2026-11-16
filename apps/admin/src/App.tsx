import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { canAccessAdminPath, getAdminRole } from './api';

const Approvals = lazy(() => import('./pages/Approvals').then((module) => ({ default: module.Approvals })));
const Assets = lazy(() => import('./pages/Assets').then((module) => ({ default: module.Assets })));
const Audit = lazy(() => import('./pages/Audit').then((module) => ({ default: module.Audit })));
const Bonuses = lazy(() => import('./pages/Bonuses').then((module) => ({ default: module.Bonuses })));
const Categories = lazy(() => import('./pages/Categories').then((module) => ({ default: module.Categories })));
const Catalog = lazy(() => import('./pages/Catalog').then((module) => ({ default: module.Catalog })));
const FileManager = lazy(() => import('./pages/FileManager').then((module) => ({ default: module.FileManager })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Features = lazy(() => import('./pages/Features').then((module) => ({ default: module.Features })));
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const Members = lazy(() => import('./pages/Members').then((module) => ({ default: module.Members })));
const Orders = lazy(() => import('./pages/Orders').then((module) => ({ default: module.Orders })));
const Reports = lazy(() => import('./pages/Reports').then((module) => ({ default: module.Reports })));
const Risk = lazy(() => import('./pages/Risk').then((module) => ({ default: module.Risk })));
const Ranks = lazy(() => import('./pages/Ranks').then((module) => ({ default: module.Ranks })));
const Settlements = lazy(() => import('./pages/Settlements').then((module) => ({ default: module.Settlements })));
const SystemSettings = lazy(() => import('./pages/SystemSettings').then((module) => ({ default: module.SystemSettings })));

function Protected() {
  const token = localStorage.getItem('solar_admin_token');
  if (!token) return <Navigate to="/login" replace />;
  const role = getAdminRole();
  const { pathname } = useLocation();
  if (!role) return <Navigate to="/login" replace />;
  if (!canAccessAdminPath(pathname, role)) {
    return <Navigate to={role === 'SUPPORT' ? '/members' : '/'} replace />;
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-surface-950 text-sm text-slate-500">页面加载中…</div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/bonuses" element={<Bonuses />} />
        <Route path="/features" element={<Features />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/files" element={<FileManager />} />
        <Route path="/ranks" element={<Ranks />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/risk" element={<Risk />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/system" element={<SystemSettings />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/approvals" element={<Approvals />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
