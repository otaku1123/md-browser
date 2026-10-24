import type { Plugin } from 'vite';

// KaTeX's stylesheet lists woff2, woff and ttf for every font, so Vite would ship all three.
// Chrome 120+ (the extension's minimum) and every browser the web viewer targets read woff2,
// so drop the other two before Vite resolves the urls.
export function katexWoff2Only(): Plugin {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('katex/dist/katex.min.css')) return;
      return code.replace(/,url\([^)]*\.woff\) format\("woff"\),url\([^)]*\.ttf\) format\("truetype"\)/g, '');
    },
  };
}
