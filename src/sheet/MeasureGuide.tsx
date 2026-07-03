// =============================================================================
// MeasureGuide — modal "Cách đo ngăn kéo": 4 bước (W/D lòng trong · H tới điểm
// cản thấp nhất · chọn độ vừa · khay tự chia). SVG minh hoạ mặt bằng + mặt cắt.
// Desktop: modal giữa (paper-pop); mobile: full-sheet trắng.
// =============================================================================
import { useEffect, type ReactNode } from 'react';
import { useIsMobile } from './hooks';
import { IconBtn, Btn } from './bits';

const CloseIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 3l9 9M12 3l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** 1 bước đánh số tròn mực. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="num mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-[12px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">{title}</h3>
        <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">{children}</div>
      </div>
    </section>
  );
}

/** Khung giấy bao SVG minh hoạ. */
function Figure({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-[9px] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
      {children}
    </div>
  );
}

/** Mặt bằng: lòng ngăn kéo + mũi tên W/D + 2 vạch đo phụ. */
function PlanSvg() {
  return (
    <svg viewBox="0 0 280 178" className="w-full" role="img" aria-label="Mặt bằng ngăn kéo: đo rộng W trái sang phải, sâu D trước ra sau">
      <defs>
        <marker id="mg-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0 0 8 4 0 8Z" fill="var(--color-ink)" />
        </marker>
      </defs>
      {/* thành ngăn kéo */}
      <rect x="18" y="12" width="244" height="142" rx="6" fill="var(--color-surface-2)" stroke="var(--color-ink-3)" strokeWidth="1.2" />
      {/* lòng trong */}
      <rect x="32" y="26" width="216" height="114" rx="3" fill="var(--color-surface)" stroke="var(--color-line)" />
      {/* 2 vị trí đo phụ — gợi ý đo 3 chỗ */}
      <line x1="38" y1="44" x2="242" y2="44" stroke="var(--color-ink-3)" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="38" y1="122" x2="242" y2="122" stroke="var(--color-ink-3)" strokeWidth="1" strokeDasharray="3 4" />
      {/* W: trái → phải */}
      <line x1="38" y1="83" x2="242" y2="83" stroke="var(--color-ink)" strokeWidth="1.4" markerStart="url(#mg-a)" markerEnd="url(#mg-a)" />
      <text x="140" y="76" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ink)">W</text>
      {/* D: trước → sau */}
      <line x1="64" y1="32" x2="64" y2="134" stroke="var(--color-ink)" strokeWidth="1.4" markerStart="url(#mg-a)" markerEnd="url(#mg-a)" />
      <text x="72" y="60" fontSize="13" fontWeight="700" fill="var(--color-ink)">D</text>
      <text x="140" y="170" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-3)">mặt trước ngăn kéo (phía bạn đứng)</text>
    </svg>
  );
}

/** Mặt cắt: đáy + thành + thanh cản phía trên, mũi tên H. */
function SectionSvg() {
  return (
    <svg viewBox="0 0 280 132" className="w-full" role="img" aria-label="Mặt cắt ngăn kéo: đo cao H từ đáy tới điểm cản thấp nhất">
      <defs>
        <marker id="mg-b" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0 0 8 4 0 8Z" fill="var(--color-ink)" />
        </marker>
      </defs>
      {/* đáy + 2 thành */}
      <rect x="20" y="103" width="240" height="9" fill="var(--color-surface-2)" stroke="var(--color-ink-3)" strokeWidth="1.1" />
      <rect x="20" y="30" width="9" height="75" fill="var(--color-surface-2)" stroke="var(--color-ink-3)" strokeWidth="1.1" />
      <rect x="251" y="30" width="9" height="75" fill="var(--color-surface-2)" stroke="var(--color-ink-3)" strokeWidth="1.1" />
      {/* thanh cản phía trên (ray trượt / thanh ngang / mặt trên) */}
      <rect x="122" y="36" width="129" height="10" fill="var(--color-ink-3)" opacity="0.55" />
      <text x="186" y="29" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-3)">ray trượt · thanh ngang · mặt trên</text>
      {/* gióng từ đáy thanh cản sang mũi tên H */}
      <line x1="56" y1="46" x2="122" y2="46" stroke="var(--color-ink-3)" strokeWidth="1" strokeDasharray="3 4" />
      {/* H */}
      <line x1="66" y1="101" x2="66" y2="48" stroke="var(--color-ink)" strokeWidth="1.4" markerStart="url(#mg-b)" markerEnd="url(#mg-b)" />
      <text x="74" y="79" fontSize="13" fontWeight="700" fill="var(--color-ink)">H</text>
      <text x="140" y="127" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-3)">đo từ đáy lên điểm cản THẤP NHẤT</text>
    </svg>
  );
}

/** Nhãn độ vừa dạng pill. */
function FitPill({ solid, children }: { solid?: boolean; children: ReactNode }) {
  return (
    <span
      className={`mr-1.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
        solid ? 'bg-[var(--color-ink)] text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
      }`}
    >
      {children}
    </span>
  );
}

export function MeasureGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile();

  // Esc đóng modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const body = (
    <div className="space-y-5">
      <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        Chỉ cần 3 số đo. Kéo ngăn ra hết cỡ và đo <b>lòng trong</b> (khoảng rỗng
        bên trong) — không đo vỏ ngoài nhé.
      </p>

      <Step n={1} title="Rộng W · sâu D — đo lòng trong">
        Rộng <b>W</b>: từ vách trái sang vách phải. Sâu <b>D</b>: từ mặt trước ra
        vách sau. Ngăn kéo hiếm khi vuông tuyệt đối — đo ở <b>3 vị trí</b> (đầu,
        giữa, cuối) và <b>lấy số nhỏ nhất</b>.
        <Figure>
          <PlanSvg />
        </Figure>
      </Step>

      <Step n={2} title="Cao H — tới điểm cản thấp nhất">
        Đo từ <b>đáy ngăn</b> lên <b>điểm cản thấp nhất</b> phía trên: ray trượt,
        thanh ngang, hay mặt trên tủ. Khay phải chui lọt dưới điểm đó khi đóng
        ngăn.
        <Figure>
          <SectionSvg />
        </Figure>
      </Step>

      <Step n={3} title="Chọn độ vừa">
        <ul className="mt-0.5 space-y-1.5">
          <li>
            <FitPill solid>Chuẩn</FitPill>
            hợp đa số ngăn kéo — phân vân thì cứ chọn cái này.
          </li>
          <li>
            <FitPill>Lỏng</FitPill>
            ngăn hơi méo, gỗ mộc, hoặc số đo bạn chưa chắc tay.
          </li>
          <li>
            <FitPill>Khít</FitPill>
            ngăn kim loại phẳng phiu, số đo chuẩn xác.
          </li>
        </ul>
      </Step>

      <Step n={4} title="Phần còn lại để khay lo">
        Các khay rời tự chia theo lưới và ghép sát nhau nằm gọn trong lòng ngăn
        — bạn không cần tính gì thêm. Khay lớn hơn <b>17 cm</b> sẽ in thành
        nhiều mảnh <b>ghép mộng</b> — lòng khay vẫn liền mạch.
      </Step>

      <Btn solid onClick={onClose} className="w-full">
        Đã hiểu, bắt đầu đo
      </Btn>
    </div>
  );

  // Mobile: full-sheet trắng, header dính trên
  if (isMobile) {
    return (
      <div className="anim-sheet fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h2 className="wordmark text-[18px] leading-none">Cách đo ngăn kéo</h2>
          <IconBtn label={CloseIcon} title="Đóng hướng dẫn" onClick={onClose} size={32} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
          {body}
        </div>
      </div>
    );
  }

  // Desktop: modal giữa
  return (
    <>
      <div className="anim-fade fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <div className="paper-pop anim-fade-up fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col">
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
          <h2 className="wordmark text-[20px] leading-none">Cách đo ngăn kéo</h2>
          <IconBtn label={CloseIcon} title="Đóng hướng dẫn" onClick={onClose} size={32} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{body}</div>
      </div>
    </>
  );
}
