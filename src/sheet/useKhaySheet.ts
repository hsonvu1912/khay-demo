// =============================================================================
// useKhaySheet V2 — hook HEADLESS trung tâm của configurator khay: giữ layout +
// catalog + selection + undo, gọi pure ops của @/engine/layout, memo hoá build.
// V2: MỘT lưới chung toàn ngăn kéo, mỗi block = 1 KHAY RỜI có màu riêng;
// selection là Ô LƯỚI (không còn tray index). Mesh giờ ASYNC (CSG manifold-3d
// WASM): pipeline build nền + cache theo HÌNH DẠNG (spec-không-tên + cuts —
// hàng trăm khay trùng hình chỉ CSG 1 lần), build TUẦN TỰ nhả event loop giữa
// các hình (không đơ UI), GIỮ pieces cũ trong lúc build lại (không nháy
// trắng); lỗi CSG surface lên buildError (không nuốt im lặng). MỌI component
// UI chỉ nhận { sheet } từ đây.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from '@/engine/layout';
import type { Block2, KhayLayout, PlacedTray2 } from '@/engine/layout';
import type { FitId, KhayCatalog } from '@/engine/catalog';
import { DEFAULT_KHAY_CATALOG } from '@/engine/catalog';
import type { TrayPiece } from '@/engine/geometry/solid2-types';
import { buildTrayPieces } from '@/engine/geometry/solid2';
import { computeKhayPrice, type KhayPrice } from '@/engine/pricing';
import { loadCatalog, saveCatalog } from './store';

/** Vùng chọn Ô LƯỚI chữ nhật trong 1 tầng — anchor = (r0,c0); chuẩn hoá min/max khi ĐỌC. */
export interface CellSelection2 {
  level: number;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** 1 mảnh in đã dựng CSG, kèm khay chứa nó. */
export interface PieceEntry {
  /** `${levelIdx}:${block.r},${block.c}:${piece.name}` — ổn định theo vị trí khay. */
  key: string;
  tray: PlacedTray2;
  piece: TrayPiece;
}

export interface KhaySheet {
  layout: KhayLayout;
  catalog: KhayCatalog;
  /** Sync: spec + cuts từng khay (KHÔNG mesh) — mesh dựng async ở `pieces`. */
  built: { trays: PlacedTray2[]; warnings: string[] };
  buildError: string | null;
  /** Kết quả CSG async (cache theo spec+cuts); giữ bản cũ khi đang build lại. */
  pieces: PieceEntry[];
  /** CSG đang chạy nền. */
  building: boolean;
  /** Giá từ pieces hiện có (computeKhayPrice). */
  price: KhayPrice;
  trayCount: number;
  pieceCount: number;
  activeLevel: number;
  selection: CellSelection2 | null;
  /** Block/tray chứa anchor selection (derive — null khi chưa chọn/built lệch). */
  selectedBlock: Block2 | null;
  selectedTray: PlacedTray2 | null;
  setActiveLevel(i: number): void;
  select(sel: CellSelection2 | null): void;
  extendSelection(to: { level: number; r: number; c: number }): void;
  setDrawer(dims: { w: number; d: number; h: number }): void;
  setFit(f: FitId): void;
  /** Đổi lưới chung — reset partition MỌI tầng về 1×1 (giữ màu chủ đạo). */
  setGrid(rows: number, cols: number): void;
  setLevelHeight(li: number, h: number): void;
  addLevel(): void;
  removeLevel(li: number): void;
  /** Vùng chọn → 1 khay (giữ màu block anchor). */
  mergeSelection(): void;
  /** Block tại anchor nổ về các ô 1×1. */
  unmergeSelection(): void;
  /** Đổi màu KHAY chứa anchor selection. */
  setBlockColor(colorId: string): void;
  setAllTrayColors(colorId: string): void;
  setCatalog(c: KhayCatalog): void;
  resetLayout(): void;
  undo(): void;
  canUndo: boolean;
  canMergeSelection: boolean;
  canUnmergeSelection: boolean;
}

type Built = { trays: PlacedTray2[]; warnings: string[] };

const DEFAULT_DRAWER = { w: 400, d: 300, h: 120 };
const UNDO_CAP = 50;
/** Trần cache theo HÌNH DẠNG (không phải theo khay) — dedup nên 300 là dư dả;
 * prune không bao giờ đụng hình của built hiện tại (xem pipeline). */
const PIECE_CACHE_CAP = 300;

/** Built an toàn tuyệt đối (default layout × default catalog) — không thể fail. */
function safeFallbackBuilt(): Built {
  return L.buildAllTrays(
    L.defaultLayout(DEFAULT_DRAWER, 'chuan', DEFAULT_KHAY_CATALOG),
    DEFAULT_KHAY_CATALOG,
  );
}

/**
 * Khoá cache CSG: spec KHÔNG TÊN + cuts — tên khay ('T1-L1'…) không đổi hình
 * dạng, giữ tên trong khoá từng làm 924 khay trùng hình build CSG 924 lần
 * (dedup vô hiệu → đơ cứng rồi crash tab). Pieces trong cache build với tên
 * canonical rỗng; assemble() gắn lại tên khay thật khi lắp PieceEntry.
 */
function trayShapeKey(t: PlacedTray2): string {
  const { name: _name, ...shape } = t.spec;
  return JSON.stringify(shape) + '|' + JSON.stringify(t.cuts);
}

/** Nhả event loop — chen giữa các build CSG WASM (đồng bộ 100% sau khi nạp). */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  // ── selection: Ô LƯỚI toàn ngăn kéo; tự về null khi out-of-range ──────────
  const [selectionState, setSelectionState] = useState<CellSelection2 | null>(null);
  const selection = useMemo(() => {
    const s = selectionState;
    if (!s) return null;
    if (s.level < 0 || s.level >= layout.levels.length) return null;
    const { rows, cols } = layout.grid;
    const ok = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
    return ok(s.r0, s.c0) && ok(s.r1, s.c1) ? s : null;
  }, [selectionState, layout]);
  useEffect(() => {
    if (selectionState && !selection) setSelectionState(null);
  }, [selectionState, selection]);

  const select = useCallback((s: CellSelection2 | null) => setSelectionState(s), []);
  const extendSelection = useCallback((to: { level: number; r: number; c: number }) => {
    // Giữ anchor (r0,c0), mở rộng TỰ DO trong lưới — chỉ ràng CÙNG tầng.
    setSelectionState((prev) =>
      prev && prev.level === to.level ? { ...prev, r1: to.r, c1: to.c } : prev,
    );
  }, []);

  // ── build sync (spec + cuts): try/catch → giữ built tốt cuối + buildError ─
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

  // ── pieces pipeline: CSG async nền + cache theo HÌNH DẠNG (dedup tên) ─────
  // Giữ pieces CŨ trong lúc build lại — preview không nháy trắng.
  const pieceCacheRef = useRef(new Map<string, TrayPiece[]>());
  // Hình đang build dở (share giữa các effect-run chồng nhau khi kéo slider
  // liên tục) — không CSG lại hình đã khởi động.
  const inflightRef = useRef(new Map<string, Promise<TrayPiece[]>>());
  const [pieces, setPieces] = useState<PieceEntry[]>([]);
  const [building, setBuilding] = useState(true);
  // Lỗi CSG async (khác buildError sync của layout) — surface, KHÔNG nuốt.
  const [csgErrors, setCsgErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const cache = pieceCacheRef.current;
    const currentKeys = new Set(built.trays.map(trayShapeKey));
    // Refresh vị trí LRU cho các hình đang dùng (Map giữ insertion order).
    for (const k of currentKeys) {
      const v = cache.get(k);
      if (v) {
        cache.delete(k);
        cache.set(k, v);
      }
    }
    const assemble = (): PieceEntry[] => {
      const out: PieceEntry[] = [];
      for (const t of built.trays) {
        const ps = cache.get(trayShapeKey(t));
        if (!ps) continue; // hình build fail — lỗi đã surface qua csgErrors
        for (const p of ps) {
          // Cache build với tên canonical rỗng → p.name = '' | '-M1'…; gắn lại
          // tên khay thật để PieceEntry.key/giá/UI đúng như build riêng lẻ.
          const pieceName = t.spec.name + p.name;
          out.push({
            key: `${t.levelIdx}:${t.block.r},${t.block.c}:${pieceName}`,
            tray: t,
            piece: { ...p, name: pieceName },
          });
        }
      }
      return out;
    };
    const publish = (errors: string[]): void => {
      setPieces(assemble());
      setBuilding(false);
      setCsgErrors((prev) => (prev.length === 0 && errors.length === 0 ? prev : errors));
    };
    // missing theo HÌNH (dedup): 1 khay đại diện mỗi khoá — 924 khay ~18 hình.
    const missing = new Map<string, PlacedTray2>();
    for (const t of built.trays) {
      const k = trayShapeKey(t);
      if (!cache.has(k) && !missing.has(k)) missing.set(k, t);
    }
    void (async () => {
      // MỌI setState của pipeline nằm SAU nextTick — setState sync ngay trong
      // passive effect chồng 25+ lần khi kéo slider dồn dập → React dev bắn
      // "Maximum update depth exceeded". Deferral cũng coalesce burst: run bị
      // cancel không set gì cả.
      await nextTick();
      if (cancelled) return;
      if (missing.size === 0) {
        publish([]);
        return;
      }
      setBuilding(true);
      const errors: string[] = [];
      // TUẦN TỰ + nhả event loop sau mỗi hình: Promise.all từng xếp hàng trăm
      // microtask CSG nặng liên tục → main thread đóng băng nhiều phút.
      for (const [key, t] of missing) {
        if (cancelled) return; // built đã đổi giữa chừng — effect mới lo tiếp
        try {
          let job = inflightRef.current.get(key);
          if (!job) {
            job = buildTrayPieces({ ...t.spec, name: '' }, t.cuts).finally(() => {
              inflightRef.current.delete(key);
            });
            inflightRef.current.set(key, job);
          }
          cache.set(key, await job);
        } catch (e) {
          // Log stack thật (vd RuntimeError từ manifold.wasm) + báo tiếng Việt.
          console.error(`[khay] Dựng hình CSG thất bại cho khay ${t.spec.name}:`, e);
          const msg = (e instanceof Error ? e.message : String(e)).replace(/^Khay "[^"]*":\s*/, '');
          errors.push(`Dựng hình khay ${t.spec.name} thất bại: ${msg}`);
        }
        await nextTick();
      }
      if (cancelled) return;
      // Prune LRU: trần scale theo số hình đang dùng, KHÔNG BAO GIỜ xoá hình
      // của built hiện tại (xoá là mesh biến mất + giá tính thiếu).
      const cap = Math.max(PIECE_CACHE_CAP, currentKeys.size);
      for (const k of cache.keys()) {
        if (cache.size <= cap) break;
        if (!currentKeys.has(k)) cache.delete(k);
      }
      publish(errors);
    })();
    return () => {
      cancelled = true;
    };
  }, [built]);

  // buildError = lỗi sync layout HOẶC lỗi CSG async — user luôn thấy lý do
  // khay biến mất (badge ⚠ TopBar) thay vì scene trống với giá sàn.
  const buildError =
    buildRes.error ?? (csgErrors.length > 0 ? csgErrors.join('\n') : null);

  // ── price: từ pieces hiện có (mảnh CSG thật → thể tích thật) ──────────────
  const price = useMemo(
    () =>
      computeKhayPrice(
        pieces.map((pe) => ({
          name: pe.piece.name,
          color: pe.tray.color,
          volumeMm3: pe.piece.volumeMm3,
        })),
        catalog,
      ),
    [pieces, catalog],
  );

  // ── derive block/tray chứa anchor selection ────────────────────────────────
  const selectedBlock = useMemo<Block2 | null>(() => {
    if (!selection) return null;
    const lv = layout.levels[selection.level];
    if (!lv) return null;
    const blocks = L.decodeBlocks2(lv.blocks, layout.grid.rows, layout.grid.cols);
    return L.blockAt(blocks, selection.r0, selection.c0) ?? null;
  }, [selection, layout]);
  const selectedTray = useMemo<PlacedTray2 | null>(() => {
    if (!selection || !selectedBlock) return null;
    return (
      built.trays.find(
        (t) =>
          t.levelIdx === selection.level &&
          t.block.r === selectedBlock.r &&
          t.block.c === selectedBlock.c,
      ) ?? null
    );
  }, [selection, selectedBlock, built]);

  // ── eligibility cho merge/unmerge ──────────────────────────────────────────
  const canMergeSelection = useMemo(() => {
    if (!selection) return false;
    return selection.r0 !== selection.r1 || selection.c0 !== selection.c1;
  }, [selection]);
  const canUnmergeSelection = useMemo(
    () => !!selectedBlock && (selectedBlock.rs > 1 || selectedBlock.cs > 1),
    [selectedBlock],
  );

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
  const setGrid = useCallback(
    (rows: number, cols: number) => apply((l, c) => L.setGrid(l, rows, cols, c)),
    [apply],
  );
  const setLevelHeight = useCallback(
    (li: number, h: number) => apply((l, c) => L.setLevelHeight(l, li, h, c)),
    [apply],
  );
  const addLevel = useCallback(() => apply((l, c) => L.addLevel(l, c)), [apply]);
  const removeLevel = useCallback(
    (li: number) => apply((l, c) => L.removeLevel(l, li, c)),
    [apply],
  );
  const mergeSelection = useCallback(() => {
    const s = selection;
    if (!s) return;
    // mergeRect tự chuẩn hoá min/max + nở qua block gộp; anchor = (r0,c0).
    apply((l) => L.mergeRect(l, s.level, s.r0, s.c0, s.r1, s.c1));
  }, [apply, selection]);
  const unmergeSelection = useCallback(() => {
    const s = selection;
    if (!s) return;
    apply((l) => L.unmergeAt(l, s.level, s.r0, s.c0));
  }, [apply, selection]);
  const setBlockColor = useCallback(
    (colorId: string) => {
      const s = selection;
      if (!s) return;
      apply((l) => L.setBlockColor(l, s.level, s.r0, s.c0, colorId));
    },
    [apply, selection],
  );
  const setAllTrayColors = useCallback(
    (colorId: string) => apply((l) => L.setAllColors(l, colorId)),
    [apply],
  );

  // ── catalog: lưu localStorage + re-normalize layout (limits đổi → lưới đổi)
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
    pieces,
    building,
    price,
    trayCount: built.trays.length,
    pieceCount: pieces.length,
    activeLevel,
    selection,
    selectedBlock,
    selectedTray,
    setActiveLevel,
    select,
    extendSelection,
    setDrawer,
    setFit,
    setGrid,
    setLevelHeight,
    addLevel,
    removeLevel,
    mergeSelection,
    unmergeSelection,
    setBlockColor,
    setAllTrayColors,
    setCatalog,
    resetLayout,
    undo,
    canUndo,
    canMergeSelection,
    canUnmergeSelection,
  };
}
