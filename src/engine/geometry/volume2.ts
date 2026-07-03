// =============================================================================
// V2 — thể tích mảnh khay. meshVolumeMm3 = tetra CÓ DẤU thuần TS (copy từ
// volume.ts cũ — file đó sẽ bị xoá). Validator/test dùng đối chiếu
// manifold.volume() (lưu trong TrayPiece.volumeMm3) vs tetra trên TriMesh đã
// xuất — 2 thuật toán độc lập, bắt bug export/winding.
//
// WINDING: getMesh() của manifold trả tam giác CCW nhìn từ NGOÀI vật liệu —
// probe xác nhận tetra volume DƯƠNG và khớp manifold.volume() → solid2.ts
// GIỮ NGUYÊN indices khi convert (quyết định 1 lần, không đảo).
// =============================================================================

import type { TriMesh } from './types';
import type { TrayPiece } from './solid2-types';

/** Thể tích mesh mm³ = Σ v0·(v1×v2)/6 trên từng tam giác (mesh kín, CCW ngoài). */
export function meshVolumeMm3(mesh: TriMesh): number {
  const { positions, indices } = mesh;
  let vol6 = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return vol6 / 6;
}

/** Tổng thể tích các mảnh (mm³) — Σ volumeMm3 do manifold tính lúc dựng. */
export async function trayPiecesVolumeMm3(pieces: TrayPiece[]): Promise<number> {
  let sum = 0;
  for (const p of pieces) sum += p.volumeMm3;
  return sum;
}
