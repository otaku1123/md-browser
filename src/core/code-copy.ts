// Adds a "Copy" button to each code block. Diagram sources and front matter are skipped.
import { t } from '../i18n';

export const RESET_MS = 1500;

export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard API unavailable or blocked: fall back to the legacy copy command.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy command failed');
}

export function addCopyButtons(root: ParentNode): void {
  for (const code of root.querySelectorAll<HTMLElement>('pre > code')) {
    const pre = code.parentElement!;
    if (pre.classList.contains('diagram-source') || pre.closest('.front-matter, .code-block')) continue;

    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    pre.replaceWith(wrap);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = t('copyCode');
    button.setAttribute('aria-live', 'polite');
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener('click', async () => {
      clearTimeout(timer);
      try {
        await writeClipboard((code.textContent ?? '').replace(/\n$/, ''));
        button.textContent = t('copied');
        button.classList.remove('failed');
      } catch {
        button.textContent = t('copyFailed');
        button.classList.add('failed');
      }
      button.classList.add('done');
      timer = setTimeout(() => {
        button.textContent = t('copyCode');
        button.classList.remove('done', 'failed');
      }, RESET_MS);
    });
    wrap.append(pre, button);
  }
}
