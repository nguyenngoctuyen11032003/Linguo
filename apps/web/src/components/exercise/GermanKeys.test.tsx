import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AnswerInput } from './AnswerInput';
import { GermanKeysScope } from './GermanKeys';
import { GERMAN_KEYS_HINT, GERMAN_KEYS_HINT_UNGRADED } from './german-keys';

function Single({ enabled = true, graded, max }: { enabled?: boolean; graded?: boolean; max?: number }) {
  const [value, setValue] = useState('');
  return (
    <GermanKeysScope enabled={enabled} graded={graded}>
      <AnswerInput aria-label="Antwort" lang="de" value={value} maxLength={max} onValueChange={setValue} />
    </GermanKeysScope>
  );
}

function Two() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <GermanKeysScope enabled>
      <AnswerInput aria-label="Eins" lang="de" value={a} onValueChange={setA} />
      <AnswerInput aria-label="Zwei" lang="de" value={b} onValueChange={setB} />
    </GermanKeysScope>
  );
}

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('GermanKeysScope', () => {
  it('renders nothing extra for other languages', () => {
    const { container } = render(<Single enabled={false} />);
    expect(screen.queryByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).not.toBeInTheDocument();
    expect(container.children).toHaveLength(1);
  });

  it('offers ä ö ü ß Ä Ö Ü as labelled buttons with the ae/oe/ue/ss hint', () => {
    render(<Single />);
    const group = screen.getByRole('group', { name: 'Chèn chữ cái tiếng Đức' });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']);
    expect(screen.getByRole('button', { name: 'Chèn ß (eszett)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chèn Ö hoa' })).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription(GERMAN_KEYS_HINT);
    expect(GERMAN_KEYS_HINT).toMatch(/ae, oe, ue, ss/);
  });

  it('uses the shorter hint when the answer is not auto-graded', () => {
    render(<Single graded={false} />);
    expect(screen.getByRole('group', { name: 'Chèn chữ cái tiếng Đức' })).toHaveAccessibleDescription(GERMAN_KEYS_HINT_UNGRADED);
    expect(GERMAN_KEYS_HINT_UNGRADED).not.toMatch(/ae, oe/);
  });

  it('types at the caret of the controlled field and keeps the caret after the new letter', async () => {
    render(<Single />);
    const input = field('Antwort');
    await userEvent.type(input, 'fr');
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ü' }));
    expect(input.value).toBe('frü');
    input.setSelectionRange(1, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ä' }));
    expect(input.value).toBe('färü');
    expect(input.selectionStart).toBe(2);
    expect(input).toHaveFocus();
  });

  it('replaces the selected text', async () => {
    render(<Single />);
    const input = field('Antwort');
    await userEvent.type(input, 'gross');
    input.setSelectionRange(3, 5);
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ß (eszett)' }));
    expect(input.value).toBe('groß');
  });

  it('does not exceed the field maxLength', async () => {
    render(<Single max={3} />);
    const input = field('Antwort');
    await userEvent.type(input, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ö' }));
    expect(input.value).toBe('abc');
  });

  it('types into the field that had focus last, or the first one', async () => {
    render(<Two />);
    await userEvent.click(screen.getByRole('button', { name: 'Chèn ö' }));
    expect(field('Eins').value).toBe('ö');
    await userEvent.click(field('Zwei'));
    await userEvent.click(screen.getByRole('button', { name: 'Chèn Ü hoa' }));
    expect(field('Zwei').value).toBe('Ü');
    expect(field('Eins').value).toBe('ö');
  });

  it('can be disabled', () => {
    render(
      <GermanKeysScope enabled disabled>
        <input aria-label="x" />
      </GermanKeysScope>,
    );
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
});
