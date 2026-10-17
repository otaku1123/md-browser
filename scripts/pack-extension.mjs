// Zips dist-extension/ into release/md-browser-<version>.zip for Chrome Web Store upload.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist-extension');
const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const out = resolve(root, 'release', `md-browser-${version}.zip`);

mkdirSync(resolve(root, 'release'), { recursive: true });
if (existsSync(out)) rmSync(out);
execFileSync('zip', ['-qrX', out, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: dist, stdio: 'inherit' });
console.log(`packed ${out}`);
