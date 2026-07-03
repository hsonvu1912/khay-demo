// =============================================================================
// khay engine — HỢP ĐỒNG kiểu dữ liệu hình học (nguồn sự thật cho mọi module).
//
// Hệ toạ độ: mm. Mặt phẳng XY = mặt bàn in, Z = chiều cao in (z=0 chạm bàn).
// Khay được dựng theo kiểu 2.5D "polygon-with-holes extrusion": chồng các
// BAND (z0→z1), mỗi band có tiết diện = viền ngoài (CCW nhìn từ +Z) + các lỗ
// (CW). Mesh watertight BY CONSTRUCTION: mọi mặt dùng chung vertex loop —
// không bao giờ có 2 đỉnh trùng toạ độ mà khác index trên cùng một đường biên.
//
// Quy ước winding:
// - Đường viền ngoài: CCW (nhìn từ +Z). Lỗ: CW.
// - Mặt nắp +Z (miệng khay, đáy pocket, đỉnh vách): tam giác CCW nhìn từ +Z.
// - Mặt nắp −Z (đáy chạm bàn): đảo winding.
// - Thành đứng từ path CCW: quad (p[i]@z0, p[i+1]@z0, p[i+1]@z1, p[i]@z1)
//   → pháp tuyến hướng RA ngoài vật liệu. Path CW (lỗ) cùng công thức
//   → pháp tuyến hướng VÀO lòng lỗ (vẫn là "ra khỏi vật liệu"). Đúng cho STL.
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

/** Hình chữ nhật cavity (lòng ô) trong toạ độ local của khay [0..w]×[0..d]. */
export interface PocketRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Đặc tả MỘT khay in được — đầu vào duy nhất của buildTraySolid().
 * Model layer (tiling/layout) chịu trách nhiệm sinh TraySpec hợp lệ:
 * pockets rời nhau ≥ wallT, cách mép ngoài ≥ wallT, nằm trong [0..w]×[0..d].
 */
export interface TraySpec {
  /** Tên dùng đặt file STL, vd "T1-L2". */
  name: string;
  /** Kích thước phủ bì mm. h GỒM cả plug/vát nếu có (chiều cao vật lý miếng in). */
  w: number;
  d: number;
  h: number;
  /** Dày vách/đáy mm (mặc định 1.6 = 4 perimeter đầu 0.4mm → tường đặc). */
  wallT: number;
  floorT: number;
  /** Bán kính bo góc viền ngoài / lòng pocket (plan-view, trục đứng). */
  outerR: number;
  pocketR: number;
  /** Số đoạn thẳng xấp xỉ mỗi cung 90° (16 → mượt cấp Apple ở R3–R6). */
  arcSegs: number;
  /** Các lòng ô. Khay 1 ô = 1 pocket chiếm trọn lòng. */
  pockets: PocketRect[];
  /**
   * Chân cắm xếp chồng (chỉ khay tầng ≥2). Đáy khay thụt `inset` mỗi cạnh,
   * cao `height`, nối lên thân bằng vát 45° cao `chamferH` (= inset để đúng
   * 45°, in không cần support). Khi đặt chồng: vai vát tựa lên mép trong
   * miệng khay dưới; độ lún = height + lipClear (xem seatDepth ở stacking.ts).
   */
  plug?: { inset: number; height: number; chamferH: number };
  /**
   * Vách chia NỘI BỘ hạ thấp hơn miệng bấy nhiêu mm (0 = vách cao bằng miệng).
   * Cần cho khay CÓ khay khác chồng lên: drop = seatDepth + vClear để plug
   * khay trên không kênh lên đỉnh vách. Viền ngoài luôn cao đủ h.
   */
  dividerDrop: number;
}

/**
 * Tiết diện 2D của một band: outer CCW + holes CW. Các path KHÔNG lặp lại
 * điểm đầu ở cuối (closed ngầm định).
 */
export interface Section {
  outer: Vec2[];
  holes: Vec2[][];
}

/** Kết quả kiểm tra manifold — mesh chỉ được xuất STL khi ok = true. */
export interface ValidateResult {
  ok: boolean;
  problems: string[];
  /** Thống kê để log/debug: đỉnh, cạnh, tam giác, Euler χ = V−E+F (kỳ vọng 2). */
  stats: { vertices: number; edges: number; triangles: number; euler: number };
}
