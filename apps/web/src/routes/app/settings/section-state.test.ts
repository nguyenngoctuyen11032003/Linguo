import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSectionOpen, jumpToSection, resetSectionStateForTests } from './section-state';

afterEach(() => {
  document.body.innerHTML = '';
  resetSectionStateForTests();
  vi.restoreAllMocks();
});

function flushFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('jumpToSection', () => {
  it('makes a plain heading focusable and focuses it', async () => {
    document.body.innerHTML = '<section id="ho-so"><h2>Hồ sơ</h2></section>';
    jumpToSection('ho-so');
    await flushFrame();
    const heading = document.querySelector('h2')!;
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    expect(isSectionOpen('ho-so')).toBe(true);
  });

  it('keeps a tabindex the heading already has', async () => {
    document.body.innerHTML = '<section id="lo-trinh"><h2 tabindex="0">Lộ trình học</h2></section>';
    jumpToSection('lo-trinh');
    await flushFrame();
    const heading = document.querySelector('h2')!;
    expect(heading).toHaveAttribute('tabindex', '0');
    expect(heading).toHaveFocus();
  });

  it('does nothing when the section is missing', async () => {
    jumpToSection('khong-co');
    await flushFrame();
    expect(document.activeElement).toBe(document.body);
  });
});
