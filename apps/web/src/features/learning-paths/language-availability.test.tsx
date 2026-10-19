import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AVAILABLE_LANGUAGE_CODES, CLASS_LANGUAGES, LANGUAGE_CODES, LANGUAGES, PERSONAL_LANGUAGES, roleplayScenariosFor } from '@linguo/shared';
import { LanguagePill } from '@/components/ui/LanguagePill';
import { CLASS_LANGUAGE_CHOICES } from '@/features/teacher/format';
import { MotionProvider } from '@/providers/MotionProvider';
import { StepLanguage } from '@/routes/app/onboarding/StepLanguage';
import { isStepValid } from '@/routes/app/onboarding/logic';
import { roleplayLanguageNames } from '@/features/roleplay/languages';
import { ListFormDialog } from '@/routes/app/vocab/ListFormDialog';
import { ClassFormDialog } from '@/routes/teacher/ClassFormDialog';
import { TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../tests/unit/render';

// Languages whose content has not shipped (LANGUAGES[code].available = false) stay hidden from every picker, while
// remaining valid for schemas and RPCs. Nothing here may hard-code a language: flipping `available` is the release step.
const hidden = LANGUAGE_CODES.filter((code) => !LANGUAGES[code].available);
const offered = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available);
const nameOf = (code: (typeof LANGUAGE_CODES)[number]) => new RegExp(LANGUAGES[code].nameVi);

describe('language pickers only offer available languages', () => {
  it('knows which languages are hidden and which are offered', () => {
    expect(offered).toEqual(expect.arrayContaining(['en', 'ko', 'ja', 'de']));
    expect([...AVAILABLE_LANGUAGE_CODES]).toEqual(offered);
  });

  it('onboarding: the language step lists only offered languages and rejects a hidden one', () => {
    render(<StepLanguage value={undefined} taken={[]} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(offered.length);
    for (const code of offered) expect(screen.getByRole('radio', { name: nameOf(code) })).toBeInTheDocument();
    for (const code of hidden) expect(screen.queryByRole('radio', { name: nameOf(code) })).not.toBeInTheDocument();
    for (const code of hidden) expect(isStepValid(1, { language: code } as never, { taken: [], today: '2026-10-17' })).toBe(false);
    for (const code of offered) expect(isStepValid(1, { language: code } as never, { taken: [], today: '2026-10-17' })).toBe(true);
  });

  it('language switcher: "+ Thêm" never offers a hidden language', async () => {
    render(
      <MemoryRouter>
        <MotionProvider>
          <LanguagePill paths={[{ id: 'path-en', language: 'en', status: 'active' }]} currentId="path-en" onSelect={vi.fn()} onAdd={vi.fn()} />
        </MotionProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    for (const code of offered.filter((c) => c !== 'en')) expect(screen.getByRole('button', { name: `+ Thêm ${LANGUAGES[code].nameVi}` })).toBeInTheDocument();
    for (const code of hidden) expect(screen.queryByRole('button', { name: `+ Thêm ${LANGUAGES[code].nameVi}` })).not.toBeInTheDocument();
  });

  it('personal vocabulary: the new-list dialog lists only offered languages', () => {
    renderWithProviders(<ListFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const wanted = PERSONAL_LANGUAGES.filter((code) => LANGUAGES[code].available);
    expect(within(dialog).getAllByRole('radio')).toHaveLength(wanted.length);
    for (const code of hidden) expect(within(dialog).queryByRole('radio', { name: nameOf(code) })).not.toBeInTheDocument();
  });

  it('personal vocabulary: a path in a hidden language does not preselect it', () => {
    // Every language is released now, so hide one for this test only.
    const was = LANGUAGES.de.available;
    LANGUAGES.de.available = false;
    const hiddenPath = { ...TEST_PATH, language: 'de' as const };
    renderWithProviders(<ListFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />, { paths: { paths: [hiddenPath], current: hiddenPath, currentId: hiddenPath.id } });
    const checked = within(screen.getByRole('dialog')).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]).not.toHaveAccessibleName(nameOf('de'));
    LANGUAGES.de.available = was;
  });

  it('personal vocabulary: the current offered language is preselected', () => {
    renderWithProviders(<ListFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />, { paths: { paths: [TEST_KO_PATH], current: TEST_KO_PATH, currentId: TEST_KO_PATH.id } });
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: /Tiếng Hàn/ })).toBeChecked();
  });

  it('classes: a teacher can only open a class in an offered language', () => {
    expect([...CLASS_LANGUAGE_CHOICES]).toEqual(CLASS_LANGUAGES.filter((code) => LANGUAGES[code].available));
    renderWithProviders(<ClassFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('radio')).toHaveLength(CLASS_LANGUAGE_CHOICES.length);
    for (const code of hidden) expect(within(dialog).queryByRole('radio', { name: nameOf(code) })).not.toBeInTheDocument();
  });

  it('roleplay: the empty state names only offered languages that have scenarios', () => {
    const text = roleplayLanguageNames();
    for (const code of offered) {
      if (roleplayScenariosFor(code).length > 0) expect(text).toContain(LANGUAGES[code].nameVi.toLowerCase());
    }
    for (const code of hidden) expect(text).not.toContain(LANGUAGES[code].nameVi.toLowerCase());
  });
});
