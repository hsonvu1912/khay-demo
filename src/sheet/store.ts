// store — đọc/ghi KhayCatalog ở localStorage (demo). Giai đoạn B: thay bằng
// Cloudflare KV `catalog:khay`. Merge NÔNG từng nhánh lên DEFAULT_KHAY_CATALOG
// để field mới thêm vào schema không làm vỡ setting cũ đã lưu.
import type { KhayCatalog } from '@/engine/catalog';
import { DEFAULT_KHAY_CATALOG } from '@/engine/catalog';

const KEY = 'khay:catalog';

export function loadCatalog(): KhayCatalog {
  const d = DEFAULT_KHAY_CATALOG;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<KhayCatalog>;
    const pl = p.limits ?? ({} as Partial<KhayCatalog['limits']>);
    return {
      version: 1,
      pricing: { ...d.pricing, ...(p.pricing ?? {}) },
      limits: {
        ...d.limits,
        ...pl,
        fitClearanceMm: { ...d.limits.fitClearanceMm, ...(pl.fitClearanceMm ?? {}) },
        maxDrawer: { ...d.limits.maxDrawer, ...(pl.maxDrawer ?? {}) },
        minDrawer: { ...d.limits.minDrawer, ...(pl.minDrawer ?? {}) },
        heightSteps:
          Array.isArray(pl.heightSteps) && pl.heightSteps.length > 0
            ? pl.heightSteps
            : d.limits.heightSteps,
      },
      colors: Array.isArray(p.colors) ? p.colors : d.colors,
    };
  } catch {
    return d; // JSON hỏng → về mặc định, không crash app
  }
}

export function saveCatalog(c: KhayCatalog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // quota/private mode — demo bỏ qua, setting chỉ sống trong session
  }
}
