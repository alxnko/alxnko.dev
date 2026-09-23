// Projective mapping of the DOM terminal onto the laptop screen's four projected
// corners (spec §6.4). H maps src (element px) → dst (viewport px).

export type Pt = [number, number];
export type H = number[]; // row-major 3×3, H[8] = 1

export function homography(src: Pt[], dst: Pt[]): H {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8×9 augmented system.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error('degenerate quad');
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function applyH(h: H, x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

const num = (v: number) => {
  const r = Number(v.toFixed(9));
  return Object.is(r, -0) ? '0' : String(r);
};

/** CSS matrix3d (column-major 4×4) for a 2-D homography; use with transform-origin: 0 0. */
export function toMatrix3d(h: H): string {
  const [a, b, c, d, e, f, g, i, j] = h;
  return `matrix3d(${[a, d, 0, g, b, e, 0, i, 0, 0, 1, 0, c, f, 0, j].map(num).join(',')})`;
}
