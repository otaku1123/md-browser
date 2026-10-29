import { afterEach, describe, expect, it, vi } from 'vitest';
import { onReturn } from '../../src/core/on-return';

describe('onReturn', () => {
  afterEach(() => vi.useRealTimers());

  it('fires on window focus and when the tab is shown, once for both together', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    onReturn(cb, 1000);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('ignores the tab being hidden', () => {
    const cb = vi.fn();
    onReturn(cb);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
    hidden.mockRestore();
  });
});
