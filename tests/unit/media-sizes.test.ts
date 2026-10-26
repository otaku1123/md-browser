import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMediaSizes,
  hashText,
  imageBaseWidth,
  loadMediaDoc,
  prepareMediaSizes,
  setGlobalMediaScale,
  showMediaSizes,
  stepScale,
  svgBaseWidth,
} from '../../src/core/media-sizes';
import { MEDIA_SIZES_KEY, loadItemSizes, normalizeItemSizes, normalizeMediaSizes, saveItemSizes } from '../../src/core/media-sizes-store';

const keys = () => Array.from(document.querySelectorAll('[data-media-key]'), (el) => el.getAttribute('data-media-key'));
const diagram = (source: string) => `<div class="diagram diagram-mermaid"><pre class="diagram-source">${source}</pre></div>`;

function svg(attrs: string): SVGSVGElement {
  document.body.innerHTML = `<svg ${attrs}></svg>`;
  return document.querySelector('svg')!;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.replaceChildren();
  setGlobalMediaScale(100);
});

describe('prepareMediaSizes', () => {
  it('keys images by their ref as written and diagrams by a hash of their source, counting repeats', () => {
    document.body.innerHTML =
      '<p><img src="img/a.png"> <img src="img/b.png"> <img src="img/a.png"></p>' + diagram('A --> B') + diagram('C') + diagram('A --> B');
    prepareMediaSizes(document.body);
    const h = hashText('A --> B');
    expect(keys()).toEqual(['img:img/a.png#1', 'img:img/b.png#1', 'img:img/a.png#2', `diagram:${h}#1`, `diagram:${hashText('C')}#1`, `diagram:${h}#2`]);
  });

  it('keeps a diagram key when content is added before it', () => {
    document.body.innerHTML = diagram('graph LR; A-->B');
    prepareMediaSizes(document.body);
    const before = keys();
    document.body.innerHTML = '<p><img src="new.png"></p>' + diagram('other') + diagram('graph LR; A-->B');
    prepareMediaSizes(document.body);
    expect(keys()).toContain(before[0]);
  });

  it('hashes long refs such as data: URLs, and is stable', () => {
    const ref = `data:image/png;base64,${'A'.repeat(500)}`;
    document.body.innerHTML = `<img src="${ref}">`;
    prepareMediaSizes(document.body);
    expect(keys()).toEqual([`img:#${hashText(ref)}#1`]);
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });

  it('puts the buttons beside the item, outside links, and ignores keys from the document', () => {
    document.body.innerHTML = '<p><a href="x"><img src="a.png"></a></p>' + diagram('A') + '<p data-media-key="evil">x</p>';
    prepareMediaSizes(document.body);
    expect(keys()).toEqual(['img:a.png#1', `diagram:${hashText('A')}#1`]);
    const imgFrame = document.querySelector('p > .media-frame')!;
    expect(imgFrame.firstElementChild!.tagName).toBe('A');
    expect(imgFrame.querySelector('a .media-size')).toBeNull();
    const diagramFrame = document.querySelector('div.media-frame')!;
    expect(diagramFrame.querySelector('.diagram .media-size')).toBeNull();
    expect(diagramFrame.querySelectorAll(':scope > .media-size button')).toHaveLength(3);
  });

  it('skips links holding several images', () => {
    document.body.innerHTML = '<a href="x"><img src="a.png"><img src="b.png"></a>';
    prepareMediaSizes(document.body);
    expect(keys()).toEqual([]);
  });
});

describe('base widths', () => {
  it('uses the width attribute, else the natural width', () => {
    const img = document.createElement('img');
    expect(imageBaseWidth(img)).toBeNull(); // not loaded
    Object.defineProperty(img, 'naturalWidth', { value: 400 });
    Object.defineProperty(img, 'naturalHeight', { value: 200 });
    expect(imageBaseWidth(img)).toBe(400);
    img.setAttribute('height', '100');
    expect(imageBaseWidth(img)).toBe(200);
    img.setAttribute('width', '300');
    expect(imageBaseWidth(img)).toBe(300);
    img.setAttribute('width', '50%');
    expect(imageBaseWidth(img)).toBe(200);
  });

  it('reads Mermaid, PlantUML and plain svg sizes', () => {
    expect(svgBaseWidth(svg('width="100%" style="max-width: 552.5px;" viewBox="0 0 552.5 100"'))).toBe(552.5);
    expect(svgBaseWidth(svg('width="180px" height="90px" style="width:180px;height:90px;" viewBox="0 0 180 90"'))).toBe(180);
    expect(svgBaseWidth(svg('width="240" height="80"'))).toBe(240);
    expect(svgBaseWidth(svg('width="100%" viewBox="0 0 320 50"'))).toBe(320);
    expect(svgBaseWidth(svg('width="100%"'))).toBeNull();
  });
});

describe('applying sizes', () => {
  function drawn(): HTMLElement {
    document.body.innerHTML = diagram('A') + '<p><img src="a.png" width="200"></p>';
    prepareMediaSizes(document.body);
    const node = document.querySelector<HTMLElement>('.diagram')!;
    // What diagrams.ts leaves in dark mode: a screen and a print copy.
    node.innerHTML =
      '<div class="diagram-screen"><svg width="100%" style="max-width: 300px"></svg></div><div class="diagram-print"><svg width="100%" style="max-width: 300px"></svg></div>';
    return node;
  }

  it('sets width = base × scale, per item over the global scale, and resets', async () => {
    const node = drawn();
    const img = document.querySelector('img')!;
    showMediaSizes(document.body, await loadMediaDoc('doc'));
    expect(node.style.getPropertyValue('--media-w')).toBe('300px');
    expect(node.classList.contains('media-scaled')).toBe(true);
    setGlobalMediaScale(150);
    expect(node.style.getPropertyValue('--media-w')).toBe('450px');
    expect(img.style.getPropertyValue('--media-w')).toBe('300px');

    const [smaller, reset] = node.parentElement!.querySelectorAll<HTMLButtonElement>('.media-size button');
    expect(reset.textContent).toBe('150%');
    smaller.click();
    expect(node.style.getPropertyValue('--media-w')).toBe('375px'); // 125%
    expect(reset.textContent).toBe('125%');
    expect(img.style.getPropertyValue('--media-w')).toBe('300px'); // others keep the global scale
    reset.click();
    expect(node.style.getPropertyValue('--media-w')).toBe('450px');
  });

  it('saves per-item sizes for the document and restores them', async () => {
    const node = drawn();
    showMediaSizes(document.body, await loadMediaDoc('docs/a.md'));
    const larger = node.parentElement!.querySelectorAll<HTMLButtonElement>('.media-size button')[2];
    larger.click();
    await saveItemSizes('other.md', {}); // waits for the queued write
    expect(await loadItemSizes('docs/a.md')).toEqual({ [`diagram:${hashText('A')}#1`]: 125 });

    const again = drawn();
    showMediaSizes(document.body, await loadMediaDoc('docs/a.md'));
    expect(again.style.getPropertyValue('--media-w')).toBe('375px');
    showMediaSizes(document.body, await loadMediaDoc('docs/b.md'));
    expect(again.style.getPropertyValue('--media-w')).toBe('300px');
  });

  it('shows no buttons for a diagram that failed or an image without a size', async () => {
    document.body.innerHTML = diagram('A') + '<p><img src="a.png"></p>';
    prepareMediaSizes(document.body);
    document.querySelector('.diagram')!.classList.add('diagram-error');
    applyMediaSizes(document.body);
    expect(document.querySelectorAll('.media-frame.media-ready')).toHaveLength(0);
  });
});

describe('stepScale', () => {
  it('steps through the list and stops at its ends', () => {
    expect(stepScale(100, 1)).toBe(125);
    expect(stepScale(100, -1)).toBe(75);
    expect(stepScale(150, 1)).toBe(200);
    expect(stepScale(300, 1)).toBe(300);
    expect(stepScale(25, -1)).toBe(25);
  });
});

describe('media sizes store', () => {
  it('keeps only allowed sizes under string keys, without a prototype', () => {
    const items = normalizeItemSizes({ a: 50, b: 60, c: '100', d: 300, ['__proto__']: 75, '': 100 });
    expect(Object.getPrototypeOf(items)).toBeNull();
    expect({ ...items }).toEqual({ a: 50, d: 300, ['__proto__']: 75 });
    expect(normalizeItemSizes([50])).toEqual({});
    expect(normalizeItemSizes('x')).toEqual({});
  });

  it('caps items per document, keeping the newest', () => {
    const raw = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, 100]));
    const items = normalizeItemSizes(raw);
    expect(Object.keys(items)).toHaveLength(500);
    expect(items.k599).toBe(100);
    expect(items.k0).toBeUndefined();
  });

  it('drops broken documents and keeps the most recently changed', () => {
    const raw: Record<string, unknown> = { empty: { at: 5, items: {} }, bad: 'x', noAt: { items: { a: 50 } } };
    for (let i = 0; i < 250; i++) raw[`d${i}`] = { at: 1000 + i, items: { a: 50 } };
    const map = normalizeMediaSizes(raw);
    expect(Object.keys(map)).toHaveLength(200);
    expect(map.d249).toEqual({ at: 1249, items: { a: 50 } });
    expect(map.d0).toBeUndefined();
    expect(map.noAt).toBeUndefined(); // at 0: the oldest
    expect(map.empty).toBeUndefined();
    expect(normalizeMediaSizes(null)).toEqual({});
    expect(normalizeMediaSizes([1])).toEqual({});
  });

  it('saves to localStorage and forgets a document without sizes', async () => {
    await saveItemSizes('a.md', { x: 200 });
    expect(JSON.parse(localStorage.getItem(MEDIA_SIZES_KEY)!)['a.md'].items).toEqual({ x: 200 });
    await saveItemSizes('a.md', {});
    expect(JSON.parse(localStorage.getItem(MEDIA_SIZES_KEY)!)).toEqual({});
    localStorage.setItem(MEDIA_SIZES_KEY, '{not json');
    expect(await loadItemSizes('a.md')).toEqual({});
  });
});
