// Saves a rendered Mermaid diagram as a standalone SVG or a PNG. Downloads use a blob: URL and
// <a download>, which needs no extension permission. PNG export is given an svg without HTML labels
// (diagrams.ts renderForExport): a <foreignObject> would taint the canvas and make toBlob throw.
const SVG_NS = 'http://www.w3.org/2000/svg';
const PNG_SCALE = 2;

export function diagramFilename(index: number, ext: 'svg' | 'png'): string {
  return `diagram-${index}.${ext}`;
}

/** Standalone SVG text: xmlns, explicit size and a background. Mermaid's <style> is already inside the svg. */
export function serializeSvg(svg: SVGSVGElement, background: string): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', SVG_NS);
  copy.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const box = copy.viewBox?.baseVal;
  const width = box?.width || svg.getBoundingClientRect().width;
  const height = box?.height || svg.getBoundingClientRect().height;
  if (width && height) {
    // Mermaid sets width="100%" and a max-width style, which have no meaning outside the page.
    copy.setAttribute('width', String(Math.ceil(width)));
    copy.setAttribute('height', String(Math.ceil(height)));
  }
  copy.style.maxWidth = '';
  copy.style.backgroundColor = background;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function saveSvg(svg: SVGSVGElement, background: string, filename: string): void {
  download(new Blob([serializeSvg(svg, background)], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/** Throws when the browser can't rasterize the diagram (e.g. the canvas is tainted). */
export async function savePng(svg: SVGSVGElement, background: string, filename: string): Promise<void> {
  const text = serializeSvg(svg, background);
  const width = Number(/ width="(\d+)"/.exec(text)?.[1]) || 800;
  const height = Number(/ height="(\d+)"/.exec(text)?.[1]) || 600;
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width * PNG_SCALE;
    canvas.height = height * PNG_SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob returned null');
    download(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
