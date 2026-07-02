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

const mocks = vi.hoisted(() => ({ getPhotoURL: vi.fn() }));

vi.mock('../../lib/libraryRepository', () => ({
  getPhotoURL: mocks.getPhotoURL,
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
});

afterEach(() => clearLibraryEntries());

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
