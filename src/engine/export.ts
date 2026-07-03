// =============================================================================
// Export v2 — dựng MẢNH từng khay qua solid2 (manifold CSG, async), VALIDATE
// manifold từng mesh (từ chối xuất nếu fail), đóng ZIP: 1 STL/MẢNH +
// manifest.txt (gom lô in theo màu, hướng dẫn ghép mộng khi khay nhiều mảnh).
// Demo: khách tải trực tiếp. Giai đoạn B: chạy trong admin để tải STL theo đơn.
// =============================================================================
import type { KhayCatalog } from './catalog';
import type { PlacedTray2 } from './layout';
import type { TrayPiece } from './geometry/solid2-types';
import { findColor } from './palette';
import { trayGrams } from './pricing';
import { buildTrayPieces } from './geometry/solid2';
import { validateManifold } from './geometry/validate';
import { writeBinaryStl } from './geometry/stl';
import { createZip } from './geometry/zip';

/**
 * Tên file in: khay_T1-L1_176x140x35_matte-charcoal.stl — khay nhiều mảnh
 * mang sẵn hậu tố -M1/-M2… trong piece.name; W×D×H = bbox MẢNH làm tròn mm.
 */
export function stlFileName(piece: TrayPiece, color: string, prefix = 'khay'): string {
  const dims = piece.bbox.map((v) => Math.round(v)).join('x');
  return `${prefix}_${piece.name}_${dims}_${color}.stl`;
}

export interface OrderExport {
  zip: Uint8Array;
  manifest: string;
  files: string[];
  totalGrams: number;
  pieceCount: number;
}

export async function buildOrderZip(
  trays: PlacedTray2[],
  catalog: KhayCatalog,
  prefix = 'khay',
): Promise<OrderExport> {
  const files: { name: string; data: Uint8Array }[] = [];
  const names: string[] = [];
  const rows: string[] = [];
  const byColor = new Map<string, { grams: number; count: number }>();
  let totalGrams = 0;
  let pieceCount = 0;
  let hasMultiPiece = false;

  for (const t of trays) {
    const pieces = await buildTrayPieces(t.spec, t.cuts);
    if (pieces.length > 1) hasMultiPiece = true;
    const color = findColor(t.color);
    for (const p of pieces) {
      const check = validateManifold(p.mesh);
      if (!check.ok) {
        throw new Error(`Mesh mảnh ${p.name} không kín, từ chối xuất STL: ${check.problems.join('; ')}`);
      }
      const grams = trayGrams(p.volumeMm3, catalog);
      totalGrams += grams;
      pieceCount += 1;
      const name = stlFileName(p, t.color, prefix);
      names.push(name);
      files.push({ name, data: new Uint8Array(writeBinaryStl(p.mesh, p.name)) });
      rows.push(
        `${p.name}  ${p.bbox.map((v) => Math.round(v)).join('×')}mm  ` +
          `${color.name} (${color.nameVi})  ~${grams.toFixed(0)}g  tầng ${t.levelIdx + 1}`,
      );
      const agg = byColor.get(color.name) ?? { grams: 0, count: 0 };
      agg.grams += grams;
      agg.count += 1;
      byColor.set(color.name, agg);
    }
  }

  const manifest = [
    `KHAY CHIA NGĂN KÉO — hồ sơ in (${trays.length} khay, ${pieceCount} mảnh, ~${totalGrams.toFixed(0)}g)`,
    `Đơn vị STL: mm. Nhựa: Bambu Lab PLA Matte, khối lượng riêng 1.24 g/cm³.`,
    ``,
    `TỪNG MẢNH IN`,
    ...rows,
    ``,
    `GOM LÔ THEO MÀU (mỗi khay in 1 màu)`,
    ...[...byColor.entries()].map(([c, a]) => `${c}: ${a.count} mảnh, ~${a.grams.toFixed(0)}g`),
    ``,
    ...(hasMultiPiece
      ? [`KHAY NHIỀU MẢNH: ghép mộng đáy khe 0.15mm, ấn thẳng từ trên xuống, không cần keo`, ``]
      : []),
    `LƯU Ý IN`,
    `- Đáy phẳng lớn: nên dùng brim hoặc bàn PEI texture chống cong vênh góc.`,
    `- Vách 4mm in đặc; KHÔNG cần support (chân đế thụt + vát plug 45°).`,
    `- Khay có chân cắm (tầng ≥2 trùng miệng dưới) in đúng chiều mặc định: chân nằm dưới.`,
  ].join('\n');

  files.push({ name: 'manifest.txt', data: new TextEncoder().encode(manifest) });
  return { zip: createZip(files), manifest, files: names, totalGrams, pieceCount };
}
