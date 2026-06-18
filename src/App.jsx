import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import StudioRoute from './pages/StudioRoute';
import AuthCallback from './pages/AuthCallback';
import ShareView from './pages/ShareView';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<StudioRoute />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/share/:token" element={<ShareView />} />
      </Routes>
    </AuthProvider>
  );
}
