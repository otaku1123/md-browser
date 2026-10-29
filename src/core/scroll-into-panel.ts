/**
 * Brings `el` into view inside `panel` by scrolling the panel only. Unlike
 * scrollIntoView({ block: 'nearest' }), it never scrolls the page: on narrow screens the TOC and
 * file list sit above the text, and scrollIntoView pulled the page back up on every scroll (#111).
 */
export function scrollIntoPanel(el: Element, panel: Element): void {
  const box = panel.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < box.top) panel.scrollTop += r.top - box.top;
  else if (r.bottom > box.bottom) panel.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top);
}
