/** Route through three stops (start, mid, goal) in a 168x36 box: shared by BootVisual and the index.html splash. */
export const ROUTE_D = 'M10 26C40 26 52 10 84 10S128 26 158 26';
export const ROUTE_NODES = [
  [10, 26],
  [84, 10],
  [158, 26],
] as const;
