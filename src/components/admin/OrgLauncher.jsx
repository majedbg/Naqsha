import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyAdminOrgs } from '../../lib/org/membershipService';
import { useAuth } from '../../lib/AuthContext';

export default function OrgLauncher({ userId: userIdProp }) {
  const { user } = useAuth();
  // Props win for tests; fall back to the authenticated user in real use.
  const userId = userIdProp ?? user?.id;
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listMyAdminOrgs(userId).then(
      (result) => {
        if (!active) return;
        setOrgs(result || []);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div>
      <h2>Your organizations</h2>
      {loading ? (
        <p>Loading your organizations…</p>
      ) : error ? (
        <p>Sorry, we couldn&apos;t load your organizations.</p>
      ) : orgs.length === 0 ? (
        <p>You don&apos;t administer any organizations.</p>
      ) : (
        <ul>
          {orgs.map((org) => (
            <li key={org.id}>
              <Link to={`/o/${org.slug}/admin`}>{org.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
