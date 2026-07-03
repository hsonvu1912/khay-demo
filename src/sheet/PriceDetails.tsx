// =============================================================================
// PriceDetails — popover chi tiết giá neo dưới price ticker của TopBar:
// bảng từng khay (tên T{n}-L{n} · chấm màu · ~gram · thành tiền, đã gồm phí
// mỗi khay) + tách nhựa/phí + giá sàn (nếu áp) + tổng. Đọc sheet.price.lines.
// =============================================================================
import { useEffect } from 'react';
import { useIsMobile } from './hooks';
import { findColor } from '@/engine/palette';
import type { KhaySheet } from './useKhaySheet';

function formatPrice(v: number): string {
  return `${Math.round(v).toLocaleString('vi-VN')} ₫`;
}

export function PriceDetails({
  sheet,
  open,
  onClose,
}: {
  sheet: KhaySheet;
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();

  // Esc đóng popover
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const p = sheet.price;
  // total = max(minOrder, round(raw/1000)) → so với raw đã tròn biết giá sàn có áp
  const rounded = Math.round((p.materialCost + p.baseFees) / 1000) * 1000;
  const floorApplied = p.total > rounded;

  return (
    <>
      {/* backdrop trong suốt: click ngoài đóng */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`paper-pop anim-fade-up fixed z-50 p-4 ${
          isMobile ? 'left-3 right-3 top-[64px]' : 'right-3 top-[68px] w-[350px]'
        }`}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <span className="muuto-label">Chi tiết giá</span>
          <span className="num text-[11px] text-[var(--color-ink-3)]">
            {p.trayCount} khay · ~{Math.round(p.totalGrams)}g
          </span>
        </div>

        {/* Bảng từng khay */}
        <div className="mt-2.5 max-h-[42vh] overflow-y-auto">
          {p.lines.map((ln, i) => {
            const c = findColor(ln.color);
            return (
              <div key={`${ln.name}-${i}`} className="flex items-center gap-2 py-[4.5px]">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                  style={{ background: c.hex }}
                  title={`${c.nameVi} (${c.name})`}
                />
                <span className="num w-[56px] shrink-0 text-[12px] font-medium">{ln.name}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-ink-3)]">
                  {c.nameVi}
                </span>
                <span className="num w-[44px] shrink-0 text-right text-[11px] text-[var(--color-ink-3)]">
                  ~{Math.round(ln.grams)}g
                </span>
                <span className="num w-[78px] shrink-0 whitespace-nowrap text-right text-[12px]">
                  {formatPrice(ln.price)}
                </span>
              </div>
            );
          })}
          {p.lines.length === 0 && (
            <p className="py-2 text-[11.5px] text-[var(--color-ink-3)]">Chưa có khay nào.</p>
          )}
        </div>

        {/* Tách nhựa / phí — mỗi dòng khay ở trên ĐÃ gồm phí xử lý */}
        <div className="mt-2 space-y-1 border-t border-[var(--color-line)] pt-2.5">
          <div className="flex items-baseline justify-between text-[11.5px] text-[var(--color-ink-2)]">
            <span>
              Nhựa ~{Math.round(p.totalGrams)}g × {formatPrice(sheet.catalog.pricing.pricePerGram)}/g
            </span>
            <span className="num">{formatPrice(p.materialCost)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[11.5px] text-[var(--color-ink-2)]">
            <span>
              Phí xử lý {p.trayCount} khay × {formatPrice(sheet.catalog.pricing.baseFeePerTray)}
            </span>
            <span className="num">{formatPrice(p.baseFees)}</span>
          </div>
          {floorApplied && (
            <div className="flex items-baseline justify-between text-[11.5px] text-[var(--color-ink-2)]">
              <span>Áp giá sàn mỗi đơn</span>
              <span className="num">{formatPrice(sheet.catalog.pricing.minOrder)}</span>
            </div>
          )}
        </div>

        {/* Tổng */}
        <div className="mt-2 flex items-baseline justify-between border-t border-[var(--color-line)] pt-2.5">
          <span className="text-[12.5px] font-semibold">Tổng</span>
          <span className="num text-[17px] font-bold tracking-tight">{formatPrice(p.total)}</span>
        </div>
        <p className="mt-1 text-right text-[10px] text-[var(--color-ink-3)]">
          Giá tạm tính · đã làm tròn 1.000 ₫
        </p>
      </div>
    </>
  );
}
