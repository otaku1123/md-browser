import { describe, expect, it } from 'vitest';
import { normalizeScanLimit, SCAN_LIMIT_DEFAULT, SCAN_LIMIT_MAX, SCAN_LIMIT_MIN } from '../../src/core/scan-limit';

describe('normalizeScanLimit', () => {
  it('keeps values in range and accepts numeric strings from the input field', () => {
    expect(normalizeScanLimit(20000)).toBe(20000);
    expect(normalizeScanLimit('12345')).toBe(12345);
    expect(normalizeScanLimit(1500.6)).toBe(1501);
  });

  it('clamps to the minimum and maximum', () => {
    expect(normalizeScanLimit(1)).toBe(SCAN_LIMIT_MIN);
    expect(normalizeScanLimit(-5)).toBe(SCAN_LIMIT_MIN);
    expect(normalizeScanLimit(SCAN_LIMIT_MAX * 10)).toBe(SCAN_LIMIT_MAX);
  });

  it('falls back to the default when unset or not a number', () => {
    for (const v of [undefined, null, '', 'abc', NaN, Infinity, {}]) expect(normalizeScanLimit(v)).toBe(SCAN_LIMIT_DEFAULT);
  });
});
