// Hooks trình bày dùng chung cho lớp UI (không đụng engine) — port từ
// ngan-excel-demo/src/sheet/hooks.ts; useRafParam generic hoá (khay không có
// setParam(id,value) duy nhất mà nhiều op kích thước khác nhau).
import { useEffect, useRef, useState } from 'react';

/** "Compact" = viewport <1024px (mobile + tablet dọc). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

/** Gom lời gọi op theo khung hình (throttle slider kéo liên tục) — chỉ giữ
 *  bộ args CUỐI CÙNG mỗi frame. */
export function useRafParam<A extends unknown[]>(
  apply: (...args: A) => void,
): (...args: A) => void {
  const fnRef = useRef(apply);
  fnRef.current = apply;
  const pending = useRef<A | null>(null);
  const rafId = useRef(0);
  useEffect(() => () => cancelAnimationFrame(rafId.current), []);
  return (...args: A) => {
    pending.current = args;
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      if (pending.current) fnRef.current(...pending.current);
      pending.current = null;
    });
  };
}

/** Giá chạy số mượt (rAF ~350ms ease-out) — thuần trình bày. */
export function usePriceTicker(target: number): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const DUR = 350;
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * e);
      setShown(v);
      fromRef.current = v;
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);
  return shown;
}
