// =============================================================================
// CellHitLayer — hộp hitbox VÔ HÌNH phủ TỪNG Ô LƯỚI (r,c) của tầng ACTIVE để
// chọn ô kiểu Excel trên 3D. KHÔNG pointer-capture (capture giữ event ở 1 mesh
// → raycast không sang ô khác được, marquee chết). Kéo giữ chuột = marquee
// (tắt OrbitControls trong lúc kéo, window pointerup chốt). Chuột phải /
// long-press ~450ms (touch) = mở context menu tại vị trí trỏ.
// =============================================================================
import { useEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { blockPocket } from '@/engine/layout';
import type { CellRef, KhaySheet } from './useKhaySheet';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10; // ngón di quá xa → huỷ long-press

interface HitCell {
  key: string;
  ref: CellRef;
  pos: [number, number, number];
  size: [number, number, number];
}

export function CellHitLayer({
  sheet,
  onContextMenu,
}: {
  sheet: KhaySheet;
  onContextMenu: (clientX: number, clientY: number) => void;
}) {
  // OrbitControls (makeDefault) — tắt tạm khi marquee để kéo không xoay camera.
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  const draggingRef = useRef(false);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);

  // Hitbox theo toạ độ ENGINE (mm, z-up) — nằm trong group mapping của Scene3D.
  // Mỗi ô lưới 1 box: XY = blockPocket của ô 1×1, Z = trọn thân khay (spec.h).
  const cells = useMemo<HitCell[]>(() => {
    const wallT = sheet.catalog.limits.wallT;
    const out: HitCell[] = [];
    for (const t of sheet.built.trays) {
      if (t.levelIdx !== sheet.activeLevel) continue;
      const grid = sheet.layout.levels[t.levelIdx]?.trays[t.trayIdx];
      if (!grid) continue; // built stale (buildError) — bỏ khay lệch layout
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const p = blockPocket(t.tile, grid, { r, c, rs: 1, cs: 1 }, wallT);
          out.push({
            key: `${t.levelIdx}-${t.trayIdx}-${r}-${c}`,
            ref: { level: t.levelIdx, tray: t.trayIdx, r, c },
            pos: [
              t.tile.x + (p.x0 + p.x1) / 2,
              t.tile.y + (p.y0 + p.y1) / 2,
              t.zBase + t.spec.h / 2,
            ],
            size: [p.x1 - p.x0, p.y1 - p.y0, t.spec.h],
          });
        }
      }
    }
    return out;
  }, [sheet.built, sheet.layout, sheet.activeLevel, sheet.catalog]);

  const cancelPress = () => {
    if (pressRef.current) {
      window.clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
  };

  // Chốt marquee + huỷ long-press bằng listener window (event có thể kết thúc
  // ngoài mọi hitbox). Cleanup unmount trả lại controls.enabled.
  useEffect(() => {
    const end = () => {
      cancelPress();
      if (draggingRef.current) {
        draggingRef.current = false;
        if (controlsRef.current) controlsRef.current.enabled = true;
      }
    };
    const move = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) cancelPress();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('pointermove', move);
      end();
    };
  }, []);

  const selectCell = (ref: CellRef) =>
    sheet.select({ level: ref.level, tray: ref.tray, r0: ref.r, c0: ref.c, r1: ref.r, c1: ref.c });

  /** Ô đã nằm trong vùng chọn hiện tại? (giữ selection khi chuột phải vào vùng). */
  const inSelection = (ref: CellRef): boolean => {
    const s = sheet.selection;
    if (!s || s.level !== ref.level || s.tray !== ref.tray) return false;
    const r0 = Math.min(s.r0, s.r1);
    const r1 = Math.max(s.r0, s.r1);
    const c0 = Math.min(s.c0, s.c1);
    const c1 = Math.max(s.c0, s.c1);
    return ref.r >= r0 && ref.r <= r1 && ref.c >= c0 && ref.c <= c1;
  };

  const openMenuAt = (ref: CellRef, x: number, y: number) => {
    // Kiểu Excel: chuột phải TRONG vùng chọn giữ nguyên vùng (để "Gộp N ô"
    // dùng được sau marquee); ngoài vùng → chọn lại 1 ô dưới trỏ.
    if (!inSelection(ref)) selectCell(ref);
    onContextMenu(x, y);
  };

  return (
    <group>
      {cells.map((cell) => (
        <mesh
          key={cell.key}
          position={cell.pos}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            selectCell(cell.ref);
            if (e.pointerType === 'touch') {
              // Mobile: tap chọn (đã select), giữ ~450ms mở context menu.
              cancelPress();
              const { clientX, clientY } = e.nativeEvent;
              pressRef.current = {
                x: clientX,
                y: clientY,
                timer: window.setTimeout(() => {
                  pressRef.current = null;
                  onContextMenu(clientX, clientY);
                }, LONG_PRESS_MS),
              };
            } else {
              // Chuột: bắt đầu marquee — tắt orbit tới window pointerup.
              draggingRef.current = true;
              if (controlsRef.current) controlsRef.current.enabled = false;
            }
          }}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            if (!draggingRef.current) return;
            e.stopPropagation();
            // extendSelection tự bỏ qua nếu khác level/tray (giữ anchor).
            sheet.extendSelection(cell.ref);
          }}
          onContextMenu={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            cancelPress(); // Android long-press bắn contextmenu thật — tránh mở đúp
            openMenuAt(cell.ref, e.nativeEvent.clientX, e.nativeEvent.clientY);
          }}
        >
          <boxGeometry args={cell.size} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
