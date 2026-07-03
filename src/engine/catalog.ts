// =============================================================================
// KhayCatalog — TOÀN BỘ setting admin của sản phẩm khay (giá, giới hạn, màu).
// Demo: lưu localStorage + export/import JSON. Giai đoạn B: chuyển y nguyên
// vào Cloudflare KV key `catalog:khay` (worker ke-maume + maume-admin đọc chung).
// Schema này là hợp đồng giữa configurator ↔ admin — đổi phải tăng version.
// =============================================================================

/** Độ vừa khách chọn khi đo ngăn kéo — quyết định khe hở với lòng ngăn kéo. */
export type FitId = 'long' | 'chuan' | 'chat';

export interface KhayLimits {
  /** Cạnh khay tối đa mm (bàn in 180 − lề an toàn). */
  maxTrayMm: number;
  /** Khe giữa 2 khay cạnh nhau trong ngăn kéo. */
  trayGapMm: number;
  /** Khe với lòng ngăn kéo MỖI CẠNH theo độ vừa (lỏng/chuẩn/chặt). */
  fitClearanceMm: Record<FitId, number>;
  /** Dày vách/đáy. 1.6 = đúng 4 perimeter đầu 0.4mm → tường đặc, gram sát slicer. */
  wallT: number;
  floorT: number;
  /** Bo góc viền ngoài / lòng ô (plan-view). */
  outerR: number;
  pocketR: number;
  arcSegs: number;
  /** Lòng ô nhỏ nhất mỗi chiều. */
  minPocketMm: number;
  /** Nấc chiều cao khay (danh nghĩa = bước xếp chồng). */
  heightSteps: number[];
  maxLevels: number;
  /** Chân cắm xếp chồng: cao lipH, khe hở lipClear (ngang & dọc). */
  lipH: number;
  lipClearMm: number;
  maxDrawer: { w: number; d: number; h: number };
  minDrawer: { w: number; d: number; h: number };
}

export interface KhayPricing {
  /** đ/gram nhựa (PLA Matte). */
  pricePerGram: number;
  /** Phí cố định mỗi khay (công tách bàn in, xử lý, đóng gói). */
  baseFeePerTray: number;
  /** Hệ số bù slicer (perimeter giao nhau, seam…) — chỉnh sau lần slice thật đầu. */
  calibrationFactor: number;
  /** Giá sàn mỗi đơn. */
  minOrder: number;
}

export interface KhayCatalog {
  version: 1;
  pricing: KhayPricing;
  limits: KhayLimits;
  /** Tồn kho màu: chỉ giữ cờ enabled — tên/hex/mã nằm trong palette.ts (code). */
  colors: { id: string; enabled: boolean }[];
}

/**
 * Fallback đầy đủ khi chưa có setting lưu (localStorage demo / KV cold-start).
 * Giá là PLACEHOLDER — user chốt số thật trong settings trước khi mở bán.
 */
export const DEFAULT_KHAY_CATALOG: KhayCatalog = {
  version: 1,
  pricing: {
    pricePerGram: 800,
    baseFeePerTray: 15_000,
    calibrationFactor: 1.05,
    minOrder: 99_000,
  },
  limits: {
    maxTrayMm: 176,
    trayGapMm: 0.5,
    fitClearanceMm: { long: 1.5, chuan: 1.0, chat: 0.5 },
    wallT: 1.6,
    floorT: 1.6,
    outerR: 6,
    pocketR: 3,
    arcSegs: 16,
    minPocketMm: 35,
    heightSteps: [25, 35, 50, 65],
    maxLevels: 3,
    lipH: 2.5,
    lipClearMm: 0.3,
    maxDrawer: { w: 900, d: 600, h: 200 },
    minDrawer: { w: 60, d: 60, h: 22 },
  },
  colors: [], // rỗng = mọi màu trong palette đều enabled (xem enabledColors())
};

/**
 * Kích thước xếp chồng SUY RA từ limits — không hardcode rời rạc:
 * plugInset = vách + khe ngang (khay trên lọt lòng khay dưới, hở lipClear/cạnh);
 * chamferH = plugInset (vát đúng 45° → in không support);
 * seatDepth = lipH + lipClear (vai vát chạm mép trong miệng khay dưới);
 * dividerDrop = seatDepth + lipClear (đỉnh vách né đáy plug thêm 1 khe dọc).
 */
export function stackingDims(limits: KhayLimits): {
  plugInset: number;
  chamferH: number;
  seatDepth: number;
  dividerDrop: number;
} {
  const plugInset = limits.wallT + limits.lipClearMm;
  return {
    plugInset,
    chamferH: plugInset,
    seatDepth: limits.lipH + limits.lipClearMm,
    dividerDrop: limits.lipH + 2 * limits.lipClearMm,
  };
}

/** Merge cờ enabled của catalog lên danh sách id màu palette (mặc định bật). */
export function colorEnabled(catalog: KhayCatalog, colorId: string): boolean {
  const row = catalog.colors.find((c) => c.id === colorId);
  return row ? row.enabled : true;
}
