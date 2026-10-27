import { version } from '../../package.json';
import { t } from '../i18n';

const REPO = 'https://github.com/otaku1123/md-browser';
export const DISCUSSIONS_URL = `${REPO}/discussions`;

export type Surface = 'web' | 'extension-file' | 'extension-viewer';

/** Where this page runs: the web app, an extension-rendered file:// page, or the extension's viewer. */
export function currentSurface(loc: Pick<Location, 'protocol'> = location): Surface {
  if (loc.protocol === 'file:') return 'extension-file';
  if (loc.protocol === 'chrome-extension:') return 'extension-viewer';
  return 'web';
}

const SURFACE_LABELS: Record<Surface, string> = {
  web: 'Web app',
  'extension-file': 'Chrome extension (file:// page)',
  'extension-viewer': 'Chrome extension (viewer)',
};

/**
 * New-issue URL for the bug report form, with the version and where it runs filled in.
 * Nothing about the open document (its name or path) goes into it.
 */
export function bugReportUrl(surface: Surface = currentSurface()): string {
  const params = new URLSearchParams({ template: 'bug_report.yml', version, surface: SURFACE_LABELS[surface] });
  return `${REPO}/issues/new?${params}`;
}

/** "Report a bug" and "Ideas & questions" links for the bottom of the settings panel. */
export function feedbackLinks(): HTMLElement {
  const row = document.createElement('p');
  row.className = 'feedback-links';
  const link = (href: string, text: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    return a;
  };
  row.append(link(bugReportUrl(), t('feedbackBug')), link(DISCUSSIONS_URL, t('feedbackIdeas')));
  return row;
}
