import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonClasses } from './Button';
import { inputClasses } from './Input';

describe('Button disabled styling', () => {
  it('uses a neutral dashed surface instead of faded colour', () => {
    for (const variant of ['primary', 'accent', 'ghost', 'glass', 'danger'] as const) {
      const classes = buttonClasses(variant);
      expect(classes).not.toMatch(/opacity-/);
      expect(classes).toContain('disabled:not-aria-busy:text-muted');
      expect(classes).toContain('disabled:not-aria-busy:outline-dashed');
    }
  });

  it('keeps disabled semantics and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Tiếp tục
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks a loading button busy and disabled', () => {
    render(<Button loading>Đang lưu</Button>);
    const button = screen.getByRole('button', { name: /Đang lưu/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('links an optional hint to the button', () => {
    render(
      <Button disabled hint="Chọn một đáp án để tiếp tục" aria-describedby="extra">
        Kiểm tra
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Kiểm tra' });
    const hint = screen.getByText('Chọn một đáp án để tiếp tục');
    expect(button.getAttribute('aria-describedby')).toBe(`extra ${hint.id}`);
    expect(button).toHaveAccessibleDescription(/Chọn một đáp án để tiếp tục/);
  });

  it('renders no wrapper without a hint', () => {
    const { container } = render(<Button>OK</Button>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });
});

describe('Input border', () => {
  it('uses the 3:1 input border token (WCAG 1.4.11), not the decorative border', () => {
    expect(inputClasses()).toContain('border-input-border');
    expect(inputClasses()).not.toMatch(/border-border/);
    expect(inputClasses(true)).toContain('border-error');
  });
});
