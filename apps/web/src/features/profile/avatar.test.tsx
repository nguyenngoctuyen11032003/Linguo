import { act, render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar, AVATAR_RETRY_DELAY_MS } from '@/components/ui/Avatar';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { AuthContext } from '../auth/AuthProvider';
import { avatarUrl, prepareAvatar, sniffImageType, uploadAvatar, AvatarError, AVATAR_MAX_INPUT_BYTES } from './avatar';
import { PROFILE_REFRESH_AFTER_MS, ProfileProvider, useProfile } from './ProfileProvider';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1];
const HEIC = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0];
const TEXT = Array.from(new TextEncoder().encode('hello world, not an image'));
const file = (bytes: number[], name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

function stubCanvas(toBlob: (cb: (b: Blob | null) => void, type?: string, quality?: number) => void) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage, fillStyle: '' } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as HTMLCanvasElement['toBlob']);
  return drawImage;
}
const okBlob = (cb: (b: Blob | null) => void) => cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sniffImageType', () => {
  it('recognises phone formats by magic bytes whatever file.type says', async () => {
    expect(await sniffImageType(file(JPEG, 'a', ''))).toBe('jpeg');
    expect(await sniffImageType(file(HEIC, 'a', ''))).toBe('heif');
    expect(await sniffImageType(file(TEXT, 'a.jpg', 'image/jpeg'))).toBeNull();
  });
});

describe('prepareAvatar on mobile pickers', () => {
  const bitmap = { width: 400, height: 300, close: vi.fn() };

  it('accepts a photo whose MIME type is empty (Android) and decodes it with EXIF orientation', async () => {
    const create = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', create);
    const draw = stubCanvas((cb) => okBlob(cb));
    const blob = await prepareAvatar(file(JPEG, 'IMG_0001.jpg', ''));
    expect(blob.type).toBe('image/jpeg');
    expect(create).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' });
    // Centre crop of the 400x300 bitmap.
    expect(draw).toHaveBeenCalledWith(bitmap, 50, 0, 300, 300, 0, 0, 256, 256);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('accepts HEIC (image/heic or no type) when the browser can decode it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    stubCanvas((cb) => okBlob(cb));
    await expect(prepareAvatar(file(HEIC, 'IMG_0002.HEIC', 'image/heic'))).resolves.toBeInstanceOf(Blob);
    await expect(prepareAvatar(file(HEIC, 'IMG_0003.HEIC', ''))).resolves.toBeInstanceOf(Blob);
  });

  it('falls back to createImageBitmap without options, then to an <img>', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('options unsupported')).mockResolvedValueOnce(bitmap);
    vi.stubGlobal('createImageBitmap', create);
    stubCanvas((cb) => okBlob(cb));
    await prepareAvatar(file(JPEG, 'a.jpg', 'image/jpeg'));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]).toHaveLength(2);

    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nope')));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:img'), revokeObjectURL: vi.fn() }));
    const img = { decode: vi.fn().mockResolvedValue(undefined), naturalWidth: 200, naturalHeight: 100, decoding: '', src: '' };
    vi.stubGlobal('Image', function FakeImage() {
      return img;
    });
    const draw = stubCanvas((cb) => okBlob(cb));
    await prepareAvatar(file(JPEG, 'a.jpg', 'image/jpeg'));
    expect(draw).toHaveBeenCalledWith(img, 50, 0, 100, 100, 0, 0, 256, 256);
  });

  it('retries toBlob without a quality when the WebView returns null, and reports DECODE if it still fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const calls: Array<number | undefined> = [];
    stubCanvas((cb, _type, quality) => {
      calls.push(quality);
      if (quality !== undefined) cb(null);
      else okBlob(cb);
    });
    await expect(prepareAvatar(file(JPEG, 'a.jpg', 'image/jpeg'))).resolves.toBeInstanceOf(Blob);
    expect(calls).toEqual([0.88, undefined]);

    stubCanvas((cb) => cb(null));
    await expect(prepareAvatar(file(JPEG, 'a.jpg', 'image/jpeg'))).rejects.toMatchObject({ code: 'DECODE' });
  });

  it('rejects non-images and huge files with a specific error', async () => {
    await expect(prepareAvatar(file(TEXT, 'notes.txt', 'text/plain'))).rejects.toMatchObject({ code: 'TYPE' });
    await expect(prepareAvatar(file(TEXT, 'noext', ''))).rejects.toBeInstanceOf(AvatarError);
    const big = file(JPEG, 'big.jpg', 'image/jpeg');
    Object.defineProperty(big, 'size', { value: AVATAR_MAX_INPUT_BYTES + 1 });
    await expect(prepareAvatar(big)).rejects.toMatchObject({ code: 'SIZE' });
  });
});

describe('uploadAvatar', () => {
  it('shows the new picture at once through a local preview, falling back to the public URL after', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const client = Object.assign(fakeClient({ profiles: fakeQuery({ data: [{ id: 'u1' }] }) }), {
      storage: { from: () => ({ upload, remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatars/${p}` } }) }) },
    });
    const path = await uploadAvatar(client, 'u1', new Blob(['x']), 'u1/old.jpg');
    expect(created).toHaveBeenCalled();
    expect(avatarUrl(client, path)).toBe('blob:preview-1');
    expect(remove).toHaveBeenCalledWith(['u1/old.jpg']);
    // A different (older) path is never replaced by the preview.
    expect(avatarUrl(client, 'u1/other.jpg')).toBe('https://x.supabase.co/storage/v1/object/public/avatars/u1/other.jpg');
    expect(avatarUrl(null, null)).toBeNull();
    revoke.mockRestore();
  });
});

describe('Avatar', () => {
  beforeEach(() => vi.useFakeTimers());

  it('retries a failed image once with a fresh URL, then settles on the initial letter', () => {
    const { container } = render(<Avatar src="https://x.supabase.co/a.jpg" initial="M" />);
    const first = container.querySelector('img')!;
    expect(first.getAttribute('src')).toBe('https://x.supabase.co/a.jpg');

    act(() => void first.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('M')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(AVATAR_RETRY_DELAY_MS));
    const second = container.querySelector('img')!;
    expect(second.getAttribute('src')).toBe('https://x.supabase.co/a.jpg?r=1');

    act(() => void second.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    act(() => void vi.advanceTimersByTime(AVATAR_RETRY_DELAY_MS * 3));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('starts over with a new src', () => {
    const { container, rerender } = render(<Avatar src="https://x/a.jpg" initial="M" />);
    act(() => void container.querySelector('img')!.dispatchEvent(new Event('error')));
    act(() => void vi.advanceTimersByTime(AVATAR_RETRY_DELAY_MS));
    act(() => void container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull();
    rerender(<Avatar src="https://x/b.jpg" initial="M" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/b.jpg');
  });
});

describe('ProfileProvider refresh on return to the app', () => {
  function Probe() {
    const { profile, setProfile } = useProfile();
    return (
      <>
        <span>{`avatar:${profile?.avatarPath ?? 'none'}`}</span>
        <button onClick={() => profile && setProfile({ ...profile, avatarPath: 'local' })}>set</button>
      </>
    );
  }
  const user = { id: 'u1' } as User;
  const mount = () =>
    render(
      <AuthContext.Provider value={{ status: 'signed-in', session: null, user }}>
        <ProfileProvider>
          <Probe />
        </ProfileProvider>
      </AuthContext.Provider>,
    );

  it('re-reads the profile when the app becomes visible after a while, but not for a local write in flight', async () => {
    let avatar: string | null = null;
    mocks.client = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: () => Promise.resolve({ data: { id: 'u1', display_name: 'A', timezone: 'UTC', avatar_path: avatar }, error: null }),
        };
        return builder;
      },
    };
    const now = vi.spyOn(Date, 'now');
    const t0 = 1_000_000;
    now.mockReturnValue(t0);
    mount();
    expect(await screen.findByText('avatar:none')).toBeInTheDocument();

    // Too soon: nothing happens.
    avatar = 'u1/new.jpg';
    now.mockReturnValue(t0 + 1000);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await Promise.resolve();
    expect(screen.getByText('avatar:none')).toBeInTheDocument();

    now.mockReturnValue(t0 + PROFILE_REFRESH_AFTER_MS + 1);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(await screen.findByText('avatar:u1/new.jpg')).toBeInTheDocument();
  });
});
