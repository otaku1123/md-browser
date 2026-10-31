import { describe, expect, it } from 'vitest';
import { clampScale, FIT, ZOOM_MAX, ZOOM_MIN, zoomAround } from '../../src/core/image-zoom';

describe('zoomAround', () => {
  it('keeps the point under the pointer fixed', () => {
    const center = { x: 500, y: 300 };
    const pointer = { x: 600, y: 350 }; // 100px right and 50px below the center
    const next = zoomAround(FIT, 2, pointer, center);
    expect(next.scale).toBe(2);
    // The content point that was 100px from the center is now 200px from it, so the center moves back by 100.
    expect(next).toMatchObject({ tx: -100, ty: -50 });
    // Zooming back around the same pointer returns to the start.
    expect(zoomAround(next, 1, pointer, center)).toEqual(FIT);
  });

  it('zooms around the center when the pointer is on it', () => {
    const center = { x: 500, y: 300 };
    expect(zoomAround(FIT, 3, center, center)).toEqual({ scale: 3, tx: 0, ty: 0 });
    const panned = { scale: 1, tx: 40, ty: -20 };
    // Pointer on the (translated) center: the translation stays.
    expect(zoomAround(panned, 2, { x: 540, y: 280 }, center)).toEqual({ scale: 2, tx: 40, ty: -20 });
  });

  it('clamps the scale', () => {
    expect(zoomAround(FIT, 100, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(ZOOM_MAX);
    expect(zoomAround(FIT, 0.001, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(ZOOM_MIN);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(0)).toBe(ZOOM_MIN);
    expect(clampScale(Infinity)).toBe(ZOOM_MAX);
  });
});
