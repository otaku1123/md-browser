export const MSG_READ_SELF = 'md-browser:read-self';
export const MSG_LIST_SIBLINGS = 'md-browser:list-siblings';
/** Hides (or shows again) a folder of the tab's list: `path` is relative to the tab's root. */
export const MSG_SET_HIDDEN_DIR = 'md-browser:set-hidden-dir';

export type ReadSelfResponse = { ok: true; text: string } | { ok: false; error: string };
export type ListSiblingsResponse =
  | { ok: true; paths: string[]; truncated: boolean; current: string; hidden: string[] }
  | { ok: false; error: string };
export type SetHiddenDirMessage = { type: typeof MSG_SET_HIDDEN_DIR; path: string; hidden: boolean };
export type SetHiddenDirResponse = { ok: true; hidden: string[] } | { ok: false; error: string };
