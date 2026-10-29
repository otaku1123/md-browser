/**
 * Calls `cb` when the user comes back to this tab: the tab is shown again, or its window gets focus
 * (switching from an editor or Finder after adding a file only fires the latter). Calls closer than
 * `minGapMs` apart are dropped, as both events usually fire together.
 */
export function onReturn(cb: () => void, minGapMs = 1000): void {
  let last = 0;
  const fire = () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - last < minGapMs) return;
    last = now;
    cb();
  };
  window.addEventListener('focus', fire);
  document.addEventListener('visibilitychange', fire);
}
