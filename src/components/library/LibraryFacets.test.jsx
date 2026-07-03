// @vitest-environment jsdom
//
// LibraryView facet filtering (S10, issue #59) — the find bar over the Library
// grid. Store + entity layers are REAL (one entity, two surfaces); only the
// supabase-backed photo signer + collections are mocked, matching LibraryView's
// own test harness.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getPhotoURL: vi.fn(),
  updateExtractedPatternMeta: vi.fn(),
  getUser: vi.fn(),
  loadCollections: vi.fn(),
}));

vi.mock('../../lib/libraryRepository', () => ({
  getPhotoURL: mocks.getPhotoURL,
  updateExtractedPatternMeta: mocks.updateExtractedPatternMeta,
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getUser: (...a) => mocks.getUser(...a) } },
}));
vi.mock('../../lib/collectionService', () => ({ loadCollections: mocks.loadCollections }));

import LibraryView from './LibraryView';
import { makeExtractedPattern } from '../../lib/extraction/extractedPattern';
import { addLibraryEntry, clearLibraryEntries } from '../../lib/libraryStore';

const TILE = {
  width: 10,
  height: 10,
  fills: [{ d: 'M1 1 L9 1 L9 9 L1 9 Z', role: 'engrave' }],
  strokes: [],
};

function seedStore() {
  const sym = (g) => ({ group: g, confidence: 0.9, source: 'auto' });
  const pal = (...h) => h.map((hex) => ({ hex, coverage: 0.4 }));
  addLibraryEntry(makeExtractedPattern({
    patternId: 'extracted-a', title: 'Alpha', tile: TILE,
    symmetry: sym('p4m'), tradition: 'Islamic', material: 'stone', tags: ['star'],
    palette: pal('#1e5fbf'), location: { placeName: 'Uppsala', lat: 59.8, lng: 17.6 },
  }), { createdAt: '2026-01-03T00:00:00Z' });
  addLibraryEntry(makeExtractedPattern({
    patternId: 'extracted-b', title: 'Beta', tile: TILE,
    symmetry: sym('p6m'), tradition: 'Gothic', material: 'glass',
    palette: pal('#d13438'), location: { placeName: 'Uppsala', lat: 59.8, lng: 17.6 },
  }), { createdAt: '2026-01-02T00:00:00Z' });
  addLibraryEntry(makeExtractedPattern({
    patternId: 'extracted-c', title: 'Gamma', tile: TILE,
    symmetry: sym('p4m'), tradition: 'Islamic', material: 'wood', tags: ['star'],
    palette: pal('#1e5fbf', '#d13438'),
  }), { createdAt: '2026-01-01T00:00:00Z' });
}

function renderView() {
  return render(
    <LibraryView onClose={() => {}} onUseInStudio={() => {}} onNewExtraction={() => {}} />
  );
}

const cardTitles = () =>
  screen.queryAllByTestId('library-card').map((c) => c.textContent.replace(/📷.*Extracted/, '').trim());

beforeEach(() => {
  clearLibraryEntries();
  mocks.getPhotoURL.mockReset().mockResolvedValue(null);
  mocks.updateExtractedPatternMeta.mockReset().mockResolvedValue({ persisted: true });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: null } });
  mocks.loadCollections.mockReset().mockResolvedValue([]);
  seedStore();
});
afterEach(() => clearLibraryEntries());

describe('facet rail — rendering', () => {
  it('renders facets with values and counts derived from the store', () => {
    renderView();
    expect(screen.getByTestId('facet-rail')).toBeInTheDocument();
    // symmetry p4m appears on a + c → count 2.
    const p4m = screen.getByTestId('facet-chip-symmetry-p4m');
    expect(p4m).toHaveTextContent('p4m');
    expect(p4m).toHaveTextContent('2');
    // colour chip carries the binned label.
    expect(screen.getByTestId('facet-chip-color-blue')).toHaveTextContent('Blue');
    // material humanised label.
    expect(screen.getByTestId('facet-chip-material-stone')).toHaveTextContent('Stone');
  });

  it('shows all three cards before any filter', () => {
    renderView();
    expect(screen.getAllByTestId('library-card')).toHaveLength(3);
  });

  it('marks a soft (hiddenRotation) symmetry chip as partial (scope item 4)', () => {
    clearLibraryEntries();
    addLibraryEntry(makeExtractedPattern({
      patternId: 'extracted-soft', title: 'Soft', tile: TILE,
      symmetry: { group: 'p4', confidence: 0.4, source: 'auto', hiddenRotation: true },
    }));
    renderView();
    const chip = screen.getByTestId('facet-chip-symmetry-p4');
    // The rail must not present a phase-collapsed auto group as authoritative:
    // a visible marker + an explanatory title.
    expect(chip).toHaveTextContent('~');
    expect(chip).toHaveAttribute('title', expect.stringMatching(/partial/i));
  });
});

describe('facet rail — single + combined filtering', () => {
  it('narrows the grid on a single facet (material=glass → only Beta)', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-material-glass'));
    expect(cardTitles()).toEqual(['Beta']);
  });

  it('OR within a facet (p4m OR p6m → all three)', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-symmetry-p4m'));
    fireEvent.click(screen.getByTestId('facet-chip-symmetry-p6m'));
    expect(screen.getAllByTestId('library-card')).toHaveLength(3);
  });

  it('AND across facets (Islamic AND wood → only Gamma)', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-tradition-Islamic'));
    fireEvent.click(screen.getByTestId('facet-chip-material-wood'));
    expect(cardTitles()).toEqual(['Gamma']);
  });

  it('color facet filters by binned swatch (blue → Alpha + Gamma)', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-color-blue'));
    expect(cardTitles().sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('toggling a chip off restores the grid', () => {
    renderView();
    const glass = screen.getByTestId('facet-chip-material-glass');
    fireEvent.click(glass);
    expect(screen.getAllByTestId('library-card')).toHaveLength(1);
    fireEvent.click(glass);
    expect(screen.getAllByTestId('library-card')).toHaveLength(3);
  });
});

describe('facet rail — zero-result + clear-all never dead-ends', () => {
  it('shows a zero-result state with a clear CTA, then recovers', () => {
    renderView();
    // glass (Beta) AND star tag (Alpha/Gamma) → no overlap.
    fireEvent.click(screen.getByTestId('facet-chip-material-glass'));
    fireEvent.click(screen.getByTestId('facet-chip-tags-star'));
    expect(screen.getByTestId('facet-zero-result')).toBeInTheDocument();
    expect(screen.queryAllByTestId('library-card')).toHaveLength(0);
    // The zero-result clear CTA restores every card.
    fireEvent.click(within(screen.getByTestId('facet-zero-result')).getByText(/clear filters/i));
    expect(screen.getAllByTestId('library-card')).toHaveLength(3);
  });

  it('clear-all in the rail resets every facet', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-material-glass'));
    expect(screen.getByTestId('facet-clear-all')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('facet-clear-all'));
    expect(screen.getAllByTestId('library-card')).toHaveLength(3);
    expect(screen.queryByTestId('facet-clear-all')).not.toBeInTheDocument();
  });
});

describe('facet rail — composes with detail view', () => {
  it('opens an entry detail from a FILTERED grid', () => {
    renderView();
    fireEvent.click(screen.getByTestId('facet-chip-material-wood')); // → only Gamma
    fireEvent.click(screen.getByTestId('library-card'));
    // Detail view header shows the opened entry, and the rail is gone.
    expect(screen.getByRole('heading', { name: 'Gamma' })).toBeInTheDocument();
    expect(screen.queryByTestId('facet-rail')).not.toBeInTheDocument();
    // Back returns to the still-filtered grid (one card).
    fireEvent.click(screen.getByText(/back to library/i));
    expect(cardTitles()).toEqual(['Gamma']);
  });
});
