// Without "Allow access to file URLs" the content script cannot run on file:// pages, so
// nothing can be shown there. Flag the toolbar icon instead until the setting is turned on.
export async function updateFileAccessBadge(): Promise<void> {
  const allowed = await chrome.extension.isAllowedFileSchemeAccess();
  await chrome.action.setBadgeText({ text: allowed ? '' : '!' });
  if (!allowed) await chrome.action.setBadgeBackgroundColor({ color: '#d1242f' });
  await chrome.action.setTitle({
    title: chrome.i18n.getMessage(allowed ? 'actionTitle' : 'actionTitleNeedsAccess'),
  });
}
