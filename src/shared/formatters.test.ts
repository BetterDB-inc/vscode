import { describe, it, expect } from 'vitest';
import { formatTTL } from './formatters';

describe('formatTTL', () => {
  it('returns "No expiry" for TTL -1', () => {
    expect(formatTTL(-1)).toBe('No expiry');
  });

  it('returns "Key does not exist" for TTL -2', () => {
    expect(formatTTL(-2)).toBe('Key does not exist');
  });

  it('formats seconds correctly', () => {
    expect(formatTTL(0)).toBe('0s');
    expect(formatTTL(1)).toBe('1s');
    expect(formatTTL(30)).toBe('30s');
    expect(formatTTL(59)).toBe('59s');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatTTL(60)).toBe('1m 0s');
    expect(formatTTL(90)).toBe('1m 30s');
    expect(formatTTL(125)).toBe('2m 5s');
    expect(formatTTL(3599)).toBe('59m 59s');
  });

  it('formats hours and minutes correctly', () => {
    expect(formatTTL(3600)).toBe('1h 0m');
    expect(formatTTL(3660)).toBe('1h 1m');
    expect(formatTTL(7200)).toBe('2h 0m');
    expect(formatTTL(7320)).toBe('2h 2m');
    expect(formatTTL(86399)).toBe('23h 59m');
  });

  it('formats days and hours correctly', () => {
    expect(formatTTL(86400)).toBe('1d 0h');
    expect(formatTTL(90000)).toBe('1d 1h');
    expect(formatTTL(172800)).toBe('2d 0h');
    expect(formatTTL(259200)).toBe('3d 0h');
    expect(formatTTL(604800)).toBe('7d 0h');
  });
});
