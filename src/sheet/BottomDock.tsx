// =============================================================================
// BottomDock — capsule giấy nổi giữa-dưới (desktop + mobile), 4 tab mở panel:
//   Ngăn kéo · Tầng · Lưới · Màu   (panel render Ở LỚP RIÊNG — DockPanel)
// Bấm tab đang mở = đóng. Nút "Màu" hiện swatch màu khay đang thao tác thay
// icon (nhìn phát biết ngay màu hiện tại — pattern nút Vật liệu của ngan).
// =============================================================================
import type { ReactNode } from 'react';
import { findColor } from '@/engine/palette';
import { useIsMobile } from './hooks';
import { IconCaret, IconGrid, IconLayer, IconPalette, IconRuler } from './icons';
import type { DockTab } from './DockPanel';
import type { KhaySheet } from './useKhaySheet';

function DockBtn({
  children,
  title,
  active,
  onClick,
  caption,
}: {
  children: ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
  /** Mobile: nhãn 8.5px dưới icon — icon không nhãn là icon vô nghĩa (audit ngan). */
  caption?: string;
}) {
  const stateCls = active
    ? 'bg-[var(--color-ink)] text-white'
    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]';
  if (caption) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={`inline-flex h-11 w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] transition-colors duration-150 ${stateCls}`}
      >
        {children}
        <span className="text-[9.5px] font-semibold leading-none">{caption}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-150 ${stateCls}`}
    >
      {children}
    </button>
  );
}

export function BottomDock({
  sheet,
  tab,
  setTab,
}: {
  sheet: KhaySheet;
  tab: DockTab;
  setTab: (t: DockTab) => void;
}) {
  const isMobile = useIsMobile();
  const toggle = (t: Exclude<DockTab, null>) => setTab(tab === t ? null : t);

  // Swatch màu khay đang thao tác cho nút "Màu" (cùng đích với panel):
  // khay đang chọn, không có thì khay đầu tiên.
  const trayColor = sheet.selectedTray?.color ?? sheet.built.trays[0]?.color;
  const swatch = trayColor ? (
    <span
      aria-hidden
      className="h-[17px] w-[17px] shrink-0 rounded-full"
      style={{ background: findColor(trayColor).hex, boxShadow: 'inset 0 0 0 1.5px rgba(28,26,23,0.35)' }}
    />
  ) : (
    <IconPalette />
  );

  const tabs: { id: Exclude<DockTab, null>; label: string; icon: ReactNode; title: string }[] = [
    { id: 'drawer', label: 'Ngăn kéo', icon: <IconRuler />, title: 'Kích thước lòng ngăn kéo + độ vừa' },
    { id: 'levels', label: 'Tầng', icon: <IconLayer />, title: 'Nấc cao từng tầng xếp chồng' },
    { id: 'grid', label: 'Lưới', icon: <IconGrid />, title: 'Chia hàng/cột + gộp/tách ô khay đang chọn' },
    { id: 'color', label: 'Màu', icon: swatch, title: 'Màu nhựa PLA Matte từng khay' },
  ];

  return (
    <div
      className="paper-pop anim-rise absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-0.5 px-1.5 py-1.5 md:bottom-5"
      style={{ borderRadius: 999 }}
    >
      {tabs.map((t) => (
        <DockBtn
          key={t.id}
          title={t.title}
          active={tab === t.id}
          onClick={() => toggle(t.id)}
          caption={isMobile ? t.label : undefined}
        >
          {t.icon}
          {!isMobile && <span>{t.label}</span>}
          {!isMobile && <IconCaret open={tab === t.id} />}
        </DockBtn>
      ))}
    </div>
  );
}
