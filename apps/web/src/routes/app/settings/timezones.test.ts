import { describe, expect, it } from 'vitest';
import { timeZoneLabel, timeZoneOptions } from './timezones';

const LIST = ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Europe/Paris', 'UTC'];

describe('timeZoneOptions', () => {
  it('drops an alias whose canonical twin is listed', () => {
    expect(timeZoneOptions('Asia/Ho_Chi_Minh', LIST)).toEqual(['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Europe/Paris', 'UTC']);
  });

  it('keeps a stored alias as the single entry for its place', () => {
    expect(timeZoneOptions('Asia/Saigon', LIST)).toEqual(['Asia/Bangkok', 'Asia/Saigon', 'Europe/Paris', 'UTC']);
  });

  it('keeps the stored canonical value when the browser only lists the alias', () => {
    expect(timeZoneOptions('Asia/Ho_Chi_Minh', ['Asia/Bangkok', 'Asia/Saigon', 'UTC'])).toEqual(['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'UTC']);
  });

  it('adds a stored zone the browser does not list', () => {
    expect(timeZoneOptions('Mars/Olympus', LIST)[0]).toBe('Mars/Olympus');
  });
});

describe('timeZoneLabel', () => {
  it('names Vietnam in Vietnamese, also for the Saigon alias', () => {
    expect(timeZoneLabel('Asia/Ho_Chi_Minh')).toBe('Việt Nam (Hà Nội, TP.HCM)');
    expect(timeZoneLabel('Asia/Saigon')).toBe('Việt Nam (Hà Nội, TP.HCM)');
  });

  it('falls back to the readable IANA name', () => {
    expect(timeZoneLabel('America/New_York')).toBe('America/New York');
  });
});
