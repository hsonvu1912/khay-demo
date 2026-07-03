// =============================================================================
// TopBar — capsule giấy nổi: wordmark "khay" + phụ đề · badge cảnh báo ·
// undo · "Đo ngăn kéo" · giá chạy số (click → chi tiết giá) + chú gram/khay ·
// primary "Tải file in" (spinner khi đang tạo ZIP) · ⚙ settings.
// =============================================================================
import { useIsMobile, usePriceTicker } from './hooks';
import { Btn, IconBtn } from './bits';
import type { KhaySheet } from './useKhaySheet';

function formatPrice(v: number): string {
  return `${Math.round(v).toLocaleString('vi-VN')} ₫`;
}

const UndoIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6.5 3.5 3 7l3.5 3.5M3 7h6a4 4 0 0 1 0 8H7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RulerIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="5.5" width="13" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M4.5 5.5v2M7 5.5v3M9.5 5.5v2M12 5.5v3"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

// Sliders (tune) — đọc ra "cài đặt" ngay; bánh răng tia thẳng dễ nhầm icon sáng/tối
const GearIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 4h2.4M7.6 4H14M2 8h6.9M12.1 8H14M2 12h1.4M6.6 12H14"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle cx="6" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="10.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const Spinner = (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function TopBar({
  sheet,
  onOpenSettings,
  onOpenGuide,
  onOpenPrice,
  onExport,
  exporting,
}: {
  sheet: KhaySheet;
  onOpenSettings: () => void;
  onOpenGuide: () => void;
  onOpenPrice: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const isMobile = useIsMobile();
  const shown = usePriceTicker(sheet.price.total);
  // Touch target ≥44px trên mobile (audit ngan); desktop giữ 32 cho gọn bar
  const iconSize = isMobile ? 42 : 32;
  const problems = [
    ...sheet.built.warnings,
    ...(sheet.buildError ? [sheet.buildError] : []),
  ];
  return (
    <header
      className={`paper-card anim-fade-up absolute left-3 right-3 top-3 z-30 flex items-center ${
        isMobile ? 'gap-0.5 px-2.5' : 'gap-1.5 px-4'
      }`}
      style={{ height: isMobile ? 52 : 56, borderRadius: 999 }}
    >
      <span className={`wordmark shrink-0 leading-none ${isMobile ? 'text-[19px]' : 'text-[22px]'}`}>
        khay
      </span>
      {!isMobile && (
        <span className="muuto-label ml-1 mt-1 shrink-0 text-[var(--color-ink-3)]">
          chia ngăn kéo in 3D
        </span>
      )}
      <span className={`ml-auto flex items-center ${isMobile ? 'gap-0' : 'gap-1'}`}>
        {problems.length > 0 && (
          <span
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2.5 text-[12px] font-medium"
            title={problems.join('\n')}
          >
            ⚠ {problems.length}
          </span>
        )}
        {/* Luôn hiện (disabled khi chưa có lịch sử) — biến mất làm user mất phương hướng */}
        <IconBtn
          label={UndoIcon}
          title={sheet.canUndo ? 'Hoàn tác' : 'Chưa có thay đổi để hoàn tác'}
          disabled={!sheet.canUndo}
          onClick={sheet.undo}
          size={iconSize}
        />
        {isMobile ? (
          <IconBtn label={RulerIcon} title="Hướng dẫn đo lòng ngăn kéo" onClick={onOpenGuide} size={iconSize} />
        ) : (
          <Btn onClick={onOpenGuide} title="Hướng dẫn đo lòng ngăn kéo">
            Đo ngăn kéo
          </Btn>
        )}
        <span className="mx-1 hidden h-5 w-px bg-[var(--color-line)] md:block" />
        <button
          type="button"
          onClick={onOpenPrice}
          title="Giá tạm tính — bấm xem chi tiết"
          className="flex shrink-0 flex-col items-end rounded-[9px] px-1.5 py-0.5 leading-none transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <span className="flex items-center gap-1.5">
            {/* Chấm nhỏ nhấp nháy khi CSG đang dựng lại mesh nền. */}
            {sheet.building && (
              <span
                className="inline-block h-[7px] w-[7px] animate-pulse rounded-full bg-[var(--color-ink-3)]"
                title="Đang dựng hình 3D…"
                aria-label="Đang dựng hình 3D"
              />
            )}
            <span
              className={`num whitespace-nowrap font-bold tracking-tight ${
                isMobile ? 'text-[14.5px]' : 'text-[18px]'
              }`}
            >
              {formatPrice(shown)}
            </span>
          </span>
          <span className="mt-[3px] whitespace-nowrap text-[10.5px] text-[var(--color-ink-3)]">
            ~{Math.round(sheet.price.totalGrams)}g · {sheet.trayCount} khay
            {sheet.pieceCount > sheet.trayCount ? ` · ${sheet.pieceCount} mảnh` : ''}
          </span>
        </button>
        {isMobile ? (
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            title="Tải ZIP file STL để in"
            className={`ml-0.5 inline-flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium text-white transition-colors ${
              exporting ? 'cursor-wait bg-[var(--color-ink)]/70' : 'bg-[var(--color-ink)] hover:bg-black'
            }`}
          >
            {exporting ? Spinner : null}
            {exporting ? 'Đang tạo…' : 'Tải file in'}
          </button>
        ) : (
          <Btn solid onClick={onExport} disabled={exporting} title="Tải ZIP file STL để in">
            {exporting ? Spinner : null}
            {exporting ? 'Đang tạo…' : 'Tải file in'}
          </Btn>
        )}
        <IconBtn label={GearIcon} title="Cài đặt sản phẩm (demo admin)" onClick={onOpenSettings} size={iconSize} />
      </span>
    </header>
  );
}
