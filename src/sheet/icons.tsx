// =============================================================================
// icons.tsx — bộ icon nét mực đơn sắc cho configurator khay (theo ngôn ngữ
// bản vẽ của ngan-excel-demo): khung nhìn TỪ TRÊN XUỐNG của khay chia ô,
// không fill, stroke 1.5, grid 16. Mọi icon nhận size (mặc định 16).
// =============================================================================
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Khung khay (plan-view, bo nhẹ như outerR). */
const Frame = <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" />;

/** Gộp ô — vách giữa đứt nét (sắp biến mất) + 2 mũi tên nhập vào. */
export function IconMerge(p: P) {
  return (
    <Svg {...p}>
      {Frame}
      <line x1="8" y1="2.8" x2="8" y2="13.2" strokeWidth="1" strokeDasharray="1.6 2" opacity="0.55" />
      <path d="M4.7 6.7 6 8 4.7 9.3" strokeWidth="1.2" />
      <path d="M11.3 6.7 10 8l1.3 1.3" strokeWidth="1.2" />
    </Svg>
  );
}

/** Tách ô — trạng thái kết quả: 2 ô rời nhau. */
export function IconSplit(p: P) {
  return (
    <Svg {...p}>
      <rect x="2.2" y="3" width="4.8" height="10" rx="1.2" />
      <rect x="9" y="3" width="4.8" height="10" rx="1.2" />
    </Svg>
  );
}

/** Lưới — khay chia 2×2 (plan-view). */
export function IconGrid(p: P) {
  return (
    <Svg {...p}>
      {Frame}
      <line x1="8" y1="2.6" x2="8" y2="13.4" strokeWidth="1.1" />
      <line x1="2.6" y1="8" x2="13.4" y2="8" strokeWidth="1.1" />
    </Svg>
  );
}

/** Tầng — 2 khay xếp chồng nhìn nghiêng. */
export function IconLayer(p: P) {
  return (
    <Svg {...p}>
      <path d="M2.5 5.6 8 2.8l5.5 2.8L8 8.4 2.5 5.6Z" strokeWidth="1.3" />
      <path d="M2.5 9.2 8 12l5.5-2.8" strokeWidth="1.3" />
    </Svg>
  );
}

/** Màu — giọt màu (đơn sắc, không palette lòe loẹt). */
export function IconPalette(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 2.6c2.5 3 3.8 4.9 3.8 6.7a3.8 3.8 0 1 1-7.6 0C4.2 7.5 5.5 5.6 8 2.6Z" strokeWidth="1.3" />
    </Svg>
  );
}

/** Thước — đo lòng ngăn kéo. */
export function IconRuler(p: P) {
  return (
    <Svg {...p}>
      <rect x="1.8" y="5.6" width="12.4" height="4.8" rx="1" strokeWidth="1.3" />
      <line x1="4.8" y1="5.8" x2="4.8" y2="8" strokeWidth="1.1" />
      <line x1="8" y1="5.8" x2="8" y2="8.6" strokeWidth="1.1" />
      <line x1="11.2" y1="5.8" x2="11.2" y2="8" strokeWidth="1.1" />
    </Svg>
  );
}

/** Tải xuống — mũi tên xuống + khay hứng. */
export function IconDownload(p: P) {
  return (
    <Svg {...p}>
      <line x1="8" y1="2.6" x2="8" y2="9.6" />
      <path d="M5.4 7.2 8 9.8l2.6-2.6" />
      <path d="M3 11.4v1a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4v-1" />
    </Svg>
  );
}

/** Bánh răng — cài đặt. */
export function IconGear(p: P) {
  return (
    <Svg {...p} strokeWidth="1.3">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v1.9M8 12.5v1.9M1.6 8h1.9M12.5 8h1.9M3.5 3.5l1.35 1.35M11.15 11.15l1.35 1.35M12.5 3.5l-1.35 1.35M4.85 11.15 3.5 12.5" />
    </Svg>
  );
}

/** Hoàn tác — mũi tên vòng trái. */
export function IconUndo(p: P) {
  return (
    <Svg {...p}>
      <path d="M6.5 3.5 3 7l3.5 3.5M3 7h6a4 4 0 0 1 0 8H7" />
    </Svg>
  );
}

/** Đóng — ✕. */
export function IconClose(p: P) {
  return (
    <Svg {...p}>
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </Svg>
  );
}

/** Cộng. */
export function IconPlus(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 3.4v9.2M3.4 8h9.2" />
    </Svg>
  );
}

/** Trừ. */
export function IconMinus(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.4 8h9.2" />
    </Svg>
  );
}

/** Caret ▾ — trạng thái mở panel (xoay 180° khi open). */
export function IconCaret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="transition-transform duration-200"
      style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path d="m2.5 7.5 3.5-3.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
