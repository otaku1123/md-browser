import { describe, expect, it } from 'vitest';
import { packageDir } from '../../scripts/package-dir';

describe('packageDir', () => {
  it('finds the package folder of bundled modules, scoped or not, nested or not', () => {
    expect(packageDir('/r/node_modules/katex/dist/katex.mjs')).toBe('/r/node_modules/katex');
    expect(packageDir('/r/node_modules/@plantuml/core/plantuml.js')).toBe('/r/node_modules/@plantuml/core');
    expect(packageDir('/r/node_modules/mermaid/node_modules/uuid/dist/index.js?commonjs')).toBe('/r/node_modules/mermaid/node_modules/uuid');
  });

  it('ignores our own code and virtual modules', () => {
    expect(packageDir('/r/src/main.ts')).toBeNull();
    expect(packageDir('\0vite/preload-helper.js')).toBeNull();
  });
});
