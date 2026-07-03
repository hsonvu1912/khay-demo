// =============================================================================
// KhayCatalog v2 — TOÀN BỘ setting admin của sản phẩm khay (giá, tạo hình,
// giới hạn, màu). V2: mỗi block lưới (sau merge) là MỘT KHAY RỜI đặt cạnh
// nhau; tạo hình Apple-reference gói trong TrayStyle (solid2-types.ts); khay
// vượt bàn in được CẮT thành mảnh ghép mộng đáy → giới hạn theo MẢNH.
// Demo: lưu localStorage + export/import JSON. Giai đoạn B: chuyển y nguyên
// vào Cloudflare KV key `catalog:khay` (worker ke-maume + maume-admin đọc
// chung). Schema là hợp đồng configurator ↔ admin — đổi phải tăng version.
// =============================================================================
import type { TrayStyle } from './geometry/solid2-types';

/** Độ vừa khách chọn khi đo ngăn kéo — quyết định khe hở với lòng ngăn kéo. */
export type FitId = 'long' | 'chuan' | 'chat';

export interface KhayLimits2 {
  /** TERRITORY mỗi mảnh tối đa (bàn in 180 − lề; bbox kèm tab mộng nhô thêm chút). */
  maxPieceMm: number;
  /** Khe giữa 2 khay cạnh nhau trong ngăn kéo. */
  trayGapMm: number;
  /** Khe với lòng ngăn kéo MỖI CẠNH theo độ vừa (lỏng/chuẩn/chặt). */
  fitClearanceMm: Record<FitId, number>;
  /** Lòng khay nhỏ nhất mỗi chiều. */
  minPocketMm: number;
  /** Nấc chiều cao khay (danh nghĩa = bước xếp chồng). */
  heightSteps: number[];
  maxLevels: number;
  /** Chân cắm xếp chồng: cao lipH, khe hở lipClear (ngang & dọc). */
  lipH: number;
  lipClearMm: number;
  maxDrawer: { w: number; d: number; h: number };
  minDrawer: { w: number; d: number; h: number };
  /** Trần số mảnh 1 khay (nx·ny sau cắt) — vượt là bắt chia khay nhỏ lại. */
  maxPiecesPerTray: number;
}

export interface KhayPricing2 {
  /** đ/gram nhựa (PLA Matte). */
  pricePerGram: number;
  /** Phí cố định mỗi MẢNH in (công tách bàn in, xử lý, đóng gói). */
  baseFeePerPiece: number;
  /** Hệ số bù slicer (perimeter giao nhau, seam…) — chỉnh sau lần slice thật đầu. */
  calibrationFactor: number;
  /** Giá sàn mỗi đơn. */
  minOrder: number;
}

export interface KhayCatalog {
  version: 2;
  pricing: KhayPricing2;
  /** Tạo hình khay (Apple-reference) — solid2.ts tiêu thụ nguyên khối. */
  style: TrayStyle;
  limits: KhayLimits2;
  /** Tồn kho màu: chỉ giữ cờ enabled — tên/hex/mã nằm trong palette.ts (code). */
  colors: { id: string; enabled: boolean }[];
}

/**
 * Fallback đầy đủ khi chưa có setting lưu (localStorage demo / KV cold-start).
 * Giá là PLACEHOLDER — user chốt số thật trong settings trước khi mở bán.
 * Style đã được user duyệt: vách 4 chunky, bo ngoài 11, miệng bo 1.4,
 * đáy lòng vát mềm 2.5, chân đế thụt 2×2.
 */
export const DEFAULT_KHAY_CATALOG: KhayCatalog = {
  version: 2,
  pricing: {
    pricePerGram: 800,
    baseFeePerPiece: 15_000,
    calibrationFactor: 1.05,
    minOrder: 99_000,
  },
  style: {
    wallT: 4,
    floorT: 3,
    outerR: 11,
    rimRound: 1.4,
    floorFillet: 2.5,
    baseInset: 2,
    baseH: 2,
    arcSegs: 16,
  },
  limits: {
    maxPieceMm: 168,
    trayGapMm: 0.5,
    fitClearanceMm: { long: 1.5, chuan: 1.0, chat: 0.5 },
    minPocketMm: 30,
    heightSteps: [25, 35, 50, 65],
    maxLevels: 3,
    lipH: 2.5,
    lipClearMm: 0.3,
    maxDrawer: { w: 900, d: 600, h: 200 },
    minDrawer: { w: 60, d: 60, h: 22 },
    maxPiecesPerTray: 4,
  },
  colors: [], // rỗng = mọi màu trong palette đều enabled (xem colorEnabled())
};

/**
 * Kích thước xếp chồng SUY RA từ style + limits — không hardcode rời rạc:
 * plugInset = vách + khe ngang (plug lọt lòng khay dưới, hở lipClear mỗi cạnh);
 * chamferH = plugInset (vát đúng 45° → in không support);
 * seatDepth = lipH + lipClear (vai vát tựa lên mép trong miệng khay dưới).
 * V2 khay 1 lòng duy nhất — KHÔNG còn dividerDrop.
 */
export function stackingDims(
  style: TrayStyle,
  limits: KhayLimits2,
): { plugInset: number; chamferH: number; seatDepth: number } {
  const plugInset = style.wallT + limits.lipClearMm;
  return {
    plugInset,
    chamferH: plugInset,
    seatDepth: limits.lipH + limits.lipClearMm,
  };
}

/** Merge cờ enabled của catalog lên danh sách id màu palette (mặc định bật). */
export function colorEnabled(catalog: KhayCatalog, colorId: string): boolean {
  const row = catalog.colors.find((c) => c.id === colorId);
  return row ? row.enabled : true;
}
