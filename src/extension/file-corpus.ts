// The documents of a file:// tab's root for full-text search, read through the service worker
// (the page itself cannot fetch other file:// URLs). The listing is the sidebar's.
import type { CorpusSource } from '../core/search-corpus';
import { MSG_READ_FILE, type ReadFileMessage, type ReadFileResponse } from './messages';

export function fileCorpusSource(paths: () => readonly string[]): CorpusSource {
  return {
    paths,
    async read(path, known) {
      const msg: ReadFileMessage = { type: MSG_READ_FILE, path, known };
      const res: ReadFileResponse | undefined = await chrome.runtime.sendMessage(msg);
      if (!res) throw new Error('no response from background');
      if (!res.ok) throw new Error(res.error);
      return res.unchanged ? 'unchanged' : { text: res.text, version: res.hash };
    },
  };
}
