import { t } from '../i18n';
import { updateFileAccessBadge } from './file-access-badge';

// "Allow access to file URLs" is off by default for store installs, and without it the
// content script never runs on file:// pages. Explain that inside the bundled viewer.
export function mountSetupBanner(slot: HTMLElement): void {
  const banner = document.createElement('section');
  banner.className = 'setup-banner';
  slot.replaceChildren(banner);

  async function refresh(): Promise<void> {
    const allowed = await chrome.extension.isAllowedFileSchemeAccess();
    banner.classList.toggle('ok', allowed);
    void updateFileAccessBadge();
    if (allowed) {
      const p = document.createElement('p');
      p.textContent = `✓ ${t('setupDone')}`;
      banner.replaceChildren(p);
      return;
    }
    const title = document.createElement('h2');
    title.textContent = t('setupTitle');
    const body = document.createElement('p');
    body.textContent = t('setupBody');
    const steps = document.createElement('ol');
    for (const key of ['setupStep1', 'setupStep2', 'setupStep3'] as const) {
      const li = document.createElement('li');
      li.textContent = t(key);
      steps.append(li);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('setupButton');
    button.addEventListener('click', () => {
      void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    banner.replaceChildren(title, body, steps, button);
  }

  void refresh();
  // Re-check when the user comes back from chrome://extensions.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
}
