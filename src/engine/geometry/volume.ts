// =============================================================================
// Thể tích khay: từ mesh (tổng tetra có dấu) và từ TraySpec (đóng, không qua
// mesh) — hai con số này khớp nhau (sai số float) là bằng chứng builder đúng.
// Các band z ở analyticTrayVolumeMm3 PHẢI mirror đúng z-station của
// buildTraySolid: plug → vát 45° → đáy đặc → thân vách → band hạ vách.
// =============================================================================

import type { TriMesh, TraySpec } from './types';
import { roundedRectArea, MIN_R } from './rounded-rect';
import { resolvePockets, interiorRingR } from './tray-solid';

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

/** Clamp bán kính giống hệt quy tắc rounded-rect.ts: r' = min(r, w/2−0.01, d/2−0.01), floor MIN_R. */
function clampR(r: number, w: number, d: number): number {
  return Math.max(Math.min(r, w / 2 - 0.01, d / 2 - 0.01), MIN_R);
}

/**
 * Thể tích khay dạng ĐÓNG (không đi qua mesh) — cross-check bắt bug builder.
 * Vát 45° dùng công thức prismatoid V = h/6·(A_dưới + 4·A_giữa + A_trên):
 * diện tích rounded-rect biến thiên bậc 2 theo inset tuyến tính → Simpson CHÍNH XÁC.
 */
export function analyticTrayVolumeMm3(spec: TraySpec): number {
  const { w, d, h, wallT, floorT, outerR, pocketR, dividerDrop } = spec;

  const aOuter = roundedRectArea(w, d, clampR(outerR, w, d));
  let volume = 0;
  let floorBase = 0; // z đáy của lớp đáy đặc (0 nếu không có plug)

  if (spec.plug) {
    const { inset: i, height: plugH, chamferH } = spec.plug;
    // Mirror đúng insetRoundedRect: r' = max(r − inset, MIN_R) rồi clamp theo kích thước
    const aPlug = roundedRectArea(w - 2 * i, d - 2 * i, clampR(Math.max(outerR - i, MIN_R), w - 2 * i, d - 2 * i));
    volume += aPlug * plugH;
    // A_giữa tại inset i/2 (giữa hành trình vát)
    const aMid = roundedRectArea(w - i, d - i, clampR(Math.max(outerR - i / 2, MIN_R), w - i, d - i));
    volume += (chamferH / 6) * (aPlug + 4 * aMid + aOuter);
    floorBase = plugH + chamferH;
  }

  // Đáy đặc
  volume += aOuter * floorT;
  const floorTop = floorBase + floorT;

  // Thân vách: outer trừ các pocket (pocket đã clamp r + thụt ε bởi resolvePockets)
  const resolved = resolvePockets(spec);
  let aPockets = 0;
  for (const p of resolved) {
    aPockets += roundedRectArea(p.w, p.d, p.r);
  }
  const wallBandH = (h - dividerDrop) - floorTop;
  volume += (aOuter - aPockets) * wallBandH;

  // Band hạ vách: chỉ còn viền ngoài (outer trừ trọn lòng trong, bo = ringR
  // dùng chung helper với builder để 2 đường tính không lệch nhau)
  if (dividerDrop > 0) {
    const iw = w - 2 * wallT;
    const id = d - 2 * wallT;
    const aInterior = roundedRectArea(iw, id, clampR(interiorRingR(pocketR, resolved), iw, id));
    volume += (aOuter - aInterior) * dividerDrop;
  }

  return volume;
}
