// @vitest-environment jsdom
//
// LibraryView (S1, issue #50) — the documentation surface of the Pattern
// Library. Card grid of saved extractions → entry detail (source photo +
// extracted pattern side by side, visibility) → "Use in Studio".
//
// The store + entity layers are REAL (one entity, two surfaces: entries come
// from the same registerExtractedPattern write path the picker uses); only the
// supabase-backed photo-URL signer is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ getPhotoURL: vi.fn(), updateExtractedPatternMeta: vi.fn() }));

vi.mock('../../lib/libraryRepository', () => ({
  getPhotoURL: mocks.getPhotoURL,
  updateExtractedPatternMeta: mocks.updateExtractedPatternMeta,
}));

import LibraryView from './LibraryView';
import { makeExtractedPattern } from '../../lib/extraction/extractedPattern';
import { addLibraryEntry, clearLibraryEntries } from '../../lib/libraryStore';

const TILE = {
  width: 20,
  height: 20,
  fills: [{ d: 'M2 2 L18 2 L18 18 L2 18 Z', role: 'engrave' }],
  strokes: [],
};

const entity = (patternId, title, photoPath = null) =>
  makeExtractedPattern({ patternId, title, tile: TILE, photoPath });

function renderView(props = {}) {
  return render(
    <LibraryView
      onClose={() => {}}
      onUseInStudio={() => {}}
      onNewExtraction={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  clearLibraryEntries();
  mocks.getPhotoURL.mockReset().mockResolvedValue(null);
  mocks.updateExtractedPatternMeta.mockReset().mockResolvedValue({ persisted: true });
});

afterEach(() => clearLibraryEntries());

// S5 (issue #54): a lattice-bearing entry previews TILED — a 3×3-cell window
// through the same placement source the generator uses — on both the card and
// the detail view (one entity, two surfaces).
describe('LibraryView — tiled preview (S5)', () => {
  const LATTICE = {
    t1: [20, 0],
    t2: [0, 20],
    cell: { width: 20, height: 20 },
    type: 'square',
    confidence: 0.9,
  };

  it('tiles the card preview 3×3 when the entity carries a lattice', () => {
    addLibraryEntry(
      makeExtractedPattern({ patternId: 'extracted-lv-t', title: 'Tiled', tile: TILE, lattice: LATTICE })
    );
    renderView();
    const svg = screen.getByTestId('tiled-preview');
    expect(svg).toHaveAttribute('viewBox', '0 0 60 60');
    expect(svg.querySelectorAll('g')).toHaveLength(9);
    expect(svg.querySelectorAll('path')).toHaveLength(9); // 1 fill × 9 copies
  });

  it('keeps the single-tile preview for lattice-less entries (floor unchanged)', () => {
    addLibraryEntry(entity('extracted-lv-s', 'Single'));
    renderView();
    expect(screen.queryByTestId('tiled-preview')).toBeNull();
    expect(screen.getByRole('img', { name: 'Extracted pattern' })).toBeInTheDocument();
  });

  it('tiles the detail-view preview too', () => {
    addLibraryEntry(
      makeExtractedPattern({ patternId: 'extracted-lv-t2', title: 'Tiled detail', tile: TILE, lattice: LATTICE })
    );
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    expect(screen.getAllByTestId('tiled-preview').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LibraryView — card grid', () => {
  it('renders saved entries as cards, newest first, each with the 📷 Extracted badge', () => {
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'), { createdAt: '2026-06-01T00:00:00Z' });
    addLibraryEntry(entity('extracted-lv-b', 'Carved door'), { createdAt: '2026-07-01T00:00:00Z' });
    renderView();
    const cards = screen.getAllByTestId('library-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Carved door')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Uppsala ceiling')).toBeInTheDocument();
    cards.forEach((c) => {
      expect(within(c).getByTestId('extracted-badge')).toHaveTextContent('Extracted');
    });
  });

  it('shows the session photo on the card when the entry carries a transient photoURL', () => {
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'), {
      photoURL: 'data:image/png;base64,sessionphoto',
    });
    renderView();
    const img = screen.getByRole('img', { name: /photo of uppsala ceiling/i });
    expect(img).toHaveAttribute('src', 'data:image/png;base64,sessionphoto');
    expect(mocks.getPhotoURL).not.toHaveBeenCalled();
  });

  it('resolves a signed URL for cloud photos, and falls back to the tile preview without one', async () => {
    mocks.getPhotoURL.mockResolvedValue('https://cdn.test/signed.png');
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling', 'u1/extracted-lv-a.png'));
    addLibraryEntry(entity('extracted-lv-b', 'Guest tile')); // no photo at all
    renderView();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /photo of uppsala ceiling/i })).toHaveAttribute(
        'src',
        'https://cdn.test/signed.png'
      )
    );
    expect(mocks.getPhotoURL).toHaveBeenCalledWith('u1/extracted-lv-a.png');
    // The photo-less entry still renders — tile preview, never a dead end.
    const guestCard = screen
      .getAllByTestId('library-card')
      .find((c) => within(c).queryByText('Guest tile'));
    expect(guestCard).toBeTruthy();
    expect(within(guestCard).getByRole('img', { name: /extracted pattern/i })).toBeInTheDocument();
  });

  it('shows an empty state with a "+ New from Photo" path when there are no entries', () => {
    const onNewExtraction = vi.fn();
    renderView({ onNewExtraction });
    expect(screen.getByText(/library is empty/i)).toBeInTheDocument();
    // "+ New from Photo" exists in the header AND the empty state; both open
    // the extraction stepper.
    const newButtons = screen.getAllByRole('button', { name: /new from photo/i });
    expect(newButtons).toHaveLength(2);
    newButtons.forEach((b) => fireEvent.click(b));
    expect(onNewExtraction).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn();
    renderView({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // Review follow-up: Escape must fire onClose exactly once even under
  // StrictMode's double-invoked updaters (the side-effect must not live
  // inside a setState updater).
  it('Escape closes exactly once under StrictMode', () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <LibraryView onClose={onClose} onUseInStudio={() => {}} onNewExtraction={() => {}} />
      </StrictMode>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Review follow-up: each cloud photo is signed exactly once — a sibling's
  // resolution re-render must not re-fire the still-pending entry's request.
  it('requests each photo signature once, even while a sibling is in flight', async () => {
    let resolveSlow;
    mocks.getPhotoURL.mockImplementation((path) =>
      path === 'u1/slow.png'
        ? new Promise((r) => {
            resolveSlow = r;
          })
        : Promise.resolve('https://cdn.test/fast.png')
    );
    addLibraryEntry(entity('extracted-lv-a', 'Slow photo', 'u1/slow.png'));
    addLibraryEntry(entity('extracted-lv-b', 'Fast photo', 'u1/fast.png'));
    renderView();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /photo of fast photo/i })).toBeInTheDocument()
    );
    // The fast resolution re-rendered the grid; the pending entry must NOT
    // have been requested again.
    expect(mocks.getPhotoURL).toHaveBeenCalledTimes(2);
    resolveSlow('https://cdn.test/slow.png');
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /photo of slow photo/i })).toBeInTheDocument()
    );
    expect(mocks.getPhotoURL).toHaveBeenCalledTimes(2);
  });
});

describe('LibraryView — entry detail', () => {
  it('opens a card into a detail view with source photo and extracted pattern together', async () => {
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'), {
      photoURL: 'data:image/png;base64,sessionphoto',
    });
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    // Detail: title heading, photo AND pattern side by side.
    expect(screen.getByRole('heading', { name: 'Uppsala ceiling' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /photo of uppsala ceiling/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /extracted pattern/i })).toBeInTheDocument();
  });

  it('surfaces visibility, defaulting to Private', () => {
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'));
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    expect(screen.getByTestId('visibility-chip')).toHaveTextContent(/private/i);
  });

  it('shows a no-photo placeholder for entries without any photo', () => {
    addLibraryEntry(entity('extracted-lv-a', 'Guest tile'));
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    expect(screen.getByText(/no source photo/i)).toBeInTheDocument();
  });

  it('"Use in Studio" reports the entry\'s patternId', () => {
    const onUseInStudio = vi.fn();
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'));
    renderView({ onUseInStudio });
    fireEvent.click(screen.getByTestId('library-card'));
    fireEvent.click(screen.getByRole('button', { name: /use in studio/i }));
    expect(onUseInStudio).toHaveBeenCalledWith('extracted-lv-a');
  });

  it('backs out of the detail to the grid; Escape in detail also goes back, not closed', () => {
    const onClose = vi.fn();
    addLibraryEntry(entity('extracted-lv-a', 'Uppsala ceiling'));
    renderView({ onClose });
    fireEvent.click(screen.getByTestId('library-card'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('library-card')).toBeInTheDocument(); // back on the grid
    fireEvent.click(screen.getByTestId('library-card'));
    fireEvent.click(screen.getByRole('button', { name: /back to library/i }));
    expect(screen.getByTestId('library-card')).toBeInTheDocument();
  });
});

// S8 (issue #57): the entry detail surfaces captured provenance — place,
// address, coordinates (as an external map link), capture date, and camera.
// Every field optional; the block is omitted entirely when nothing exists.
describe('LibraryView — provenance / location detail (S8)', () => {
  const withMeta = (overrides) =>
    makeExtractedPattern({
      patternId: 'extracted-lv-loc',
      title: 'Uppsala vault',
      tile: TILE,
      location: {
        lat: 59.8586,
        lng: 17.6389,
        placeName: 'Uppsala, Sweden',
        address: 'Uppsala Cathedral, Sweden',
        source: 'geocoded',
      },
      captureDate: '2026-06-28T12:32:10.000Z',
      exif: { camera: 'Apple iPhone 15 Pro' },
      ...overrides,
    });

  it('renders place, address, coordinates, date, and camera in the detail', () => {
    addLibraryEntry(withMeta());
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    const meta = screen.getByTestId('provenance-meta');
    expect(meta.textContent).toMatch(/Uppsala, Sweden/);
    expect(meta.textContent).toMatch(/Uppsala Cathedral/);
    expect(meta.textContent).toMatch(/June 28, 2026/);
    expect(meta.textContent).toMatch(/iPhone 15 Pro/);
    // Coordinates open OpenStreetMap in a new tab (read-only, click-gated).
    const link = screen.getByTestId('location-map-link');
    expect(link.getAttribute('href')).toContain('mlat=59.8586');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows a place-only manual location without coordinates', () => {
    addLibraryEntry(
      makeExtractedPattern({
        patternId: 'extracted-lv-manual',
        title: 'Carved chest',
        tile: TILE,
        location: { placeName: 'A carved chest', source: 'manual' },
      })
    );
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    expect(screen.getByTestId('provenance-meta').textContent).toMatch(/A carved chest/);
    expect(screen.queryByTestId('location-map-link')).toBeNull();
  });

  it('omits the provenance block entirely when no metadata was recorded', () => {
    addLibraryEntry(entity('extracted-lv-bare', 'No metadata'));
    renderView();
    fireEvent.click(screen.getByTestId('library-card'));
    expect(screen.queryByTestId('provenance-meta')).toBeNull();
  });
});

// S9 (issue #58): provenance + palette + tags + favorite in the entry detail,
// plus editable-later and the OSM credit on a geocoded place.
describe('LibraryView — S9 provenance + palette + organization', () => {
  const META_ENTITY = (over = {}) =>
    makeExtractedPattern({
      patternId: 'extracted-s9',
      title: 'Uppsala vault',
      tile: TILE,
      sourceType: 'in_person',
      material: 'stone',
      tradition: 'Gothic tracery',
      note: 'Rib crossing detail',
      tags: ['gothic', 'vault'],
      favorite: true,
      palette: [
        { hex: '#a08040', coverage: 0.6 },
        { hex: '#101010', coverage: 0.4 },
      ],
      ...over,
    });

  async function openDetail(patternId = 'extracted-s9') {
    renderView();
    fireEvent.click(await screen.findByText('Uppsala vault'));
    return screen.findByTestId('provenance-meta');
  }

  it('renders palette swatches as validated hex chips in detail', async () => {
    addLibraryEntry(META_ENTITY());
    await openDetail();
    const chips = screen.getAllByTestId('palette-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain('#a08040');
  });

  it('renders provenance, tradition, note and tags', async () => {
    addLibraryEntry(META_ENTITY());
    const meta = await openDetail();
    expect(meta.textContent).toContain('In person');
    expect(meta.textContent).toContain('Stone');
    expect(meta.textContent).toContain('Gothic tracery');
    expect(meta.textContent).toContain('Rib crossing detail');
    const tags = screen.getByTestId('tag-list');
    expect(tags.textContent).toContain('gothic');
    expect(tags.textContent).toContain('vault');
  });

  it('shows the favorite star on the card and toggles favorite from detail', async () => {
    addLibraryEntry(META_ENTITY());
    renderView();
    expect(screen.getByTestId('favorite-star')).toBeTruthy();
    fireEvent.click(screen.getByText('Uppsala vault'));
    fireEvent.click(screen.getByTestId('favorite-toggle'));
    expect(mocks.updateExtractedPatternMeta).toHaveBeenCalledWith('extracted-s9', { favorite: false });
  });

  it('edits metadata from the detail view via updateExtractedPatternMeta', async () => {
    addLibraryEntry(META_ENTITY());
    renderView();
    fireEvent.click(screen.getByText('Uppsala vault'));
    fireEvent.click(screen.getByTestId('edit-details'));
    fireEvent.change(screen.getByLabelText('Edit note'), { target: { value: 'Updated note' } });
    fireEvent.change(screen.getByLabelText('Edit tags'), { target: { value: 'a, b, a' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(mocks.updateExtractedPatternMeta).toHaveBeenCalled());
    const [id, patch] = mocks.updateExtractedPatternMeta.mock.calls[0];
    expect(id).toBe('extracted-s9');
    expect(patch.note).toBe('Updated note');
    expect(patch.tags).toEqual(['a', 'b', 'a']); // normalization/dedupe happens in the repo
  });

  it('credits OpenStreetMap only for a geocoded place name', async () => {
    addLibraryEntry(
      META_ENTITY({
        patternId: 'extracted-s9',
        location: { lat: 59.86, lng: 17.63, placeName: 'Uppsala, Sweden', source: 'geocoded' },
      })
    );
    await openDetail();
    expect(screen.getByTestId('osm-credit')).toBeTruthy();
    clearLibraryEntries();
  });

  it('omits the OSM credit for a manually typed place name', async () => {
    addLibraryEntry(
      META_ENTITY({
        location: { lat: 59.86, lng: 17.63, placeName: 'My studio', source: 'manual' },
      })
    );
    await openDetail();
    expect(screen.queryByTestId('osm-credit')).toBeNull();
  });

  it('omits palette + tags when none were recorded (no empty-form look)', async () => {
    addLibraryEntry(makeExtractedPattern({ patternId: 'extracted-bare', title: 'Bare', tile: TILE }));
    renderView();
    fireEvent.click(screen.getByText('Bare'));
    expect(screen.queryByTestId('palette-facet')).toBeNull();
    expect(screen.queryByTestId('tag-list')).toBeNull();
  });
});
