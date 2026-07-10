import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import useMaterialEvaluations from "../lib/hooks/useMaterialEvaluations";

// EvaluationsPage — material-evaluation slice 1 (/evaluations)
//
// The review view (docs/material-evaluation-VISION.md "The UX in one image"):
// every submission listed as the keystone side-by-side — the maker's photo of
// their Sheet on the left, the render screenshot of the same Material
// Archetype on the right. OWNER-ONLY in this slice: you review your own
// submissions (the community gallery / aggregation reads are open vision
// questions — DECISIONS-DRAFT). Images arrive as short-lived signed URLs from
// the private bucket; a row whose signing failed stays listed with
// placeholders so its metadata is still reviewable.

function Pane({ url, alt, testId, label }) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <figcaption className="text-xs font-medium text-ink-soft">{label}</figcaption>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-paper-warm">
        {url ? (
          <img data-testid={testId} src={url} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <span className="px-3 text-center text-xs text-ink-soft/60">Image unavailable</span>
        )}
      </div>
    </figure>
  );
}

export default function EvaluationsPage() {
  const { user, signIn } = useAuth();
  const { evaluations, loading, error } = useMaterialEvaluations(user);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Material evaluations</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your side-by-side submissions: a photo of your physical sheet next to
          the 3D preview render of the same material.
        </p>
      </header>

      {!user && (
        <div className="rounded-md border border-ink/10 bg-paper-warm p-6 text-sm text-ink-soft">
          <button type="button" onClick={() => signIn?.()} className="underline hover:text-ink">
            Sign in
          </button>{" "}
          to review your material evaluations.
        </div>
      )}

      {user && error && (
        <p data-testid="evaluations-error" className="mb-4 text-sm text-red-600">
          Couldn&apos;t load evaluations — {error.message}
        </p>
      )}

      {user && loading && (
        <p data-testid="evaluations-loading" className="text-sm text-ink-soft">
          Loading your evaluations…
        </p>
      )}

      {user && !loading && !error && evaluations.length === 0 && (
        <div
          data-testid="evaluations-empty"
          className="rounded-md border border-dashed border-ink/20 bg-paper-warm p-6 text-sm text-ink-soft"
        >
          No evaluations yet. In the{" "}
          <Link to="/" className="underline hover:text-ink">
            studio
          </Link>
          , pick a material in the Material lens, open the 3D preview, and use
          “Evaluate material” to pair a render with a photo of your sheet.
        </div>
      )}

      <ul className="flex flex-col gap-6">
        {user &&
          evaluations.map((e) => (
            <li
              key={e.id}
              data-testid="evaluation-row"
              className="rounded-lg border border-ink/10 bg-paper p-4"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-ink">{e.materialName}</span>{" "}
                  <span className="font-mono text-xs text-ink-soft">{e.archetype}</span>
                </div>
                <time className="text-xs text-ink-soft" dateTime={e.createdAt}>
                  {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ""}
                </time>
              </div>
              <div className="flex gap-3">
                <Pane
                  url={e.photoUrl}
                  alt={`Your sheet — ${e.materialName}`}
                  testId={`evaluation-photo-${e.id}`}
                  label="Your sheet"
                />
                <Pane
                  url={e.renderUrl}
                  alt={`Preview render — ${e.materialName}`}
                  testId={`evaluation-render-${e.id}`}
                  label="Preview render"
                />
              </div>
              {e.note && <p className="mt-2 text-xs text-ink-soft">{e.note}</p>}
            </li>
          ))}
      </ul>
    </main>
  );
}
