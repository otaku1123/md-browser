// Decides whether a pull request to develop may be merged automatically once CI passes, or needs
// a review by hand (#199). The auto-merge workflow runs this from the develop checkout (never from
// the PR, so a PR cannot change the policy that judges it). Anything the rules below don't know is
// "manual".
//
//   node scripts/pr-merge-policy.mjs <pr-number>     prints {auto, reasons, pr} as JSON; `gh` must be logged in
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BASE = 'develop';

/** Human overrides: the labels win over every path rule. */
export const LABEL_AUTO = 'merge:auto';
export const LABEL_MANUAL = 'merge:manual';

export const DEPENDABOT = 'dependabot[bot]';
/** Dependabot groups (.github/dependabot.yml) that hold minor and patch updates only. */
export const DEPENDABOT_AUTO_GROUPS = ['npm-minor-patch', 'actions-minor-patch'];

// Each rule is a prefix (ending in "/") or an exact path, or a RegExp. The manual list wins: a file
// under `docs/store/` is manual although `docs/` is auto.
/** Files that always need a review by hand, whatever else the PR touches. */
export const MANUAL_PATHS = [
  'src/',
  'extension/',
  'public/',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  /^vite(\.[^/]+)?\.config\.ts$/,
  'vitest.config.ts',
  'playwright.config.ts',
  'scripts/',
  '.github/workflows/',
  '.github/dependabot.yml',
  'docs/store/', // store listing text: published to users as is
  'tests/e2e/__screenshots__/', // screenshot baselines: the change is the picture, look at it
];

/** Files a PR may change and still merge on its own: documentation and tests. */
export const AUTO_PATHS = [
  /^README(\.[a-z]{2})?\.md$/,
  'SECURITY.md',
  'LICENSE',
  'docs/',
  'sample/',
  '.github/ISSUE_TEMPLATE/',
  '.github/PULL_REQUEST_TEMPLATE/',
  'tests/',
];

function matches(path, rule) {
  if (rule instanceof RegExp) return rule.test(path);
  return rule.endsWith('/') ? path.startsWith(rule) : path === rule;
}

const ruleName = (rule) => (rule instanceof RegExp ? rule.source : rule);

/** The group name of a Dependabot branch (dependabot/<ecosystem>/<base>/<group>-<hash>), or null. */
export function dependabotGroup(headRef) {
  const m = /^dependabot\/[^/]+\/(?:[^/]+\/)?(.+)-[0-9a-f]{10}$/.exec(headRef ?? '');
  return m ? m[1] : null;
}

/**
 * @param {object} pr
 * @param {string} pr.author       login of the PR author
 * @param {string[]} pr.labels     label names
 * @param {string[]} pr.files      changed paths, relative to the repository root
 * @param {string} [pr.base]       base branch (develop unless given)
 * @param {string} [pr.headRef]    head branch name (Dependabot PRs are judged by it)
 * @param {boolean} [pr.draft]
 * @param {boolean} [pr.crossRepository]  head lives in a fork
 * @returns {{ auto: boolean, reasons: string[] }}  `reasons` explain the decision for the PR comment
 */
export function decide(pr) {
  const labels = new Set(pr.labels ?? []);
  if ((pr.base ?? BASE) !== BASE) return { auto: false, reasons: [`base branch is \`${pr.base}\`, not \`${BASE}\``] };
  if (pr.crossRepository) return { auto: false, reasons: ['pull request from a fork'] };
  if (pr.draft) return { auto: false, reasons: ['draft pull request'] };
  if (labels.has(LABEL_MANUAL)) return { auto: false, reasons: [`label \`${LABEL_MANUAL}\``] };
  if (labels.has(LABEL_AUTO)) return { auto: true, reasons: [`label \`${LABEL_AUTO}\``] };

  if (pr.author === DEPENDABOT) {
    const group = dependabotGroup(pr.headRef);
    if (group && DEPENDABOT_AUTO_GROUPS.includes(group)) {
      return { auto: true, reasons: [`Dependabot group \`${group}\` (minor and patch updates)`] };
    }
    return { auto: false, reasons: [`Dependabot update outside the minor/patch groups (${group ? `group \`${group}\`` : 'single update, e.g. a major or a security fix'})`] };
  }

  if (!pr.files?.length) return { auto: false, reasons: ['no changed files found'] };

  const manual = [];
  const unknown = [];
  for (const file of pr.files) {
    const rule = MANUAL_PATHS.find((r) => matches(file, r));
    if (rule) manual.push(`\`${file}\` (${ruleName(rule)})`);
    else if (!AUTO_PATHS.some((r) => matches(file, r))) unknown.push(`\`${file}\``);
  }
  const reasons = [];
  if (manual.length) reasons.push(`needs a review: ${manual.join(', ')}`);
  if (unknown.length) reasons.push(`not covered by the policy: ${unknown.join(', ')}`);
  if (reasons.length) return { auto: false, reasons };
  return { auto: true, reasons: [`only documentation / test files (${pr.files.length})`] };
}

const FIELDS = 'number,state,author,labels,files,isDraft,isCrossRepository,baseRefName,headRefName,headRefOid,mergeStateStatus';

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

/** Reads the PR from GitHub and decides; `pr` carries what the workflow needs to merge it. */
export function decidePullRequest(number, run = gh) {
  const pr = JSON.parse(run(['pr', 'view', String(number), '--json', FIELDS]));
  const decision = decide({
    author: pr.author.login,
    labels: pr.labels.map((l) => l.name),
    files: pr.files.map((f) => f.path),
    base: pr.baseRefName,
    headRef: pr.headRefName,
    draft: pr.isDraft,
    crossRepository: pr.isCrossRepository,
  });
  return {
    ...decision,
    pr: { number: pr.number, state: pr.state, head: pr.headRefOid, mergeStateStatus: pr.mergeStateStatus },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const number = process.argv[2];
  if (!/^\d+$/.test(number ?? '')) {
    console.error('usage: node scripts/pr-merge-policy.mjs <pr-number>');
    process.exit(2);
  }
  console.log(JSON.stringify(decidePullRequest(number)));
}
