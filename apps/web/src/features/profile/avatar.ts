import type { AppSupabaseClient } from '@/lib/supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export type AvatarErrorCode = 'TYPE' | 'SIZE' | 'DECODE';

export class AvatarError extends Error {
  constructor(readonly code: AvatarErrorCode) {
    super(code);
  }
}

export function avatarErrorMessage(error: unknown): string {
  if (error instanceof AvatarError) {
    if (error.code === 'TYPE') return 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.';
    if (error.code === 'SIZE') return 'Ảnh quá lớn (tối đa 10 MB).';
    return 'Không đọc được ảnh này. Hãy thử ảnh khác.';
  }
  return 'Chưa tải được ảnh đại diện. Vui lòng thử lại.';
}

/** Public URL of a stored avatar, or null for the initial-letter fallback. */
export function avatarUrl(client: AppSupabaseClient | null, path: string | null | undefined): string | null {
  if (!client || !path) return null;
  return client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Centre-crops to a square and downsizes to AVATAR_SIZE as JPEG: small upload, consistent shape everywhere. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new AvatarError('TYPE');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new AvatarError('SIZE');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarError('DECODE');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('DECODE');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) throw new AvatarError('DECODE');
    return blob;
  } finally {
    bitmap.close();
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
  if (previousPath) await client.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => undefined);
  return path;
}

export async function removeAvatar(client: AppSupabaseClient, userId: string, path: string): Promise<void> {
  const { data, error } = await client.from('profiles').update({ avatar_path: null }).eq('id', userId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('NO_ROWS_UPDATED');
  await client.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
}
