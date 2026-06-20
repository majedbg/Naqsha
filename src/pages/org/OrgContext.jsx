import { createContext, useContext, useState, useEffect } from "react";
import { getOrgBySlug } from "../../lib/org/orgService";

const OrgContext = createContext(null);

export function OrgProvider({ slug, children }) {
  // Keyed by slug so a slug change re-enters the loading state (org=null,
  // notFound=false) without a synchronous setState in the effect body.
  const [state, setState] = useState({
    slug,
    org: null,
    loading: true,
    notFound: false,
  });

  useEffect(() => {
    let mounted = true;
    getOrgBySlug(slug)
      .then((data) => {
        if (!mounted) return;
        setState({
          slug,
          org: data ?? null,
          loading: false,
          notFound: !data,
        });
      })
      .catch(() => {
        if (mounted) {
          setState({ slug, org: null, loading: false, notFound: true });
        }
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  // If the slug prop changed before its load resolved, present loading for the
  // new slug rather than stale data from the previous one.
  const fresh =
    state.slug === slug
      ? state
      : { slug, org: null, loading: true, notFound: false };

  const value = {
    org: fresh.org,
    loading: fresh.loading,
    notFound: fresh.notFound,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
