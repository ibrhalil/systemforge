import { useMemo } from 'react';

export interface UseVirtualListOptions {
  /** Total number of rows in the dataset. */
  itemCount: number;
  /** Fixed row height in px — the caller guarantees uniform row heights. */
  rowHeight: number;
  /** Current scroll offset of the scroll container in px. */
  scrollTop: number;
  /** Visible height of the scroll container in px. */
  viewportHeight: number;
  /** Extra rows rendered above/below the viewport (default 4). */
  overscan?: number;
}

export interface VirtualListWindow {
  /** Inclusive first row index to render. */
  startIndex: number;
  /** Inclusive last row index to render; -1 when the window is empty. */
  endIndex: number;
  /** Rows in the window (endIndex - startIndex + 1). */
  visibleCount: number;
  /** Top spacer height in px (startIndex * rowHeight). */
  offsetY: number;
  /** Bottom spacer height in px — keeps the scrollbar at true dataset length. */
  bottomOffset: number;
  /** Full unvirtualized height in px (itemCount * rowHeight). */
  totalHeight: number;
}

/**
 * Zero-dependency fixed-row-height virtual window (K-56 F2). Pure math over the
 * container metrics — the caller owns the scroll container and feeds scrollTop /
 * viewportHeight; rendering stays limited to [startIndex, endIndex].
 */
export function useVirtualList({
  itemCount,
  rowHeight,
  overscan = 4,
  scrollTop,
  viewportHeight,
}: UseVirtualListOptions): VirtualListWindow {
  return useMemo(() => {
    const totalHeight = Math.max(0, itemCount) * Math.max(0, rowHeight);
    const empty: VirtualListWindow = {
      startIndex: 0,
      endIndex: -1,
      visibleCount: 0,
      offsetY: 0,
      bottomOffset: 0,
      totalHeight,
    };
    if (itemCount <= 0 || rowHeight <= 0 || viewportHeight <= 0) return empty;

    const offset = Math.min(Math.max(0, scrollTop), totalHeight);
    const firstVisible = Math.floor(offset / rowHeight);
    const lastVisibleExclusive = Math.ceil((offset + viewportHeight) / rowHeight);
    const startIndex = Math.max(0, firstVisible - overscan);
    const endIndex = Math.min(itemCount - 1, lastVisibleExclusive - 1 + overscan);
    if (endIndex < startIndex) return empty;

    return {
      startIndex,
      endIndex,
      visibleCount: endIndex - startIndex + 1,
      offsetY: startIndex * rowHeight,
      bottomOffset: (itemCount - 1 - endIndex) * rowHeight,
      totalHeight,
    };
  }, [itemCount, rowHeight, overscan, scrollTop, viewportHeight]);
}
