import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) {
      navigate('/', { replace: true });
      return;
    }

    // Supabase reads the access_token / refresh_token from the URL hash
    // and exchanges them for a session. Wait for that to complete.
    supabase.auth.getSession().then(() => {
      navigate('/', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="h-screen bg-surface flex items-center justify-center">
      <p className="text-sm text-ink-soft">Signing in...</p>
    </div>
  );
}
