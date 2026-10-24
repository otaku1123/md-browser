import { describe, expect, it } from 'vitest';
import { diagramFilename, serializeSvg } from '../../src/core/diagram-export';

function svgFrom(markup: string): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.querySelector('svg')!;
}

describe('serializeSvg', () => {
  it('adds xmlns, an explicit size from the viewBox and a background, keeping the inline <style>', () => {
    const svg = svgFrom(
      '<svg id="m1" width="100%" viewBox="0 0 120.4 60" style="max-width: 120px"><style>#m1 .a{fill:red}</style><rect class="a"/></svg>',
    );
    const out = serializeSvg(svg, 'rgb(1, 2, 3)');
    expect(out.startsWith('<?xml')).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('width="121"');
    expect(out).toContain('height="60"');
    expect(out).toContain('background-color: rgb(1, 2, 3)');
    expect(out).not.toContain('max-width');
    expect(out).toContain('#m1 .a{fill:red}');
    // the document's own svg is untouched
    expect(svg.getAttribute('width')).toBe('100%');
  });
});

describe('diagramFilename', () => {
  it('numbers the diagram and uses the extension', () => {
    expect(diagramFilename(2, 'svg')).toBe('diagram-2.svg');
    expect(diagramFilename(1, 'png')).toBe('diagram-1.png');
  });
});
