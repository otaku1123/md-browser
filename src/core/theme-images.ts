// GitHub's two ways of giving an image a light and a dark version:
//   ![](a.png#gh-dark-mode-only) / ![](a.png#gh-light-mode-only): shown only in that theme.
//   <picture><source media="(prefers-color-scheme: dark)" srcset="dark.png"><img src="light.png"></picture>
// The <source> media query follows the OS, not the theme the user pinned in the settings
// (theme.ts), so the sources are chosen here; both forms are re-applied when the theme changes
// and switched to the light version while printing (white paper).
import { currentTheme, onThemeChange, type Theme } from './theme';

/** On an img: "light" or "dark", the only theme it is shown in. Set before the src is resolved. */
export const THEME_ONLY_ATTR = 'data-theme-only';
/** On a <source>: its media query as written, kept while the attribute itself says all / not all. */
const MEDIA_ATTR = 'data-media';

const GH_ONLY = /#gh-(light|dark)-mode-only$/;
const SCHEME_QUERY = /prefers-color-scheme\s*:\s*(light|dark)/;

/**
 * Hides the images meant for the other theme and points each <picture> at the source for
 * `theme`. Call on new content before its image refs are resolved (the marker is in the ref) and
 * again whenever the shown theme changes.
 */
export function applyThemeImages(root: ParentNode, theme: Theme = currentTheme()): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
    const only = img.getAttribute(THEME_ONLY_ATTR) ?? GH_ONLY.exec(img.getAttribute('src') ?? '')?.[1];
    if (only !== 'light' && only !== 'dark') continue;
    img.setAttribute(THEME_ONLY_ATTR, only);
    // The size buttons' frame (media-sizes.ts) goes with the image, or it would keep its space.
    const target = img.parentElement?.classList.contains('media-frame') ? img.parentElement : img;
    target.hidden = only !== theme;
  }
  for (const source of root.querySelectorAll<HTMLSourceElement>('picture > source[media]')) {
    const media = source.getAttribute(MEDIA_ATTR) ?? source.getAttribute('media') ?? '';
    const scheme = SCHEME_QUERY.exec(media)?.[1];
    if (!scheme) continue; // not about the theme: the browser evaluates it as usual
    source.setAttribute(MEDIA_ATTR, media);
    source.setAttribute('media', scheme === theme ? 'all' : 'not all');
  }
}

/** Keeps `root`'s images on the shown theme, and on the light one while printing. */
export function watchThemeImages(root: ParentNode): void {
  onThemeChange((theme) => applyThemeImages(root, theme));
  window.addEventListener('beforeprint', () => applyThemeImages(root, 'light'));
  window.addEventListener('afterprint', () => applyThemeImages(root));
}
