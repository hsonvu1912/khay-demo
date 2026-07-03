// =============================================================================
// khay engine — HỢP ĐỒNG kiểu dữ liệu hình học (nguồn sự thật cho mọi module).
//
// Hệ toạ độ: mm. Mặt phẳng XY = mặt bàn in, Z = chiều cao in (z=0 chạm bàn).
// V2: khối khay dựng bằng CSG manifold-3d (solid2.ts) thay vì band extrusion —
// nhưng mesh đầu ra VẪN theo hợp đồng TriMesh dưới đây để đổ thẳng vào
// preview (THREE.BufferGeometry), validate.ts và stl.ts → WYSIWYG.
//
// Quy ước winding (stl.ts + validate.ts dựa vào):
// - Path 2D viền ngoài: CCW (nhìn từ +Z, pathArea() > 0). Lỗ: CW.
// - Tam giác mesh: CCW nhìn từ NGOÀI vật liệu (pháp tuyến hướng ra) — đúng
//   chuẩn STL; validateManifold kiểm cạnh có hướng a→b/b→a mỗi chiều đúng 1 lần.
// =============================================================================

/** Điểm 2D [x, y] mm trên mặt phẳng XY. */
export type Vec2 = readonly [number, number];
/** Điểm 3D [x, y, z] mm. */
export type Vec3 = readonly [number, number, number];

/**
 * Mesh tam giác đã hàn kín. positions phẳng [x0,y0,z0, x1,y1,z1, …];
 * indices = bộ ba index đỉnh (mỗi tam giác 3 index, winding CCW nhìn từ
 * ngoài vật liệu). Đây CHÍNH LÀ dữ liệu đổ vào THREE.BufferGeometry để
 * preview và vào stl.ts để xuất file in → WYSIWYG.
 */
export interface TriMesh {
  positions: number[];
  indices: number[];
}

/** Kết quả kiểm tra manifold — mesh chỉ được xuất STL khi ok = true. */
export interface ValidateResult {
  ok: boolean;
  problems: string[];
  /** Thống kê để log/debug: đỉnh, cạnh, tam giác, Euler χ = V−E+F (kỳ vọng 2). */
  stats: { vertices: number; edges: number; triangles: number; euler: number };
}
