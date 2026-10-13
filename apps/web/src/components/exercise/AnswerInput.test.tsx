import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerInput } from './AnswerInput';
import { createCompositionGate } from './compositionGate';

function Harness({ onSubmitRequest }: { onSubmitRequest: () => void }) {
  const [value, setValue] = useState('');
  return <AnswerInput aria-label="Câu trả lời" lang="ko" value={value} onValueChange={setValue} onSubmitRequest={onSubmitRequest} />;
}

afterEach(() => vi.useRealTimers());

describe('AnswerInput', () => {
  it('sets mobile-friendly attributes and the answer language', () => {
    render(<Harness onSubmitRequest={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Câu trả lời' });
    expect(input).toHaveAttribute('lang', 'ko');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('enterkeyhint', 'done');
    expect(input.className).toMatch(/text-\[17px\]|text-base/);
  });

  it('submits on Enter', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmitRequest={onSubmit} />);
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('ignores Enter while an IME composition is active (isComposing or keyCode 229)', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmitRequest={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('queues a single submit for Enters pressed while the composition settles', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmitRequest={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '안녕' } });
    // Some browsers report these Enters as not composing although compositionend has not fired yet.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Afterwards Enter submits again.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('ignores a held-down (repeating) Enter', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmitRequest={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('createCompositionGate', () => {
  it('runs immediately when nothing is composing', () => {
    const gate = createCompositionGate();
    const fn = vi.fn();
    gate.run(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits for compositionend before running', () => {
    vi.useFakeTimers();
    const gate = createCompositionGate();
    const fn = vi.fn();
    gate.begin();
    gate.run(fn);
    expect(fn).not.toHaveBeenCalled();
    gate.end();
    act(() => vi.advanceTimersByTime(1));
    expect(fn).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(200));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back after 80 ms when compositionend never arrives', () => {
    vi.useFakeTimers();
    const gate = createCompositionGate();
    const fn = vi.fn();
    gate.begin();
    gate.run(fn);
    act(() => vi.advanceTimersByTime(79));
    expect(fn).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(gate.composing).toBe(false);
  });
});
