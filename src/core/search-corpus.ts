// The documents full-text search reads: every Markdown file of the open folder, by path. The
// viewer reads them through its Workspace, a file:// tab through the service worker; both only
// hand over a file that changed since the last load. The texts are cached here, on the page,
// because the service worker loses its memory whenever it stops. Nothing is persisted.

export type CorpusRead = { text: string; version: string } | 'unchanged';

export interface CorpusSource {
  /** Root-relative paths of the documents (the sidebar's list). */
  paths(): readonly string[];
  /** The document's text and version tag, or 'unchanged' when `known` is still its version. */
  read(path: string, known?: string): Promise<CorpusRead>;
}

export interface CorpusDoc {
  path: string;
  text: string;
}

export interface LoadOptions {
  signal?: AbortSignal;
  /** Called after each document, read or found unchanged. */
  onProgress?(done: number, total: number): void;
}

export interface SearchCorpus {
  /** Every document's current text, in path order. Reads only what changed since the last call. */
  load(opts?: LoadOptions): Promise<CorpusDoc[]>;
}

/** Documents read at once: the viewer's file handles and the service worker both cope with this. */
export const CONCURRENCY = 8;

export function createSearchCorpus(source: CorpusSource, concurrency = CONCURRENCY): SearchCorpus {
  const cache = new Map<string, { version: string; text: string }>();

  return {
    async load({ signal, onProgress } = {}) {
      const paths = [...source.paths()];
      const wanted = new Set(paths);
      for (const path of cache.keys()) if (!wanted.has(path)) cache.delete(path);

      let next = 0;
      let done = 0;
      async function worker(): Promise<void> {
        while (next < paths.length && !signal?.aborted) {
          const path = paths[next++];
          const had = cache.get(path);
          try {
            const res = await source.read(path, had?.version);
            if (res !== 'unchanged') cache.set(path, res);
            else if (!had) throw new Error('unchanged without a version'); // a source bug: never trust it
          } catch {
            cache.delete(path); // unreadable (gone, or a permission problem): not searched
          }
          onProgress?.(++done, paths.length);
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError');

      const docs: CorpusDoc[] = [];
      for (const path of paths) {
        const entry = cache.get(path);
        if (entry) docs.push({ path, text: entry.text });
      }
      return docs;
    },
  };
}
