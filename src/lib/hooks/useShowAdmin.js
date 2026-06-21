import { useEffect, useState } from 'react';
import { isPlatformAdmin } from '../org/platformService';
import { listMyAdminOrgs } from '../org/membershipService';
import { useAuth } from '../AuthContext';

// Whether the current user should see an Admin entry point: true for platform
// admins or anyone who administers at least one org. Extracted from TopNav so the
// studio's own chrome (desktop MenuBar, MobileStudio header) can show the same
// Admin link now that TopNav no longer renders over the studio route.
//
// Fails closed: any gate error hides Admin rather than leaking an entry point or
// leaving an unhandled rejection.
export default function useShowAdmin() {
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
        if (alive) setShowAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return showAdmin;
}
