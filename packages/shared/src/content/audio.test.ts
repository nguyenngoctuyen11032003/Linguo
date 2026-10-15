import { describe, expect, it } from 'vitest';
import { AUDIO_BUCKET, audioAssetLang, audioAssetPath, audioAssetUrl, isAudioAssetId } from './audio';

const KO = 'ko-0123456789abcdef0123456789abcdef';
const EN = 'en-fedcba9876543210fedcba9876543210';

describe('audio asset ids', () => {
  it('accepts the generated shape only', () => {
    expect(isAudioAssetId(KO)).toBe(true);
    expect(isAudioAssetId(EN)).toBe(true);
    expect(isAudioAssetId('ja-0123456789abcdef0123456789abcdef')).toBe(true);
    for (const bad of [null, undefined, '', 42, 'ko-0123', 'KO-0123456789abcdef0123456789abcdef', `${KO}0`, 'ko-0123456789ABCDEF0123456789abcdef', '../ko-0123456789abcdef0123456789abcdef', 'kor-0123456789abcdef0123456789abcdef']) {
      expect(isAudioAssetId(bad)).toBe(false);
    }
  });

  it('extracts the language', () => {
    expect(audioAssetLang(KO)).toBe('ko');
    expect(audioAssetLang(EN)).toBe('en');
    expect(audioAssetLang('legacy-id')).toBeNull();
    expect(audioAssetLang(null)).toBeNull();
  });

  it('builds the bucket path', () => {
    expect(audioAssetPath(KO)).toBe(`ko/${KO}.wav`);
    expect(audioAssetPath(null)).toBeNull();
    expect(audioAssetPath('x/../y')).toBeNull();
  });
});

describe('audioAssetUrl', () => {
  it('follows the public URL contract', () => {
    expect(AUDIO_BUCKET).toBe('content-audio');
    expect(audioAssetUrl(KO, 'https://abc.supabase.co')).toBe(
      `https://abc.supabase.co/storage/v1/object/public/content-audio/ko/${KO}.wav`,
    );
  });

  it('ignores trailing slashes and whitespace on the base URL', () => {
    expect(audioAssetUrl(EN, ' http://127.0.0.1:54321// ')).toBe(
      `http://127.0.0.1:54321/storage/v1/object/public/content-audio/en/${EN}.wav`,
    );
  });

  it('returns null when there is no usable recording', () => {
    expect(audioAssetUrl(null, 'https://abc.supabase.co')).toBeNull();
    expect(audioAssetUrl(undefined, 'https://abc.supabase.co')).toBeNull();
    expect(audioAssetUrl('not-an-id', 'https://abc.supabase.co')).toBeNull();
    expect(audioAssetUrl(KO, '')).toBeNull();
  });
});
