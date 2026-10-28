import type { ReadSelfResponse } from './messages';

/** SHA-256 of the bytes, as hex: the version tag the page and the service worker compare. */
export async function sha256Hex(data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads the file and answers with its text, unless the page already has this version (`known` is
 * the hash it last got): the page polls every second, so an unchanged file must not be decoded
 * and copied through the message channel each time (CPU on big files, and a size limit on it).
 */
export async function readSelf(fetchFn: typeof fetch, url: string, known?: string): Promise<ReadSelfResponse> {
  try {
    const buf = await (await fetchFn(url, { cache: 'no-store' })).arrayBuffer();
    const hash = await sha256Hex(buf);
    if (hash === known) return { ok: true, unchanged: true };
    return { ok: true, text: new TextDecoder().decode(buf), hash };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
