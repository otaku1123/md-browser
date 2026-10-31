// Checks a release PR (develop -> main) for the regressions the regular tests don't see:
// a forgotten version bump, a changed extension permission surface, a bigger store zip,
// and store listing text over the Chrome Web Store limits.
//
//   node scripts/release-check.mjs --base <checkout of main>
//
// Both checkouts must already have run `npm run pack:ext` (release/md-browser-<version>.zip).
// Set ALLOW_MANIFEST_CHANGE=true (the `store-permissions` PR label in CI) to accept a changed
// permission surface on purpose. Findings also go to the job summary when GITHUB_STEP_SUMMARY is set.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_ZIP_GROWTH = 1.25; // fail when the zip is more than 25% bigger than the released one
const MAX_NAME_CHARS = 75; // manifest `name` limit
const MAX_DESCRIPTION_CHARS = 132; // manifest `description` limit (shown as the store summary)
const MANIFEST_SURFACE = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'web_accessible_resources',
  'content_security_policy',
  'externally_connectable',
  'minimum_chrome_version',
];

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
if (baseIndex === -1 || !args[baseIndex + 1]) {
  console.error('usage: node scripts/release-check.mjs --base <checkout of main>');
  process.exit(2);
}
const head = resolve(import.meta.dirname, '..');
const base = resolve(args[baseIndex + 1]);
const allowManifestChange = process.env.ALLOW_MANIFEST_CHANGE === 'true';

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);

const readJson = (root, file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const parseVersion = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? m.slice(1).map(Number) : null;
};
const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

// 1. Version: package.json, package-lock.json and the manifest agree, the version is newer than
//    main's, no tag exists for it yet, and the store notes name the new zip.
const version = readJson(head, 'package.json').version;
const baseVersion = readJson(base, 'package.json').version;
{
  const lock = readJson(head, 'package-lock.json');
  const manifestVersion = readJson(head, 'extension/public/manifest.json').version;
  for (const [file, v] of [
    ['package-lock.json', lock.version],
    ['package-lock.json (packages[""])', lock.packages?.['']?.version],
    ['extension/public/manifest.json', manifestVersion],
  ]) {
    if (v !== version) fail(`${file} has version ${v}, but package.json has ${version}`);
  }
  const parsed = parseVersion(version);
  const parsedBase = parseVersion(baseVersion);
  if (!parsed) fail(`package.json version "${version}" is not X.Y.Z`);
  else if (parsedBase && compareVersions(parsed, parsedBase) <= 0) {
    fail(`version ${version} is not newer than main's ${baseVersion}: bump it before releasing`);
  }
  try {
    const tags = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`], {
      cwd: head,
      encoding: 'utf8',
    });
    if (tags.trim()) fail(`tag v${version} already exists`);
  } catch (e) {
    notes.push(`could not list remote tags (${e.message.split('\n')[0]}); skipped the existing-tag check`);
  }
  const listing = readFileSync(resolve(head, 'docs/store/listing.md'), 'utf8');
  if (!listing.includes(`md-browser-${version}.zip`)) {
    fail(`docs/store/listing.md does not mention md-browser-${version}.zip: update the package table`);
  }
  notes.push(`version ${baseVersion} → ${version}`);
}

// 2. Manifest surface: a changed permission, match pattern or CSP means a store re-review and,
//    for permissions, a warning to every user on update. Make it an explicit decision.
{
  const pick = (manifest) => Object.fromEntries(MANIFEST_SURFACE.map((k) => [k, manifest[k]]));
  const headSurface = pick(readJson(head, 'extension/public/manifest.json'));
  const baseSurface = pick(readJson(base, 'extension/public/manifest.json'));
  const changed = MANIFEST_SURFACE.filter(
    (k) => JSON.stringify(headSurface[k]) !== JSON.stringify(baseSurface[k]),
  );
  if (changed.length) {
    const detail = changed
      .map((k) => `  ${k}:\n    main: ${JSON.stringify(baseSurface[k])}\n    PR:   ${JSON.stringify(headSurface[k])}`)
      .join('\n');
    if (allowManifestChange) {
      notes.push(
        `manifest surface changed (accepted by the store-permissions label): ${changed.join(', ')}. ` +
          'Update the host permission / permission justification texts in docs/store/listing.md and privacy.html.',
      );
      console.log(`manifest surface changed (accepted):\n${detail}`);
    } else {
      fail(
        `the extension's manifest surface changed (${changed.join(', ')}):\n${detail}\n` +
          '  This triggers a store re-review and, for permissions, a warning to every user. If intended, add the ' +
          '`store-permissions` label to the PR and re-run this job; also update docs/store/listing.md and privacy.html.',
      );
    }
  } else {
    notes.push('manifest surface unchanged (permissions, matches, web-accessible resources, CSP)');
  }
}

// 3. Store zip size against the one main would produce.
{
  const zipOf = (root, v) => {
    const dir = resolve(root, 'release');
    const name = `md-browser-${v}.zip`;
    if (!readdirSync(dir, { withFileTypes: true }).some((e) => e.name === name)) {
      throw new Error(`${dir}/${name} not found: run \`npm run pack:ext\` first`);
    }
    return statSync(resolve(dir, name)).size;
  };
  try {
    const headSize = zipOf(head, version);
    const baseSize = zipOf(base, baseVersion);
    const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
    const ratio = headSize / baseSize;
    const delta = `${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(1)}%`;
    notes.push(`store zip: ${kb(baseSize)} (main) → ${kb(headSize)} (PR), ${delta}`);
    if (ratio > MAX_ZIP_GROWTH) {
      fail(
        `the store zip grew from ${kb(baseSize)} to ${kb(headSize)} (${delta}), more than ${((MAX_ZIP_GROWTH - 1) * 100).toFixed(0)}%. ` +
          'Check what got bundled (a new dependency, a duplicated library) or raise MAX_ZIP_GROWTH on purpose.',
      );
    }
  } catch (e) {
    fail(e.message);
  }
}

// 4. Store listing text: the name and description come from _locales and have hard limits.
{
  const localesDir = resolve(head, 'extension/public/_locales');
  for (const locale of readdirSync(localesDir)) {
    const messages = readJson(localesDir, `${locale}/messages.json`);
    const name = messages.extName?.message ?? '';
    const description = messages.extDescription?.message ?? '';
    if (name.length > MAX_NAME_CHARS) {
      fail(`_locales/${locale}: extName is ${name.length} characters (limit ${MAX_NAME_CHARS})`);
    }
    if (description.length > MAX_DESCRIPTION_CHARS) {
      fail(`_locales/${locale}: extDescription is ${description.length} characters (limit ${MAX_DESCRIPTION_CHARS})`);
    }
  }
  notes.push('store name and summary within the limits');
}

// Report
const summary = [
  '## Release check',
  '',
  ...notes.map((n) => `- ${n}`),
  ...(errors.length ? ['', '### Problems', '', ...errors.map((e) => `- ${e.split('\n')[0]}`)] : ['', 'All checks passed.']),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
for (const n of notes) console.log(`ok: ${n}`);
for (const e of errors) console.error(`\nerror: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log('\nrelease check passed');
