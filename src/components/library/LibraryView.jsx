// LibraryView — the documentation surface of the personal Pattern Library
// (S1, issue #50; PRD #48 user stories 35/39/43/44/57).
//
// One entity, two surfaces (locked decision 6): this view renders the SAME
// entities registerExtractedPattern indexed into libraryStore — the exact set
// the picker's custom family registered — so the Library and the picker can
// never disagree. Cloud-loaded entries arrive via Studio's
// loadAndRegisterExtractedPatterns; guest/session-only saves arrive via the
// stepper's registration and are fully browsable here (never a dead end).
//
// Photos: a session save carries a transient dataURL (entry.photoURL); a
// cloud row carries a private storage path resolved lazily to a short-lived
// signed URL (best-effort — failures fall back to the tile preview).
//
// Visibility is surfaced read-only, defaulting to 'private' (PRD data-safety:
// the field exists so future sharing is a flag flip, not a migration).

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { subscribeLibrary, getLibraryEntries } from '../../lib/libraryStore';
import { getPhotoURL, updateExtractedPatternMeta } from '../../lib/libraryRepository';
import { tilePlacements } from '../../lib/extraction/tileComposer';
import {
  SOURCE_TYPES,
  MATERIALS,
  SOURCE_TYPE_LABELS,
  MATERIAL_LABELS,
  labelFor,
} from '../../lib/extraction/provenanceMeta';

const PRIMARY_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-saffron text-ink hover:bg-saffron-hover disabled:opacity-40 disabled:cursor-default transition-colors duration-fast ease-out-quart';
const GHOST_BTN =
  'px-4 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart';

// The extracted-pattern tile, rendered as a real React <svg> (path data is
// validated at deserialize; no markup injection surface). S5 (issue #54):
// when the entity carries a lattice the preview TILES — a 3×3-cell window
// through the same placement source the generator uses — so the Library shows
// the pattern, not just its repeat unit (one entity, two surfaces).
function TilePreview({ tile, lattice = null, className = '' }) {
  const paths = (
    <>
      {tile.fills.map((f, i) => (
        <path key={`f${i}`} d={f.d} fill="currentColor" fillRule="evenodd" stroke="none" />
      ))}
      {tile.strokes.map((s, i) => (
        <path key={`s${i}`} d={s.d} fill="none" stroke="currentColor" strokeWidth="1" />
      ))}
    </>
  );
  if (!lattice) {
    return (
      <svg
        viewBox={`0 0 ${tile.width} ${tile.height}`}
        className={className}
        role="img"
        aria-label="Extracted pattern"
        preserveAspectRatio="xMidYMid meet"
      >
        {paths}
      </svg>
    );
  }
  const region = { width: lattice.cell.width * 3, height: lattice.cell.height * 3 };
  return (
    <svg
      viewBox={`0 0 ${region.width} ${region.height}`}
      className={className}
      role="img"
      aria-label="Extracted pattern (tiled)"
      data-testid="tiled-preview"
      preserveAspectRatio="xMidYMid meet"
    >
      {tilePlacements(lattice, region).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          {paths}
        </g>
      ))}
    </svg>
  );
}

// 📷 chip — the Library twin of PatternCard's picker badge (issue #50 AC:
// the badge is visible on BOTH surfaces).
function ExtractedBadge() {
  return (
    <span
      data-testid="extracted-badge"
      title="Extracted from a photo"
      className="inline-flex items-center gap-1 px-1.5 py-px text-[10px] leading-tight rounded-sm bg-paper/85 border border-hairline text-ink-soft"
    >
      <span aria-hidden>📷</span> Extracted
    </span>
  );
}

function VisibilityChip({ visibility }) {
  const isPrivate = visibility !== 'public';
  return (
    <span
      data-testid="visibility-chip"
      title={
        isPrivate
          ? 'Only you can see this entry (sharing arrives later)'
          : 'Visible to others'
      }
      className="inline-flex items-center gap-1 px-1.5 py-px text-[10px] leading-tight rounded-sm bg-paper-warm border border-hairline text-ink-soft capitalize"
    >
      <span aria-hidden>{isPrivate ? '🔒' : '🌐'}</span> {visibility}
    </span>
  );
}

function LibraryCard({ entry, photoURL, onOpen }) {
  const { entity } = entry;
  return (
    <button
      type="button"
      data-testid="library-card"
      onClick={() => onOpen(entity.patternId)}
      className="group flex flex-col text-left rounded-md border border-card-border bg-paper overflow-hidden hover:border-saffron transition-colors duration-fast ease-out-quart"
    >
      <div className="relative aspect-[4/3] bg-paper-warm flex items-center justify-center overflow-hidden">
        {photoURL ? (
          <img
            src={photoURL}
            alt={`Photo of ${entity.title}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <TilePreview tile={entity.tile} lattice={entity.lattice} className="max-h-full max-w-full p-3 text-ink" />
        )}
        <span className="absolute top-1.5 left-1.5">
          <ExtractedBadge />
        </span>
        {entity.favorite && (
          <span
            className="absolute top-1.5 right-1.5 text-saffron text-sm leading-none drop-shadow"
            data-testid="favorite-star"
            title="Favorite"
            aria-label="Favorite"
          >
            ★
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="text-xs font-medium text-ink truncate">{entity.title}</div>
      </div>
    </button>
  );
}

// OpenStreetMap geo link for a coordinate — read-only, opened only on click
// (never auto-fetched). Kept keyless + external so the Library view stays pure.
function mapsHref(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

// Palette facet (S9, issue #58): the extracted dominant colours as read-only
// swatch chips. Hex is validated at deserialize (/^#[0-9a-f]{6}$/) before it
// can reach a style attribute — the entity's palette is always safe here.
function PaletteSwatches({ palette }) {
  if (!palette?.length) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="palette-facet">
      <span className="text-[11px] text-ink-soft">Palette</span>
      <div className="flex flex-wrap gap-1.5">
        {palette.map((sw) => (
          <span
            key={sw.hex}
            data-testid="palette-chip"
            className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-xs border border-hairline bg-paper-warm text-[10px] text-ink-soft"
            title={`${sw.hex} · ${Math.round((sw.coverage || 0) * 100)}%`}
          >
            <span
              className="inline-block w-3 h-3 rounded-xs border border-hairline"
              style={{ backgroundColor: sw.hex }}
              aria-hidden
            />
            {sw.hex}
          </span>
        ))}
      </div>
    </div>
  );
}

// Provenance block (S8 #57 + S9 #58 / PRD story 39): the entry's captured
// context — where, when, with what, in what tradition, plus the user's note
// and tags. Every field optional; the whole block is omitted when nothing was
// recorded (never an empty-form look).
function ProvenanceMeta({ entity }) {
  const { location, captureDate, exif, sourceType, material, tradition, note, tags } = entity;
  const hasCoords =
    location && typeof location.lat === 'number' && typeof location.lng === 'number';
  const when = captureDate
    ? new Date(captureDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const hasAny =
    location || when || exif?.camera || sourceType || material || tradition || note || tags?.length;
  if (!hasAny) return null;
  return (
    <div className="flex flex-col gap-2">
      <dl
        data-testid="provenance-meta"
        className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
      >
        {location?.placeName && (
          <>
            <dt className="text-ink-soft">Place</dt>
            <dd className="text-ink">
              {location.placeName}
              {/* S8 follow-up 3: attribute a geocoded place name to OSM. */}
              {location.source === 'geocoded' && (
                <span className="text-ink-faint" data-testid="osm-credit">
                  {' '}
                  · ©{' '}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-violet hover:underline"
                  >
                    OpenStreetMap
                  </a>
                </span>
              )}
            </dd>
          </>
        )}
        {location?.address && (
          <>
            <dt className="text-ink-soft">Address</dt>
            <dd className="text-ink">{location.address}</dd>
          </>
        )}
        {hasCoords && (
          <>
            <dt className="text-ink-soft">Coordinates</dt>
            <dd className="text-ink">
              <a
                href={mapsHref(location.lat, location.lng)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-violet hover:underline"
                data-testid="location-map-link"
              >
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)} ↗
              </a>
            </dd>
          </>
        )}
        {when && (
          <>
            <dt className="text-ink-soft">Captured</dt>
            <dd className="text-ink">{when}</dd>
          </>
        )}
        {exif?.camera && (
          <>
            <dt className="text-ink-soft">Camera</dt>
            <dd className="text-ink">{exif.camera}</dd>
          </>
        )}
        {sourceType && (
          <>
            <dt className="text-ink-soft">Source</dt>
            <dd className="text-ink">{labelFor(SOURCE_TYPE_LABELS, sourceType)}</dd>
          </>
        )}
        {material && (
          <>
            <dt className="text-ink-soft">Material</dt>
            <dd className="text-ink">{labelFor(MATERIAL_LABELS, material)}</dd>
          </>
        )}
        {tradition && (
          <>
            <dt className="text-ink-soft">Tradition</dt>
            <dd className="text-ink">{tradition}</dd>
          </>
        )}
        {note && (
          <>
            <dt className="text-ink-soft">Note</dt>
            <dd className="text-ink whitespace-pre-wrap">{note}</dd>
          </>
        )}
      </dl>
      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="tag-list">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-1.5 py-0.5 rounded-xs bg-paper-warm border border-hairline text-[10px] text-ink-soft"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// S9 (issue #58 AC): metadata is editable from the entry detail view. The form
// edits title/note/tags/source/material/tradition; favorite has its own header
// toggle. Saving goes through updateExtractedPatternMeta — store-always +
// best-effort persist, so guest/session entries edit immediately too.
function MetaEditForm({ entity, onDone }) {
  const [title, setTitle] = useState(entity.title || '');
  const [note, setNote] = useState(entity.note || '');
  const [tagsText, setTagsText] = useState((entity.tags || []).join(', '));
  const [sourceType, setSourceType] = useState(entity.sourceType || '');
  const [material, setMaterial] = useState(entity.material || '');
  const [tradition, setTradition] = useState(entity.tradition || '');
  const [saving, setSaving] = useState(false);

  const field =
    'bg-paper-warm text-ink text-sm px-2.5 py-1.5 rounded-xs border border-hairline outline-none focus:border-violet';

  const save = async () => {
    setSaving(true);
    try {
      await updateExtractedPatternMeta(entity.patternId, {
        title,
        note,
        tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        sourceType: sourceType || null,
        material: material || null,
        tradition,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border border-hairline rounded-md p-3" data-testid="meta-edit-form">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Title</span>
        <input type="text" aria-label="Edit title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Note</span>
        <textarea aria-label="Edit note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} resize-y`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Tags (comma-separated)</span>
        <input type="text" aria-label="Edit tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={field} />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[11px] text-ink-soft">Source</span>
          <select aria-label="Edit source type" value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={field}>
            <option value="">—</option>
            {SOURCE_TYPES.map((v) => (
              <option key={v} value={v}>{SOURCE_TYPE_LABELS[v] || v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[11px] text-ink-soft">Material</span>
          <select aria-label="Edit material" value={material} onChange={(e) => setMaterial(e.target.value)} className={field}>
            <option value="">—</option>
            {MATERIALS.map((v) => (
              <option key={v} value={v}>{MATERIAL_LABELS[v] || v}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-soft">Tradition / style</span>
        <input type="text" aria-label="Edit tradition" value={tradition} onChange={(e) => setTradition(e.target.value)} className={field} />
      </label>
      <div className="flex gap-2">
        <button type="button" className={GHOST_BTN} onClick={onDone} disabled={saving}>Cancel</button>
        <button type="button" className={PRIMARY_BTN} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function EntryDetail({ entry, photoURL, onBack, onUseInStudio }) {
  const { entity } = entry;
  const [editing, setEditing] = useState(false);

  // Favorite toggle — persists immediately (store-always + best-effort DB).
  const toggleFavorite = () => updateExtractedPatternMeta(entity.patternId, { favorite: !entity.favorite });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" className={GHOST_BTN} onClick={onBack}>
          ← Back to Library
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-ink">{entity.title}</h3>
        <ExtractedBadge />
        <VisibilityChip visibility={entity.visibility} />
        <button
          type="button"
          data-testid="favorite-toggle"
          aria-pressed={!!entity.favorite}
          aria-label={entity.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={toggleFavorite}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-sm border transition-colors duration-fast ease-out-quart ${
            entity.favorite
              ? 'bg-saffron/15 border-saffron text-ink'
              : 'bg-paper-warm border-hairline text-ink-soft hover:text-ink'
          }`}
        >
          <span aria-hidden>{entity.favorite ? '★' : '☆'}</span>
          {entity.favorite ? 'Favorited' : 'Favorite'}
        </button>
        {!editing && (
          <button type="button" className={GHOST_BTN} onClick={() => setEditing(true)} data-testid="edit-details">
            Edit details
          </button>
        )}
      </div>

      {editing ? (
        <MetaEditForm entity={entity} onDone={() => setEditing(false)} />
      ) : (
        <>
          <ProvenanceMeta entity={entity} />
          <PaletteSwatches palette={entity.palette} />
        </>
      )}

      {/* Documentation and artifact live together (PRD story 39): source photo
          and extracted pattern side by side. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-[11px] text-ink-soft">Source photo</figcaption>
          <div className="rounded-md border border-hairline bg-paper-warm min-h-48 flex items-center justify-center overflow-hidden">
            {photoURL ? (
              <img
                src={photoURL}
                alt={`Photo of ${entity.title}`}
                className="max-h-80 w-auto object-contain"
              />
            ) : (
              <p className="text-xs text-ink-faint p-6 text-center">
                No source photo for this entry
                {entity.photoPath ? ' (photo unavailable)' : ''}.
              </p>
            )}
          </div>
        </figure>
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-[11px] text-ink-soft">Extracted pattern</figcaption>
          <div className="rounded-md border border-hairline bg-white min-h-48 flex items-center justify-center">
            <TilePreview tile={entity.tile} lattice={entity.lattice} className="max-h-80 w-auto p-4 text-[#1a1a1a]" />
          </div>
        </figure>
      </div>
      <div>
        <button
          type="button"
          className={PRIMARY_BTN}
          onClick={() => onUseInStudio(entity.patternId)}
        >
          Use in Studio
        </button>
      </div>
    </div>
  );
}

export default function LibraryView({ onClose, onUseInStudio, onNewExtraction }) {
  const entries = useSyncExternalStore(subscribeLibrary, getLibraryEntries);
  const [openId, setOpenId] = useState(null);
  // patternId -> signed URL (or null once resolution failed) for cloud photos.
  const [signedURLs, setSignedURLs] = useState({});

  // Lazily resolve signed URLs for entries that have a storage path but no
  // transient session photoURL. `requestedRef` tracks every id we have ever
  // fired for (in-flight AND resolved), so each entry is requested exactly
  // once — a sibling's resolution re-rendering the grid never re-fires a
  // still-pending request. `mountedRef` only guards the final setState after
  // unmount; effect re-runs must NOT cancel in-flight resolutions.
  const requestedRef = useRef(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    // Re-arm on every (re)mount — StrictMode mounts, cleans up, and mounts
    // again, and the ref must not stay false after that rehearsal unmount.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    for (const entry of entries) {
      const { patternId, photoPath } = entry.entity;
      if (entry.photoURL || !photoPath) continue;
      if (requestedRef.current.has(patternId)) continue;
      requestedRef.current.add(patternId);
      getPhotoURL(photoPath).then((url) => {
        if (mountedRef.current) setSignedURLs((m) => ({ ...m, [patternId]: url }));
      });
    }
  }, [entries]);

  const photoFor = (entry) =>
    entry.photoURL ?? signedURLs[entry.entity.patternId] ?? null;

  // Escape backs out one level: detail → grid, grid → closed. The branch is
  // decided OUTSIDE any setState updater (updaters must stay pure — StrictMode
  // double-invokes them, which would double-fire onClose); the effect simply
  // re-subscribes when openId changes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (openId !== null) setOpenId(null);
      else onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, onClose]);

  const openEntry = openId
    ? entries.find((e) => e.entity.patternId === openId) ?? null
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center pt-10 px-4">
      <div className="bg-panel border border-card-border rounded-lg w-full max-w-[1120px] max-h-[88vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink">Pattern Library</h2>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Ornament you have captured · {entries.length}{' '}
              {entries.length === 1 ? 'entry' : 'entries'} · private to you
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onNewExtraction && (
              <button type="button" className={PRIMARY_BTN} onClick={onNewExtraction}>
                + New from Photo
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-ink-soft hover:text-ink text-xl leading-none px-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {openEntry ? (
            <EntryDetail
              entry={openEntry}
              photoURL={photoFor(openEntry)}
              onBack={() => setOpenId(null)}
              onUseInStudio={onUseInStudio}
            />
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm text-ink-soft max-w-md">
                Your library is empty. Photograph an ornament — tilework, tracery, a
                carved door — and extract it into a pattern you can place, tile, and cut.
              </p>
              {onNewExtraction && (
                <button type="button" className={PRIMARY_BTN} onClick={onNewExtraction}>
                  + New from Photo
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {entries.map((entry) => (
                <LibraryCard
                  key={entry.entity.patternId}
                  entry={entry}
                  photoURL={photoFor(entry)}
                  onOpen={setOpenId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
