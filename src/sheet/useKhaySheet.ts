// =============================================================================
// useKhaySheet — hook HEADLESS trung tâm của configurator khay: giữ layout +
// catalog + selection + undo, gọi pure ops của @/engine/layout, memo hoá
// build/mesh/price. MỌI component UI chỉ nhận { sheet } từ đây — không tự đụng
// KhayLayout. Undo = snapshot layout (cap 50, chỉ push khi layout ĐỔI nội dung).
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from '@/engine/layout';
import type { KhayLayout, PlacedTray } from '@/engine/layout';
import type { FitId, KhayCatalog } from '@/engine/catalog';
import { DEFAULT_KHAY_CATALOG } from '@/engine/catalog';
import type { Tiling } from '@/engine/tiling';
import type { TriMesh } from '@/engine/geometry/types';
import { buildTraySolid } from '@/engine/geometry/tray-solid';
import { computeKhayPrice, type KhayPrice } from '@/engine/pricing';
import { loadCatalog, saveCatalog } from './store';

/** 1 ô trong 1 khay của 1 tầng. */
export interface CellRef {
  level: number;
  tray: number;
  r: number;
  c: number;
}

/** Vùng chọn chữ nhật trong 1 khay — anchor = (r0,c0); chuẩn hoá min/max khi ĐỌC. */
export interface CellSelection {
  level: number;
  tray: number;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface KhaySheet {
  layout: KhayLayout;
  catalog: KhayCatalog;
  built: { trays: PlacedTray[]; tiling: Tiling; warnings: string[] };
  buildError: string | null;
  price: KhayPrice;
  /** key = `${levelIdx}-${trayIdx}` — mesh WYSIWYG (cùng builder với STL). */
  meshes: Map<string, TriMesh>;
  activeLevel: number;
  selection: CellSelection | null;
  setActiveLevel(i: number): void;
  select(sel: CellSelection | null): void;
  extendSelection(to: CellRef): void;
  setDrawer(dims: { w: number; d: number; h: number }): void;
  setFit(f: FitId): void;
  setLevelHeight(li: number, h: number): void;
  addLevel(): void;
  removeLevel(li: number): void;
  setTrayGrid(li: number, ti: number, rows: number, cols: number): void;
  mergeSelection(): void;
  unmergeSelection(): void;
  setTrayColor(li: number, ti: number, colorId: string): void;
  setAllTrayColors(colorId: string): void;
  setCatalog(c: KhayCatalog): void;
  resetLayout(): void;
  undo(): void;
  canUndo: boolean;
  canMergeSelection: boolean;
  canUnmergeSelection: boolean;
}

type Built = { trays: PlacedTray[]; tiling: Tiling; warnings: string[] };

const DEFAULT_DRAWER = { w: 400, d: 300, h: 120 };
const UNDO_CAP = 50;
const MESH_CACHE_CAP = 400;

/** Built an toàn tuyệt đối (default layout × default catalog) — không thể fail. */
function safeFallbackBuilt(): Built {
  return L.buildAllTrays(
    L.defaultLayout(DEFAULT_DRAWER, 'chuan', DEFAULT_KHAY_CATALOG),
    DEFAULT_KHAY_CATALOG,
  );
}

export function useKhaySheet(): KhaySheet {
  const [catalog, setCatalogState] = useState<KhayCatalog>(loadCatalog);
  const [hist, setHist] = useState<{ layout: KhayLayout; past: KhayLayout[] }>(() => {
    // Catalog localStorage hỏng nặng (min/max vô lý) có thể làm defaultLayout
    // throw — fallback dựng bằng catalog mặc định để app luôn mount được.
    let layout: KhayLayout;
    try {
      layout = L.defaultLayout(DEFAULT_DRAWER, 'chuan', catalog);
    } catch {
      layout = L.defaultLayout(DEFAULT_DRAWER, 'chuan', DEFAULT_KHAY_CATALOG);
    }
    return { layout, past: [] };
  });
  const layout = hist.layout;
  const canUndo = hist.past.length > 0;

  // Catalog mới nhất cho các op (callback giữ stable, không lệ thuộc catalog).
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  /** Áp 1 op thuần: chỉ push undo khi layout ĐỔI nội dung; op throw → bỏ qua. */
  const apply = useCallback((fn: (l: KhayLayout, c: KhayCatalog) => KhayLayout) => {
    setHist((h) => {
      let next: KhayLayout;
      try {
        next = fn(h.layout, catalogRef.current);
      } catch {
        return h;
      }
      if (next === h.layout || L.serializeLayout(next) === L.serializeLayout(h.layout)) return h;
      return { layout: next, past: [...h.past, h.layout].slice(-UNDO_CAP) };
    });
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      // Chuẩn hoá snapshot theo catalog HIỆN TẠI: settings có thể đã đổi sau
      // khi snapshot được chụp — khôi phục thô sẽ vi phạm giới hạn mới.
      let restored = prev;
      try {
        restored = L.normalizeLayout(prev, catalogRef.current);
      } catch {
        /* giữ snapshot thô; buildError sẽ báo rõ */
      }
      return { layout: restored, past: h.past.slice(0, -1) };
    });
  }, []);

  // ── activeLevel: clamp theo số tầng hiện có ────────────────────────────────
  const [activeLevelState, setActiveLevelState] = useState(0);
  const activeLevel = Math.min(Math.max(0, activeLevelState), layout.levels.length - 1);
  useEffect(() => {
    if (activeLevelState !== activeLevel) setActiveLevelState(activeLevel);
  }, [activeLevelState, activeLevel]);
  const setActiveLevel = useCallback((i: number) => setActiveLevelState(i), []);

  // ── selection: tự về null khi out-of-range sau khi layout đổi ─────────────
  const [selectionState, setSelectionState] = useState<CellSelection | null>(null);
  const selection = useMemo(() => {
    const s = selectionState;
    if (!s) return null;
    const tray = layout.levels[s.level]?.trays[s.tray];
    if (!tray) return null;
    const ok = (r: number, c: number) => r >= 0 && r < tray.rows && c >= 0 && c < tray.cols;
    return ok(s.r0, s.c0) && ok(s.r1, s.c1) ? s : null;
  }, [selectionState, layout]);
  useEffect(() => {
    if (selectionState && !selection) setSelectionState(null);
  }, [selectionState, selection]);

  const select = useCallback((s: CellSelection | null) => setSelectionState(s), []);
  const extendSelection = useCallback((to: CellRef) => {
    // Giữ anchor (r0,c0), chỉ mở rộng trong CÙNG level+tray.
    setSelectionState((prev) =>
      prev && prev.level === to.level && prev.tray === to.tray
        ? { ...prev, r1: to.r, c1: to.c }
        : prev,
    );
  }, []);

  // ── build (try/catch → giữ built tốt cuối + buildError) ───────────────────
  const buildRes = useMemo(() => {
    try {
      return { built: L.buildAllTrays(layout, catalog) as Built, error: null as string | null };
    } catch (e) {
      return { built: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [layout, catalog]);
  const lastGoodRef = useRef<Built | null>(null);
  if (buildRes.built) lastGoodRef.current = buildRes.built;
  const built = buildRes.built ?? lastGoodRef.current ?? (lastGoodRef.current = safeFallbackBuilt());
  const buildError = buildRes.error;

  // ── meshes: cache theo JSON(spec), LRU prune >400 entry ────────────────────
  const meshCacheRef = useRef(new Map<string, TriMesh>());
  const meshes = useMemo(() => {
    const cache = meshCacheRef.current;
    const out = new Map<string, TriMesh>();
    for (const t of built.trays) {
      const specKey = JSON.stringify(t.spec);
      let m = cache.get(specKey);
      if (m) {
        cache.delete(specKey); // refresh vị trí LRU (Map giữ insertion order)
        cache.set(specKey, m);
      } else {
        try {
          m = buildTraySolid(t.spec);
        } catch {
          continue; // spec lỗi hiếm — bỏ mesh khay này, không crash scene
        }
        cache.set(specKey, m);
      }
      out.set(`${t.levelIdx}-${t.trayIdx}`, m);
    }
    while (cache.size > MESH_CACHE_CAP) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return out;
  }, [built]);

  // ── price: luôn tính trên built TỐT (khi lỗi vẫn hiện giá cấu hình cuối) ──
  const price = useMemo(() => computeKhayPrice(built.trays, catalog), [built, catalog]);

  // ── eligibility cho merge/unmerge ──────────────────────────────────────────
  const canMergeSelection = useMemo(() => {
    if (!selection) return false;
    return selection.r0 !== selection.r1 || selection.c0 !== selection.c1;
  }, [selection]);
  const canUnmergeSelection = useMemo(() => {
    if (!selection) return false;
    const tray = layout.levels[selection.level]?.trays[selection.tray];
    if (!tray) return false;
    const b = L.blockAt(
      L.decodeBlocks(tray.blocks, tray.rows, tray.cols),
      selection.r0,
      selection.c0,
    );
    return !!b && (b.rs > 1 || b.cs > 1);
  }, [selection, layout]);

  // ── ops layout (wrap pure fn engine) ───────────────────────────────────────
  const setDrawer = useCallback(
    (dims: { w: number; d: number; h: number }) => {
      apply((l, c) => {
        try {
          return L.setDrawer(l, dims, c);
        } catch {
          // Ngoài min/max: vẫn ghi drawer thô để buildError báo lỗi tiếng Việt
          // cho user thấy; levels giữ nguyên, sửa lại số là hết lỗi.
          return { ...l, drawer: { ...dims } };
        }
      });
    },
    [apply],
  );
  const setFit = useCallback((f: FitId) => apply((l, c) => L.setFit(l, f, c)), [apply]);
  const setLevelHeight = useCallback(
    (li: number, h: number) => apply((l, c) => L.setLevelHeight(l, li, h, c)),
    [apply],
  );
  const addLevel = useCallback(() => apply((l, c) => L.addLevel(l, c)), [apply]);
  const removeLevel = useCallback(
    (li: number) => apply((l, c) => L.removeLevel(l, li, c)),
    [apply],
  );
  const setTrayGrid = useCallback(
    (li: number, ti: number, rows: number, cols: number) =>
      apply((l, c) => L.setTrayGrid(l, li, ti, rows, cols, c)),
    [apply],
  );
  const mergeSelection = useCallback(() => {
    const s = selection;
    if (!s) return;
    apply((l) => L.mergeRect(l, s.level, s.tray, s.r0, s.c0, s.r1, s.c1));
  }, [apply, selection]);
  const unmergeSelection = useCallback(() => {
    const s = selection;
    if (!s) return;
    apply((l) => L.unmergeAt(l, s.level, s.tray, s.r0, s.c0));
  }, [apply, selection]);
  const setTrayColor = useCallback(
    (li: number, ti: number, colorId: string) =>
      apply((l) => L.setTrayColor(l, li, ti, colorId)),
    [apply],
  );
  const setAllTrayColors = useCallback(
    (colorId: string) =>
      apply((l) => ({
        ...l,
        levels: l.levels.map((lv) => ({
          ...lv,
          trays: lv.trays.map((t) => ({ ...t, color: colorId })),
        })),
      })),
    [apply],
  );

  // ── catalog: lưu localStorage + re-normalize layout (limits đổi → tiling đổi)
  const setCatalog = useCallback((c: KhayCatalog) => {
    saveCatalog(c);
    setCatalogState(c);
    setHist((h) => {
      try {
        const next = L.normalizeLayout(h.layout, c);
        if (L.serializeLayout(next) === L.serializeLayout(h.layout)) return h;
        return { layout: next, past: [...h.past, h.layout].slice(-UNDO_CAP) };
      } catch {
        return h; // layout cũ mâu thuẫn catalog mới → buildError sẽ báo
      }
    });
  }, []);

  const resetLayout = useCallback(() => {
    apply((_l, c) => {
      try {
        return L.defaultLayout(DEFAULT_DRAWER, 'chuan', c);
      } catch {
        return L.defaultLayout(DEFAULT_DRAWER, 'chuan', DEFAULT_KHAY_CATALOG);
      }
    });
    setSelectionState(null);
    setActiveLevelState(0);
  }, [apply]);

  return {
    layout,
    catalog,
    built,
    buildError,
    price,
    meshes,
    activeLevel,
    selection,
    setActiveLevel,
    select,
    extendSelection,
    setDrawer,
    setFit,
    setLevelHeight,
    addLevel,
    removeLevel,
    setTrayGrid,
    mergeSelection,
    unmergeSelection,
    setTrayColor,
    setAllTrayColors,
    setCatalog,
    resetLayout,
    undo,
    canUndo,
    canMergeSelection,
    canUnmergeSelection,
  };
}
