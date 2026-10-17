// Content scripts are classic scripts; load the real (ES module) renderer so its
// heavy dependencies such as mermaid can stay code-split and lazy.
import(chrome.runtime.getURL('content.js')).catch((err) => {
  console.error('[MD Browser] failed to load renderer', err);
});
