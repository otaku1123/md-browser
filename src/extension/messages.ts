export const MSG_READ_SELF = 'md-browser:read-self';

export type ReadSelfResponse = { ok: true; text: string } | { ok: false; error: string };
