// =============================================================================
// SelectionOverlay3D — box mực bán trong suốt (~14%) + viền edges phủ vùng ô
// đang chọn của tầng active. Union rect NỞ qua block đã gộp (giống Excel) —
// khớp đúng vùng mergeRect sẽ gộp. Nhô hơn miệng khay ~0.5mm tránh z-fight.
// Toạ độ ENGINE (mm, z-up) — mount TRONG group mapping của Scene3D.
// =============================================================================
import { useEffect, useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { blockPocket, decodeBlocks } from '@/engine/layout';
import type { KhaySheet } from './useKhaySheet';

const INK = '#1c1a17';
const FILL_OPACITY = 0.14;
const LIP_MM = 0.5; // nhô hơn miệng
const BASE_LIFT_MM = 0.3; // nhấc đáy khỏi mặt đáy khay (tránh coplanar)

export function SelectionOverlay3D({ sheet }: { sheet: KhaySheet }) {
  const data = useMemo(() => {
    const s = sheet.selection;
    if (!s) return null;
    const grid = sheet.layout.levels[s.level]?.trays[s.tray];
    const placed = sheet.built.trays.find(
      (t) => t.levelIdx === s.level && t.trayIdx === s.tray,
    );
    if (!grid || !placed) return null;

    // Chuẩn hoá rect + nở qua block gộp tới ổn định (logic khớp mergeRect).
    let R0 = Math.min(s.r0, s.r1);
    let R1 = Math.max(s.r0, s.r1);
    let C0 = Math.min(s.c0, s.c1);
    let C1 = Math.max(s.c0, s.c1);
    const blocks = decodeBlocks(grid.blocks, grid.rows, grid.cols);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of blocks) {
        const hit = b.r <= R1 && b.r + b.rs - 1 >= R0 && b.c <= C1 && b.c + b.cs - 1 >= C0;
        if (!hit) continue;
        const nR0 = Math.min(R0, b.r);
        const nC0 = Math.min(C0, b.c);
        const nR1 = Math.max(R1, b.r + b.rs - 1);
        const nC1 = Math.max(C1, b.c + b.cs - 1);
        if (nR0 !== R0 || nC0 !== C0 || nR1 !== R1 || nC1 !== C1) {
          [R0, C0, R1, C1] = [nR0, nC0, nR1, nC1];
          grew = true;
        }
      }
    }

    const wallT = sheet.catalog.limits.wallT;
    const p = blockPocket(
      placed.tile,
      grid,
      { r: R0, c: C0, rs: R1 - R0 + 1, cs: C1 - C0 + 1 },
      wallT,
    );
    const z0 = placed.zBase + BASE_LIFT_MM;
    const z1 = placed.zBase + placed.spec.h + LIP_MM;
    return {
      pos: [
        placed.tile.x + (p.x0 + p.x1) / 2,
        placed.tile.y + (p.y0 + p.y1) / 2,
        (z0 + z1) / 2,
      ] as [number, number, number],
      size: [p.x1 - p.x0, p.y1 - p.y0, z1 - z0] as [number, number, number],
    };
  }, [sheet.selection, sheet.layout, sheet.built, sheet.catalog]);

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
