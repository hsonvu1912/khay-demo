// =============================================================================
// Loader singleton cho manifold-3d (WASM) — mọi module CSG dùng chung 1 lần nạp.
// LƯU Ý browser/Vite: default import tự resolve file .wasm cạnh bundle; nếu
// build UI vỡ asset wasm thì workflow UI chỉnh (vd locateFile / ?url) — engine
// GIỮ NGUYÊN default import này.
// =============================================================================

import Module from 'manifold-3d';

export type ManifoldTop = Awaited<ReturnType<typeof Module>>;

let p: Promise<ManifoldTop> | null = null;

/** Trả module manifold ĐÃ setup() — gọi bao nhiêu lần cũng chỉ nạp WASM 1 lần. */
export function getManifold(): Promise<ManifoldTop> {
  if (!p) {
    p = Module().then((m) => {
      m.setup();
      return m;
    });
  }
  return p;
}
