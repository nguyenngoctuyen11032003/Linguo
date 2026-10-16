import indexHtml from '../../../index.html?raw';
import { act, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { BootVisual } from './BootVisual';
import { ROUTE_D, ROUTE_NODES } from './route';
import { LOADING_TIPS } from './tips';

describe('boot splash (index.html)', () => {
  it('uses the same route geometry and classes as the React loader', () => {
    const root = /<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/.exec(indexHtml)?.[1] ?? '';
    expect(root).toContain('class="lg-boot"');
    expect(root).toContain('role="status"');
    expect(root).toContain('Đang tải…');
    expect(root.split(`d="${ROUTE_D}"`)).toHaveLength(5);
    for (const [cx, cy] of ROUTE_NODES) expect(root).toContain(`cx="${cx}" cy="${cy}" r="4"`);
    // Every class the React brand block renders exists in the static copy.
    const classes = new Set([...renderToStaticMarkup(<BootVisual />).matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' ')));
    for (const c of classes) expect(root).toContain(c);
  });

  it('loads its styles from a file (the CSP allows no inline styles) and has no inline handlers', () => {
    expect(indexHtml).toContain('href="/src/components/feedback/feedback.css"');
    expect(indexHtml).not.toMatch(/<style\b/i);
    expect(indexHtml).not.toMatch(/\sstyle=/i);
    expect(indexHtml).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('FullScreenLoader', () => {
  afterEach(() => vi.useRealTimers());

  it('announces the label and shows a tip only once loading lasts', () => {
    vi.useFakeTimers();
    const { unmount } = render(<FullScreenLoader label="Đang hoàn tất đăng nhập…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đang hoàn tất đăng nhập…');
    const tip = status.querySelector('.lg-boot__tip')!;
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    expect(tip).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(tip).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const first = tip.textContent;
    expect(LOADING_TIPS.some((t) => first === `${t.lead} ${t.text}`)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(tip.textContent).not.toBe(first);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('defaults to "Đang tải…"', () => {
    render(<FullScreenLoader />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…');
  });
});
