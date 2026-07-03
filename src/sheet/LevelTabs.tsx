// =============================================================================
// LevelTabs — cụm nổi dưới TopBar (trái): tab "Tầng 1..N" (kèm nấc cao) +
// "+ Tầng" + xoá tầng đang chọn (confirm nhẹ 2 bước, tự huỷ sau 2.5s).
// Tầng 1 = dưới cùng (levels[0]) — khớp thứ tự xếp chồng trong mô hình 3D.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import type { KhaySheet } from './useKhaySheet';
import { IconMinus, IconPlus } from './icons';

export function LevelTabs({ sheet }: { sheet: KhaySheet }) {
  const { layout, catalog, activeLevel } = sheet;
  const { heightSteps, maxLevels } = catalog.limits;
  const levels = layout.levels;
  const sumH = levels.reduce((s, l) => s + l.h, 0);
  const minStep = Math.min(...heightSteps);
  const atMax = levels.length >= maxLevels;
  const noRoom = sumH + minStep > layout.drawer.h;
  const canAdd = !atMax && !noRoom;
  const addTitle = atMax
    ? `Tối đa ${maxLevels} tầng`
    : noRoom
      ? 'Không đủ chiều cao lòng ngăn kéo để thêm tầng'
      : 'Thêm 1 tầng xếp chồng lên trên';

  // Confirm nhẹ cho nút xoá: bấm 1 → "Xoá?", bấm 2 → xoá; tự huỷ sau 2.5s.
  const [confirming, setConfirming] = useState(false);
  const timer = useRef(0);
  useEffect(() => setConfirming(false), [activeLevel, levels.length]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const askRemove = () => {
    if (!confirming) {
      setConfirming(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setConfirming(false), 2500);
      return;
    }
    window.clearTimeout(timer.current);
    setConfirming(false);
    sheet.removeLevel(activeLevel);
  };

  return (
    <div className="paper-card anim-fade-up absolute left-3 top-[76px] z-20 flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto px-1.5 py-1.5 no-scrollbar" style={{ borderRadius: 999 }}>
      {levels.map((lv, i) => {
        const active = i === activeLevel;
        return (
          <button
            key={i}
            type="button"
            title={`Tầng ${i + 1} — nấc cao ${lv.h}mm${active ? ' (đang chỉnh)' : ''}`}
            onClick={() => sheet.setActiveLevel(i)}
            className={`flex shrink-0 flex-col items-center rounded-full px-3.5 py-1 transition-colors duration-150 ${
              active
                ? 'bg-[var(--color-ink)] text-white'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
            }`}
          >
            <span className="text-[12px] font-semibold leading-tight">Tầng {i + 1}</span>
            <span className={`num text-[9.5px] font-medium leading-tight ${active ? 'text-white/75' : 'text-[var(--color-ink-3)]'}`}>
              {lv.h}mm
            </span>
          </button>
        );
      })}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-[var(--color-line)]" />
      <button
        type="button"
        disabled={!canAdd}
        title={addTitle}
        onClick={sheet.addLevel}
        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-150 ${
          canAdd
            ? 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
            : 'cursor-not-allowed text-[var(--color-ink-3)]/60'
        }`}
      >
        <IconPlus size={13} /> Tầng
      </button>
      {levels.length > 1 && (
        <button
          type="button"
          title={confirming ? 'Bấm lần nữa để xoá' : `Xoá tầng ${activeLevel + 1} (đang chọn)`}
          onClick={askRemove}
          className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
            confirming
              ? 'bg-[#b3261e] px-2.5 text-[11.5px] font-semibold text-white'
              : 'w-8 text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
          }`}
        >
          {confirming ? 'Xoá?' : <IconMinus size={13} />}
        </button>
      )}
    </div>
  );
}
