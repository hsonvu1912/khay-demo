// =============================================================================
// Layout v2 — state model của toàn bộ cấu hình khách: ngăn kéo + MỘT lưới
// chung + các tầng. Mỗi block (sau merge) là MỘT KHAY RỜI đặt cạnh nhau
// (khe trayGap), mỗi khay 1 màu. Mọi op là PURE FUNCTION (layout → layout mới)
// để UI làm undo/redo bằng snapshot. Codec blocks "r,c,rs,cs,<colorId>|…" —
// trường thứ 5 (v1 là "p") GIỜ LÀ MÀU của khay đó.
//
// Ràng buộc vật lý (chốt cuối ở buildAllTrays, UI phải chặn trước):
// - Khay ≥ 2·wallT + minPocketMm mỗi chiều; Σ cao danh nghĩa ≤ lòng ngăn kéo.
// - Plug chỉ sinh khi block tầng trên TRÙNG KHỚP block tầng NGAY DƯỚI.
// - Khay vượt maxPieceMm → cắt thành mảnh mộng đáy, tối đa maxPiecesPerTray.
// =============================================================================
import type { FitId, KhayCatalog } from './catalog';
import { stackingDims } from './catalog';
import { DEFAULT_COLOR_ID, findColor } from './palette';
import type { CutLine, TraySpec2 } from './geometry/solid2-types';

/** Block = 1 KHAY trên lưới chung, mang màu riêng. */
export interface Block2 {
  r: number;
  c: number;
  rs: number;
  cs: number;
  /** id màu trong PLA_MATTE_PALETTE — mỗi khay in 1 màu. */
  color: string;
}

export interface Level2 {
  /** Chiều cao DANH NGHĨA (nấc heightSteps) = bước xếp chồng. */
  h: number;
  /** Codec "r,c,rs,cs,<colorId>|…" — luôn phủ kín rows×cols không chồng lấn. */
  blocks: string;
}

export interface KhayLayout {
  v: 2;
  drawer: { w: number; d: number; h: number };
  fit: FitId;
  /** MỘT lưới chung cho cả ngăn kéo — mọi tầng chia cùng pitch. */
  grid: { rows: number; cols: number };
  levels: Level2[];
}

// ── Codec blocks ─────────────────────────────────────────────────────────────

/** colorId hợp lệ trong palette, không thì fallback. */
function validColor(id: string | undefined, fallback: string): string {
  return id && findColor(id).id === id ? id : fallback;
}

export function encodeBlocks(blocks: Block2[]): string {
  return blocks.map((b) => `${b.r},${b.c},${b.rs},${b.cs},${b.color}`).join('|');
}

/**
 * Decode + sửa lỗi: block ngoài lưới bị bỏ, chồng lấn giữ block đến trước,
 * màu lạ → DEFAULT; ô thiếu được phủ 1×1 màu block đầu (hoặc DEFAULT).
 */
export function decodeBlocks2(s: string, rows: number, cols: number): Block2[] {
  const taken: boolean[] = new Array(rows * cols).fill(false);
  const out: Block2[] = [];
  if (s.trim()) {
    for (const part of s.split('|')) {
      const fields = part.split(',');
      const [r, c, rs, cs] = fields.map((n) => parseInt(n, 10));
      if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(rs) || !Number.isFinite(cs)) continue;
      if (r < 0 || c < 0 || rs < 1 || cs < 1 || r + rs > rows || c + cs > cols) continue;
      let clash = false;
      for (let i = r; i < r + rs && !clash; i++)
        for (let j = c; j < c + cs && !clash; j++) if (taken[i * cols + j]) clash = true;
      if (clash) continue;
      for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) taken[i * cols + j] = true;
      out.push({ r, c, rs, cs, color: validColor(fields[4], DEFAULT_COLOR_ID) });
    }
  }
  const fillColor = out[0]?.color ?? DEFAULT_COLOR_ID;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      if (!taken[i * cols + j]) out.push({ r: i, c: j, rs: 1, cs: 1, color: fillColor });
  return out;
}

export function fullGridBlocks(rows: number, cols: number, color: string): string {
  const bs: Block2[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bs.push({ r, c, rs: 1, cs: 1, color });
  return encodeBlocks(bs);
}

/** Tìm block chứa ô (r,c). */
export function blockAt(blocks: Block2[], r: number, c: number): Block2 | undefined {
  return blocks.find((b) => r >= b.r && r < b.r + b.rs && c >= b.c && c < b.c + b.cs);
}

// ── Hình học lưới → khay ─────────────────────────────────────────────────────

/** Bước lưới mỗi trục: usable = drawer − 2·fitClear chia ĐỀU cho cols/rows. */
export function gridPitch(
  layout: KhayLayout,
  catalog: KhayCatalog,
): { pitchX: number; pitchY: number; clear: number } {
  const clear = catalog.limits.fitClearanceMm[layout.fit];
  return {
    pitchX: (layout.drawer.w - 2 * clear) / layout.grid.cols,
    pitchY: (layout.drawer.d - 2 * clear) / layout.grid.rows,
    clear,
  };
}

/**
 * Phủ bì khay của 1 block, toạ độ trong hệ LÒNG ngăn kéo (gốc góc trái-trước).
 * Cạnh NỘI BỘ (có hàng xóm) co trayGap/2; cạnh biên giữ nguyên (fitClear đã
 * trừ ở usable, thể hiện qua offset `clear`).
 */
export function trayRectOf(
  layout: KhayLayout,
  catalog: KhayCatalog,
  block: { r: number; c: number; rs: number; cs: number },
): { x: number; y: number; w: number; d: number } {
  const { pitchX, pitchY, clear } = gridPitch(layout, catalog);
  const g = catalog.limits.trayGapMm / 2;
  const x0 = block.c * pitchX + (block.c > 0 ? g : 0);
  const x1 = (block.c + block.cs) * pitchX - (block.c + block.cs < layout.grid.cols ? g : 0);
  const y0 = block.r * pitchY + (block.r > 0 ? g : 0);
  const y1 = (block.r + block.rs) * pitchY - (block.r + block.rs < layout.grid.rows ? g : 0);
  return { x: clear + x0, y: clear + y0, w: x1 - x0, d: y1 - y0 };
}

// ── Khởi tạo & chuẩn hoá ─────────────────────────────────────────────────────

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Khay 1×1 nhỏ nhất cho phép (phủ bì): 2 vách + lòng tối thiểu. */
function minTrayMm(catalog: KhayCatalog): number {
  return 2 * catalog.style.wallT + catalog.limits.minPocketMm;
}

/**
 * Số ô tối đa 1 trục: pitch trừ khe (xấu nhất 2 cạnh nội bộ = trọn trayGap)
 * vẫn ≥ khay tối thiểu.
 */
export function maxAxisCells(usable: number, catalog: KhayCatalog): number {
  const minTray = minTrayMm(catalog);
  let n = 1;
  while (usable / (n + 1) - catalog.limits.trayGapMm >= minTray) n++;
  return n;
}

/** Số ô mặc định 1 trục: nhắm pitch ~110mm, kẹp bởi max hợp lệ. */
function defaultAxisCells(usable: number, catalog: KhayCatalog): number {
  const n = Math.max(1, Math.round(usable / 110));
  return Math.min(n, maxAxisCells(usable, catalog));
}

/** Nấc cao lớn nhất ≤ h (không có → nấc nhỏ nhất, buildAllTrays sẽ cảnh báo). */
function bestHeightStep(h: number, steps: number[]): number {
  const fit = steps.filter((s) => s <= h);
  return fit.length ? Math.max(...fit) : Math.min(...steps);
}

export function defaultLayout(
  drawer: { w: number; d: number; h: number },
  fit: FitId,
  catalog: KhayCatalog,
): KhayLayout {
  const clear = catalog.limits.fitClearanceMm[fit];
  const cols = defaultAxisCells(drawer.w - 2 * clear, catalog);
  const rows = defaultAxisCells(drawer.d - 2 * clear, catalog);
  const h = bestHeightStep(drawer.h, catalog.limits.heightSteps);
  return {
    v: 2,
    drawer,
    fit,
    grid: { rows, cols },
    levels: [{ h, blocks: fullGridBlocks(rows, cols, DEFAULT_COLOR_ID) }],
  };
}

/**
 * Chuẩn hoá sau MỌI op (UI gọi qua đây) — PURE, không throw: drawer kẹp
 * min/max; grid kẹp sao cho pitch − trayGap ≥ 2·wallT + minPocket; nấc cao
 * hợp lệ; levels ≤ maxLevels; Σ cao ≤ drawer.h (bỏ tầng thừa từ trên xuống);
 * blocks decode robust (block hỏng bị vá, màu lạ về default).
 */
export function normalizeLayout(layout: KhayLayout, catalog: KhayCatalog): KhayLayout {
  const { limits } = catalog;
  const drawer = {
    w: clampNum(layout.drawer.w, limits.minDrawer.w, limits.maxDrawer.w),
    d: clampNum(layout.drawer.d, limits.minDrawer.d, limits.maxDrawer.d),
    h: clampNum(layout.drawer.h, limits.minDrawer.h, limits.maxDrawer.h),
  };
  const clear = limits.fitClearanceMm[layout.fit];
  const cols = clampNum(Math.floor(layout.grid?.cols ?? 1) || 1, 1, maxAxisCells(drawer.w - 2 * clear, catalog));
  const rows = clampNum(Math.floor(layout.grid?.rows ?? 1) || 1, 1, maxAxisCells(drawer.d - 2 * clear, catalog));
  let levels = layout.levels.slice(0, limits.maxLevels).map((lv) => {
    const h = limits.heightSteps.includes(lv.h) ? lv.h : bestHeightStep(lv.h, limits.heightSteps);
    return { h, blocks: encodeBlocks(decodeBlocks2(lv.blocks ?? '', rows, cols)) };
  });
  if (levels.length === 0) {
    levels = [{ h: bestHeightStep(drawer.h, limits.heightSteps), blocks: fullGridBlocks(rows, cols, DEFAULT_COLOR_ID) }];
  }
  // Σ cao danh nghĩa ≤ cao lòng ngăn kéo: bỏ tầng trên cùng tới khi vừa.
  while (levels.length > 1 && levels.reduce((s, l) => s + l.h, 0) > drawer.h) levels.pop();
  return { v: 2, drawer, fit: layout.fit, grid: { rows, cols }, levels };
}

// ── Ops cho UI (pure) ────────────────────────────────────────────────────────

export function setDrawer(
  layout: KhayLayout,
  drawer: { w: number; d: number; h: number },
  catalog: KhayCatalog,
): KhayLayout {
  return normalizeLayout({ ...layout, drawer }, catalog);
}

export function setFit(layout: KhayLayout, fit: FitId, catalog: KhayCatalog): KhayLayout {
  return normalizeLayout({ ...layout, fit }, catalog);
}

/** Màu chủ đạo của 1 tầng = màu chiếm nhiều Ô nhất (hoà → màu gặp trước). */
function dominantColor(lv: Level2, rows: number, cols: number): string {
  const count = new Map<string, number>();
  for (const b of decodeBlocks2(lv.blocks, rows, cols)) {
    count.set(b.color, (count.get(b.color) ?? 0) + b.rs * b.cs);
  }
  let best = DEFAULT_COLOR_ID;
  let bestN = -1;
  for (const [color, n] of count) {
    if (n > bestN) {
      best = color;
      bestN = n;
    }
  }
  return best;
}

/** Đổi lưới chung → reset blocks MỌI TẦNG về 1×1, giữ màu chủ đạo từng tầng. */
export function setGrid(layout: KhayLayout, rows: number, cols: number, catalog: KhayCatalog): KhayLayout {
  const levels = layout.levels.map((lv) => ({
    h: lv.h,
    blocks: fullGridBlocks(rows, cols, dominantColor(lv, layout.grid.rows, layout.grid.cols)),
  }));
  return normalizeLayout({ ...layout, grid: { rows, cols }, levels }, catalog);
}

export function setLevelHeight(layout: KhayLayout, li: number, h: number, catalog: KhayCatalog): KhayLayout {
  const levels = layout.levels.map((lv, i) => (i === li ? { ...lv, h } : lv));
  return normalizeLayout({ ...layout, levels }, catalog);
}

/** Thêm tầng mới lên TRÊN CÙNG, copy partition + màu của tầng trên cùng cũ. */
export function addLevel(layout: KhayLayout, catalog: KhayCatalog): KhayLayout {
  const { heightSteps, maxLevels } = catalog.limits;
  if (layout.levels.length >= maxLevels) return layout;
  const used = layout.levels.reduce((s, l) => s + l.h, 0);
  const room = layout.drawer.h - used;
  const fit = heightSteps.filter((s) => s <= room);
  if (!fit.length) return layout; // không còn chỗ — UI disable nút trước
  const top = layout.levels[layout.levels.length - 1];
  const levels = [...layout.levels, { h: Math.max(...fit), blocks: top.blocks }];
  return normalizeLayout({ ...layout, levels }, catalog);
}

export function removeLevel(layout: KhayLayout, li: number, catalog: KhayCatalog): KhayLayout {
  if (layout.levels.length <= 1) return layout;
  const levels = layout.levels.filter((_, i) => i !== li);
  return normalizeLayout({ ...layout, levels }, catalog);
}

/** Thay blocks của 1 tầng (helper nội bộ cho các op sửa block). */
function withLevelBlocks(layout: KhayLayout, li: number, blocks: Block2[]): KhayLayout {
  const levels = layout.levels.map((lv, i) => (i === li ? { ...lv, blocks: encodeBlocks(blocks) } : lv));
  return { ...layout, levels };
}

/**
 * Merge vùng chọn chữ nhật [r0..r1]×[c0..c1] của tầng li (kiểu Excel: vùng
 * chạm block đã merge nào thì NỞ ra ôm trọn block đó, lặp tới ổn định).
 * Khay gộp GIỮ MÀU của block anchor = block chứa ô bắt đầu chọn (r0,c0).
 */
export function mergeRect(layout: KhayLayout, li: number, r0: number, c0: number, r1: number, c1: number): KhayLayout {
  const lv = layout.levels[li];
  if (!lv) return layout;
  const { rows, cols } = layout.grid;
  const blocks = decodeBlocks2(lv.blocks, rows, cols);
  const anchor = blockAt(blocks, r0, c0);
  let [R0, C0, R1, C1] = [Math.min(r0, r1), Math.min(c0, c1), Math.max(r0, r1), Math.max(c0, c1)];
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
  keep.push({ r: R0, c: C0, rs: R1 - R0 + 1, cs: C1 - C0 + 1, color: anchor?.color ?? DEFAULT_COLOR_ID });
  return withLevelBlocks(layout, li, keep);
}

/** Tách block chứa ô (r,c) về các ô 1×1 CÙNG MÀU block cũ. */
export function unmergeAt(layout: KhayLayout, li: number, r: number, c: number): KhayLayout {
  const lv = layout.levels[li];
  if (!lv) return layout;
  const blocks = decodeBlocks2(lv.blocks, layout.grid.rows, layout.grid.cols);
  const target = blockAt(blocks, r, c);
  if (!target || (target.rs === 1 && target.cs === 1)) return layout;
  const keep = blocks.filter((b) => b !== target);
  for (let i = target.r; i < target.r + target.rs; i++)
    for (let j = target.c; j < target.c + target.cs; j++)
      keep.push({ r: i, c: j, rs: 1, cs: 1, color: target.color });
  return withLevelBlocks(layout, li, keep);
}

/** Đổi màu KHAY chứa ô (r,c) của tầng li. */
export function setBlockColor(layout: KhayLayout, li: number, r: number, c: number, colorId: string): KhayLayout {
  const lv = layout.levels[li];
  if (!lv) return layout;
  const blocks = decodeBlocks2(lv.blocks, layout.grid.rows, layout.grid.cols);
  const target = blockAt(blocks, r, c);
  if (!target) return layout;
  const color = validColor(colorId, DEFAULT_COLOR_ID);
  return withLevelBlocks(layout, li, blocks.map((b) => (b === target ? { ...b, color } : b)));
}

/** Sơn TẤT CẢ khay mọi tầng về 1 màu. */
export function setAllColors(layout: KhayLayout, colorId: string): KhayLayout {
  const color = validColor(colorId, DEFAULT_COLOR_ID);
  const { rows, cols } = layout.grid;
  const levels = layout.levels.map((lv) => ({
    h: lv.h,
    blocks: encodeBlocks(decodeBlocks2(lv.blocks, rows, cols).map((b) => ({ ...b, color }))),
  }));
  return { ...layout, levels };
}

// ── Layout → TraySpec2 + cuts (cầu nối sang engine hình học) ────────────────

export interface PlacedTray2 {
  /** 'T{n}-L{l}' — n = thứ tự block row-major trong tầng, l = tầng (1-based). */
  name: string;
  levelIdx: number;
  block: { r: number; c: number; rs: number; cs: number };
  color: string;
  /** Phủ bì + vị trí trong hệ LÒNG ngăn kéo (gốc góc trái-trước). */
  rect: { x: number; y: number; w: number; d: number };
  /** z đáy miếng in khi ĐẶT TRONG ngăn kéo (khay plug lún seatDepth vào dưới). */
  zBase: number;
  /** Chiều cao danh nghĩa của tầng (khác spec.h với khay có plug). */
  nominalH: number;
  spec: TraySpec2;
  /** Đường cắt chia mảnh (rỗng = in nguyên khối). solid2 dựng mộng tại đây. */
  cuts: CutLine[];
}

export function buildAllTrays(
  layout: KhayLayout,
  catalog: KhayCatalog,
): { trays: PlacedTray2[]; warnings: string[] } {
  const { limits, style } = catalog;
  const { minDrawer, maxDrawer } = limits;
  const { drawer } = layout;
  // Chốt cuối drawer — normalizeLayout đã kẹp, đây chặn layout chưa qua normalize.
  if (drawer.w < minDrawer.w || drawer.d < minDrawer.d || drawer.h < minDrawer.h) {
    throw new Error(`Ngăn kéo quá nhỏ: tối thiểu ${minDrawer.w}×${minDrawer.d}×${minDrawer.h}mm`);
  }
  if (drawer.w > maxDrawer.w || drawer.d > maxDrawer.d || drawer.h > maxDrawer.h) {
    throw new Error(`Ngăn kéo quá lớn: tối đa ${maxDrawer.w}×${maxDrawer.d}×${maxDrawer.h}mm`);
  }
  const stack = stackingDims(style, limits);
  const minTray = minTrayMm(catalog);
  const warnings: string[] = [];
  const totalH = layout.levels.reduce((s, l) => s + l.h, 0);
  if (totalH > drawer.h) warnings.push(`Tổng cao các tầng ${totalH}mm vượt lòng ngăn kéo ${drawer.h}mm`);

  const trays: PlacedTray2[] = [];
  let below: Block2[] = []; // blocks tầng NGAY DƯỚI — đối chiếu sinh plug
  let rimZ = 0; // Σ cao danh nghĩa các tầng dưới = z miệng tầng dưới cùng đã đặt
  for (let li = 0; li < layout.levels.length; li++) {
    const lv = layout.levels[li];
    const blocks = decodeBlocks2(lv.blocks, layout.grid.rows, layout.grid.cols)
      .slice()
      .sort((a, b) => a.r - b.r || a.c - b.c); // đánh số row-major ổn định
    for (let n = 0; n < blocks.length; n++) {
      const b = blocks[n];
      const name = `T${n + 1}-L${li + 1}`;
      const rect = trayRectOf(layout, catalog, b);
      if (rect.w < minTray - 1e-9 || rect.d < minTray - 1e-9) {
        throw new Error(
          `Khay ${name} nhỏ hơn tối thiểu ${minTray}mm (${rect.w.toFixed(1)}×${rect.d.toFixed(1)}mm) — giảm số cột/hàng lưới`,
        );
      }
      // Plug: chỉ khi tầng dưới có block TRÙNG KHỚP (miệng dưới ôm đúng chân trên).
      const matched =
        li > 0 && below.some((u) => u.r === b.r && u.c === b.c && u.rs === b.rs && u.cs === b.cs);
      if (li > 0 && !matched) {
        warnings.push(`Khay ${name} gác lên nhiều khay dưới — đáy phẳng, không có chân định vị`);
      }
      const hasPlug = li > 0 && matched;
      const h = lv.h + (hasPlug ? stack.seatDepth : 0);
      const zBase = rimZ - (hasPlug ? stack.seatDepth : 0);
      // Cắt mảnh: mỗi trục vượt maxPieceMm → chia đều n mảnh, territory ≤ maxPieceMm.
      const nx = Math.ceil(rect.w / limits.maxPieceMm);
      const ny = Math.ceil(rect.d / limits.maxPieceMm);
      if (nx * ny > limits.maxPiecesPerTray) {
        throw new Error(
          `Khay ${name} quá lớn: phải cắt ${nx}×${ny} = ${nx * ny} mảnh, vượt trần ${limits.maxPiecesPerTray} — chia khay nhỏ lại trên lưới`,
        );
      }
      const cuts: CutLine[] = [];
      for (let i = 1; i < nx; i++) cuts.push({ axis: 'x', at: (i * rect.w) / nx });
      for (let i = 1; i < ny; i++) cuts.push({ axis: 'y', at: (i * rect.d) / ny });
      trays.push({
        name,
        levelIdx: li,
        block: { r: b.r, c: b.c, rs: b.rs, cs: b.cs },
        color: b.color,
        rect,
        zBase,
        nominalH: lv.h,
        spec: {
          name,
          w: rect.w,
          d: rect.d,
          h,
          style,
          plug: hasPlug
            ? { inset: stack.plugInset, height: limits.lipH, chamferH: stack.chamferH }
            : undefined,
        },
        cuts,
      });
    }
    below = blocks;
    rimZ += lv.h;
  }
  return { trays, warnings };
}

// ── Serialize (param `layout` cho ?c= / order payload giai đoạn B) ───────────

export function serializeLayout(layout: KhayLayout): string {
  return JSON.stringify(layout);
}

export function parseLayout(s: string, catalog: KhayCatalog): KhayLayout | null {
  try {
    const obj = JSON.parse(s) as KhayLayout;
    if (obj?.v !== 2 || !obj.drawer || !obj.grid || !Array.isArray(obj.levels)) return null;
    return normalizeLayout(obj, catalog);
  } catch {
    return null;
  }
}
