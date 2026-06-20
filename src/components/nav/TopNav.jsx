import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isPlatformAdmin } from '../../lib/org/platformService';
import { listMyAdminOrgs } from '../../lib/org/membershipService';
import { useAuth } from '../../lib/AuthContext';

export default function TopNav() {
  const { user } = useAuth();
  const userId = user?.id;
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([isPlatformAdmin(), listMyAdminOrgs(userId)])
      .then(([platformAdmin, adminOrgs]) => {
        if (!alive) return;
        setShowAdmin(platformAdmin || (adminOrgs?.length || 0) > 0);
      })
      .catch(() => {
        // Fail closed: on any gate error, hide the Admin tab rather than
        // leaving an unhandled rejection.
        if (alive) setShowAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <nav aria-label="Primary" className="flex items-center gap-4 px-4 py-2">
      <Link to="/" className="font-semibold">
        Naqsha
      </Link>
      {showAdmin && (
        <Link to="/admin" className="ml-auto">
          Admin
        </Link>
      )}
    </nav>
  );
}
