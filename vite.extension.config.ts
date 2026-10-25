import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { katexWoff2Only } from './scripts/vite-katex-woff2';
import { thirdPartyNotices } from './scripts/vite-third-party-notices';

// Builds the Chrome extension into dist-extension/ (load it via chrome://extensions → "Load unpacked").
export default defineConfig({
  plugins: [katexWoff2Only(), thirdPartyNotices()],
  // Relative URLs so chunks resolve against chrome-extension://<id>/ even when imported from a file:// page.
  base: './',
  publicDir: 'extension/public',
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    // Preload <link> tags would be injected into the host page with wrong URLs.
    modulePreload: false,
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        content: resolve(import.meta.dirname, 'src/extension/content.ts'),
        background: resolve(import.meta.dirname, 'src/extension/background.ts'),
      },
      output: {
        // content.js / background.js are referenced by fixed names from the manifest.
        entryFileNames: (chunk) =>
          chunk.name === 'index' ? 'assets/[name]-[hash].js' : '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
