// @vitest-environment jsdom
//
// S1 (issue #50) — the picker distinguishes library-sourced (extracted) from
// AI-generated custom patterns with a 📷 origin badge, in BOTH picker views.
// End-to-end through the real registry: registerExtractedPattern (the library
// write path) vs a plain registerPattern (the AI path).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PatternPickerModal from './PatternPickerModal';
import { makeExtractedPattern } from '../lib/extraction/extractedPattern';
import { registerExtractedPattern } from '../lib/patterns/ExtractedPatternGenerator';
import { registerPattern, unregisterPattern } from '../lib/patternRegistry';
import { Pattern } from '../lib/patterns/drawingContext';
import { clearLibraryEntries } from '../lib/libraryStore';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ tier: 'studio' }),
}));

class FakeAIPattern extends Pattern {
  generate() {}
}

const EXTRACTED_ID = 'extracted-badge-test';
const AI_ID = 'ai-badge-test';

beforeEach(() => {
  localStorage.clear();
  registerExtractedPattern(
    makeExtractedPattern({
      patternId: EXTRACTED_ID,
      title: 'Uppsala ceiling',
      tile: {
        width: 20,
        height: 20,
        fills: [{ d: 'M2 2 L18 2 L18 18 L2 18 Z', role: 'engrave' }],
        strokes: [],
      },
    })
  );
  registerPattern(AI_ID, FakeAIPattern, 'AI Swirl', {}, []);
});

afterEach(() => {
  unregisterPattern(EXTRACTED_ID);
  unregisterPattern(AI_ID);
  clearLibraryEntries();
});

// The Grid wraps each card in a dnd-kit sortable div that ALSO has
// role="button", so query the inner card by its title attribute instead.
const cardByLabel = (label) => screen.getByTitle(new RegExp(`${label} —`, 'i'));

describe('PatternPickerModal — extracted origin badge (S1)', () => {
  it('badges the extracted card 📷 in the Grid view, but not the AI card', () => {
    render(<PatternPickerModal open onClose={() => {}} onPick={() => {}} />);
    const extractedCard = cardByLabel('Uppsala ceiling');
    expect(
      within(extractedCard).getByRole('img', { name: /extracted from a photo/i })
    ).toBeInTheDocument();
    const aiCard = cardByLabel('AI Swirl');
    expect(
      within(aiCard).queryByRole('img', { name: /extracted from a photo/i })
    ).not.toBeInTheDocument();
  });

  it('badges the extracted card in the Map view custom row too', () => {
    render(<PatternPickerModal open onClose={() => {}} onPick={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    const extractedCard = cardByLabel('Uppsala ceiling');
    expect(
      within(extractedCard).getByRole('img', { name: /extracted from a photo/i })
    ).toBeInTheDocument();
    const aiCard = cardByLabel('AI Swirl');
    expect(
      within(aiCard).queryByRole('img', { name: /extracted from a photo/i })
    ).not.toBeInTheDocument();
  });
});
