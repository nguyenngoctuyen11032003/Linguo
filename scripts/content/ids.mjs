// Stable content ids: RFC 4122 UUIDv5 (SHA-1) of the repo key under CONTENT_UUID_NAMESPACE, so
// re-importing the same key always targets the same row.
import { createHash } from 'node:crypto';
import { CONTENT_UUID_NAMESPACE } from '@linguo/shared';

function uuidBytes(uuid) {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Invalid namespace UUID: ${uuid}`);
  return Buffer.from(hex, 'hex');
}

export function uuidV5(name, namespace) {
  const hash = createHash('sha1').update(uuidBytes(namespace)).update(Buffer.from(name, 'utf8')).digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function contentId(key) {
  return uuidV5(key, CONTENT_UUID_NAMESPACE);
}
