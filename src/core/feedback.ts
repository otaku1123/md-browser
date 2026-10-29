import { version } from '../../package.json';
import { t } from '../i18n';

const REPO = 'https://github.com/otaku1123/md-browser';

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

interface UADataLike {
  brands?: { brand: string; version: string }[];
  platform?: string;
}

/**
 * "Chrome 140 / macOS" for the bug form. Only the major version and the OS name: Chrome freezes the
 * rest of the user agent, so finer detail would be wrong rather than helpful.
 */
export function browserLabel(
  nav: { userAgent: string; userAgentData?: UADataLike } = navigator as Navigator & { userAgentData?: UADataLike },
): string {
  const ua = nav.userAgent;
  const brands = nav.userAgentData?.brands ?? [];
  // Edge and Chrome both list "Chromium" too, so look for the specific brand first.
  const brand = ['Microsoft Edge', 'Google Chrome', 'Chromium'].map((name) => brands.find((b) => b.brand === name)).find(Boolean);
  // Edge's and Chrome's strings also say "Chrome" and "Safari": check the more specific tokens first.
  const fromUa = [/(Edg)\/(\d+)/, /(Firefox)\/(\d+)/, /(Chrome)\/(\d+)/, /(Version)\/(\d+).*Safari/]
    .map((re) => re.exec(ua))
    .find(Boolean);
  const browser = brand
    ? `${brand.brand.replace(/^(Google|Microsoft) /, '')} ${brand.version}`
    : fromUa
      ? `${{ Edg: 'Edge', Version: 'Safari' }[fromUa[1]] ?? fromUa[1]} ${fromUa[2]}`
      : '';
  const os =
    nav.userAgentData?.platform ||
    (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '');
  return [browser, os].filter(Boolean).join(' / ');
}

/**
 * New-issue URL for one of the issue forms, with the version, where it runs and any `extra` fields filled in.
 * Nothing about the open document (its name or path) goes into it.
 */
function issueUrl(template: string, surface: Surface, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ template, version, surface: SURFACE_LABELS[surface] });
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return `${REPO}/issues/new?${params}`;
}

export const bugReportUrl = (surface: Surface = currentSurface(), browser = browserLabel()) =>
  issueUrl('bug_report.yml', surface, { browser });
export const featureRequestUrl = (surface: Surface = currentSurface()) => issueUrl('feature_request.yml', surface);

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
  row.append(link(bugReportUrl(), t('feedbackBug')), link(featureRequestUrl(), t('feedbackIdeas')));
  return row;
}
