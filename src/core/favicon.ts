// Tab icon (favicon) drawn as an inline SVG, so the extension needs no web-accessible icon file.
// A dot on the icon flags a background update (until the tab is looked at) or an error.
// The SVG has its own prefers-color-scheme rule: the tab strip follows the browser / OS theme,
// not the page's light / dark setting.

export type FaviconState = 'normal' | 'updated' | 'error';

const DOT_COLOR: Record<Exclude<FaviconState, 'normal'>, string> = {
  updated: '#f59e0b',
  error: '#e5484d',
};

export function faviconSvg(state: FaviconState): string {
  const dot =
    state === 'normal'
      ? ''
      : `<circle class="ring" cx="25" cy="7" r="7"/><circle cx="25" cy="7" r="5" fill="${DOT_COLOR[state]}"/>`;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<style>.bg{fill:#1a6fe0}.ring{fill:#fff}' +
    '@media (prefers-color-scheme:dark){.bg{fill:#4c8df6}.ring{fill:#202124}}</style>' +
    '<rect class="bg" width="32" height="32" rx="7"/>' +
    '<path fill="#fff" d="M9 19V6h3.2l3.8 6.5L19.8 6H23v13h-3v-8l-4 6.3-4-6.3v8z"/>' +
    '<path fill="#fff" d="M11 22h10l-5 5z"/>' +
    dot +
    '</svg>'
  );
}

let error = false;
let unseen = false;
let shown: FaviconState | null = null;

function apply(): void {
  const state: FaviconState = error ? 'error' : unseen ? 'updated' : 'normal';
  if (state === shown) return;
  shown = state;
  let link = document.querySelector<HTMLLinkElement>('link#md-browser-favicon');
  if (!link) {
    // Drop icons the page already declares so ours is the one Chrome picks.
    for (const old of document.querySelectorAll('link[rel~="icon"]')) old.remove();
    link = document.createElement('link');
    link.id = 'md-browser-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(state))}`;
}

/** Shows the icon and clears the update dot once the tab is looked at. */
export function initFavicon(): void {
  apply();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !unseen) return;
    unseen = false;
    apply();
  });
}

/** The document was re-rendered with new content; flag it if nobody is looking. */
export function faviconUpdated(): void {
  if (!document.hidden) return;
  unseen = true;
  apply();
}

export function faviconError(on: boolean): void {
  error = on;
  apply();
}
