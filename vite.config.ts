import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works under a sub-path (GitHub Pages: /md-browser/).
  base: './',
  build: {
    // mermaid's lazily loaded chunks are large by nature.
    chunkSizeWarningLimit: 4000,
  },
});
