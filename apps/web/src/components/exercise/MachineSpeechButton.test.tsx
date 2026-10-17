import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';
import { ListenExercise } from './ListenExercise';
import { detectScriptLang, toTtsLanguage } from './machine-speech';
import { MachineSpeechButton } from './MachineSpeechButton';
import { renderExercise } from './test-utils';

const VOICES = [
  { lang: 'en-GB', name: 'Brit' },
  { lang: 'en-US', name: 'Yank' },
  { lang: 'ko-KR', name: 'Yuna' },
  { lang: 'de-DE', name: 'Hedda' },
];

afterEach(() => vi.unstubAllGlobals());

const listenPrompt = (over: Record<string, unknown> = {}) => ({
  audio_asset_id: null,
  fallback_text: 'Hello, my name is Lan.',
  options: [
    { id: 'l1', text: 'Xin chào', lang: 'vi' as const },
    { id: 'l2', text: 'Tạm biệt', lang: 'vi' as const },
  ],
  shuffle: false,
  ...over,
});

const renderListen = (over: Record<string, unknown> = {}) =>
  renderExercise(<ListenExercise prompt={listenPrompt(over)} seed="s" selectedId={null} onSelect={() => {}} disabled={false} marks={null} />);

describe('detectScriptLang', () => {
  it('picks Korean for Hangul and English otherwise', () => {
    expect(detectScriptLang('학교에 가요.')).toBe('ko');
    expect(detectScriptLang('Hello')).toBe('en');
  });

  it('picks Japanese for kana or kanji, Korean first when Hangul is present', () => {
    expect(detectScriptLang('ありがとう')).toBe('ja');
    expect(detectScriptLang('カタカナ')).toBe('ja');
    expect(detectScriptLang('学校')).toBe('ja');
    expect(detectScriptLang('학교 学校')).toBe('ko');
  });
});

describe('toTtsLanguage', () => {
  it('passes the four course languages through and ignores the rest', () => {
    expect(['en', 'ko', 'ja', 'de'].map(toTtsLanguage)).toEqual(['en', 'ko', 'ja', 'de']);
    expect(toTtsLanguage('vi')).toBeNull();
    expect(toTtsLanguage(undefined)).toBeNull();
  });

  it('cannot guess German from its script: Latin text without a language is English', () => {
    expect(detectScriptLang('Guten Morgen, wie geht es Ihnen?')).toBe('en');
  });
});

describe('MachineSpeechButton', () => {
  it('speaks German with the de-DE voice and without the plural notation', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<MachineSpeechButton text="der Tisch, -e" lang="de" label="Nghe" />);
    await userEvent.click(screen.getByRole('button', { name: /^Nghe/ }));
    expect(spoken[0]).toMatchObject({ text: 'der Tisch', lang: 'de-DE' });
    expect(spoken[0]?.voice?.name).toBe('Hedda');
  });

  it('speaks with the exact-locale voice at 0.9 and shows the speaking state, stop cancels', async () => {
    const { spoken, cancel } = stubSpeechSynthesis(VOICES);
    renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe bằng giọng đọc của máy" slow />);
    expect(spoken).toHaveLength(0);
    expect(screen.getByText('Giọng đọc tự động — chỉ để luyện nghe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: Hello' }));
    expect(spoken[0]).toMatchObject({ text: 'Hello', lang: 'en-US', rate: 0.9 });
    expect(spoken[0]?.voice?.name).toBe('Yank');
    await userEvent.click(screen.getByRole('button', { name: 'Dừng đọc: Hello' }));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nghe chậm: Hello' })).toBeInTheDocument();
  });

  it('slow mode uses rate 0.7 and Korean picks the ko-KR voice', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<MachineSpeechButton text="학교" lang="ko" label="Nghe" slow />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe chậm: 학교' }));
    expect(spoken[0]).toMatchObject({ lang: 'ko-KR', rate: 0.7 });
    expect(spoken[0]?.voice?.name).toBe('Yuna');
  });

  it('returns to idle when the utterance ends', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe" />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe: Hello' }));
    await act(async () => spoken[0]?.onend?.());
    expect(screen.getByRole('button', { name: 'Nghe: Hello' })).toBeInTheDocument();
  });

  it('offers a retry after a synthesis error', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe" />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe: Hello' }));
    await act(async () => spoken[0]?.onerror?.({ error: 'synthesis-failed' }));
    const retry = screen.getByRole('button', { name: 'Không đọc được. Thử lại: Hello' });
    await userEvent.click(retry);
    expect(spoken).toHaveLength(2);
  });

  it('renders nothing when speechSynthesis is unsupported or has no voice for the language', () => {
    stubSpeechSynthesis(null);
    const { container, unmount } = renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe" />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    stubSpeechSynthesis([{ lang: 'ko-KR', name: 'Yuna' }]);
    const second = renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe" />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it('cancels speech on unmount', async () => {
    const { cancel } = stubSpeechSynthesis(VOICES);
    const { unmount } = renderExercise(<MachineSpeechButton text="Hello" lang="en" label="Nghe" />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe: Hello' }));
    cancel.mockClear();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('ListenExercise machine speech', () => {
  it('offers machine speech and slow mode without an audio asset, keeping the transcript path', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderListen();
    expect(screen.getByText('Đọc thay vì nghe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Nghe chậm/ }));
    expect(spoken[0]).toMatchObject({ text: 'Hello, my name is Lan.', rate: 0.7 });
    expect(spoken[0]?.text).not.toMatch(/Xin chào/);
  });

  it('uses the explicit lesson language for Latin-script German', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(
      <ListenExercise prompt={listenPrompt({ fallback_text: 'Guten Morgen, ich heiße Anna.' })} lang="de" seed="s" selectedId={null} onSelect={() => {}} disabled={false} marks={null} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Nghe bằng giọng đọc của máy/ }));
    expect(spoken[0]).toMatchObject({ text: 'Guten Morgen, ich heiße Anna.', lang: 'de-DE' });
  });

  it('detects Korean scripts', async () => {
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderListen({ fallback_text: '안녕하세요' });
    await userEvent.click(screen.getByRole('button', { name: /^Nghe bằng giọng đọc của máy/ }));
    expect(spoken[0]?.lang).toBe('ko-KR');
  });

  it('hides the machine button when unsupported, leaving only the transcript', () => {
    stubSpeechSynthesis(null);
    renderListen();
    expect(screen.queryByRole('button', { name: /Nghe/ })).not.toBeInTheDocument();
    expect(screen.getByText('Hello, my name is Lan.')).toBeInTheDocument();
  });

  it('keeps the recording button and no machine voice when an audio asset exists', () => {
    stubSpeechSynthesis(VOICES);
    renderListen({ audio_asset_id: 'en/hello.mp3' });
    expect(screen.getByRole('button', { name: 'Nghe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /giọng đọc của máy/ })).not.toBeInTheDocument();
  });
});
