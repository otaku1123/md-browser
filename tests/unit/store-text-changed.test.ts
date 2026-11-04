import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { listingChanged, previousTag, storeTextChanged } from '../../scripts/store-text-changed.mjs';

const diff = (...lines: string[]) =>
  ['diff --git a/docs/store/listing.md b/docs/store/listing.md', '--- a/docs/store/listing.md', '+++ b/docs/store/listing.md', '@@ -1 +1 @@', ...lines].join('\n');

describe('listingChanged', () => {
  it('ignores the zip name line, which changes every release', () => {
    expect(listingChanged('')).toBe(false);
    expect(listingChanged(diff('-| アップロードするファイル | `release/md-browser-1.10.0.zip` |', '+| アップロードするファイル | `release/md-browser-1.13.0.zip` |'))).toBe(false);
  });

  it('sees any other changed line', () => {
    expect(listingChanged(diff('-• Click an image to see it at full size', '+• Click an image to see it at full size, zoom and pan'))).toBe(true);
    expect(listingChanged(diff('+• A new feature bullet'))).toBe(true);
  });
});

describe('storeTextChanged', () => {
  it('compares with the tag before the released one, and treats a first release as unchanged', () => {
    const calls: string[][] = [];
    const run = vi.fn((args: string[]) => {
      calls.push(args);
      if (args[0] === 'describe') return 'v1.10.0\n';
      return diff('+• new');
    });
    expect(storeTextChanged('v1.13.0', run, () => {})).toBe(true);
    expect(calls[0]).toEqual(['describe', '--tags', '--abbrev=0', '--match', 'v*', 'v1.13.0^']);
    expect(calls[1]).toEqual(['diff', 'v1.10.0', 'v1.13.0', '--', 'docs/store/listing.md']);

    const none = () => {
      throw new Error('fatal: No tags can describe');
    };
    expect(previousTag('v1.0.0', none)).toBeNull();
    expect(storeTextChanged('v1.0.0', none, () => {})).toBe(false);
  });
});
