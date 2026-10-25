import { defineConfig, type Plugin } from 'vite';
import { katexWoff2Only } from './scripts/vite-katex-woff2';
import { thirdPartyNotices } from './scripts/vite-third-party-notices';

// Content-Security-Policy for the web viewer, as a <meta> tag (GitHub Pages can't send headers).
// Defence in depth behind DOMPurify: Markdown may contain raw HTML, but no script can run.
// style-src needs 'unsafe-inline' for Mermaid's <style> and KaTeX's style attributes.
// img-src: blob: for folder images, data: for the favicon, https: for remote images such as badges.
// Build only: the dev server injects inline styles and uses a WebSocket for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  plugins: [katexWoff2Only(), contentSecurityPolicy(), thirdPartyNotices()],
  // Relative asset URLs so the build works under a sub-path (GitHub Pages: /md-browser/).
  base: './',
  build: {
    // mermaid's lazily loaded chunks are large by nature.
    chunkSizeWarningLimit: 4000,
  },
});
