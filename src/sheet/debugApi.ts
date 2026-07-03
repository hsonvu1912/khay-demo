// =============================================================================
// debugApi — window.__khay cho integrator/critic verify tự động (Playwright).
// Cập nhật MỖI render bằng useLayoutEffect (sync tại commit) — passive effect
// bị trình duyệt trì hoãn ở tab hidden làm get() trả state cũ hàng giây.
// V2: selection là Ô LƯỚI chung (CellSelection2), ops theo hợp đồng KhaySheet
// v2; exportProbe ASYNC (dựng mảnh CSG thật) → tên file STL từng MẢNH.
// =============================================================================
import { useEffect, useLayoutEffect } from 'react';
import { stlFileName } from '@/engine/export';
import { buildTrayPieces } from '@/engine/geometry/solid2';
import type { KhayLayout } from '@/engine/layout';
import type { FitId, KhayCatalog } from '@/engine/catalog';
import type { CellSelection2, KhaySheet } from './useKhaySheet';

export interface KhayDebugApi {
  get: () => {
    layout: KhayLayout;
    activeLevel: number;
    selection: CellSelection2 | null;
    priceTotal: number;
    trayCount: number;
    pieceCount: number;
    building: boolean;
    warnings: string[];
    buildError: string | null;
  };
  act: {
    setDrawer: (dims: { w: number; d: number; h: number }) => void;
    setFit: (f: FitId) => void;
    setGrid: (rows: number, cols: number) => void;
    setLevelHeight: (li: number, h: number) => void;
    addLevel: () => void;
    removeLevel: (li: number) => void;
    select: (sel: CellSelection2 | null) => void;
    mergeSelection: () => void;
    unmergeSelection: () => void;
    setBlockColor: (colorId: string) => void;
    setAllTrayColors: (colorId: string) => void;
    setActiveLevel: (i: number) => void;
    undo: () => void;
    setCatalog: (c: KhayCatalog) => void;
    /** Dựng mảnh CSG thật từng khay → tên file stlFileName từng MẢNH — không tải. */
    exportProbe: () => Promise<string[]>;
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
        trayCount: sheet.trayCount,
        pieceCount: sheet.pieceCount,
        building: sheet.building,
        warnings: sheet.built.warnings,
        buildError: sheet.buildError,
      }),
      act: {
        setDrawer: sheet.setDrawer,
        setFit: sheet.setFit,
        setGrid: sheet.setGrid,
        setLevelHeight: sheet.setLevelHeight,
        addLevel: sheet.addLevel,
        removeLevel: sheet.removeLevel,
        select: sheet.select,
        mergeSelection: sheet.mergeSelection,
        unmergeSelection: sheet.unmergeSelection,
        setBlockColor: sheet.setBlockColor,
        setAllTrayColors: sheet.setAllTrayColors,
        setActiveLevel: sheet.setActiveLevel,
        undo: sheet.undo,
        setCatalog: sheet.setCatalog,
        exportProbe: async () => {
          const names: string[] = [];
          for (const t of sheet.built.trays) {
            const pieces = await buildTrayPieces(t.spec, t.cuts);
            for (const p of pieces) names.push(stlFileName(p, t.color));
          }
          return names;
        },
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
