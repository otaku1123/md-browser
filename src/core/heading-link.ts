// Adds a hover "🔗" link to each heading that copies a link to it. Clicking also scrolls there
// (plain in-page anchor). In the web viewer the URL doesn't identify the open document, so only
// "#id" is copied; on an extension page the URL does, so the full URL is copied.
import { t } from '../i18n';
import { RESET_MS, writeClipboard } from './code-copy';

export function addHeadingLinks(root: ParentNode, copyFullUrl: boolean): void {
  for (const heading of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    const id = heading.id;
    if (!id || heading.closest('.front-matter')) continue;

    const link = document.createElement('a');
    link.className = 'heading-link';
    link.href = `#${id}`;
    // The icon is drawn by CSS (::before) so it never ends up in the heading's text.
    link.setAttribute('aria-label', t('copyHeadingLink'));
    link.setAttribute('aria-live', 'polite');
    let timer: ReturnType<typeof setTimeout> | undefined;
    link.addEventListener('click', async () => {
      clearTimeout(timer);
      const base = copyFullUrl ? location.href.replace(/#.*$/, '') : '';
      try {
        await writeClipboard(`${base}#${id}`);
        link.setAttribute('aria-label', t('copied'));
        link.classList.remove('failed');
      } catch {
        link.setAttribute('aria-label', t('copyFailed'));
        link.classList.add('failed');
      }
      link.classList.add('done');
      timer = setTimeout(() => {
        link.setAttribute('aria-label', t('copyHeadingLink'));
        link.classList.remove('done', 'failed');
      }, RESET_MS);
    });
    heading.append(link);
  }
}
