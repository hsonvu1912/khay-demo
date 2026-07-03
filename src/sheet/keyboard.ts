// =============================================================================
// useKhayKeyboard — phím tắt toàn cục: Cmd/Ctrl+Z = undo, Escape = bỏ chọn.
// Bỏ qua khi focus đang ở input/textarea/select (giữ undo gõ chữ của trình duyệt).
// escapeEnabled (optional): trả false → Escape KHÔNG bỏ chọn (nhường overlay
// đang mở tự đóng trước — 1 phím Escape chỉ làm 1 việc).
// =============================================================================
import { useEffect, useRef } from 'react';
import type { KhaySheet } from './useKhaySheet';

export function useKhayKeyboard(sheet: KhaySheet, escapeEnabled?: () => boolean): void {
  // Ref giữ sheet mới nhất — listener gắn 1 lần, không re-bind mỗi render.
  const ref = useRef(sheet);
  ref.current = sheet;
  const escRef = useRef(escapeEnabled);
  escRef.current = escapeEnabled;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if (typing) return; // để native undo của ô nhập chạy
        e.preventDefault();
        ref.current.undo();
      } else if (e.key === 'Escape' && !typing) {
        if (escRef.current && !escRef.current()) return;
        ref.current.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
