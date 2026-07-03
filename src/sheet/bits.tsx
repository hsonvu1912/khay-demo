// Mảnh UI nhỏ dùng chung — style "thẻ giấy" đơn sắc (port từ ngan-excel-demo).
// useToast thêm biến thể error (nền đỏ) cho lỗi export.
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Nút icon/tròn tối giản. */
export function IconBtn({
  label,
  title,
  disabled,
  active,
  onClick,
  size = 34,
}: {
  label: ReactNode;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[15px] transition-colors duration-150 ${
        disabled
          ? 'cursor-not-allowed text-[var(--color-ink-3)]/60'
          : active
            ? 'bg-[var(--color-ink)] text-white'
            : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
    </button>
  );
}

/** Nút chữ dạng ghost/solid. */
export function Btn({
  children,
  title,
  disabled,
  solid,
  onClick,
  className = '',
}: {
  children: ReactNode;
  title?: string;
  disabled?: boolean;
  solid?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-medium transition-colors duration-150 ${
        disabled
          ? 'cursor-not-allowed border border-[var(--color-line)] text-[var(--color-ink-3)]/70'
          : solid
            ? 'bg-[var(--color-ink)] text-white hover:bg-black'
            : 'border border-[var(--color-line)] bg-white/60 text-[var(--color-ink)] hover:border-[var(--color-ink)]/40'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Segmented control (độ vừa, nấc cao…). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div className="scroll-fade-x inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-[var(--color-surface-2)] p-0.5 no-scrollbar">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title ?? o.label}
          onClick={() => onChange(o.value)}
          className={`shrink-0 rounded-full font-medium transition-colors duration-150 ${
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]'
          } ${
            value === o.value
              ? 'bg-[var(--color-ink)] text-white shadow-sm'
              : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Popover neo dưới trigger, click-ngoài đóng. */
export function Popover({
  trigger,
  open,
  onOpenChange,
  align = 'left',
  children,
  width = 264,
}: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  align?: 'left' | 'right';
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, onOpenChange]);
  return (
    <div className="relative" ref={ref}>
      {trigger(() => onOpenChange(!open), open)}
      {open && (
        <div
          className={`paper-pop anim-fade-up absolute bottom-full z-40 mb-2 p-3 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
          style={{ width }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Toast nhỏ — flash(msg) thường (nền mực), flash(msg, {error:true}) nền đỏ. */
export function useToast(): [
  ReactNode,
  (msg: string, opts?: { error?: boolean }) => void,
] {
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const t = useRef(0);
  const flash = (m: string, opts?: { error?: boolean }) => {
    setToast({ msg: m, error: !!opts?.error });
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setToast(null), opts?.error ? 3500 : 2000);
  };
  const node = toast ? (
    <div
      className="anim-rise pointer-events-none fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-medium text-white shadow-lg"
      style={{ background: toast.error ? '#b3261e' : 'var(--color-ink)' }}
    >
      {toast.msg}
    </div>
  ) : null;
  return [node, flash];
}
