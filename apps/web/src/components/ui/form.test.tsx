import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { FormField } from './FormField';
import { Input } from './Input';
import { PasswordInput } from './PasswordInput';

describe('Button', () => {
  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button"', () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('FormField', () => {
  it('links label, hint and error to the control', () => {
    render(
      <FormField label="Email" hint="Dùng email bạn hay kiểm tra." error="Email không hợp lệ.">
        {(a11y) => <Input {...a11y} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Dùng email bạn hay kiểm tra. Email không hợp lệ.');
    expect(screen.getByRole('alert')).toHaveTextContent('Email không hợp lệ.');
  });
});

describe('PasswordInput', () => {
  it('toggles visibility', async () => {
    render(
      <FormField label="Mật khẩu">{(a11y) => <PasswordInput {...a11y} defaultValue="bimat123" />}</FormField>,
    );
    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute('aria-pressed', 'true');
  });
});
