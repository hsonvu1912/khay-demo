// =============================================================================
// ContextMenu — menu chuột phải / long-press trên ô lưới: "Gộp N ô thành 1
// khay" · "Tách khay này" · 8 swatch màu enabled đầu (đổi màu KHAY chứa anchor
// selection qua setBlockColor) · "Tất cả màu…".
// Paper-card fixed tại (x,y) kẹp viewport; click ngoài / Escape / selection
// biến mất → đóng.
// =============================================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { PLA_MATTE_PALETTE } from '@/engine/palette';
import { colorEnabled } from '@/engine/catalog';
import type { KhaySheet } from './useKhaySheet';

function MenuButton({
  label,
  hint,
  disabled,
  reason,
  onClick,
}: {
  label: ReactNode;
  /** Chú thích nhỏ bên phải khi enabled. */
  hint?: string;
  disabled?: boolean;
  /** Lý do nhỏ hiện khi disabled (kèm title). */
  reason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? reason : hint}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-medium transition-colors duration-150 ${
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <span className="flex-1">{label}</span>
      {disabled && reason && (
        <span className="max-w-[120px] text-right text-[10px] leading-tight opacity-70">
          {reason}
        </span>
      )}
    </button>
  );
}

const Divider = () => <div className="my-1 border-t border-[var(--color-line)]" />;

export function ContextMenu({
  x,
  y,
  sheet,
  onClose,
  onOpenColors,
}: {
  x: number;
  y: number;
  sheet: KhaySheet;
  onClose: () => void;
  onOpenColors: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Đóng khi click ngoài / Escape.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Kẹp trong viewport (menu có thể tràn phải/dưới khi mở sát mép).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth)
      el.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
    if (r.bottom > window.innerHeight)
      el.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
  }, [x, y]);

  // Selection biến mất (layout đổi/bỏ chọn) → tự đóng, tránh menu "mở" vô hình
  // kẹt state ở KhayApp (không còn DOM để click-ngoài đóng).
  const sel = sheet.selection;
  useEffect(() => {
    if (!sel) onClose();
  }, [sel, onClose]);

  if (!sel) return null;
  const cellCount = (Math.abs(sel.r1 - sel.r0) + 1) * (Math.abs(sel.c1 - sel.c0) + 1);
  const currentColor = sheet.selectedBlock?.color;
  // 8 màu enabled đầu — đủ bảng thì mở panel qua "Tất cả màu…".
  const swatches = PLA_MATTE_PALETTE.filter((c) => colorEnabled(sheet.catalog, c.id)).slice(0, 8);

  const wrap = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="paper-pop anim-fade-up fixed z-50 w-60 p-1.5"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuButton
        label={`Gộp ${cellCount} ô thành 1 khay`}
        hint="Vùng chọn thành 1 khay rời"
        disabled={!sheet.canMergeSelection}
        reason="Kéo chọn từ 2 ô trở lên"
        onClick={wrap(sheet.mergeSelection)}
      />
      <MenuButton
        label="Tách khay này"
        hint="Trả khay gộp về các ô nhỏ"
        disabled={!sheet.canUnmergeSelection}
        reason="Khay chưa được gộp"
        onClick={wrap(sheet.unmergeSelection)}
      />
      <Divider />
      <div className="muuto-label px-2 pb-1.5 pt-1 text-[var(--color-ink-3)]">
        Màu khay{sheet.selectedTray ? ` · ${sheet.selectedTray.name}` : ''}
      </div>
      <div className="grid grid-cols-8 gap-1 px-1.5 pb-1.5">
        {swatches.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.nameVi}
            aria-label={c.nameVi}
            onClick={wrap(() => sheet.setBlockColor(c.id))}
            className={`h-6 w-6 rounded-full border transition-transform duration-150 hover:scale-110 ${
              currentColor === c.id
                ? 'border-2 border-[var(--color-ink)]'
                : 'border-black/15'
            }`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
      <MenuButton label="Tất cả màu…" hint="Mở bảng màu đầy đủ" onClick={wrap(onOpenColors)} />
    </div>
  );
}
