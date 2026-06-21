import { Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import TopNav from './components/nav/TopNav';
import StudioRoute from './pages/StudioRoute';
import AuthCallback from './pages/AuthCallback';
import ShareView from './pages/ShareView';
import AdminPage from './pages/AdminPage';
import OrgRoute from './pages/org/OrgRoute';
import OrgSubmitPage from './pages/org/OrgSubmitPage';
import OrgAdminPage from './pages/org/OrgAdminPage';

// Layout for every route EXCEPT the studio: renders the persistent TopNav above
// the routed page. The studio ("/") deliberately opts out — its own chrome
// (desktop MenuBar brand + Admin, MobileStudio header) reproduces TopNav, so the
// standalone bar there was pure duplication and wasted a full row of height.
function NavLayout() {
  return (
    <>
      <TopNav />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<StudioRoute />} />
        <Route element={<NavLayout />}>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/share/:token" element={<ShareView />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/o/:slug" element={<OrgRoute />}>
            <Route index element={<OrgSubmitPage />} />
            <Route path="admin" element={<OrgAdminPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
