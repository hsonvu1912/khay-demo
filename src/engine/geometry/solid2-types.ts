// =============================================================================
// V2 — HỢP ĐỒNG hình học "khay module rời" (CSG manifold-3d).
// Mỗi khay = 1 lòng duy nhất, vách 4 phía. Tạo hình theo ảnh tham khảo Apple:
// bo ngoài lớn, MIỆNG BO TRÒN (rimRound), đáy lòng vát mềm (floorFillet),
// chân đế thụt (baseInset) cho khay thường / chân cắm (plug) cho khay stack.
// Khay vượt bàn in → cắt thành mảnh với mộng puzzle ở đáy, lòng liền mạch.
//
// Toạ độ local khay: XY = mặt bằng [0..w]×[0..d], z=0 chạm bàn in, z-up, mm.
// pocketR = outerR − wallT (đồng tâm, không param riêng).
// =============================================================================
import type { TriMesh } from './types';

export interface TrayStyle {
  /** Vách 4mm (chốt với user) — chunky như ảnh tham khảo. */
  wallT: number;
  floorT: number;
  /** Bo góc ngoài plan-view. */
  outerR: number;
  /** Bo tròn miệng (áp cả mép ngoài lẫn mép trong), xấp xỉ bằng band 0.2mm ≈ layer in. */
  rimRound: number;
  /** Vát mềm chuyển tiếp đáy lòng → vách (hull bands). */
  floorFillet: number;
  /** Chân đế thụt — khay KHÔNG stack (plug thay thế khi stack). */
  baseInset: number;
  baseH: number;
  arcSegs: number;
}

export interface TraySpec2 {
  /** "T3-L1" — đánh số theo block trong lưới. */
  name: string;
  /** Phủ bì mm. h GỒM plug/base (chiều cao vật lý). */
  w: number;
  d: number;
  h: number;
  style: TrayStyle;
  /** Chân cắm stack (thay base step). inset = wallT + lipClear; chamferH = inset (45°). */
  plug?: { inset: number; height: number; chamferH: number };
}

/** Đường cắt chia mảnh, toạ độ local theo trục vuông góc. */
export interface CutLine {
  axis: 'x' | 'y';
  at: number;
}

export interface TrayPiece {
  /** "T3-L1" (1 mảnh) hoặc "T3-L1-M1", "-M2"… */
  name: string;
  mesh: TriMesh;
  volumeMm3: number;
  /** bbox thực của mảnh (gồm tab mộng) — PHẢI ≤ bàn in − lề. */
  bbox: [number, number, number];
  /** Mảnh nằm nguyên vị trong toạ độ local khay (mesh KHÔNG dịch về gốc) —
   * preview đặt cạnh nhau là khớp; xuất STL giữ nguyên (slicer tự căn giữa). */
}

/** Thông số mộng puzzle ở đáy (đực về phía mảnh có territory NHỎ HƠN theo trục). */
export interface JigsawStyle {
  /** Số bầu mộng ≈ chiều dài cắt / 60mm, tối thiểu 1. */
  neckMm: number;    // 10
  headMm: number;    // 14
  depthMm: number;   // 7
  roundMm: number;   // 1.5 — bo mềm outline mộng (offset round)
  clearMm: number;   // 0.15 — khe lắp mỗi bên
}

/**
 * Dựng các mảnh của 1 khay. cuts rỗng → 1 mảnh. Async vì manifold-3d WASM.
 * Mộng chỉ tồn tại trong dải z [0 .. floorTopZ] (xuyên base + đáy); phía trên
 * đường cắt là mặt phẳng trơn. Mảnh cái (female) = outline mộng offset +clear.
 */
export type BuildTrayPieces = (spec: TraySpec2, cuts: CutLine[]) => Promise<TrayPiece[]>;
