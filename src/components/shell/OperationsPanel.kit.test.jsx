// Guard test: the ITP Camp Mode enter/exit control is surfaced in the Operations
// panel ONLY when the active machine is Laser (issue #18, plan §7.3 / C9).

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OperationsPanel from './OperationsPanel.jsx';

const baseProps = {
  operations: [],
  onCommitOperations: () => {},
  onAddOperation: () => {},
};

describe('OperationsPanel — ITP Camp Mode control (Laser-gated)', () => {
  it('shows the Enter ITP Camp Mode control when machine = Laser', () => {
    render(
      <OperationsPanel
        {...baseProps}
        profileId="laser"
        kitAvailable
        kitActive={false}
        onEnterKit={() => {}}
        onExitKit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /enter itp camp mode/i })).toBeTruthy();
  });

  it('shows the Exit control when the kit is active', () => {
    render(
      <OperationsPanel
        {...baseProps}
        profileId="laser"
        kitAvailable
        kitActive
        onEnterKit={() => {}}
        onExitKit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /exit itp camp mode/i })).toBeTruthy();
  });

  it('does NOT show the control when machine is not Laser', () => {
    for (const profileId of ['plotter', 'dragCutter']) {
      const { unmount } = render(
        <OperationsPanel
          {...baseProps}
          profileId={profileId}
          kitAvailable
          kitActive={false}
          onEnterKit={() => {}}
          onExitKit={() => {}}
        />
      );
      expect(screen.queryByRole('button', { name: /itp camp mode/i })).toBeNull();
      unmount();
    }
  });

  it('enter/exit clicks fire the callbacks', () => {
    const onEnterKit = vi.fn();
    const { rerender } = render(
      <OperationsPanel
        {...baseProps}
        profileId="laser"
        kitAvailable
        kitActive={false}
        onEnterKit={onEnterKit}
        onExitKit={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /enter itp camp mode/i }));
    expect(onEnterKit).toHaveBeenCalledTimes(1);

    const onExitKit = vi.fn();
    rerender(
      <OperationsPanel
        {...baseProps}
        profileId="laser"
        kitAvailable
        kitActive
        onEnterKit={() => {}}
        onExitKit={onExitKit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /exit itp camp mode/i }));
    expect(onExitKit).toHaveBeenCalledTimes(1);
  });
});
