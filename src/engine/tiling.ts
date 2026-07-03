// =============================================================================
// Tiling — chia lòng ngăn kéo thành lưới khay ≤ maxTrayMm (bàn in 180 − lề).
// TILING LÀ MASTER: tính TRƯỚC từ W×D + độ vừa; mọi tầng dùng CHUNG 1 tiling
// (ràng buộc xếp chồng — plug phải trùng miệng khay dưới). Grid pocket bên
// trong từng khay là chuyện của layout.ts, tính SAU.
// =============================================================================
import type { FitId, KhayLimits } from './catalog';

export interface TrayTile {
  /** Vị trí góc (mm) trong hệ toạ độ lòng ngăn kéo (gốc = góc trái-trước lòng). */
  x: number;
  y: number;
  w: number;
  d: number;
  col: number;
  row: number;
}

export interface Tiling {
  cols: number;
  rows: number;
  /** Row-major: index = row * cols + col — layout.ts đánh số khay theo thứ tự này. */
  tiles: TrayTile[];
  /** Vùng khay chiếm được sau khi trừ khe lòng ngăn kéo. */
  usableW: number;
  usableD: number;
  /** Offset từ mép lòng ngăn kéo tới khay đầu tiên (= khe fit). */
  originX: number;
  originY: number;
}

/** Số khay tối thiểu trên 1 trục để mọi tile ≤ maxTray (kể cả khe giữa khay). */
function axisCount(usable: number, limits: KhayLimits): number {
  let n = 1;
  while ((usable - (n - 1) * limits.trayGapMm) / n > limits.maxTrayMm) n++;
  return n;
}

/** Chia 1 trục thành n tile ĐỀU NHAU (chênh nhau ≤ độ chính xác float). */
function axisTiles(usable: number, n: number, gap: number): { start: number; size: number }[] {
  const size = (usable - (n - 1) * gap) / n;
  const out: { start: number; size: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ start: i * (size + gap), size });
  return out;
}

/**
 * drawerW × drawerD = kích thước LÒNG ngăn kéo khách đo (mm).
 * Throw (tiếng Việt) nếu ngoài min/maxDrawer — UI chặn trước, đây là chốt cuối.
 */
export function computeTiling(drawerW: number, drawerD: number, fit: FitId, limits: KhayLimits): Tiling {
  const { minDrawer, maxDrawer } = limits;
  if (drawerW < minDrawer.w || drawerD < minDrawer.d) {
    throw new Error(`Ngăn kéo quá nhỏ: tối thiểu ${minDrawer.w}×${minDrawer.d}mm`);
  }
  if (drawerW > maxDrawer.w || drawerD > maxDrawer.d) {
    throw new Error(`Ngăn kéo quá lớn: tối đa ${maxDrawer.w}×${maxDrawer.d}mm`);
  }
  const clear = limits.fitClearanceMm[fit];
  const usableW = drawerW - 2 * clear;
  const usableD = drawerD - 2 * clear;
  const cols = axisCount(usableW, limits);
  const rows = axisCount(usableD, limits);
  const xs = axisTiles(usableW, cols, limits.trayGapMm);
  const ys = axisTiles(usableD, rows, limits.trayGapMm);
  const tiles: TrayTile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ x: clear + xs[c].start, y: clear + ys[r].start, w: xs[c].size, d: ys[r].size, col: c, row: r });
    }
  }
  return { cols, rows, tiles, usableW, usableD, originX: clear, originY: clear };
}
