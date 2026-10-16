import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';
import { ForeignText } from './ForeignText';
import { speechText } from './machine-speech';
import { SpeakButton } from './SpeakButton';
import { renderExercise } from './test-utils';

const VOICES = [
  { lang: 'en-US', name: 'Yank' },
  { lang: 'ko-KR', name: 'Yuna' },
  { lang: 'ja-JP', name: 'Kyoko' },
];

afterEach(() => vi.unstubAllGlobals());

describe('speechText', () => {
  it('drops markdown and blank placeholders', () => {
    expect(speechText('I **really** like ____ cats…')).toBe('I really like cats');
    expect(speechText('  Hello   world ')).toBe('Hello world');
  });
});

describe('SpeakButton', () => {
  it('reads the text in its language when tapped and stops on the second tap', async () => {
    const { spoken, cancel } = stubSpeechSynthesis(VOICES);
    renderExercise(<SpeakButton text="학교에 가요" lang="ko" />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 학교에 가요' }));
    expect(spoken[0]).toMatchObject({ text: '학교에 가요', lang: 'ko-KR' });
    await userEvent.click(screen.getByRole('button', { name: 'Dừng đọc: 학교에 가요' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('guesses the language from the script when none is given', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<SpeakButton text="ありがとう" />);
    await userEvent.click(screen.getByRole('button'));
    expect(spoken[0]?.lang).toBe('ja-JP');
  });

  it('renders nothing for Vietnamese, for empty text, or when the browser has no voice', () => {
    stubSpeechSynthesis(VOICES);
    const first = renderExercise(<SpeakButton text="Xin chào" lang="vi" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    first.unmount();
    const second = renderExercise(<SpeakButton text="  " lang="en" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    second.unmount();
    vi.unstubAllGlobals();
    stubSpeechSynthesis(null);
    renderExercise(<SpeakButton text="Hello" lang="en" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ForeignText', () => {
  it('turns Korean and Japanese phrases in Vietnamese prose into buttons', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<ForeignText>Dùng 은/는 sau 학교 nhé, như 先生.</ForeignText>);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 학교' }));
    expect(spoken[0]).toMatchObject({ text: '학교', lang: 'ko-KR' });
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 先生' }));
    expect(spoken[1]).toMatchObject({ text: '先生', lang: 'ja-JP' });
  });

  it('picks English phrases out of an English course but not Vietnamese words or IPA', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<ForeignText course="en">{'Không nói very brilliant cho người khác, đọc /bɪt/ nhé.'}</ForeignText>);
    expect(screen.queryByRole('button', { name: /cho/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: very brilliant' }));
    expect(spoken[0]).toMatchObject({ text: 'very brilliant', lang: 'en-US' });
  });

  it('leaves Latin text alone outside an English course (it is romanisation)', () => {
    stubSpeechSynthesis(VOICES);
    renderExercise(<ForeignText course="ko">{'Đọc là annyeonghaseyo nhé'}</ForeignText>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders one untouched string when the browser has no voice', () => {
    stubSpeechSynthesis(null);
    renderExercise(<ForeignText course="en">{'Nói 안녕 và very good nhé'}</ForeignText>);
    expect(screen.getByText('Nói 안녕 và very good nhé')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
