// layout.js — grid of character cells, recomputed whenever a character joins
// or the screen size changes. Cells animate to new places via CSS transitions.

/**
 * Picks the column count that gives the largest square cells for `n` items
 * in a `width` × `height` area.
 */
export function computeGrid(n, width, height) {
  let best = { cols: 1, rows: n, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min(width / cols, height / rows);
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
}

/**
 * Largest item count (up to `limit`) whose grid cells are still at least
 * `minSize` px in a `width` × `height` area.
 */
export function maxItems(width, height, minSize, limit) {
  let n = 1;
  while (n < limit && computeGrid(n + 1, width, height).size >= minSize) n++;
  return n;
}

/**
 * Square cells for `n` items in a centred grid inside `container`, as
 * {x, y, size} (top-left corner, side). Items missing from the last row are
 * split evenly on both sides of it.
 */
export function gridCells(n, container) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const { cols, rows, size } = computeGrid(n, width, height);
  const left = (width - cols * size) / 2;
  const top = (height - rows * size) / 2;
  const lastRowCount = n - (rows - 1) * cols;

  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowShift = row === rows - 1 ? ((cols - lastRowCount) * size) / 2 : 0;
    return { x: left + rowShift + col * size, y: top + row * size, size };
  });
}

/** Centre point of each grid cell for `n` items in `container`. */
export function cellCenters(n, container) {
  return gridCells(n, container).map(({ x, y, size }) => ({ x: x + size / 2, y: y + size / 2 }));
}

/** Positions the given cell elements in the grid (see gridCells). */
export function layoutCells(cells, container) {
  gridCells(cells.length, container).forEach(({ x, y, size }, i) => {
    const cell = cells[i];
    cell.style.width = `${size}px`;
    cell.style.height = `${size}px`;
    cell.style.transform = `translate(${x}px, ${y}px)`;
  });
}
