// =============================================================================
// debugApi — window.__khay cho integrator/critic verify tự động (Playwright).
// Cập nhật MỖI render bằng useLayoutEffect (sync tại commit) — passive effect
// bị trình duyệt trì hoãn ở tab hidden làm get() trả state cũ hàng giây.
// exportProbe: trả tên file STL từng tray, KHÔNG tải file. Chỉ dùng dev/demo.
// =============================================================================
import { useEffect, useLayoutEffect } from 'react';
import { stlFileName } from '@/engine/export';
import type { KhayLayout } from '@/engine/layout';
import type { FitId, KhayCatalog } from '@/engine/catalog';
import type { CellSelection, KhaySheet } from './useKhaySheet';

export interface KhayDebugApi {
  get: () => {
    layout: KhayLayout;
    activeLevel: number;
    selection: CellSelection | null;
    priceTotal: number;
    warnings: string[];
    buildError: string | null;
    trayCount: number;
  };
  act: {
    setDrawer: (dims: { w: number; d: number; h: number }) => void;
    setFit: (f: FitId) => void;
    setLevelHeight: (li: number, h: number) => void;
    addLevel: () => void;
    removeLevel: (li: number) => void;
    setTrayGrid: (li: number, ti: number, rows: number, cols: number) => void;
    select: (sel: CellSelection | null) => void;
    mergeSelection: () => void;
    unmergeSelection: () => void;
    setTrayColor: (li: number, ti: number, colorId: string) => void;
    setAllTrayColors: (colorId: string) => void;
    setActiveLevel: (i: number) => void;
    undo: () => void;
    setCatalog: (c: KhayCatalog) => void;
    /** Tên file stlFileName cho từng tray của cấu hình hiện tại — không tải. */
    exportProbe: () => string[];
  };
}

declare global {
  interface Window {
    __khay?: KhayDebugApi;
  }
}

export function useDebugApi(sheet: KhaySheet): void {
  // Không deps: re-install mỗi render → closure luôn trỏ sheet mới nhất.
  useLayoutEffect(() => {
    window.__khay = {
      get: () => ({
        layout: sheet.layout,
        activeLevel: sheet.activeLevel,
        selection: sheet.selection,
        priceTotal: sheet.price.total,
        warnings: sheet.built.warnings,
        buildError: sheet.buildError,
        trayCount: sheet.built.trays.length,
      }),
      act: {
        setDrawer: sheet.setDrawer,
        setFit: sheet.setFit,
        setLevelHeight: sheet.setLevelHeight,
        addLevel: sheet.addLevel,
        removeLevel: sheet.removeLevel,
        setTrayGrid: sheet.setTrayGrid,
        select: sheet.select,
        mergeSelection: sheet.mergeSelection,
        unmergeSelection: sheet.unmergeSelection,
        setTrayColor: sheet.setTrayColor,
        setAllTrayColors: sheet.setAllTrayColors,
        setActiveLevel: sheet.setActiveLevel,
        undo: sheet.undo,
        setCatalog: sheet.setCatalog,
        exportProbe: () => sheet.built.trays.map((t) => stlFileName(t)),
      },
    };
  });
  // Gỡ khi unmount app.
  useEffect(
    () => () => {
      delete window.__khay;
    },
    [],
  );
}
