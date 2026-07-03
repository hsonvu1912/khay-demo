// =============================================================================
// Export — dựng mesh từng khay, VALIDATE manifold (từ chối xuất nếu fail),
// đóng ZIP: 1 STL/khay + manifest.txt (gom lô in theo màu). Demo: khách tải
// trực tiếp. Giai đoạn B: cùng module này chạy trong admin để tải STL theo đơn.
// =============================================================================
import type { KhayCatalog } from './catalog';
import type { PlacedTray } from './layout';
import { findColor } from './palette';
import { trayGrams } from './pricing';
import { buildTraySolid } from './geometry/tray-solid';
import { validateManifold } from './geometry/validate';
import { writeBinaryStl } from './geometry/stl';
import { createZip } from './geometry/zip';
import { meshVolumeMm3 } from './geometry/volume';

/** Tên file in: khay_T1-L1_176x140x35_matte-charcoal.stl (kích thước làm tròn mm). */
export function stlFileName(t: PlacedTray, prefix = 'khay'): string {
  const dims = `${Math.round(t.spec.w)}x${Math.round(t.spec.d)}x${Math.round(t.spec.h)}`;
  return `${prefix}_${t.spec.name}_${dims}_${t.color}.stl`;
}

export interface OrderExport {
  zip: Uint8Array;
  manifest: string;
  files: string[];
  totalGrams: number;
}

export function buildOrderZip(trays: PlacedTray[], catalog: KhayCatalog, prefix = 'khay'): OrderExport {
  const files: { name: string; data: Uint8Array }[] = [];
  const names: string[] = [];
  const rows: string[] = [];
  const byColor = new Map<string, { grams: number; count: number }>();
  let totalGrams = 0;

  for (const t of trays) {
    const mesh = buildTraySolid(t.spec);
    const check = validateManifold(mesh);
    if (!check.ok) {
      throw new Error(`Mesh khay ${t.spec.name} không kín, từ chối xuất STL: ${check.problems.join('; ')}`);
    }
    const grams = trayGrams(meshVolumeMm3(mesh), catalog);
    totalGrams += grams;
    const color = findColor(t.color);
    const name = stlFileName(t, prefix);
    names.push(name);
    files.push({ name, data: new Uint8Array(writeBinaryStl(mesh, t.spec.name)) });
    rows.push(
      `${t.spec.name}  ${Math.round(t.spec.w)}×${Math.round(t.spec.d)}×${Math.round(t.spec.h)}mm  ` +
        `${color.name} (${color.nameVi})  ~${grams.toFixed(0)}g  tầng ${t.levelIdx + 1}`,
    );
    const agg = byColor.get(color.name) ?? { grams: 0, count: 0 };
    agg.grams += grams;
    agg.count += 1;
    byColor.set(color.name, agg);
  }

  const manifest = [
    `KHAY CHIA NGĂN KÉO — hồ sơ in (${trays.length} khay, ~${totalGrams.toFixed(0)}g)`,
    `Đơn vị STL: mm. Nhựa: Bambu Lab PLA Matte, khối lượng riêng 1.24 g/cm³.`,
    ``,
    `TỪNG KHAY`,
    ...rows,
    ``,
    `GOM LÔ THEO MÀU (mỗi khay in 1 màu)`,
    ...[...byColor.entries()].map(([c, a]) => `${c}: ${a.count} khay, ~${a.grams.toFixed(0)}g`),
    ``,
    `LƯU Ý IN`,
    `- Đáy phẳng lớn: nên dùng brim hoặc bàn PEI texture chống cong vênh góc.`,
    `- Vách 1.6mm = 4 perimeter đầu 0.4mm; KHÔNG cần support (vát chân 45°).`,
    `- Khay có chân cắm (tầng ≥2) in đúng chiều mặc định: chân nằm dưới.`,
  ].join('\n');

  files.push({ name: 'manifest.txt', data: new TextEncoder().encode(manifest) });
  return { zip: createZip(files), manifest, files: names, totalGrams };
}
