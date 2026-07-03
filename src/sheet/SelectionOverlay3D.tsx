// =============================================================================
// SelectionOverlay3D — box mực bán trong suốt (~14%) + viền edges phủ vùng ô
// đang chọn của tầng active. V2: vùng phủ theo PITCH lưới chung (khớp hitbox
// CellHitLayer), rect chuẩn hoá min/max. Nhô hơn miệng khay +0.5mm tránh
// z-fight. Toạ độ ENGINE (mm, z-up) — mount TRONG group mapping của Scene3D.
// =============================================================================
import { useEffect, useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { gridPitch } from '@/engine/layout';
import type { KhaySheet } from './useKhaySheet';

const INK = '#1c1a17';
const FILL_OPACITY = 0.14;
const LIP_MM = 0.5; // nhô hơn miệng
const BASE_LIFT_MM = 0.3; // nhấc đáy khỏi mặt đáy khay (tránh coplanar)

export function SelectionOverlay3D({ sheet }: { sheet: KhaySheet }) {
  const data = useMemo(() => {
    const s = sheet.selection;
    if (!s) return null;
    const lv = sheet.layout.levels[s.level];
    if (!lv) return null;

    const { pitchX, pitchY, clear } = gridPitch(sheet.layout, sheet.catalog);
    const R0 = Math.min(s.r0, s.r1);
    const R1 = Math.max(s.r0, s.r1);
    const C0 = Math.min(s.c0, s.c1);
    const C1 = Math.max(s.c0, s.c1);
    const x0 = clear + C0 * pitchX;
    const x1 = clear + (C1 + 1) * pitchX;
    const y0 = clear + R0 * pitchY;
    const y1 = clear + (R1 + 1) * pitchY;
    // Z: đáy danh nghĩa tầng → miệng tầng (+LIP) — khớp hitbox CellHitLayer.
    const zFloor = sheet.layout.levels.slice(0, s.level).reduce((sum, l) => sum + l.h, 0);
    const z0 = zFloor + BASE_LIFT_MM;
    const z1 = zFloor + lv.h + LIP_MM;
    return {
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as [number, number, number],
      size: [x1 - x0, y1 - y0, z1 - z0] as [number, number, number],
    };
  }, [sheet.selection, sheet.layout, sheet.catalog]);

  // Viền edges dựng tay (kích thước động) — dispose khi đổi/unmount.
  const edges = useMemo(() => {
    if (!data) return null;
    const box = new BoxGeometry(data.size[0], data.size[1], data.size[2]);
    const geo = new EdgesGeometry(box);
    box.dispose();
    return geo;
  }, [data]);
  useEffect(() => () => edges?.dispose(), [edges]);

  if (!data || !edges) return null;
  return (
    <group position={data.pos}>
      <mesh renderOrder={10}>
        <boxGeometry args={data.size} />
        <meshBasicMaterial color={INK} transparent opacity={FILL_OPACITY} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={11}>
        <lineBasicMaterial color={INK} transparent opacity={0.9} />
      </lineSegments>
    </group>
  );
}
