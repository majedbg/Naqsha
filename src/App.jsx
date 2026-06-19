import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import StudioRoute from './pages/StudioRoute';
import AuthCallback from './pages/AuthCallback';
import ShareView from './pages/ShareView';
import OrgRoute from './pages/org/OrgRoute';
import OrgSubmitPage from './pages/org/OrgSubmitPage';
import OrgAdminPage from './pages/org/OrgAdminPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<StudioRoute />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/share/:token" element={<ShareView />} />
        <Route path="/o/:slug" element={<OrgRoute />}>
          <Route index element={<OrgSubmitPage />} />
          <Route path="admin" element={<OrgAdminPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
