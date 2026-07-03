// store — đọc/ghi KhayCatalog ở localStorage (demo). Giai đoạn B: thay bằng
// Cloudflare KV `catalog:khay`. Merge NÔNG từng nhánh lên DEFAULT_KHAY_CATALOG
// để field mới thêm vào schema không làm vỡ setting cũ đã lưu.
// V2: bản lưu version !== 2 (setting v1 cũ) → RESET về default, không migrate.
import type { KhayCatalog } from '@/engine/catalog';
import { DEFAULT_KHAY_CATALOG } from '@/engine/catalog';

const KEY = 'khay:catalog';

export function loadCatalog(): KhayCatalog {
  const d = DEFAULT_KHAY_CATALOG;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<KhayCatalog>;
    // Schema đổi giữa v1→v2 (pricing/limits/style khác hẳn) — bản cũ bỏ đi.
    if (p.version !== 2) return d;
    const pl = p.limits ?? ({} as Partial<KhayCatalog['limits']>);
    return {
      version: 2,
      pricing: { ...d.pricing, ...(p.pricing ?? {}) },
      style: { ...d.style, ...(p.style ?? {}) },
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
