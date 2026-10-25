// "Skip to content": the toolbar's first Tab stop, shown only while focused. It moves focus to the
// visible main region (the document, or its source view) without touching the URL hash, which
// belongs to the document's headings.
import { t } from '../i18n';

export function mountSkipLink(toolbar: HTMLElement): void {
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#';
  link.textContent = t('skipToContent');
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const main = document.querySelector<HTMLElement>('main:not([hidden]), [role="main"]:not([hidden])');
    if (!main) return;
    main.tabIndex = -1;
    main.focus();
  });
  toolbar.prepend(link);
}
