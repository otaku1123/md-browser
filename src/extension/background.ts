import { MSG_READ_SELF, type ReadSelfResponse } from './messages';

const VIEWER_URL = chrome.runtime.getURL('index.html');

// Toolbar icon opens the bundled viewer (same app as the web version).
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: VIEWER_URL });
});

// On first install, open the viewer: it explains how to enable "Allow access to file URLs".
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) void chrome.tabs.create({ url: VIEWER_URL });
});

const MD_URL = /^file:\/\/\/.+\.(md|markdown|mdown|mkd)$/i;

// file:// pages cannot re-read their own file (CORS, origin "null"), but the service worker
// can fetch file:// URLs once "Allow access to file URLs" is on. Only the sender's own
// document is served, so a content script cannot be used to read arbitrary files.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse: (r: ReadSelfResponse) => void) => {
  if (msg?.type !== MSG_READ_SELF) return false;
  const url = sender.url?.split('#')[0] ?? '';
  if (sender.id !== chrome.runtime.id || !MD_URL.test(url)) {
    sendResponse({ ok: false, error: 'not a Markdown file URL' });
    return false;
  }
  fetch(url, { cache: 'no-store' })
    .then((r) => r.text())
    .then((text) => sendResponse({ ok: true, text }))
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});
