const NODE_MODULES = '/node_modules/';

/** The package folder a module comes from ("…/node_modules/@scope/name"), or null for our own code. */
export function packageDir(id: string): string | null {
  const file = id.replace(/^\0/, '').split('?')[0].replace(/\\/g, '/');
  const i = file.lastIndexOf(NODE_MODULES);
  if (i < 0) return null;
  const parts = file.slice(i + NODE_MODULES.length).split('/');
  return file.slice(0, i + NODE_MODULES.length) + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/');
}
