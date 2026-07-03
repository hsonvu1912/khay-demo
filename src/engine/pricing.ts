// =============================================================================
// Pricing — gram nhựa ước tính từ THỂ TÍCH ANALYTIC (khớp mesh <0.1%, đủ nhanh
// cho price ticker realtime). Vách/đáy 1.6mm = in đặc nên thể tích hình học ≈
// nhựa thật; calibrationFactor bù phần lệch slicer (seam, giao perimeter…).
// =============================================================================
import type { KhayCatalog } from './catalog';
import type { PlacedTray } from './layout';
import { analyticTrayVolumeMm3 } from './geometry/volume';

/** Khối lượng riêng PLA g/cm³ (Bambu PLA Matte ~1.24–1.26; lấy 1.24 chuẩn PLA). */
export const PLA_DENSITY = 1.24;

export interface TrayPriceLine {
  name: string;
  color: string;
  grams: number;
  price: number;
}

export interface KhayPrice {
  lines: TrayPriceLine[];
  trayCount: number;
  totalGrams: number;
  materialCost: number;
  baseFees: number;
  /** Đã làm tròn 1.000đ và áp sàn minOrder. */
  total: number;
}

export function trayGrams(volumeMm3: number, catalog: KhayCatalog): number {
  return (volumeMm3 / 1000) * PLA_DENSITY * catalog.pricing.calibrationFactor;
}

export function computeKhayPrice(trays: PlacedTray[], catalog: KhayCatalog): KhayPrice {
  const { pricePerGram, baseFeePerTray, minOrder } = catalog.pricing;
  const lines: TrayPriceLine[] = trays.map((t) => {
    const grams = trayGrams(analyticTrayVolumeMm3(t.spec), catalog);
    return {
      name: t.spec.name,
      color: t.color,
      grams,
      price: grams * pricePerGram + baseFeePerTray,
    };
  });
  const totalGrams = lines.reduce((s, l) => s + l.grams, 0);
  const materialCost = totalGrams * pricePerGram;
  const baseFees = baseFeePerTray * lines.length;
  const raw = materialCost + baseFees;
  const total = Math.max(minOrder, Math.round(raw / 1000) * 1000);
  return { lines, trayCount: lines.length, totalGrams, materialCost, baseFees, total };
}
