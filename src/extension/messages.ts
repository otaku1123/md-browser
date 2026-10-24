export const MSG_READ_SELF = 'md-browser:read-self';
export const MSG_LIST_SIBLINGS = 'md-browser:list-siblings';

export type ReadSelfResponse = { ok: true; text: string } | { ok: false; error: string };
export type ListSiblingsResponse = { ok: true; paths: string[]; truncated: boolean; current: string } | { ok: false; error: string };
