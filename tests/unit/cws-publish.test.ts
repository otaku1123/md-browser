import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { publish } from '../../scripts/cws-publish.mjs';

const ITEM = 'publishers/pub/items/item';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function run(responses: Response[]) {
  const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => responses.shift()!);
  const result = publish({
    token: 'tok',
    publisherId: 'pub',
    itemId: 'item',
    zip: new TextEncoder().encode('zip'),
    version: '1.9.1',
    fetchFn,
    sleep: async () => {},
    log: () => {},
  });
  return { fetchFn, result };
}

describe('cws-publish', () => {
  it('uploads, then submits for review to publish on approval', async () => {
    const { fetchFn, result } = run([
      json({ uploadState: 'SUCCEEDED', crxVersion: '1.9.1' }),
      json({ state: 'PENDING_REVIEW' }),
    ]);
    await expect(result).resolves.toEqual({ state: 'PENDING_REVIEW' });
    const calls = fetchFn.mock.calls;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      `POST https://chromewebstore.googleapis.com/upload/v2/${ITEM}:upload`,
      `POST https://chromewebstore.googleapis.com/v2/${ITEM}:publish`,
    ]);
    expect(calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' });
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ publishType: 'DEFAULT_PUBLISH' });
  });

  it('waits for an upload still in progress', async () => {
    const { fetchFn, result } = run([
      json({ uploadState: 'IN_PROGRESS' }),
      json({ lastAsyncUploadState: 'IN_PROGRESS' }),
      json({ lastAsyncUploadState: 'SUCCEEDED' }),
      json({ state: 'PENDING_REVIEW' }),
    ]);
    await expect(result).resolves.toEqual({ state: 'PENDING_REVIEW' });
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[1][0]).toMatch(/:fetchStatus$/);
  });

  it('does not submit a failed upload or another version', async () => {
    await expect(run([json({ uploadState: 'FAILED' })]).result).rejects.toThrow('state FAILED');
    await expect(run([json({ uploadState: 'SUCCEEDED', crxVersion: '1.9.0' })]).result).rejects.toThrow('expected 1.9.1');
  });

  it('reports API errors with the status and body', async () => {
    await expect(run([json({ error: { message: 'version must be greater' } }, 400)]).result).rejects.toThrow(
      /400 .*version must be greater/,
    );
  });
});
