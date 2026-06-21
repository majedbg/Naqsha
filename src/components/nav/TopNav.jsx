import { Link } from 'react-router-dom';
import useShowAdmin from '../../lib/hooks/useShowAdmin';

export default function TopNav() {
  const showAdmin = useShowAdmin();

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
