// =============================================================================
// Layout — state model của toàn bộ cấu hình khách: ngăn kéo + các tầng + grid
// từng khay + màu từng khay. Mọi op là PURE FUNCTION (layout → layout mới) để
// UI làm undo/redo bằng snapshot. Codec blocks "r,c,rs,cs,p|…" tương thích quy
// ước cellgrid của ngan-excel-demo (t luôn = "p" — khay chỉ có 1 loại ô).
//
// Ràng buộc vật lý (chốt cuối ở buildAllTrays, UI phải chặn trước):
// - Mọi tầng dùng CHUNG tiling (xếp chồng phải trùng miệng).
// - Ô (cell) ≥ minPocketMm mỗi chiều; merge chỉ trong 1 khay.
// - Σ chiều cao danh nghĩa các tầng ≤ chiều cao lòng ngăn kéo.
// =============================================================================
import type { FitId, KhayCatalog } from './catalog';
import { stackingDims } from './catalog';
import { DEFAULT_COLOR_ID } from './palette';
import type { Tiling, TrayTile } from './tiling';
import { computeTiling } from './tiling';
import type { PocketRect, TraySpec } from './geometry/types';

export interface Block {
  r: number;
  c: number;
  rs: number;
  cs: number;
}

export interface TrayGrid {
  rows: number;
  cols: number;
  /** Codec "r,c,rs,cs,p|…" — luôn phủ kín rows×cols không chồng lấn. */
  blocks: string;
  /** id màu trong PLA_MATTE_PALETTE — mỗi khay in 1 màu. */
  color: string;
}

export interface Level {
  /** Chiều cao DANH NGHĨA (nấc heightSteps) = bước xếp chồng. */
  h: number;
  /** Row-major theo tiling.tiles. */
  trays: TrayGrid[];
}

export interface KhayLayout {
  v: 1;
  drawer: { w: number; d: number; h: number };
  fit: FitId;
  levels: Level[];
}

// ── Codec blocks ─────────────────────────────────────────────────────────────

export function encodeBlocks(blocks: Block[]): string {
  return blocks.map((b) => `${b.r},${b.c},${b.rs},${b.cs},p`).join('|');
}

/** Decode + sửa lỗi: block ngoài lưới bị cắt, ô thiếu được phủ 1×1, chồng lấn giữ block đến trước. */
export function decodeBlocks(s: string, rows: number, cols: number): Block[] {
  const taken: boolean[] = new Array(rows * cols).fill(false);
  const out: Block[] = [];
  if (s.trim()) {
    for (const part of s.split('|')) {
      const [r, c, rs, cs] = part.split(',').map((n) => parseInt(n, 10));
      if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(rs) || !Number.isFinite(cs)) continue;
      if (r < 0 || c < 0 || rs < 1 || cs < 1 || r + rs > rows || c + cs > cols) continue;
      let clash = false;
      for (let i = r; i < r + rs && !clash; i++)
        for (let j = c; j < c + cs && !clash; j++) if (taken[i * cols + j]) clash = true;
      if (clash) continue;
      for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) taken[i * cols + j] = true;
      out.push({ r, c, rs, cs });
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      if (!taken[i * cols + j]) out.push({ r: i, c: j, rs: 1, cs: 1 });
  return out;
}

export function fullGridBlocks(rows: number, cols: number): string {
  const bs: Block[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bs.push({ r, c, rs: 1, cs: 1 });
  return encodeBlocks(bs);
}

/** Tìm block chứa ô (r,c). */
export function blockAt(blocks: Block[], r: number, c: number): Block | undefined {
  return blocks.find((b) => r >= b.r && r < b.r + b.rs && c >= b.c && c < b.c + b.cs);
}

// ── Kích thước ô trong khay ──────────────────────────────────────────────────

/** Cạnh ô (lòng) theo 1 trục: innerSize chia cols ô + (cols−1) vách. */
export function cellSize(tileSize: number, count: number, wallT: number): number {
  return (tileSize - 2 * wallT - (count - 1) * wallT) / count;
}

/** Số ô mặc định trên 1 trục: nhắm lòng ô ~80mm, kẹp bởi minPocket. */
function defaultAxisCells(tileSize: number, catalog: KhayCatalog): number {
  const { wallT, minPocketMm } = catalog.limits;
  let n = Math.max(1, Math.round((tileSize - 2 * wallT) / 84));
  while (n > 1 && cellSize(tileSize, n, wallT) < minPocketMm) n--;
  return n;
}

/** Số ô tối đa trên 1 trục sao cho lòng ô ≥ minPocket. */
export function maxAxisCells(tileSize: number, catalog: KhayCatalog): number {
  const { wallT, minPocketMm } = catalog.limits;
  let n = 1;
  while (cellSize(tileSize, n + 1, wallT) >= minPocketMm) n++;
  return n;
}

/** PocketRect (toạ độ local khay) của 1 block trong grid. */
export function blockPocket(tile: TrayTile, grid: TrayGrid, b: Block, wallT: number): PocketRect {
  const cw = cellSize(tile.w, grid.cols, wallT);
  const cd = cellSize(tile.d, grid.rows, wallT);
  const x0 = wallT + b.c * (cw + wallT);
  const y0 = wallT + b.r * (cd + wallT);
  return { x0, y0, x1: x0 + b.cs * cw + (b.cs - 1) * wallT, y1: y0 + b.rs * cd + (b.rs - 1) * wallT };
}

// ── Khởi tạo & chuẩn hoá ─────────────────────────────────────────────────────

function defaultTray(tile: TrayTile, catalog: KhayCatalog, color: string): TrayGrid {
  const cols = defaultAxisCells(tile.w, catalog);
  const rows = defaultAxisCells(tile.d, catalog);
  return { rows, cols, blocks: fullGridBlocks(rows, cols), color };
}

/** Nấc cao lớn nhất ≤ h (không có → nấc nhỏ nhất, normalize sẽ cảnh báo). */
function bestHeightStep(h: number, steps: number[]): number {
  const fit = steps.filter((s) => s <= h);
  return fit.length ? Math.max(...fit) : Math.min(...steps);
}

export function defaultLayout(
  drawer: { w: number; d: number; h: number },
  fit: FitId,
  catalog: KhayCatalog,
): KhayLayout {
  const tiling = computeTiling(drawer.w, drawer.d, fit, catalog.limits);
  const h = bestHeightStep(drawer.h, catalog.limits.heightSteps);
  return {
    v: 1,
    drawer,
    fit,
    levels: [{ h, trays: tiling.tiles.map((t) => defaultTray(t, catalog, DEFAULT_COLOR_ID)) }],
  };
}

/**
 * Chuẩn hoá sau MỌI op (UI gọi qua đây): tiling đổi → giữ grid khay nào còn
 * cùng kích thước tile, khay mới nhận grid mặc định; kẹp số tầng, nấc cao,
 * Σ cao ≤ drawer.h (bỏ tầng thừa từ trên xuống); grid quá dày → hạ về max hợp lệ.
 */
export function normalizeLayout(layout: KhayLayout, catalog: KhayCatalog): KhayLayout {
  const { limits } = catalog;
  const tiling = computeTiling(layout.drawer.w, layout.drawer.d, layout.fit, limits);
  let levels = layout.levels.slice(0, limits.maxLevels).map((lv) => {
    const h = limits.heightSteps.includes(lv.h) ? lv.h : bestHeightStep(lv.h, limits.heightSteps);
    const trays = tiling.tiles.map((tile, i) => {
      const old = lv.trays[i];
      if (old) {
        const maxC = maxAxisCells(tile.w, catalog);
        const maxR = maxAxisCells(tile.d, catalog);
        const cols = Math.min(Math.max(1, old.cols), maxC);
        const rows = Math.min(Math.max(1, old.rows), maxR);
        const blocks =
          cols === old.cols && rows === old.rows
            ? encodeBlocks(decodeBlocks(old.blocks, rows, cols))
            : fullGridBlocks(rows, cols);
        return { rows, cols, blocks, color: old.color };
      }
      return defaultTray(tile, catalog, lv.trays[0]?.color ?? DEFAULT_COLOR_ID);
    });
    return { h, trays };
  });
  if (levels.length === 0) levels = defaultLayout(layout.drawer, layout.fit, catalog).levels;
  // Σ cao danh nghĩa ≤ cao lòng ngăn kéo: bỏ tầng trên cùng tới khi vừa.
  while (levels.length > 1 && levels.reduce((s, l) => s + l.h, 0) > layout.drawer.h) levels.pop();
  return { ...layout, levels };
}

// ── Ops cho UI (pure) ────────────────────────────────────────────────────────

export function setDrawer(layout: KhayLayout, drawer: { w: number; d: number; h: number }, catalog: KhayCatalog): KhayLayout {
  return normalizeLayout({ ...layout, drawer }, catalog);
}

export function setFit(layout: KhayLayout, fit: FitId, catalog: KhayCatalog): KhayLayout {
  return normalizeLayout({ ...layout, fit }, catalog);
}

export function setLevelHeight(layout: KhayLayout, li: number, h: number, catalog: KhayCatalog): KhayLayout {
  const levels = layout.levels.map((lv, i) => (i === li ? { ...lv, h } : lv));
  return normalizeLayout({ ...layout, levels }, catalog);
}

/** Thêm tầng mới lên TRÊN CÙNG, copy grid + màu của tầng dưới nó. */
export function addLevel(layout: KhayLayout, catalog: KhayCatalog): KhayLayout {
  const { heightSteps, maxLevels } = catalog.limits;
  if (layout.levels.length >= maxLevels) return layout;
  const used = layout.levels.reduce((s, l) => s + l.h, 0);
  const room = layout.drawer.h - used;
  const fit = heightSteps.filter((s) => s <= room);
  if (!fit.length) return layout; // không còn chỗ — UI disable nút trước
  const top = layout.levels[layout.levels.length - 1];
  const levels = [...layout.levels, { h: Math.max(...fit), trays: top.trays.map((t) => ({ ...t })) }];
  return normalizeLayout({ ...layout, levels }, catalog);
}

export function removeLevel(layout: KhayLayout, li: number, catalog: KhayCatalog): KhayLayout {
  if (layout.levels.length <= 1) return layout;
  const levels = layout.levels.filter((_, i) => i !== li);
  return normalizeLayout({ ...layout, levels }, catalog);
}

export function setTrayGrid(layout: KhayLayout, li: number, ti: number, rows: number, cols: number, catalog: KhayCatalog): KhayLayout {
  const levels = layout.levels.map((lv, i) =>
    i !== li
      ? lv
      : {
          ...lv,
          trays: lv.trays.map((t, j) =>
            j !== ti ? t : { ...t, rows, cols, blocks: fullGridBlocks(rows, cols) },
          ),
        },
  );
  return normalizeLayout({ ...layout, levels }, catalog);
}

export function setTrayColor(layout: KhayLayout, li: number, ti: number, color: string): KhayLayout {
  const levels = layout.levels.map((lv, i) =>
    i !== li ? lv : { ...lv, trays: lv.trays.map((t, j) => (j !== ti ? t : { ...t, color })) },
  );
  return { ...layout, levels };
}

/**
 * Merge vùng chọn chữ nhật [r0..r1]×[c0..c1] trong 1 khay (kiểu Excel: vùng
 * chạm block đã merge nào thì NỞ ra ôm trọn block đó, lặp tới ổn định).
 */
export function mergeRect(layout: KhayLayout, li: number, ti: number, r0: number, c0: number, r1: number, c1: number): KhayLayout {
  const tray = layout.levels[li]?.trays[ti];
  if (!tray) return layout;
  let [R0, C0, R1, C1] = [Math.min(r0, r1), Math.min(c0, c1), Math.max(r0, r1), Math.max(c0, c1)];
  const blocks = decodeBlocks(tray.blocks, tray.rows, tray.cols);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of blocks) {
      const hit = b.r <= R1 && b.r + b.rs - 1 >= R0 && b.c <= C1 && b.c + b.cs - 1 >= C0;
      if (!hit) continue;
      const nR0 = Math.min(R0, b.r);
      const nC0 = Math.min(C0, b.c);
      const nR1 = Math.max(R1, b.r + b.rs - 1);
      const nC1 = Math.max(C1, b.c + b.cs - 1);
      if (nR0 !== R0 || nC0 !== C0 || nR1 !== R1 || nC1 !== C1) {
        [R0, C0, R1, C1] = [nR0, nC0, nR1, nC1];
        grew = true;
      }
    }
  }
  const keep = blocks.filter((b) => !(b.r <= R1 && b.r + b.rs - 1 >= R0 && b.c <= C1 && b.c + b.cs - 1 >= C0));
  keep.push({ r: R0, c: C0, rs: R1 - R0 + 1, cs: C1 - C0 + 1 });
  const next = { ...tray, blocks: encodeBlocks(keep) };
  const levels = layout.levels.map((lv, i) =>
    i !== li ? lv : { ...lv, trays: lv.trays.map((t, j) => (j !== ti ? t : next)) },
  );
  return { ...layout, levels };
}

/** Tách block chứa ô (r,c) về các ô 1×1. */
export function unmergeAt(layout: KhayLayout, li: number, ti: number, r: number, c: number): KhayLayout {
  const tray = layout.levels[li]?.trays[ti];
  if (!tray) return layout;
  const blocks = decodeBlocks(tray.blocks, tray.rows, tray.cols);
  const target = blockAt(blocks, r, c);
  if (!target || (target.rs === 1 && target.cs === 1)) return layout;
  const keep = blocks.filter((b) => b !== target);
  for (let i = target.r; i < target.r + target.rs; i++)
    for (let j = target.c; j < target.c + target.cs; j++) keep.push({ r: i, c: j, rs: 1, cs: 1 });
  const next = { ...tray, blocks: encodeBlocks(keep) };
  const levels = layout.levels.map((lv, i) =>
    i !== li ? lv : { ...lv, trays: lv.trays.map((t, j) => (j !== ti ? t : next)) },
  );
  return { ...layout, levels };
}

// ── Layout → TraySpec (cầu nối sang engine hình học) ─────────────────────────

export interface PlacedTray {
  spec: TraySpec;
  levelIdx: number;
  trayIdx: number;
  tile: TrayTile;
  /** z đáy miếng in khi ĐẶT TRONG ngăn kéo (tầng trên lún seatDepth vào tầng dưới). */
  zBase: number;
  color: string;
  /** Chiều cao danh nghĩa của tầng (khác spec.h với tầng ≥2). */
  nominalH: number;
}

export function buildAllTrays(
  layout: KhayLayout,
  catalog: KhayCatalog,
): { trays: PlacedTray[]; tiling: Tiling; warnings: string[] } {
  const { limits } = catalog;
  const stack = stackingDims(limits);
  const tiling = computeTiling(layout.drawer.w, layout.drawer.d, layout.fit, limits);
  const warnings: string[] = [];
  const totalH = layout.levels.reduce((s, l) => s + l.h, 0);
  if (totalH > layout.drawer.h) warnings.push(`Tổng cao các tầng ${totalH}mm vượt lòng ngăn kéo ${layout.drawer.h}mm`);
  const trays: PlacedTray[] = [];
  let rimZ = 0; // miệng tầng dưới cùng đã đặt
  for (let li = 0; li < layout.levels.length; li++) {
    const lv = layout.levels[li];
    const isTop = li === layout.levels.length - 1;
    const hasPlug = li > 0;
    const pieceH = lv.h + (hasPlug ? stack.seatDepth : 0);
    const zBase = rimZ - (hasPlug ? stack.seatDepth : 0);
    for (let ti = 0; ti < tiling.tiles.length; ti++) {
      const tile = tiling.tiles[ti];
      const grid = lv.trays[ti];
      if (!grid) throw new Error(`Thiếu grid khay T${ti + 1} tầng ${li + 1} — layout chưa normalize`);
      const cw = cellSize(tile.w, grid.cols, limits.wallT);
      const cd = cellSize(tile.d, grid.rows, limits.wallT);
      if (cw < limits.minPocketMm - 1e-9 || cd < limits.minPocketMm - 1e-9) {
        throw new Error(
          `Ô khay T${ti + 1} tầng ${li + 1} nhỏ hơn ${limits.minPocketMm}mm (${cw.toFixed(1)}×${cd.toFixed(1)})`,
        );
      }
      const blocks = decodeBlocks(grid.blocks, grid.rows, grid.cols);
      const pockets = blocks.map((b) => blockPocket(tile, grid, b, limits.wallT));
      trays.push({
        spec: {
          name: `T${ti + 1}-L${li + 1}`,
          w: tile.w,
          d: tile.d,
          h: pieceH,
          wallT: limits.wallT,
          floorT: limits.floorT,
          outerR: limits.outerR,
          pocketR: limits.pocketR,
          arcSegs: limits.arcSegs,
          pockets,
          plug: hasPlug ? { inset: stack.plugInset, height: limits.lipH, chamferH: stack.chamferH } : undefined,
          dividerDrop: isTop ? 0 : stack.dividerDrop,
        },
        levelIdx: li,
        trayIdx: ti,
        tile,
        zBase,
        color: grid.color,
        nominalH: lv.h,
      });
    }
    rimZ += lv.h;
  }
  return { trays, tiling, warnings };
}

// ── Serialize (param `layout` cho ?c= / order payload giai đoạn B) ───────────

export function serializeLayout(layout: KhayLayout): string {
  return JSON.stringify(layout);
}

export function parseLayout(s: string, catalog: KhayCatalog): KhayLayout | null {
  try {
    const obj = JSON.parse(s) as KhayLayout;
    if (obj?.v !== 1 || !obj.drawer || !Array.isArray(obj.levels)) return null;
    return normalizeLayout(obj, catalog);
  } catch {
    return null;
  }
}
