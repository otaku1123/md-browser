// Says whether the store listing text (docs/store/listing.md) changed since the previous release
// tag. The release workflow then uploads the zip without submitting it for review, so that the
// Developer Dashboard (updated by hand from that file) can be brought in line first (#187).
// The line naming the zip changes with every release and is ignored.
//
//   node scripts/store-text-changed.mjs <tag>     prints "true" or "false"; the previous tag goes to stderr
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const LISTING = 'docs/store/listing.md';

const git = (args) => execFileSync('git', args, { encoding: 'utf8' });

/** The nearest release tag before `tag` (reachable from its parent), or null for the first release. */
export function previousTag(tag, run = git) {
  try {
    return run(['describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`]).trim() || null;
  } catch {
    return null;
  }
}

/** True when a unified diff of the listing changes anything but the zip name. */
export function listingChanged(diff) {
  return diff.split('\n').some((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line) && !/md-browser-\d+\.\d+\.\d+\.zip/.test(line));
}

/** Compares the listing between the previous release tag and `tag`. */
export function storeTextChanged(tag, run = git, log = console.error) {
  const prev = previousTag(tag, run);
  if (!prev) {
    log(`no release tag before ${tag}: nothing to compare`);
    return false;
  }
  log(`comparing ${LISTING} between ${prev} and ${tag}`);
  return listingChanged(run(['diff', prev, tag, '--', LISTING]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tag = process.argv[2];
  if (!tag) {
    console.error('usage: node scripts/store-text-changed.mjs <tag>');
    process.exit(2);
  }
  console.log(storeTextChanged(tag) ? 'true' : 'false');
}
