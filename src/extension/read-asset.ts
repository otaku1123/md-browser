// The other kinds of file the service worker reads for a page, besides its Markdown documents:
// what a document refers to, below the tab's root only (background.ts checks the sender and
// builds the URL below the root; here the path and the file are checked). Each kind has its
// extensions, a size limit and a form on the wire: images as data: URLs (the HTML export embeds
// them), text files as text. Anything else is refused by name, before it is read.
import type { ReadAssetResponse } from './messages';
import { isBelowRoot } from './dir-listing';
import { sha256Hex } from './read-self';

export type AssetKind = 'image' | 'text';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};
const TEXT_EXTENSIONS = new Set(['puml', 'plantuml', 'iuml', 'pu', 'css']);

export const ASSET_LIMITS: Record<AssetKind, number> = {
  image: 20 * 1024 * 1024, // as the export's own limit for fetched images (export-html.ts)
  text: 2 * 1024 * 1024,
};

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The kind of asset a root-relative path names, by its extension; null for anything else. */
export function assetKind(path: string): AssetKind | null {
  const ext = extensionOf(path);
  if (ext in IMAGE_TYPES) return 'image';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

/** A root-relative path a page may ask to read as an asset: below the root, of a known kind. */
export function isAssetPath(path: string): boolean {
  return isBelowRoot(path) && assetKind(path) !== null;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Reads the asset at `url` (already checked and built below the root from `path`), unless the
 * page has this version (`known`). The MIME type comes from the extension: a file:// response
 * may carry none, and the extension is what was allowed.
 */
export async function readAsset(fetchFn: typeof fetch, url: string, path: string, known?: string): Promise<ReadAssetResponse> {
  const kind = assetKind(path);
  if (!kind) return { ok: false, error: 'bad path' };
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > ASSET_LIMITS[kind]) return { ok: false, error: 'too large' };
    const hash = await sha256Hex(buf);
    if (hash === known) return { ok: true, unchanged: true };
    const data = kind === 'image' ? `data:${IMAGE_TYPES[extensionOf(path)]};base64,${base64(new Uint8Array(buf))}` : new TextDecoder().decode(buf);
    return { ok: true, kind, data, hash };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
