import { describe, expect, it } from 'vitest';
import { readBool, readString, writeBool, writeString } from './storage';

describe('storage', () => {
  it('round-trips strings and booleans', () => {
    writeString('k', 'v');
    writeBool('b', true);
    expect(readString('k')).toBe('v');
    expect(readBool('b')).toBe(true);
    expect(readBool('missing')).toBe(false);
    expect(readString('missing')).toBeNull();
  });
});
