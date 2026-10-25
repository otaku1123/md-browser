import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// Writes THIRD_PARTY_NOTICES.txt next to the build: every npm package whose code ends up in the
// output, with its license text. MIT, BSD, ISC and the like ask for the notice to ship with copies.
// Taken from the bundle itself, so it lists what is shipped, not everything in package.json.
export function thirdPartyNotices(): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const dirs = new Set<string>();
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        for (const id of file.moduleIds) {
          const dir = packageDir(id);
          if (dir) dirs.add(dir);
        }
      }
      const entries = [...dirs].map(describe).sort((a, b) => a.name.localeCompare(b.name));
      const source = [
        'MD Browser includes the following third-party software.',
        '',
        ...entries.map((e) => `${'='.repeat(72)}\n${e.name} ${e.version} (${e.license})\n${e.homepage}\n\n${e.text}\n`),
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source });
    },
  };
}

const NODE_MODULES = '/node_modules/';

/** The package folder a module comes from ("…/node_modules/@scope/name"), or null for our own code. */
export function packageDir(id: string): string | null {
  const file = id.replace(/^\0/, '').split('?')[0].split(path.sep).join('/');
  const i = file.lastIndexOf(NODE_MODULES);
  if (i < 0) return null;
  const parts = file.slice(i + NODE_MODULES.length).split('/');
  return file.slice(0, i + NODE_MODULES.length) + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/');
}

function describe(dir: string) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string;
    homepage?: string;
    repository?: string | { url?: string };
  };
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)(\.|-|$)/i.test(f)).sort();
  const text = files.map((f) => readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license ?? (files.length ? 'see the license text below' : 'unknown'),
    homepage: pkg.homepage ?? repo ?? `https://www.npmjs.com/package/${pkg.name}`,
    text: text || `No license file in the package; package.json declares: ${pkg.license ?? 'nothing'}.`,
  };
}
