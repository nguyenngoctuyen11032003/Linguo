import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_SENTENCES } from '@/features/speaking/content';
import { loadReflections } from '@/features/speaking/ratings';
import type { SpeakingMaterial } from '@/features/speaking/useSpeakingMaterial';
import type { TtsApi } from '@/features/speaking/useTts';
import { renderWithProviders, TEST_USER_ID } from '../../../../tests/unit/render';
import { SpeakingPage } from './SpeakingPage';

const mocks = vi.hoisted(() => ({
  material: null as unknown as SpeakingMaterial,
  tts: null as unknown as TtsApi,
}));
vi.mock('@/features/speaking/useSpeakingMaterial', () => ({ useSpeakingMaterial: () => mocks.material }));
vi.mock('@/features/speaking/useTts', () => ({ useTts: () => mocks.tts }));

const LESSON_SENTENCES = [
  { id: 's1', text: 'Good morning, how are you today?', translation: 'Chào buổi sáng, hôm nay bạn thế nào?' },
  { id: 's2', text: 'I am fine, thank you.', translation: 'Tôi khỏe, cảm ơn.' },
];

function material(overrides: Partial<SpeakingMaterial> = {}): SpeakingMaterial {
  return {
    status: 'ready',
    lang: 'en',
    lessons: [],
    lessonId: null,
    lessonTitle: 'Chào hỏi',
    selectLesson: vi.fn(),
    sentences: LESSON_SENTENCES,
    usingFallback: false,
    ...overrides,
  };
}

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function installRecorder() {
  stream = new FakeStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  URL.createObjectURL = vi.fn(() => 'blob:rec');
  URL.revokeObjectURL = vi.fn();
}

function removeRecorder() {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  mocks.material = material();
  mocks.tts = { available: true, speakingText: null, play: vi.fn(), stop: vi.fn() };
  installRecorder();
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeRecorder();
});

const render = () => renderWithProviders(<SpeakingPage />, { route: '/app/luyen-noi' });

describe('SpeakingPage', () => {
  it('shows the privacy line and the repeat-the-sentence mode first', () => {
    render();
    expect(screen.getByRole('heading', { level: 1, name: 'Luyện nói' })).toBeInTheDocument();
    expect(screen.getByText(/Linguo không tải lên hay lưu bản ghi nào/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhắc lại câu', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('Good morning, how are you today?')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Câu 1/2')).toBeInTheDocument();
  });

  it('listens to the sample with text to speech and falls back to the script without a voice', async () => {
    const user = userEvent.setup();
    const view = render();
    await user.click(screen.getByRole('button', { name: 'Nghe mẫu' }));
    expect(mocks.tts.play).toHaveBeenCalledWith('Good morning, how are you today?');
    view.unmount();
    mocks.tts = { ...mocks.tts, available: false };
    render();
    expect(screen.queryByRole('button', { name: 'Nghe mẫu' })).toBeNull();
    expect(screen.getByText(/Trình duyệt chưa có giọng đọc tiếng Anh/)).toBeInTheDocument();
  });

  it('records, plays back from memory, self-rates and saves only the ratings on this device', async () => {
    const user = userEvent.setup();
    render();
    expect(screen.queryByText('Tự đánh giá')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
    expect(await screen.findByRole('button', { name: 'Dừng ghi âm' })).toBeInTheDocument();
    expect(screen.getByText('Đang ghi âm.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    const audio = await screen.findByLabelText('Bản ghi giọng của bạn');
    expect(audio).toHaveAttribute('src', 'blob:rec');
    expect(stream.tracks[0]?.stopped).toBe(true);
    // Five separate axes, no overall grade.
    for (const axis of ['Độ dễ hiểu', 'Âm mục tiêu', 'Nhịp và ngắt nghỉ', 'Độ trôi chảy', 'Hợp nội dung']) {
      expect(screen.getByRole('group', { name: axis })).toBeInTheDocument();
    }
    expect(screen.queryByText(/điểm số:|Tổng điểm|\d+\s*\/\s*100/)).toBeNull();
    const save = screen.getByRole('button', { name: 'Lưu tự đánh giá trên thiết bị này' });
    expect(save).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: 'Độ dễ hiểu' })).getByLabelText('Khá tốt'));
    await user.click(within(screen.getByRole('group', { name: 'Độ trôi chảy' })).getByLabelText('Cần luyện thêm'));
    await user.click(save);
    expect(screen.getByText(/Đã lưu trên thiết bị này/)).toBeInTheDocument();
    expect(loadReflections(TEST_USER_ID)).toEqual([
      expect.objectContaining({ mode: 'repeat', lang: 'en', ratings: { clarity: 3, fluency: 1 } }),
    ]);
    expect(screen.getByText('Bạn đã lưu 1 lần tự đánh giá trên thiết bị này.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xoá các tự đánh giá đã lưu' }));
    expect(loadReflections(TEST_USER_ID)).toEqual([]);
  });

  it('releases the microphone and the audio when the learner leaves the page', async () => {
    const user = userEvent.setup();
    const view = render();
    await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
    await screen.findByRole('button', { name: 'Dừng ghi âm' });
    view.unmount();
    expect(stream.tracks[0]?.stopped).toBe(true);
  });

  it('moves between sentences', async () => {
    const user = userEvent.setup();
    render();
    expect(screen.getByRole('button', { name: /Câu trước/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Câu tiếp/ }));
    expect(screen.getByText('I am fine, thank you.')).toBeInTheDocument();
    expect(screen.getByText('Câu 2/2')).toBeInTheDocument();
    expect(mocks.tts.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Câu tiếp/ })).toBeDisabled();
  });

  describe('fallback without a usable microphone', () => {
    it('offers listen + script + self-practice when recording is unsupported', () => {
      removeRecorder();
      render();
      expect(screen.queryByRole('button', { name: 'Bắt đầu ghi âm' })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Nghe và tự luyện' })).toBeInTheDocument();
      expect(screen.getAllByText(/chưa hỗ trợ ghi âm/).length).toBeGreaterThan(0);
      expect(screen.getByText('Good morning, how are you today?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nghe mẫu' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Độ dễ hiểu' })).toBeInTheDocument();
    });

    it('explains a denied permission, never blocks, and lets the learner retry', async () => {
      const user = userEvent.setup();
      getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
      render();
      await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
      expect(await screen.findByRole('heading', { name: 'Nghe và tự luyện' })).toBeInTheDocument();
      expect(screen.getAllByText(/chưa được dùng micro/).length).toBeGreaterThan(0);
      await user.click(screen.getByRole('button', { name: 'Thử ghi âm lại' }));
      await user.click(await screen.findByRole('button', { name: 'Dừng ghi âm' }));
      expect(await screen.findByLabelText('Bản ghi giọng của bạn')).toBeInTheDocument();
      // Nothing is blocked: other sentences still work.
      await user.click(screen.getByRole('button', { name: /Câu tiếp/ }));
      expect(screen.getByText('I am fine, thank you.')).toBeInTheDocument();
    });

    it('explains a missing device', async () => {
      const user = userEvent.setup();
      getUserMedia.mockRejectedValueOnce(new DOMException('none', 'NotFoundError'));
      render();
      await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
      expect((await screen.findAllByText(/Không tìm thấy micro/)).length).toBeGreaterThan(0);
    });
  });

  describe('automatic transcript', () => {
    class FakeRecognition {
      static last: FakeRecognition | null = null;
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        FakeRecognition.last = this;
      }
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
    }

    it('is hidden without SpeechRecognition', () => {
      render();
      expect(screen.queryByLabelText(/Bật bản chép lời tự động/)).toBeNull();
      expect(screen.queryByText('Bản chép lời có thể sai')).toBeNull();
    });

    it('is opt-in, editable, and compared with the sentence only as a hint', async () => {
      vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
      const user = userEvent.setup();
      render();
      const toggle = screen.getByLabelText(/Bật bản chép lời tự động/);
      expect(toggle).not.toBeChecked();
      expect(screen.getByText(/gửi âm thanh tới dịch vụ nhận dạng giọng nói/)).toBeInTheDocument();
      await user.click(toggle);

      await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
      await screen.findByRole('button', { name: 'Dừng ghi âm' });
      expect(FakeRecognition.last?.lang).toBe('en-US');
      act(() => {
        FakeRecognition.last?.onresult?.({ results: [Object.assign([{ transcript: 'good morning how are' }], { isFinal: true })] });
      });
      await user.click(screen.getByRole('button', { name: 'Dừng ghi âm' }));

      const box = await screen.findByLabelText('Bản chép lời có thể sai');
      expect(box).toHaveValue('good morning how are');
      const hint = screen.getByTestId('overlap-hint');
      expect(hint).toHaveTextContent('Từ trong câu mẫu chưa thấy trong bản chép: you, today');
      expect(hint).toHaveTextContent('không phải điểm số');
      await user.clear(box);
      await user.type(box, 'good morning how are you today');
      expect(screen.getByTestId('overlap-hint')).toHaveTextContent(/khá khớp/);
    });
  });

  describe('open answer', () => {
    it('shows a Vietnamese question, a starter and lesson sentences as help, and rotates prompts', async () => {
      const user = userEvent.setup();
      render();
      await user.click(screen.getByRole('button', { name: 'Trả lời mở' }));
      expect(screen.getByText(/Hãy nói 2–3 câu liên quan đến bài “Chào hỏi”/)).toBeInTheDocument();
      expect(screen.getByText('Câu mẫu từ bài học để tham khảo')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Câu hỏi khác' }));
      expect(screen.getByText('Hãy giới thiệu bản thân trong 2–3 câu.')).toBeInTheDocument();
      expect(screen.getByText(/My name is/)).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })).toBeInTheDocument();
    });
  });

  describe('role-play', () => {
    it('walks through the scripted exchange and records only the learner turns', async () => {
      const user = userEvent.setup();
      render();
      await user.click(screen.getByRole('button', { name: 'Đóng vai' }));
      expect(screen.getByText('Hi! What would you like to drink?')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Bắt đầu ghi âm' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Nghe đối phương' }));
      expect(mocks.tts.play).toHaveBeenCalledWith('Hi! What would you like to drink?');
      await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      expect(screen.getByText('đến lượt bạn', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('I would like a cup of tea, please.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })).toBeInTheDocument();
      // Finish the remaining five of the six turns.
      for (let i = 0; i < 5; i++) {
        await user.click(screen.getByRole('button', { name: /^(Xong lượt của tôi|Tiếp tục)$/ }));
      }
      expect(screen.getByText(/làm tốt lắm/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Luyện lại từ đầu' }));
      expect(screen.getByText('Hi! What would you like to drink?')).toBeInTheDocument();
    });

    it('works in Korean with Korean script', async () => {
      mocks.material = material({ lang: 'ko', sentences: FALLBACK_SENTENCES.ko });
      const user = userEvent.setup();
      render();
      await user.click(screen.getByRole('button', { name: 'Đóng vai' }));
      expect(screen.getByText('어서 오세요. 뭘 드릴까요?')).toHaveAttribute('lang', 'ko');
    });
  });

  it('says when a lesson has no short sentences and a fallback set is used', () => {
    mocks.material = material({ sentences: FALLBACK_SENTENCES.en, usingFallback: true });
    render();
    expect(screen.getByText(/chưa có câu ngắn để nhắc lại/)).toBeInTheDocument();
    expect(screen.getByText('Nice to meet you.')).toBeInTheDocument();
  });

  it('shows a loading state and an empty state without a path', async () => {
    mocks.material = material({ status: 'loading', lang: null, sentences: [] });
    const view = render();
    expect(screen.getByText('Đang chuẩn bị bài luyện nói…')).toBeInTheDocument();
    view.unmount();
    mocks.material = material({ lang: null, sentences: [] });
    render();
    expect(screen.getByRole('link', { name: 'Tạo lộ trình' })).toHaveAttribute('href', '/app/bat-dau');
    await waitFor(() => expect(screen.queryByText('Nhắc lại câu')).toBeNull());
  });
});
