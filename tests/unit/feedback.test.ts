import { describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { bugReportUrl, currentSurface, featureRequestUrl, feedbackLinks } from '../../src/core/feedback';

describe('currentSurface', () => {
  it('tells the web app, the file:// page and the extension viewer apart', () => {
    expect(currentSurface({ protocol: 'https:' })).toBe('web');
    expect(currentSurface({ protocol: 'http:' })).toBe('web');
    expect(currentSurface({ protocol: 'file:' })).toBe('extension-file');
    expect(currentSurface({ protocol: 'chrome-extension:' })).toBe('extension-viewer');
  });
});

describe('bugReportUrl', () => {
  it('opens the bug report form with the version and surface filled in', () => {
    const url = new URL(bugReportUrl('extension-file'));
    expect(url.origin + url.pathname).toBe('https://github.com/otaku1123/md-browser/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('surface')).toBe('Chrome extension (file:// page)');
    expect([...url.searchParams.keys()]).toEqual(['template', 'version', 'surface']);
  });
});

describe('featureRequestUrl', () => {
  it('opens the idea / question form with the same fields filled in', () => {
    const url = new URL(featureRequestUrl('web'));
    expect(url.searchParams.get('template')).toBe('feature_request.yml');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('surface')).toBe('Web app');
  });
});

describe('feedbackLinks', () => {
  it('opens both links in a new tab without a referrer', () => {
    const links = [...feedbackLinks().querySelectorAll('a')];
    expect(links.map((a) => a.href)).toEqual([bugReportUrl(), featureRequestUrl()]);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.textContent).not.toBe('');
    }
  });
});
