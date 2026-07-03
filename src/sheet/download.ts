// download — xuất ZIP STL cho khách: buildOrderZip (validate manifold bên
// trong, throw nếu mesh hỏng) → Blob → thẻ <a download>. Caller tự toast.
import { buildOrderZip } from '@/engine/export';
import type { KhaySheet } from './useKhaySheet';

export function exportZip(sheet: KhaySheet): { files: string[]; totalGrams: number } {
  if (sheet.buildError) {
    throw new Error(`Cấu hình đang lỗi, sửa trước khi tải: ${sheet.buildError}`);
  }
  const { zip, files, totalGrams } = buildOrderZip(sheet.built.trays, sheet.catalog);
  const { w, d, h } = sheet.layout.drawer;
  const blob = new Blob([zip as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `khay_${Math.round(w)}x${Math.round(d)}x${Math.round(h)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { files, totalGrams };
}
