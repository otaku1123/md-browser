import type { TocItem } from './render';
import { scrollIntoPanel } from './scroll-into-panel';

export interface TocController {
  render(items: TocItem[]): void;
  /** Re-evaluates which entry is active from the scroll position. */
  update(): void;
  /** Forgets the clicked entry (call when switching documents). */
  reset(): void;
}

/** Sidebar TOC: renders entries, scrolls on click, and highlights the current section. */
export function createToc(tocEl: HTMLElement): TocController {
  // Entry the user clicked; wins over scroll position until they scroll manually (needed near page end).
  let pinnedTarget: string | null = null;

  function render(items: TocItem[]): void {
    // Only the list: the resize handle (toc-panel.ts) lives in the TOC too.
    tocEl.querySelector(':scope > ul')?.remove();
    if (items.length === 0) {
      tocEl.classList.add('empty');
      return;
    }
    tocEl.classList.remove('empty');
    const minLevel = Math.min(...items.map((i) => i.level));
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.className = `toc-l${item.level - minLevel + 1}`;
      const a = document.createElement('a');
      a.href = `#${item.id}`;
      a.dataset.target = item.id;
      a.textContent = item.text;
      li.append(a);
      list.append(li);
    }
    tocEl.prepend(list);
  }

  function update(): void {
    const links = Array.from(tocEl.querySelectorAll<HTMLAnchorElement>('a[data-target]'));
    let active = pinnedTarget ? links.find((l) => l.dataset.target === pinnedTarget) : undefined;
    if (!active) for (const link of links) {
      const h = document.getElementById(link.dataset.target!);
      if (h && h.getBoundingClientRect().top <= 80) active = link;
    }
    active ??= links[0];
    for (const link of links) link.classList.toggle('active', link === active);
    if (active) scrollIntoPanel(active, tocEl);
  }

  tocEl.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-target]');
    if (!a) return;
    e.preventDefault();
    pinnedTarget = a.dataset.target!;
    document.getElementById(a.dataset.target!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${a.dataset.target}`);
  });

  let scrollRaf = 0;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(update);
  });

  for (const type of ['wheel', 'touchmove', 'keydown', 'mousedown'] as const) {
    window.addEventListener(type, (e) => {
      if (type === 'mousedown' && tocEl.contains(e.target as Node)) return;
      pinnedTarget = null;
    }, { passive: true });
  }

  return { render, update, reset: () => (pinnedTarget = null) };
}
