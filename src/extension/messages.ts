export const MSG_READ_SELF = 'md-browser:read-self';
export const MSG_LIST_SIBLINGS = 'md-browser:list-siblings';
/** Hides (or shows again) a folder of the tab's list: `path` is relative to the tab's root. */
export const MSG_SET_HIDDEN_DIR = 'md-browser:set-hidden-dir';
/** Reads a Markdown file below the tab's root by its root-relative path (full-text search). */
export const MSG_READ_FILE = 'md-browser:read-file';

/** `known` is the hash of the version the page already has; the answer then skips the text. */
export type ReadSelfMessage = { type: typeof MSG_READ_SELF; known?: string };
export type ReadSelfResponse =
  | { ok: true; unchanged: true }
  | { ok: true; unchanged?: false; text: string; hash: string }
  | { ok: false; error: string };
export type ListSiblingsResponse =
  | { ok: true; paths: string[]; truncated: boolean; current: string; hidden: string[] }
  | { ok: false; error: string };
export type SetHiddenDirMessage = { type: typeof MSG_SET_HIDDEN_DIR; path: string; hidden: boolean };
export type SetHiddenDirResponse = { ok: true; hidden: string[] } | { ok: false; error: string };
/** `known` as in ReadSelfMessage: the hash the page has, so an unchanged file sends no text. */
export type ReadFileMessage = { type: typeof MSG_READ_FILE; path: string; known?: string };
export type ReadFileResponse = ReadSelfResponse;
/**
 * Reads an asset below the tab's root by its root-relative path (read-asset.ts says which kinds):
 * an image comes back as a data: URL, a text file as its text. `known` as in ReadSelfMessage.
 */
export const MSG_READ_ASSET = 'md-browser:read-asset';
export type ReadAssetMessage = { type: typeof MSG_READ_ASSET; path: string; known?: string };
export type ReadAssetResponse =
  | { ok: true; unchanged: true }
  | { ok: true; unchanged?: false; kind: 'image' | 'text'; data: string; hash: string }
  | { ok: false; error: string };
