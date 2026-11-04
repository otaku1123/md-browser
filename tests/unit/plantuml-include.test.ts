import { afterEach, describe, expect, it, vi } from 'vitest';
import { includeUrl, plantUmlFileLoader, setPlantUmlFileReader } from '../../src/core/plantuml';

afterEach(() => setPlantUmlFileReader(null));

describe('includeUrl', () => {
  it('resolves against the document for an include in the diagram, and against the including file otherwise', () => {
    expect(includeUrl('common.iuml', null, 'file:///docs/sub/a.md')).toBe('file:///docs/sub/common.iuml');
    expect(includeUrl('../styles/x.puml', null, 'file:///docs/sub/a.md')).toBe('file:///docs/styles/x.puml');
    expect(includeUrl('inner.iuml', 'file:///docs/inc/outer.puml', 'file:///docs/sub/a.md')).toBe('file:///docs/inc/inner.iuml');
    expect(includeUrl('themes/puml-theme-x.puml', null, 'file:///docs/a.md')).toBe('file:///docs/themes/puml-theme-x.puml');
  });

  it('is null for something that is not a path at all', () => {
    expect(includeUrl('http://[bad', null, 'file:///docs/a.md')).toBeNull();
  });
});

describe('plantUmlFileLoader', () => {
  it('declines every file (strict false) when no reader is set', () => {
    const ok = vi.fn();
    const err = vi.fn();
    expect(plantUmlFileLoader('x.puml', null, ok, err)).toBe(false);
    expect(ok).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it('delivers the file under its URL as id, so nested includes resolve next to it', async () => {
    const read = vi.fn(async (url: string) => `' from ${url}`);
    setPlantUmlFileReader(read);
    const ok = vi.fn();
    const err = vi.fn();
    expect(plantUmlFileLoader('inc/a.puml', null, ok, err)).toBe(true);
    await vi.waitFor(() => expect(ok).toHaveBeenCalled());
    const url = new URL('inc/a.puml', document.baseURI).href;
    expect(read).toHaveBeenCalledWith(url);
    expect(ok).toHaveBeenCalledWith(url, `' from ${url}`);
    expect(err).not.toHaveBeenCalled();
  });

  it("fails the include with the reader's reason and the path as written", async () => {
    setPlantUmlFileReader(async () => {
      throw new Error('outside the root');
    });
    const ok = vi.fn();
    const err = vi.fn();
    plantUmlFileLoader('../x.puml', null, ok, err);
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    expect(err).toHaveBeenCalledWith('could not include ../x.puml (outside the root)');
    expect(ok).not.toHaveBeenCalled();
  });
});
