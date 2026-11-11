import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { DEPENDABOT, LABEL_AUTO, LABEL_MANUAL, decide, decidePullRequest, dependabotGroup } from '../../scripts/pr-merge-policy.mjs';

const human = (files: string[], labels: string[] = []) => decide({ author: 'otaku1123', labels, files });

describe('pr-merge-policy', () => {
  it('merges documentation-only changes on their own', () => {
    const d = human(['README.md', 'README.en.md', 'docs/features.md', 'docs/features.en.md', 'sample/docs/other.md', 'SECURITY.md']);
    expect(d.auto).toBe(true);
    expect(d.reasons[0]).toMatch(/documentation \/ test files \(6\)/);
  });

  it('merges test-only changes, but not screenshot baselines', () => {
    expect(human(['tests/unit/file-tree.test.ts', 'tests/fixtures/gfm/tables.md', 'tests/e2e/web.spec.ts']).auto).toBe(true);
    const d = human(['tests/e2e/__screenshots__/visual-web.spec.ts/toolbar-chromium-linux.png']);
    expect(d.auto).toBe(false);
    expect(d.reasons[0]).toContain('tests/e2e/__screenshots__/');
  });

  it('needs a review as soon as one file is source, config, script, workflow or store text', () => {
    for (const file of [
      'src/main.ts',
      'src/extension/background.ts',
      'extension/public/manifest.json',
      'public/privacy.html',
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.extension.config.ts',
      'playwright.config.ts',
      'scripts/release-check.mjs',
      '.github/workflows/test.yml',
      '.github/dependabot.yml',
      'docs/store/listing.md',
    ]) {
      const d = human(['README.md', file]);
      expect(d.auto, file).toBe(false);
      expect(d.reasons.join('\n'), file).toContain(`\`${file}\``);
    }
  });

  it('needs a review for paths the policy does not know', () => {
    const d = human(['README.md', 'tools/new-thing.sh']);
    expect(d.auto).toBe(false);
    expect(d.reasons).toEqual(['not covered by the policy: `tools/new-thing.sh`']);
  });

  it('lets the labels override the paths, manual winning over auto', () => {
    expect(human(['src/main.ts'], [LABEL_AUTO])).toEqual({ auto: true, reasons: [`label \`${LABEL_AUTO}\``] });
    expect(human(['README.md'], [LABEL_MANUAL]).auto).toBe(false);
    expect(human(['README.md'], [LABEL_AUTO, LABEL_MANUAL]).auto).toBe(false);
  });

  it('never merges a draft, a fork, an empty PR or a PR to another branch, even with the label', () => {
    const base = { author: 'otaku1123', labels: [LABEL_AUTO], files: ['README.md'] };
    expect(decide({ ...base, draft: true }).auto).toBe(false);
    expect(decide({ ...base, crossRepository: true }).auto).toBe(false);
    expect(decide({ ...base, base: 'main' })).toEqual({ auto: false, reasons: ['base branch is `main`, not `develop`'] });
    expect(human([]).auto).toBe(false);
  });

  it('reads the Dependabot group from the branch name', () => {
    expect(dependabotGroup('dependabot/npm_and_yarn/develop/npm-minor-patch-aa76e49b1b')).toBe('npm-minor-patch');
    expect(dependabotGroup('dependabot/github_actions/develop/actions-minor-patch-0123456789')).toBe('actions-minor-patch');
    expect(dependabotGroup('dependabot/npm_and_yarn/develop/vite-7.2.0')).toBeNull();
    expect(dependabotGroup('feature/199-auto-merge')).toBeNull();
  });

  it('merges Dependabot minor/patch groups only', () => {
    const bot = (headRef: string) =>
      decide({ author: DEPENDABOT, labels: ['dependencies'], files: ['package.json', 'package-lock.json'], headRef });
    expect(bot('dependabot/npm_and_yarn/develop/npm-minor-patch-aa76e49b1b')).toEqual({
      auto: true,
      reasons: ['Dependabot group `npm-minor-patch` (minor and patch updates)'],
    });
    expect(bot('dependabot/github_actions/develop/actions-minor-patch-0123456789').auto).toBe(true);
    expect(bot('dependabot/github_actions/develop/actions-abcdef0123').auto).toBe(false);
    const single = bot('dependabot/npm_and_yarn/develop/vite-7.2.0');
    expect(single.auto).toBe(false);
    expect(single.reasons[0]).toContain('single update');
  });

  it('reads the PR through gh and passes on what the workflow needs to merge', () => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      return JSON.stringify({
        number: 42,
        state: 'OPEN',
        author: { login: 'otaku1123' },
        labels: [{ name: 'documentation' }],
        files: [{ path: 'docs/features.md' }],
        isDraft: false,
        isCrossRepository: false,
        baseRefName: 'develop',
        headRefName: 'docs/42-features',
        headRefOid: 'abc123',
        mergeStateStatus: 'BLOCKED',
      });
    };
    expect(decidePullRequest(42, run)).toEqual({
      auto: true,
      reasons: ['only documentation / test files (1)'],
      pr: { number: 42, state: 'OPEN', head: 'abc123', mergeStateStatus: 'BLOCKED' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual(['pr', 'view', '42']);
  });
});
