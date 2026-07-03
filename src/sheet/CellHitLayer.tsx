// =============================================================================
// CellHitLayer — hộp hitbox VÔ HÌNH phủ TỪNG Ô LƯỚI (r,c) TOÀN NGĂN KÉO của
// tầng ACTIVE để chọn ô kiểu Excel trên 3D. V2: lưới chung gridPitch — mỗi ô
// hitbox trọn pitch (KHÔNG co khe khay) để kéo marquee không lọt khe.
// KHÔNG pointer-capture (capture giữ event ở 1 mesh → raycast không sang ô
// khác được, marquee chết). Kéo giữ chuột = marquee (tắt OrbitControls trong
// lúc kéo, window pointerup chốt). Chuột phải / long-press ~450ms (touch) =
// mở context menu tại vị trí trỏ.
// =============================================================================
import { useEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { gridPitch } from '@/engine/layout';
import type { KhaySheet } from './useKhaySheet';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10; // ngón di quá xa → huỷ long-press

interface HitCell {
  key: string;
  r: number;
  c: number;
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

  const level = sheet.activeLevel;

  // Hitbox theo toạ độ ENGINE (mm, z-up) — nằm trong group mapping của Scene3D.
  // Mỗi ô lưới 1 box trọn pitch; Z phủ từ đáy danh nghĩa tầng active lên
  // + nominalH (= lv.h — khay plug lún thêm seatDepth nhưng hitbox không cần).
  const cells = useMemo<HitCell[]>(() => {
    const lv = sheet.layout.levels[level];
    if (!lv) return [];
    const { pitchX, pitchY, clear } = gridPitch(sheet.layout, sheet.catalog);
    const z0 = sheet.layout.levels.slice(0, level).reduce((s, l) => s + l.h, 0);
    const out: HitCell[] = [];
    for (let r = 0; r < sheet.layout.grid.rows; r++) {
      for (let c = 0; c < sheet.layout.grid.cols; c++) {
        out.push({
          key: `${level}-${r}-${c}`,
          r,
          c,
          pos: [clear + (c + 0.5) * pitchX, clear + (r + 0.5) * pitchY, z0 + lv.h / 2],
          size: [pitchX, pitchY, lv.h],
        });
      }
    }
    return out;
  }, [sheet.layout, sheet.catalog, level]);

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

  const selectCell = (r: number, c: number) =>
    sheet.select({ level, r0: r, c0: c, r1: r, c1: c });

  /** Ô đã nằm trong vùng chọn hiện tại? (giữ selection khi chuột phải vào vùng). */
  const inSelection = (r: number, c: number): boolean => {
    const s = sheet.selection;
    if (!s || s.level !== level) return false;
    const r0 = Math.min(s.r0, s.r1);
    const r1 = Math.max(s.r0, s.r1);
    const c0 = Math.min(s.c0, s.c1);
    const c1 = Math.max(s.c0, s.c1);
    return r >= r0 && r <= r1 && c >= c0 && c <= c1;
  };

  const openMenuAt = (r: number, c: number, x: number, y: number) => {
    // Kiểu Excel: chuột phải TRONG vùng chọn giữ nguyên vùng (để "Gộp N ô"
    // dùng được sau marquee); ngoài vùng → chọn lại 1 ô dưới trỏ.
    if (!inSelection(r, c)) selectCell(r, c);
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
            selectCell(cell.r, cell.c);
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
            // extendSelection giữ anchor, mở rộng TỰ DO — tự bỏ qua nếu khác tầng.
            sheet.extendSelection({ level, r: cell.r, c: cell.c });
          }}
          onContextMenu={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            cancelPress(); // Android long-press bắn contextmenu thật — tránh mở đúp
            openMenuAt(cell.r, cell.c, e.nativeEvent.clientX, e.nativeEvent.clientY);
          }}
        >
          <boxGeometry args={cell.size} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
