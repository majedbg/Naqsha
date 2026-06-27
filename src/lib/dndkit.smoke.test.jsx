// @vitest-environment jsdom
//
// React-19.2 ↔ dnd-kit compatibility GATE (pattern-picker manual-sort, slice 1).
//
// The entire manual-sort feature rests on dnd-kit mounting cleanly under this
// project's React version. StrictMode double-invokes effects, and dnd sensors
// have regressed there before, so this smoke test is a real regression guard:
// it renders a minimal SortableContext with two useSortable children *inside*
// <React.StrictMode> and asserts the tree mounts without throwing.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} data-testid={`item-${id}`} {...attributes} {...listeners}>
      {id}
    </div>
  );
}

describe('dnd-kit ↔ React 19 StrictMode gate', () => {
  it('mounts a SortableContext with useSortable children under StrictMode without throwing', () => {
    const items = ['a', 'b'];

    expect(() =>
      render(
        <React.StrictMode>
          <DndContext>
            <SortableContext items={items} strategy={rectSortingStrategy}>
              {items.map((id) => (
                <SortableItem key={id} id={id} />
              ))}
            </SortableContext>
          </DndContext>
        </React.StrictMode>,
      ),
    ).not.toThrow();

    // Both sortable children actually rendered (sensors/effects ran under StrictMode).
    expect(screen.getByTestId('item-a')).toBeInTheDocument();
    expect(screen.getByTestId('item-b')).toBeInTheDocument();
  });
});
