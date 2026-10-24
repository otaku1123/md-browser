import { defineConfig } from 'vite';
import { katexWoff2Only } from './scripts/vite-katex-woff2';

export default defineConfig({
  plugins: [katexWoff2Only()],
  // Relative asset URLs so the build works under a sub-path (GitHub Pages: /md-browser/).
  base: './',
  build: {
    // mermaid's lazily loaded chunks are large by nature.
    chunkSizeWarningLimit: 4000,
  },
});
