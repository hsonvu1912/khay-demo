// =============================================================================
// DockPanel — panel mở TỪ BottomDock, ở LỚP RIÊNG phía trên dock (port pattern
// ngan-excel-demo: không nằm trong container cuộn ngang nên không bị cắt).
//   · desktop: thẻ giấy nổi ngay trên dock, giữa màn hình
//   · mobile : bottom sheet trượt lên (tay nắm + ✕), che dock
// Nội dung 4 tab:
//   'drawer' — W/D/H lòng ngăn kéo (slider rAF + nhập số) + độ vừa + info tiling
//   'levels' — nấc cao từng tầng (chặn nấc làm Σ vượt lòng)
//   'grid'   — hàng/cột khay đang chọn + gộp/tách ô
//   'color'  — màu PLA Matte cho khay đang chọn / tất cả khay
// =============================================================================
import { useEffect, type ReactNode } from 'react';
import { colorEnabled, type FitId } from '@/engine/catalog';
import { maxAxisCells } from '@/engine/layout';
import { findColor, PLA_MATTE_PALETTE } from '@/engine/palette';
import { Btn, IconBtn, Segmented } from './bits';
import { useIsMobile, useRafParam } from './hooks';
import { IconClose, IconMerge, IconMinus, IconPlus, IconSplit } from './icons';
import type { KhaySheet } from './useKhaySheet';

export type DockTab = null | 'drawer' | 'levels' | 'grid' | 'color';

/** Khay đang thao tác (grid/color): theo selection, không có thì khay 1 tầng active. */
export function targetTray(sheet: KhaySheet): { li: number; ti: number } {
  return {
    li: sheet.selection?.level ?? sheet.activeLevel,
    ti: sheet.selection?.tray ?? 0,
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="muuto-label text-[var(--color-ink-3)]">{label}</div>
      {children}
    </div>
  );
}

// ── Panel Ngăn kéo ───────────────────────────────────────────────────────────

const FIT_OPTIONS: { value: FitId; label: string }[] = [
  { value: 'long', label: 'Lỏng' },
  { value: 'chuan', label: 'Chuẩn' },
  { value: 'chat', label: 'Khít' },
];

function DrawerContent({ sheet, onOpenGuide }: { sheet: KhaySheet; onOpenGuide: () => void }) {
  const rafSetDrawer = useRafParam(sheet.setDrawer);
  const { minDrawer, maxDrawer, maxTrayMm, fitClearanceMm } = sheet.catalog.limits;
  const drawer = sheet.layout.drawer;
  const tiling = sheet.built.tiling;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const axis = (key: 'w' | 'd' | 'h', label: string) => {
    const min = minDrawer[key];
    const max = maxDrawer[key];
    const value = drawer[key];
    return (
      <Row label={label}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            className="ke-slider min-w-0 flex-1"
            min={min}
            max={max}
            step={1}
            value={clamp(value, min, max)}
            aria-label={label}
            onChange={(e) => rafSetDrawer({ ...drawer, [key]: Number(e.target.value) })}
          />
          <span className="flex shrink-0 items-baseline gap-0.5">
            {/* Nhập số chính xác (khách đo thước) — commit khi blur/Enter, clamp min/max. */}
            <input
              type="number"
              className="num w-[62px] rounded-[8px] border border-[var(--color-line)] bg-white px-1.5 py-1 text-right text-[13px] font-bold focus:border-[var(--color-ink)]"
              min={min}
              max={max}
              defaultValue={value}
              key={value}
              aria-label={`${label} (mm)`}
              onBlur={(e) => {
                const v = clamp(Number(e.target.value) || value, min, max);
                if (v !== value) sheet.setDrawer({ ...drawer, [key]: v });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="text-[10.5px] font-medium text-[var(--color-ink-3)]">mm</span>
          </span>
        </div>
        <div className="num flex justify-between text-[9.5px] text-[var(--color-ink-3)]">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </Row>
    );
  };

  return (
    <div className="space-y-4">
      {axis('w', 'Rộng (W)')}
      {axis('d', 'Sâu (D)')}
      {axis('h', 'Cao lòng (H)')}
      <Row label="Độ vừa">
        <Segmented
          options={FIT_OPTIONS.map((o) => ({
            ...o,
            title: `${o.label} — hở ${fitClearanceMm[o.value]}mm mỗi cạnh`,
          }))}
          value={sheet.layout.fit}
          onChange={(f) => sheet.setFit(f)}
        />
      </Row>
      <p className="text-[11px] leading-relaxed text-[var(--color-ink-3)]">
        Chia thành{' '}
        <b className="num font-bold text-[var(--color-ink-2)]">
          {tiling.cols}×{tiling.rows}
        </b>{' '}
        khay (mỗi khay ≤ {maxTrayMm}mm — vừa bàn in).{' '}
        <button
          type="button"
          onClick={onOpenGuide}
          className="font-medium text-[var(--color-ink)] underline underline-offset-2 hover:opacity-70"
        >
          Cách đo lòng ngăn kéo
        </button>
      </p>
    </div>
  );
}

// ── Panel Tầng ───────────────────────────────────────────────────────────────

/** Segmented có disabled từng nấc (bits.Segmented không hỗ trợ) — style đồng bộ. */
function StepSeg({
  steps,
  value,
  isDisabled,
  onChange,
}: {
  steps: number[];
  value: number;
  isDisabled: (s: number) => boolean;
  onChange: (s: number) => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-[var(--color-surface-2)] p-0.5 no-scrollbar">
      {steps.map((s) => {
        const off = s !== value && isDisabled(s);
        return (
          <button
            key={s}
            type="button"
            disabled={off}
            title={off ? `Nấc ${s}mm làm tổng cao vượt lòng ngăn kéo` : `Nấc cao ${s}mm`}
            onClick={() => onChange(s)}
            className={`num shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors duration-150 ${
              s === value
                ? 'bg-[var(--color-ink)] text-white shadow-sm'
                : off
                  ? 'cursor-not-allowed text-[var(--color-ink-3)]/50'
                  : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function LevelsContent({ sheet }: { sheet: KhaySheet }) {
  const { heightSteps } = sheet.catalog.limits;
  const steps = [...heightSteps].sort((a, b) => a - b);
  const levels = sheet.layout.levels;
  const drawerH = sheet.layout.drawer.h;
  const sumH = levels.reduce((s, l) => s + l.h, 0);
  return (
    <div className="space-y-4">
      {levels.map((lv, li) => {
        const others = sumH - lv.h; // Σ các tầng còn lại
        return (
          <Row key={li} label={`Tầng ${li + 1} — nấc cao (mm)`}>
            <StepSeg
              steps={steps}
              value={lv.h}
              isDisabled={(s) => others + s > drawerH}
              onChange={(s) => sheet.setLevelHeight(li, s)}
            />
          </Row>
        );
      })}
      <p className="num text-[11px] font-medium text-[var(--color-ink-3)]">
        Σ cao {sumH}mm / lòng {drawerH}mm
      </p>
    </div>
  );
}

// ── Panel Lưới ───────────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium">
        {label} <span className="num text-[10px] text-[var(--color-ink-3)]">(1–{max})</span>
      </span>
      <span className="flex items-center gap-0.5 rounded-full bg-[var(--color-surface-2)] p-0.5">
        <IconBtn
          label={<IconMinus size={13} />}
          title={`Giảm ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          size={28}
        />
        <span className="num w-7 text-center text-[14px] font-bold">{value}</span>
        <IconBtn
          label={<IconPlus size={13} />}
          title={`Tăng ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          size={28}
        />
      </span>
    </div>
  );
}

function GridContent({ sheet }: { sheet: KhaySheet }) {
  const { li, ti } = targetTray(sheet);
  const tray = sheet.layout.levels[li]?.trays[ti];
  const tile = sheet.built.tiling.tiles[ti];
  if (!tray || !tile) {
    return <p className="text-[12px] text-[var(--color-ink-3)]">Chưa có khay để chỉnh — kiểm tra lại kích thước ngăn kéo.</p>;
  }
  const maxR = maxAxisCells(tile.d, sheet.catalog);
  const maxC = maxAxisCells(tile.w, sheet.catalog);
  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <Stepper label="Hàng" value={tray.rows} min={1} max={maxR} onChange={(r) => sheet.setTrayGrid(li, ti, r, tray.cols)} />
        <Stepper label="Cột" value={tray.cols} min={1} max={maxC} onChange={(c) => sheet.setTrayGrid(li, ti, tray.rows, c)} />
        <p className="text-[10.5px] leading-relaxed text-[var(--color-ink-3)]">
          Đổi hàng/cột sẽ đặt lại các ô đã gộp của khay này.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn
          title={sheet.canMergeSelection ? 'Gộp vùng ô đang chọn thành 1 ngăn lớn' : 'Chọn từ 2 ô trở lên (cùng khay) để gộp'}
          disabled={!sheet.canMergeSelection}
          onClick={sheet.mergeSelection}
        >
          <IconMerge /> Gộp ô đã chọn
        </Btn>
        <Btn
          title={sheet.canUnmergeSelection ? 'Tách ô gộp về các ô nhỏ như cũ' : 'Chọn 1 ô đã gộp để tách'}
          disabled={!sheet.canUnmergeSelection}
          onClick={sheet.unmergeSelection}
        >
          <IconSplit /> Tách ô
        </Btn>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-ink-3)]">
        Chọn nhiều ô: kéo chuột/tay trên mô hình 3D.
      </p>
    </div>
  );
}

// ── Panel Màu ────────────────────────────────────────────────────────────────

function ColorContent({ sheet }: { sheet: KhaySheet }) {
  const { li, ti } = targetTray(sheet);
  const tray = sheet.layout.levels[li]?.trays[ti];
  const colors = PLA_MATTE_PALETTE.filter((c) => colorEnabled(sheet.catalog, c.id));
  if (!tray) {
    return <p className="text-[12px] text-[var(--color-ink-3)]">Chưa có khay để đổi màu.</p>;
  }
  const current = findColor(tray.color);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-[22px] w-[22px] shrink-0 rounded-full"
          style={{ background: current.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)' }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{current.nameVi}</span>
        <span className="shrink-0 text-[10.5px] text-[var(--color-ink-3)]">PLA Matte · {current.name}</span>
      </div>
      <div className="grid grid-cols-5 gap-x-1.5 gap-y-2">
        {colors.map((c) => {
          const selected = c.id === tray.color;
          return (
            <button
              key={c.id}
              type="button"
              title={`${c.nameVi} (${c.name})`}
              onClick={() => sheet.setTrayColor(li, ti, c.id)}
              className="group flex min-w-0 flex-col items-center gap-1"
            >
              <span
                aria-hidden
                className="h-7 w-7 rounded-full transition-transform duration-150 group-hover:scale-110"
                style={{
                  background: c.hex, // swatch luôn dùng hex gốc (previewHex chỉ cho 3D)
                  boxShadow: selected
                    ? 'inset 0 0 0 2px var(--color-ink), inset 0 0 0 4px #fff'
                    : 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                }}
              />
              <span
                className={`w-full truncate text-center text-[9.5px] leading-tight ${
                  selected ? 'font-semibold text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'
                }`}
              >
                {c.nameVi}
              </span>
            </button>
          );
        })}
      </div>
      <Btn
        title={`Đổi tất cả khay (mọi tầng) sang màu ${current.nameVi}`}
        onClick={() => sheet.setAllTrayColors(tray.color)}
        className="w-full"
      >
        Áp «{current.nameVi}» cho tất cả khay
      </Btn>
    </div>
  );
}

// ── Khung panel (desktop nổi trên dock · mobile bottom-sheet) ────────────────

const TITLES: Record<Exclude<DockTab, null>, string> = {
  drawer: 'Ngăn kéo',
  levels: 'Tầng',
  grid: 'Lưới ngăn',
  color: 'Màu khay',
};

export function DockPanel({
  sheet,
  tab,
  onClose,
  onOpenGuide,
}: {
  sheet: KhaySheet;
  tab: DockTab;
  onClose: () => void;
  onOpenGuide: () => void;
}) {
  const isMobile = useIsMobile();
  // Esc đóng panel (a11y) — hook gọi TRƯỚC early-return để giữ thứ tự hooks.
  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, onClose]);

  if (!tab) return null;
  const body =
    tab === 'drawer' ? (
      <DrawerContent sheet={sheet} onOpenGuide={onOpenGuide} />
    ) : tab === 'levels' ? (
      <LevelsContent sheet={sheet} />
    ) : tab === 'grid' ? (
      <GridContent sheet={sheet} />
    ) : (
      <ColorContent sheet={sheet} />
    );
  // Subtitle ngữ cảnh: grid/color thao tác trên KHAY nào (audit ngan: echo đích).
  const { li, ti } = targetTray(sheet);
  const subtitle = tab === 'grid' || tab === 'color' ? `Khay ${ti + 1} · Tầng ${li + 1}` : null;

  const header = (closeSize: string) => (
    <div className="mb-3 flex items-center justify-between">
      <span className="muuto-label">
        {TITLES[tab]}
        {subtitle && (
          <span className="ml-1.5 normal-case tracking-normal text-[var(--color-ink-2)]">· {subtitle}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className={`inline-flex items-center justify-center rounded-full text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] ${closeSize}`}
      >
        <IconClose size={14} />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div className="anim-fade fixed inset-0 z-40 bg-black/20" onClick={onClose} />
        <div className="anim-sheet fixed inset-x-0 bottom-0 z-50 max-h-[72dvh] overflow-y-auto rounded-t-[22px] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--color-line)]" />
          {header('h-9 w-9')}
          {body}
        </div>
      </>
    );
  }
  // Desktop: thẻ giấy nổi ngay trên dock, giữa màn hình (clamp theo viewport).
  const width = Math.min(400, window.innerWidth - 24);
  return (
    <div
      className="paper-pop anim-fade-up absolute bottom-[84px] left-1/2 z-30 -translate-x-1/2 p-4"
      style={{ width, borderRadius: 20 }}
    >
      {header('h-7 w-7')}
      {body}
    </div>
  );
}
