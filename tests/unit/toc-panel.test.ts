import { describe, expect, it } from 'vitest';
import {
  clampTocWidth,
  normalizeTocPanel,
  TOC_WIDTH_DEFAULT,
  TOC_WIDTH_MAX,
  TOC_WIDTH_MIN,
} from '../../src/core/toc-panel';

describe('clampTocWidth', () => {
  it('keeps values in range (rounded) and clamps the rest', () => {
    expect(clampTocWidth(300.4)).toBe(300);
    expect(clampTocWidth(10)).toBe(TOC_WIDTH_MIN);
    expect(clampTocWidth(9999)).toBe(TOC_WIDTH_MAX);
  });

  it('falls back to the default for non-numbers', () => {
    for (const v of [undefined, null, '300', NaN, Infinity, {}]) expect(clampTocWidth(v)).toBe(TOC_WIDTH_DEFAULT);
  });
});

describe('normalizeTocPanel', () => {
  it('defaults to open at the default width', () => {
    for (const raw of [undefined, null, 'x', 5, {}]) {
      expect(normalizeTocPanel(raw)).toEqual({ open: true, width: TOC_WIDTH_DEFAULT });
    }
  });

  it('keeps a stored choice and sanitises bad fields', () => {
    expect(normalizeTocPanel({ open: false, width: 400 })).toEqual({ open: false, width: 400 });
    expect(normalizeTocPanel({ open: 'no', width: 1 })).toEqual({ open: true, width: TOC_WIDTH_MIN });
  });
});
