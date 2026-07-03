// =============================================================================
// Pricing v2 — gram nhựa tính từ THỂ TÍCH MẢNH (manifold volume() do solid2
// cung cấp qua TrayPiece.volumeMm3 — model layer không import geometry).
// Vách 4mm in đặc nên thể tích hình học ≈ nhựa thật; calibrationFactor bù
// phần lệch slicer (seam, giao perimeter…). Phí cố định tính theo MẢNH in.
// =============================================================================
import type { KhayCatalog } from './catalog';

/** Khối lượng riêng PLA g/cm³ (Bambu PLA Matte ~1.24–1.26; lấy 1.24 chuẩn PLA). */
export const PLA_DENSITY = 1.24;

/** Đầu vào giá: 1 mảnh in đã có thể tích (từ TrayPiece hoặc ước lượng UI). */
export interface PricedPiece {
  name: string;
  color: string;
  volumeMm3: number;
}

export interface PiecePriceLine {
  name: string;
  color: string;
  grams: number;
  price: number;
}

export interface KhayPrice {
  lines: PiecePriceLine[];
  pieceCount: number;
  totalGrams: number;
  materialCost: number;
  baseFees: number;
  /** Đã làm tròn 1.000đ và áp sàn minOrder. */
  total: number;
}

export function trayGrams(volumeMm3: number, catalog: KhayCatalog): number {
  return (volumeMm3 / 1000) * PLA_DENSITY * catalog.pricing.calibrationFactor;
}

export function computeKhayPrice(pieces: PricedPiece[], catalog: KhayCatalog): KhayPrice {
  const { pricePerGram, baseFeePerPiece, minOrder } = catalog.pricing;
  const lines: PiecePriceLine[] = pieces.map((p) => {
    const grams = trayGrams(p.volumeMm3, catalog);
    return {
      name: p.name,
      color: p.color,
      grams,
      price: grams * pricePerGram + baseFeePerPiece,
    };
  });
  const totalGrams = lines.reduce((s, l) => s + l.grams, 0);
  const materialCost = totalGrams * pricePerGram;
  const baseFees = baseFeePerPiece * lines.length;
  const raw = materialCost + baseFees;
  const total = Math.max(minOrder, Math.round(raw / 1000) * 1000);
  return { lines, pieceCount: lines.length, totalGrams, materialCost, baseFees, total };
}
