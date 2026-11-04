import { t } from '../i18n';

/** Resolves a path relative to the open document into a displayable URL (or null if not found). */
export type AssetResolver = (relativePath: string) => Promise<string | null>;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

export function isRelativeRef(ref: string): boolean {
  return ref !== '' && !EXTERNAL.test(ref);
}

/** Joins `ref` onto the directory of `docPath` ("a/b/doc.md"), normalising "." and "..". */
export function resolvePath(docPath: string, ref: string): string | null {
  let clean = ref.split(/[?#]/)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* keep as-is when the ref is not valid percent-encoding */
  }
  const base = clean.startsWith('/') ? [] : docPath.split('/').slice(0, -1);
  const parts = [...base];
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null; // escapes the opened folder
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

/** srcset candidates: "url", or "url descriptor" (1x, 2x, 100w …), comma-separated. */
const SRCSET_CANDIDATE = /\s*([^\s,]+)(\s+[^,]+)?\s*(?:,|$)/g;

/** Rewrites the relative URLs of a srcset; null when one of them cannot be resolved. */
export async function resolveSrcset(srcset: string, resolver: AssetResolver | null): Promise<string | null> {
  const out: string[] = [];
  for (const [, ref, descriptor = ''] of srcset.matchAll(SRCSET_CANDIDATE)) {
    const url = isRelativeRef(ref) ? resolver && (await resolver(ref)) : ref;
    if (!url) return null;
    out.push(url + descriptor.trimEnd());
  }
  return out.join(', ');
}

/**
 * Rewrites relative <img src> to resolved URLs. Unresolvable images get a visible marker.
 * A <picture>'s <source srcset> is rewritten too; one that cannot be resolved is dropped, so the
 * <img> (the light version, in GitHub's usage) shows in its place.
 */
export async function resolveImages(root: ParentNode, resolver: AssetResolver | null): Promise<void> {
  const sources = Array.from(root.querySelectorAll<HTMLSourceElement>('picture > source[srcset]'));
  await Promise.all(
    sources.map(async (source) => {
      const srcset = await resolveSrcset(source.getAttribute('srcset') ?? '', resolver);
      if (srcset) source.setAttribute('srcset', srcset);
      else source.remove();
    }),
  );
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const ref = img.getAttribute('src') ?? '';
      if (!isRelativeRef(ref)) return;
      const url = resolver ? await resolver(ref) : null;
      if (url) {
        img.src = url;
      } else {
        img.removeAttribute('src');
        img.classList.add('img-missing');
        img.title = t(resolver ? 'imageNotFound' : 'imageNeedsFolder', { ref });
        img.alt = t('imageAlt', { ref });
      }
    }),
  );
}
