import { act, fireEvent, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { HeroSection } from './HeroSection';
import { LandingPage } from './LandingPage';
import { useHeroReady } from './useHeroReady';

const envMock = vi.hoisted(() => ({ heroVideoUrl: null as string | null }));
vi.mock('@/lib/env', () => ({ env: envMock }));

const signedOut = { auth: { status: 'signed-out' as const, session: null, user: null } };

describe('useHeroReady', () => {
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

  function stubFonts(ready: Promise<unknown>) {
    Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true });
  }

  afterEach(() => {
    vi.useRealTimers();
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
  });

  it('becomes ready once fonts are ready', async () => {
    stubFonts(Promise.resolve());
    const { result } = renderHook(() => useHeroReady());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it('never waits longer than 1000ms for fonts', () => {
    vi.useFakeTimers();
    stubFonts(new Promise(() => {}));
    const { result } = renderHook(() => useHeroReady());
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('does not wait at all when the Font Loading API is unavailable', async () => {
    Reflect.deleteProperty(document, 'fonts');
    const { result } = renderHook(() => useHeroReady());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });
});

describe('HeroSection video', () => {
  const originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
  const play = vi.fn();

  beforeEach(() => {
    envMock.heroVideoUrl = 'https://cdn.example.com/hero.mp4';
    play.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: play, configurable: true, writable: true });
  });

  afterEach(() => {
    envMock.heroVideoUrl = null;
    if (originalPlay) Object.defineProperty(HTMLMediaElement.prototype, 'play', originalPlay);
    else Reflect.deleteProperty(HTMLMediaElement.prototype, 'play');
  });

  it('fades the video in on its own when it starts playing, without gating the headline', () => {
    const { container } = renderWithProviders(<HeroSection />, signedOut);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Học thông minh/i);
    expect(video).toHaveClass('opacity-0');
    expect(play).toHaveBeenCalled();
    act(() => {
      fireEvent(video!, new Event('playing'));
    });
    expect(video).toHaveClass('opacity-55');
    expect(video).not.toHaveClass('opacity-0');
  });

  it('also reveals the video on canplay and hides it again on error', () => {
    const { container } = renderWithProviders(<HeroSection />, signedOut);
    const video = container.querySelector('video')!;
    act(() => {
      fireEvent(video, new Event('canplay'));
    });
    expect(video).toHaveClass('opacity-55');
    act(() => {
      fireEvent(video, new Event('error'));
    });
    expect(video).toHaveClass('opacity-0');
  });

  it('ignores a refused autoplay promise', async () => {
    play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    const { container } = renderWithProviders(<HeroSection />, signedOut);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('video')).toHaveClass('opacity-0');
  });
});

describe('LandingPage', () => {
  it('renders the hero, learning route, method and CTA', () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, signedOut);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Học thông minh/i);
    expect(screen.getAllByRole('link', { name: 'Bắt đầu miễn phí' })[0]).toHaveAttribute('href', '/dang-ky');
    expect(screen.getByRole('img', { name: /Lộ trình tiếng Anh, tiếng Hàn và tiếng Nhật/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhớ lại chủ động' })).toBeInTheDocument();
    expect(screen.getByText(/không hứa “thành thạo siêu tốc”/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
  });

  it('opens the menu overlay, traps focus, and restores focus to "Mở menu" on Escape', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderWithProviders(<LandingPage />, signedOut);
    const trigger = screen.getByRole('button', { name: 'Mở menu' });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const close = screen.getByRole('button', { name: 'Đóng menu' });
    expect(close).toHaveFocus();

    expect(dialog.querySelectorAll('a[href]').length).toBeGreaterThan(0);
    // The install button is the last focusable element of the menu.
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Tải ứng dụng' })).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
});
