// Remembers the size picked for single images and diagrams, per document. Local only, never synced:
// document keys are file:// URLs (local paths) or folder names plus paths. Extension pages and
// content scripts use chrome.storage.local; the web app uses localStorage.

export const MEDIA_SIZES_KEY = 'md-browser:media-sizes';
/** Sizes (percent of the natural size) the per-item buttons step through. */
export const SIZE_STEPS = [25, 50, 75, 100, 125, 150, 200, 300] as const;
const MAX_DOCS = 200;
const MAX_ITEMS = 500;
const MAX_KEY_LENGTH = 1000;

/** Item key -> percent. */
export type ItemSizes = Record<string, number>;
type SizesMap = Record<string, { at: number; items: ItemSizes }>;

const isStep = (v: unknown): v is number => (SIZE_STEPS as readonly unknown[]).includes(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Keeps only allowed sizes under reasonable keys; the newest entries win when over the cap. */
export function normalizeItemSizes(raw: unknown): ItemSizes {
  // No prototype, so keys like "__proto__" are plain keys.
  const out: ItemSizes = Object.create(null);
  if (!isObject(raw)) return out;
  const entries = Object.entries(raw).filter(([key, v]) => key !== '' && key.length <= MAX_KEY_LENGTH && isStep(v));
  for (const [key, v] of entries.slice(-MAX_ITEMS)) out[key] = v as number;
  return out;
}

/** Drops documents without sizes and keeps the MAX_DOCS most recently changed. */
export function normalizeMediaSizes(raw: unknown): SizesMap {
  const out: SizesMap = Object.create(null);
  if (!isObject(raw)) return out;
  const docs: [string, { at: number; items: ItemSizes }][] = [];
  for (const [doc, entry] of Object.entries(raw)) {
    if (doc === '' || doc.length > MAX_KEY_LENGTH || !isObject(entry)) continue;
    const items = normalizeItemSizes(entry.items);
    if (!Object.keys(items).length) continue;
    const at = typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.at > 0 ? entry.at : 0;
    docs.push([doc, { at, items }]);
  }
  docs.sort((a, b) => b[1].at - a[1].at);
  for (const [doc, entry] of docs.slice(0, MAX_DOCS)) out[doc] = entry;
  return out;
}

async function readMap(): Promise<SizesMap> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return normalizeMediaSizes((await local.get(MEDIA_SIZES_KEY))[MEDIA_SIZES_KEY]);
  try {
    return normalizeMediaSizes(JSON.parse(localStorage.getItem(MEDIA_SIZES_KEY) ?? 'null'));
  } catch {
    return normalizeMediaSizes(null);
  }
}

async function writeMap(map: SizesMap): Promise<void> {
  const local = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
  if (local) return local.set({ [MEDIA_SIZES_KEY]: map });
  try {
    localStorage.setItem(MEDIA_SIZES_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode etc.): the sizes last for this page only.
  }
}

export async function loadItemSizes(doc: string): Promise<ItemSizes> {
  const map = await readMap().catch(() => normalizeMediaSizes(null));
  return normalizeItemSizes(map[doc]?.items);
}

let queue = Promise.resolve();

/** Replaces the sizes saved for doc (none: forgets the document). One write at a time. */
export function saveItemSizes(doc: string, items: ItemSizes): Promise<void> {
  queue = queue.then(async () => {
    const map = await readMap().catch(() => normalizeMediaSizes(null));
    const list = normalizeItemSizes(items);
    if (Object.keys(list).length) map[doc] = { at: Date.now(), items: list };
    else delete map[doc];
    await writeMap(normalizeMediaSizes(map));
  }).catch(() => {});
  return queue;
}
