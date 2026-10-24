import { updateFileAccessBadge } from './file-access-badge';
import { chooseRoot, folderOf, listMarkdownTree, relativePath } from './dir-listing';
import { MSG_LIST_SIBLINGS, MSG_READ_SELF, type ListSiblingsResponse, type ReadSelfResponse } from './messages';

const VIEWER_URL = chrome.runtime.getURL('index.html');

// Toolbar icon opens the bundled viewer (same app as the web version).
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: VIEWER_URL });
});

// On first install, open the viewer: it explains how to enable "Allow access to file URLs".
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) void chrome.tabs.create({ url: VIEWER_URL });
});

// Runs whenever the service worker starts (including after the extension is reloaded).
void updateFileAccessBadge();

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

// Lists the Markdown files below the tab's root folder (never above it), from Chrome's file://
// directory listings. The page sends no path, so it cannot list arbitrary folders: the root is the
// folder of a Markdown file the tab itself opened, kept per tab so moving into a subfolder keeps
// the list (session storage, as the service worker may restart).
const rootKey = (tabId: number) => `files-root:${tabId}`;

async function tabRoot(tabId: number | undefined, folder: string): Promise<string> {
  if (tabId === undefined) return folder;
  const key = rootKey(tabId);
  const stored = (await chrome.storage.session.get(key))[key];
  const root = chooseRoot(typeof stored === 'string' ? stored : undefined, folder);
  if (root !== stored) await chrome.storage.session.set({ [key]: root });
  return root;
}

chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(rootKey(tabId)));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse: (r: ListSiblingsResponse) => void) => {
  if (msg?.type !== MSG_LIST_SIBLINGS) return false;
  const url = sender.url?.split('#')[0] ?? '';
  if (sender.id !== chrome.runtime.id || !MD_URL.test(url)) {
    sendResponse({ ok: false, error: 'not a Markdown file URL' });
    return false;
  }
  tabRoot(sender.tab?.id, folderOf(url))
    .then(async (root) => {
      const { paths, truncated } = await listMarkdownTree(root, (dir) => fetch(dir, { cache: 'no-store' }).then((r) => r.text()));
      sendResponse({ ok: true, paths, truncated, current: relativePath(root, url) });
    })
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});
