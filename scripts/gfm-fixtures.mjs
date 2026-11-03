// Fetches GitHub's rendering of tests/fixtures/gfm/*.md through the GitHub Markdown API
// and saves it next to each file as <name>.github.html. The API's "markdown" mode is what github.com
// does for a README, except that alerts, task lists and math are added later on github.com and
// the API leaves them alone; its "gfm" mode (comments, issues) renders those but turns every
// line break into <br> and adds no heading anchors. A fixture that needs "gfm" says so on its
// first line: <!-- gfm-fixture mode: gfm --> (and then avoids line breaks inside paragraphs).
// tests/unit/gfm-compat.test.ts compares the saved files with renderMarkdown(); the test itself
// never goes online, so run this by hand after editing a fixture:
//
//   npm run gfm:fetch              # fixtures whose Markdown changed since the last fetch
//   npm run gfm:fetch -- --force   # all of them (GitHub changed its output)
//   npm run gfm:fetch -- tables    # only tables.md
//
// Each .github.html starts with a comment that names the SHA-256 of the Markdown it was made
// from; the test fails when it no longer matches, so a fixture can't silently go stale.
// Unauthenticated calls are limited to 60 per hour; a GITHUB_TOKEN or `gh auth token` raises it.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const DIR = new URL('../tests/fixtures/gfm/', import.meta.url);
const API = 'https://api.github.com/markdown';
// Same patterns as in tests/unit/gfm-compat.test.ts.
const HEADER = /^<!-- gfm-fixture sha256=([0-9a-f]{64}) mode=(markdown|gfm) -->\n/;
const MODE = /^<!--\s*gfm-fixture mode:\s*(markdown|gfm)\s*-->/;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

async function fetchGitHub(text, mode, auth) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ text, mode }) });
  if (!res.ok) {
    const reset = res.headers.get('x-ratelimit-reset');
    const when = reset ? ` (rate limit resets ${new Date(Number(reset) * 1000).toLocaleTimeString()})` : '';
    throw new Error(`GitHub API ${res.status} ${res.statusText}${when}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.text();
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = new Set(args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\.md$/, '')));
  const names = (await readdir(DIR))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .filter((n) => only.size === 0 || only.has(n))
    .sort();
  const auth = token();
  let fetched = 0;
  for (const name of names) {
    const md = await readFile(new URL(`${name}.md`, DIR), 'utf8');
    const hash = sha256(md);
    const mode = MODE.exec(md)?.[1] ?? 'markdown';
    const out = new URL(`${name}.github.html`, DIR);
    if (!force) {
      const current = await readFile(out, 'utf8').catch(() => '');
      if (HEADER.exec(current)?.[1] === hash) continue;
    }
    const html = await fetchGitHub(md, mode, auth);
    await writeFile(out, `<!-- gfm-fixture sha256=${hash} mode=${mode} -->\n${html.replace(/\n*$/, '\n')}`);
    console.log(`fetched ${name}.github.html`);
    fetched++;
  }
  console.log(`${fetched} of ${names.length} fixture(s) updated${auth ? '' : ' (unauthenticated: 60 requests per hour)'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
