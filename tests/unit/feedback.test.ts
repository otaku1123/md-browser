import { describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { browserLabel, bugReportUrl, currentSurface, featureRequestUrl, feedbackLinks } from '../../src/core/feedback';

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
    const url = new URL(bugReportUrl('extension-file', 'Chrome 156 / macOS'));
    expect(url.origin + url.pathname).toBe('https://github.com/otaku1123/md-browser/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('surface')).toBe('Chrome extension (file:// page)');
    expect(url.searchParams.get('browser')).toBe('Chrome 156 / macOS');
    expect([...url.searchParams.keys()]).toEqual(['template', 'version', 'surface', 'browser']);
  });

  it('leaves the browser out when it cannot be told', () => {
    expect(new URL(bugReportUrl('web', '')).searchParams.has('browser')).toBe(false);
  });
});

describe('browserLabel', () => {
  const MAC_CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

  it('prefers the client hints: browser major version and OS name', () => {
    const brands = [
      { brand: 'Not=A?Brand', version: '24' },
      { brand: 'Chromium', version: '156' },
      { brand: 'Google Chrome', version: '156' },
    ];
    expect(browserLabel({ userAgent: MAC_CHROME, userAgentData: { brands, platform: 'macOS' } })).toBe('Chrome 156 / macOS');
  });

  it('falls back to the user agent string, without its frozen OS version', () => {
    expect(browserLabel({ userAgent: MAC_CHROME })).toBe('Chrome 156 / macOS');
    expect(
      browserLabel({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0' }),
    ).toBe('Edge 150 / Windows');
    expect(browserLabel({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' })).toBe('Firefox 140 / Linux');
  });

  it('gives an empty string when nothing is recognised', () => {
    expect(browserLabel({ userAgent: 'curl/8' })).toBe('');
  });
});

describe('featureRequestUrl', () => {
  it('opens the idea / question form with the same fields filled in', () => {
    const url = new URL(featureRequestUrl('web'));
    expect(url.searchParams.get('template')).toBe('feature_request.yml');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('surface')).toBe('Web app');
    expect(url.searchParams.has('browser')).toBe(false);
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
