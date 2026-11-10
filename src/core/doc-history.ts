/**
 * Back and forward between the documents of an open folder (#198). Every document shown gets an
 * entry in the browser's session history, so the browser's own back / forward buttons, Alt+← /
 * Alt+→ and swipe gestures move between the documents, and a document comes back scrolled to where
 * it was left. The URL stays the same: the app has no routes, and the folder is a handle this tab
 * holds. An entry names the folder (root) and the path in it; main.ts shows the document when that
 * folder is still the open one and ignores the entry otherwise. The viewer's file:// pages are
 * real navigations and need none of this.
 *
 * Anchor links ("#heading") add entries of their own, with no state. Those are stamped with the
 * document shown when they appear, so going back and forth over them keeps showing it (the browser
 * restores the scroll position itself, as the content does not change).
 */

export interface DocEntry {
  /** The open folder's name ('' for a single file or dropped files), as the recent documents use it. */
  root: string;
  path: string;
}

interface Stamp extends DocEntry {
  /** Unique per entry, so the scroll position left there can be found again. */
  id: string;
}

const KEY = 'mdBrowserDoc';

export interface DocHistory {
  /**
   * Call when a document is shown. The first document takes over the page's own entry; another
   * document adds one. `scrollY` is where the document left (if any) was scrolled to.
   */
  show(entry: DocEntry, scrollY: number): void;
  /** Stops following the history (tests). */
  unmount(): void;
}

function stampOf(state: unknown): Stamp | null {
  const s = (state as { [KEY]?: unknown } | null)?.[KEY] as Partial<Stamp> | undefined;
  return s && typeof s.id === 'string' && typeof s.root === 'string' && typeof s.path === 'string' ? { id: s.id, root: s.root, path: s.path } : null;
}

/** `onPop` is called when the user goes back or forward to a document: show it, scrolled to `scrollY` when known. */
export function mountDocHistory(onPop: (entry: DocEntry, scrollY: number | undefined) => void): DocHistory {
  // Scroll positions by entry id, in memory: the entries survive a reload, the positions need not.
  const scrolls = new Map<string, number>();
  const session = Math.random().toString(36).slice(2);
  let count = 0;
  // After a reload the page's entry is still the one written before it.
  let current = stampOf(history.state);
  const url = () => location.pathname + location.search; // drops a "#heading" of the entry left
  const stamp = (entry: DocEntry): Stamp => ({ ...entry, id: `${session}:${++count}` });

  /** An entry without a state (an anchor link) belongs to the document shown. */
  const adopt = () => {
    if (!current || stampOf(history.state)) return;
    current = stamp(current);
    history.replaceState({ [KEY]: current }, '');
  };
  const onPopState = (e: PopStateEvent) => {
    const next = stampOf(e.state);
    if (!next) {
      adopt();
      return;
    }
    if (current) scrolls.set(current.id, window.scrollY); // the content is still the document left
    current = next;
    onPop({ root: next.root, path: next.path }, scrolls.get(next.id));
  };
  window.addEventListener('popstate', onPopState);
  // Chrome fires popstate for an anchor link as well; other browsers may only fire this.
  window.addEventListener('hashchange', adopt);

  return {
    unmount() {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', adopt);
    },
    show(entry, scrollY) {
      if (current && current.root === entry.root && current.path === entry.path) return; // shown again (reload, rescan)
      const next = stamp(entry);
      if (current) {
        scrolls.set(current.id, scrollY);
        history.pushState({ [KEY]: next }, '', url());
      } else {
        history.replaceState({ [KEY]: next }, '', url());
      }
      current = next;
    },
  };
}
