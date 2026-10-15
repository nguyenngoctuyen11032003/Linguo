import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from './Toast';
import { useLiftToasts } from './toast-lift';

function Lift({ level, active }: { level: 1 | 2; active: boolean }) {
  useLiftToasts(level, active);
  return null;
}

/** The toast live region is the provider's only role="status" element. */
const region = () => screen.getByRole('status');

describe('Toast stacking above the PWA toasts', () => {
  it('sits at the base offset when nothing lifts it', () => {
    render(
      <ToastProvider>
        <Lift level={1} active={false} />
      </ToastProvider>,
    );
    expect(region()).toHaveAttribute('data-lift', '0');
    expect(region().className).toContain('bottom-[calc(5.5rem');
  });

  it('moves above the update toast while it shows, and back down after', () => {
    const { rerender } = render(
      <ToastProvider>
        <Lift level={1} active />
      </ToastProvider>,
    );
    expect(region()).toHaveAttribute('data-lift', '1');
    expect(region().className).toContain('bottom-[calc(10.5rem');
    act(() =>
      rerender(
        <ToastProvider>
          <Lift level={1} active={false} />
        </ToastProvider>,
      ),
    );
    expect(region()).toHaveAttribute('data-lift', '0');
  });

  it('clears the highest active PWA toast', () => {
    render(
      <ToastProvider>
        <Lift level={1} active />
        <Lift level={2} active />
      </ToastProvider>,
    );
    expect(region()).toHaveAttribute('data-lift', '2');
    expect(region().className).toContain('bottom-[calc(15.5rem');
  });

  it('is a no-op outside the provider', () => {
    expect(() => render(<Lift level={1} active />)).not.toThrow();
  });
});
