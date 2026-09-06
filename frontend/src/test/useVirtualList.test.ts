import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVirtualList } from '../lib/useVirtualList';

/**
 * Unit tests for the zero-dependency virtual window hook (K-56 F2): window math
 * at various scroll offsets, overscan, clamping and degenerate inputs.
 */

const ROW = 40;
const VIEWPORT = 400; // exactly 10 rows

function windowAt(itemCount: number, scrollTop: number, overrides?: Partial<Parameters<typeof useVirtualList>[0]>) {
  const { result } = renderHook((props: Parameters<typeof useVirtualList>[0]) => useVirtualList(props), {
    initialProps: { itemCount, rowHeight: ROW, scrollTop, viewportHeight: VIEWPORT, ...overrides },
  });
  return result.current;
}

describe('useVirtualList (K-56 F2)', () => {
  it('renders every row when the list fits the viewport', () => {
    const w = windowAt(8, 0);
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(7);
    expect(w.visibleCount).toBe(8);
    expect(w.totalHeight).toBe(8 * ROW);
    expect(w.offsetY).toBe(0);
    expect(w.bottomOffset).toBe(0);
  });

  it('windows around the viewport with default overscan', () => {
    const w = windowAt(1000, 4000);
    expect(w.startIndex).toBe(96); // floor(4000/40) - 4
    expect(w.endIndex).toBe(113); // ceil(4400/40) - 1 + 4
    expect(w.visibleCount).toBe(18);
    expect(w.offsetY).toBe(96 * ROW);
    expect(w.bottomOffset).toBe((999 - 113) * ROW);
    expect(w.totalHeight).toBe(1000 * ROW);
  });

  it('clamps the window at the bottom of the list', () => {
    const w = windowAt(1000, 39600); // beyond max scroll (40000 - 400)
    expect(w.endIndex).toBe(999);
    expect(w.startIndex).toBeLessThanOrEqual(w.endIndex);
    expect(w.bottomOffset).toBe(0);
    expect(w.visibleCount).toBe(w.endIndex - w.startIndex + 1);
  });

  it('clamps negative and past-end scrollTop values', () => {
    const negative = windowAt(1000, -500);
    expect(negative.startIndex).toBe(0);

    const pastEnd = windowAt(1000, 999999);
    expect(pastEnd.endIndex).toBe(999);
    expect(pastEnd.visibleCount).toBeGreaterThan(0);
    expect(pastEnd.visibleCount).toBeLessThanOrEqual(20); // viewport rows + 2 * overscan
  });

  it('honors a custom overscan', () => {
    const w = windowAt(1000, 4000, { overscan: 0 });
    expect(w.startIndex).toBe(100);
    expect(w.endIndex).toBe(109);
    expect(w.visibleCount).toBe(10);
  });

  it('returns an empty window for degenerate inputs', () => {
    const empty = windowAt(0, 0);
    expect(empty).toMatchObject({ startIndex: 0, endIndex: -1, visibleCount: 0, offsetY: 0, bottomOffset: 0, totalHeight: 0 });

    const noViewport = windowAt(50, 0, { viewportHeight: 0 });
    expect(noViewport.visibleCount).toBe(0);
    expect(noViewport.totalHeight).toBe(50 * ROW); // spacer height stays true

    const noRowHeight = windowAt(50, 0, { rowHeight: 0 });
    expect(noRowHeight.visibleCount).toBe(0);
    expect(noRowHeight.totalHeight).toBe(0);
  });

  it('recomputes when arguments change', () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useVirtualList>[0]) => useVirtualList(props),
      { initialProps: { itemCount: 1000, rowHeight: ROW, scrollTop: 0, viewportHeight: VIEWPORT } },
    );
    expect(result.current.startIndex).toBe(0);

    rerender({ itemCount: 1000, rowHeight: ROW, scrollTop: 8000, viewportHeight: VIEWPORT });
    expect(result.current.startIndex).toBe(196);

    rerender({ itemCount: 10, rowHeight: ROW, scrollTop: 8000, viewportHeight: VIEWPORT });
    expect(result.current.endIndex).toBe(9);
  });
});
