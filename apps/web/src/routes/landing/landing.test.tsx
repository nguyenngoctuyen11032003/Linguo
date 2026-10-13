import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { LandingPage } from './LandingPage';
import { useHeroReady } from './useHeroReady';

// happy-dom ships a minimal Web Animations API whose `cancel()` rejects `finished` with an AbortError, which surfaces as an
// unhandled rejection when motion stops a running animation. Removing it makes motion fall back to its JS animator.
Reflect.deleteProperty(Element.prototype, 'animate');

describe('useHeroReady', () => {
  afterEach(() => vi.useRealTimers());

  it('becomes ready after fonts when there is no video', async () => {
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
    const { result } = renderHook(() => useHeroReady(null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it('waits for the video, but never longer than the safety timeout', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    const ref = { current: video };
    const { result } = renderHook(() => useHeroReady(ref, 5000));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);
  });
});

describe('LandingPage', () => {
  it('renders the hero, learning route, method and CTA', () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, { auth: { status: 'signed-out', session: null, user: null } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Học thông minh/i);
    expect(screen.getAllByRole('link', { name: 'Bắt đầu miễn phí' })[0]).toHaveAttribute('href', '/dang-ky');
    expect(screen.getByRole('img', { name: /Lộ trình tiếng Anh và tiếng Hàn/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhớ lại chủ động' })).toBeInTheDocument();
    expect(screen.getByText(/không hứa “thành thạo siêu tốc”/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
  });

  it('opens and closes the menu overlay', async () => {
    localStorage.setItem('lp-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, { auth: { status: 'signed-out', session: null, user: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Mở menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
