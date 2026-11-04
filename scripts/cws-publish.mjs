// Uploads release/md-browser-<version>.zip to the Chrome Web Store and submits it for review
// (published automatically once approved). Run by .github/workflows/release.yml.
//
//   CWS_TOKEN=<access token> CWS_PUBLISHER_ID=... CWS_ITEM_ID=... node scripts/cws-publish.mjs <zip> <version> [--no-submit | --submit-only]
//
// --no-submit uploads the zip as the item's draft and stops there (the workflow uses it when the
// store listing text changed, so the dashboard can be updated by hand before the review starts:
// #187); --submit-only submits the draft already uploaded. The token needs the https://www.googleapis.com/auth/chromewebstore scope (the workflow gets
// one for the service account registered in the developer dashboard).
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';

/** Polls fetchStatus while an upload is still being processed. */
const POLL_MS = 5000;
const POLL_TIMES = 60;

/**
 * Uploads `zip`, waits for the store to accept it as `version`, then submits it for review.
 * Returns the publish response, or `{ submitted: false }` with `submit: false` (upload only);
 * `upload: false` submits the draft already there. `fetchFn` and `sleep` are injectable for tests.
 */
export async function publish({
  token,
  publisherId,
  itemId,
  zip,
  version,
  upload: doUpload = true,
  submit = true,
  fetchFn = fetch,
  sleep = defaultSleep,
  log = console.log,
}) {
  const item = `publishers/${publisherId}/items/${itemId}`;
  const call = async (method, url, body) => {
    const res = await fetchFn(url, { method, headers: { Authorization: `Bearer ${token}` }, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${text}`);
    return text ? JSON.parse(text) : {};
  };

  if (doUpload) {
    log(`uploading ${zip.length} bytes as ${version}`);
    const upload = await call('POST', `${API}/upload/v2/${item}:upload`, zip);
    let state = upload.uploadState;
    // The docs name the in-progress state both ways.
    for (let i = 0; /IN_PROGRESS$/.test(state ?? ''); i++) {
      if (i >= POLL_TIMES) throw new Error('upload still in progress, giving up');
      await sleep(POLL_MS);
      state = (await call('GET', `${API}/v2/${item}:fetchStatus`)).lastAsyncUploadState;
    }
    if (state !== 'SUCCEEDED') throw new Error(`upload ended in state ${state}: ${JSON.stringify(upload)}`);
    // Only a synchronous upload reports the version; when it does, it must be this release.
    if (upload.crxVersion && upload.crxVersion !== version) throw new Error(`the store got ${upload.crxVersion}, expected ${version}`);
    log('upload succeeded');
  } else log('submitting the draft already uploaded');
  if (!submit) {
    log('not submitted for review: the draft waits in the developer dashboard');
    return { submitted: false };
  }

  const result = await call('POST', `${API}/v2/${item}:publish`, JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }));
  log(`submitted for review: ${result.state ?? 'unknown state'}`);
  for (const w of result.warningInfo?.warnings ?? []) log(`warning: ${w.reason}: ${w.description}`);
  return result;
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [zipPath, version] = args.filter((a) => !a.startsWith('--'));
  const { CWS_TOKEN: token, CWS_PUBLISHER_ID: publisherId, CWS_ITEM_ID: itemId } = process.env;
  const known = ['--no-submit', '--submit-only'];
  if (!zipPath || !version || !token || !publisherId || !itemId || flags.some((f) => !known.includes(f)) || flags.length > 1) {
    console.error('usage: CWS_TOKEN=... CWS_PUBLISHER_ID=... CWS_ITEM_ID=... node scripts/cws-publish.mjs <zip> <version> [--no-submit | --submit-only]');
    process.exit(2);
  }
  const submitOnly = flags.includes('--submit-only');
  await publish({
    token,
    publisherId,
    itemId,
    zip: submitOnly ? null : await readFile(zipPath),
    version,
    upload: !submitOnly,
    submit: !flags.includes('--no-submit'),
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
