import type { AppSupabaseClient } from '@/lib/supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_SIZE = 256;
/** Phone cameras produce 5-15 MB photos (HEIC/JPEG): the picture is downscaled to 256 px here, so be generous. */
export const AVATAR_MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type AvatarErrorCode = 'TYPE' | 'SIZE' | 'DECODE';

export class AvatarError extends Error {
  constructor(readonly code: AvatarErrorCode) {
    super(code);
  }
}

export function avatarErrorMessage(error: unknown): string {
  if (error instanceof AvatarError) {
    if (error.code === 'TYPE') return 'Chỉ hỗ trợ ảnh (JPG, PNG, WebP, HEIC).';
    if (error.code === 'SIZE') return 'Ảnh quá lớn (tối đa 25 MB).';
    return 'Không đọc được ảnh này (HEIC có thể chưa được hỗ trợ trên thiết bị). Hãy thử ảnh JPG hoặc PNG.';
  }
  const text = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/bucket not found|avatar_path|schema cache|column/i.test(text)) return 'Tính năng ảnh đại diện chưa sẵn sàng trên máy chủ. Vui lòng thử lại sau ít phút.';
  return 'Chưa tải được ảnh đại diện. Vui lòng thử lại.';
}

/**
 * Object URLs of freshly uploaded avatars, keyed by storage path: the picture shows at once (and keeps showing
 * even if the phone is slow to fetch it from Storage). Only the latest one is kept.
 */
const previews = new Map<string, string>();

export function rememberAvatarPreview(path: string, blob: Blob): void {
  try {
    const url = URL.createObjectURL(blob);
    for (const [key, old] of previews) {
      URL.revokeObjectURL(old);
      previews.delete(key);
    }
    previews.set(path, url);
  } catch {
    // No object URLs (very old WebView): the public URL is used instead.
  }
}

/** Public URL of a stored avatar (or its local preview right after an upload), null for the initial-letter fallback. */
export function avatarUrl(client: AppSupabaseClient | null, path: string | null | undefined): string | null {
  if (!path) return null;
  const preview = previews.get(path);
  if (preview) return preview;
  if (!client) return null;
  return client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif', 'avif', 'avis'];

async function readHead(file: Blob, length: number): Promise<Uint8Array> {
  const part = file.slice(0, length);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(part);
  });
}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

/** Recognises the image formats a phone picker hands out by their first bytes (file.type is often '' or wrong). */
export async function sniffImageType(file: Blob): Promise<'jpeg' | 'png' | 'webp' | 'gif' | 'heif' | null> {
  let head: Uint8Array;
  try {
    head = await readHead(file, 16);
  } catch {
    return null;
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head[0] === 0x89 && ascii(head, 1, 4) === 'PNG') return 'png';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'webp';
  if (ascii(head, 0, 3) === 'GIF') return 'gif';
  if (ascii(head, 4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(head, 8, 12))) return 'heif';
  return null;
}

/** Image the picker returned, however the phone labels it: by magic bytes first, then MIME type, then extension. */
async function looksLikeImage(file: File): Promise<boolean> {
  if (await sniffImageType(file)) return true;
  const type = (file.type ?? '').toLowerCase();
  if (type.startsWith('image/')) return !type.includes('svg');
  if (type === '' || type === 'application/octet-stream') return IMAGE_EXTENSION.test(file.name ?? '');
  return false;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeWithImageElement(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    if (typeof img.decode === 'function') await img.decode();
    else
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode'));
      });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error('empty');
    return { source: img, width, height, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** createImageBitmap honouring the EXIF rotation of phone photos, then without options (old WebKit), then an <img>. */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' as const }, undefined]) {
      try {
        const bitmap = await createImageBitmap(file, options);
        if (bitmap.width > 0 && bitmap.height > 0) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        bitmap.close();
      } catch {
        // Try the next decoder.
      }
    }
  }
  try {
    return await decodeWithImageElement(file);
  } catch {
    throw new AvatarError('DECODE');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Centre-crops to a square and downsizes to AVATAR_SIZE as JPEG: small upload, consistent shape everywhere. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new AvatarError('SIZE');
  if (!(await looksLikeImage(file))) throw new AvatarError('TYPE');
  const image = await decode(file);
  try {
    const side = Math.min(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('DECODE');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(image.source, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    // Some mobile WebViews return null for toBlob (or cannot encode with a quality): retry plainly before giving up.
    const blob = (await canvasToBlob(canvas, 'image/jpeg', 0.88)) ?? (await canvasToBlob(canvas, 'image/jpeg'));
    if (!blob || blob.size === 0) throw new AvatarError('DECODE');
    return blob;
  } finally {
    image.close();
  }
}

/** Uploads under <uid>/<timestamp>.jpg (a new URL each time, so caches never show a stale picture), then points the profile at it. */
export async function uploadAvatar(client: AppSupabaseClient, userId: string, blob: Blob, previousPath: string | null): Promise<string> {
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from('profiles').update({ avatar_path: path }).eq('id', userId).select('id');
  if (error || !data || data.length === 0) {
    await client.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
    throw error ?? new Error('NO_ROWS_UPDATED');
  }
  rememberAvatarPreview(path, blob);
  if (previousPath) await client.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => undefined);
  return path;
}

export async function removeAvatar(client: AppSupabaseClient, userId: string, path: string): Promise<void> {
  const { data, error } = await client.from('profiles').update({ avatar_path: null }).eq('id', userId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('NO_ROWS_UPDATED');
  await client.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
}
