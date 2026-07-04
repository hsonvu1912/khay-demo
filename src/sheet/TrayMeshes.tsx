// =============================================================================
// TrayMeshes — render theo sheet.pieces (PieceEntry): mỗi MẢNH CSG 1 mesh,
// WYSIWYG với STL. BufferGeometry indexed → toNonIndexed() +
// computeVertexNormals() cho flat shading sắc cạnh. Material matte PLA
// (roughness 0.65) màu THEO KHAY chứa mảnh.
//
// TẦNG: mọi tầng render ĐẶC (transparency + depthWrite:false từng gây artifact
// "vỡ hình" khi tầng trên lún 2.8mm vào miệng tầng dưới — mảnh trong suốt
// sort sai từng tam giác). Thay bằng EXPLODED VIEW: tầng phía TRÊN tầng đang
// chỉnh nhấc lên LIFT_GAP (animate damp), tầng đang chỉnh + dưới giữ nguyên vị
// → luôn nhìn/click được lòng tầng active, chọn tầng trên cùng = stack khít
// đúng vị trí thật. Tầng non-active nhuộm xám nhẹ để phân biệt.
//
// Mảnh nằm NGUYÊN VỊ trong toạ độ local khay → đặt tại [rect.x, rect.y, zBase]
// (hệ engine, trong group mapping của Scene3D). Kèm DrawerGhost: khung edges
// LÒNG ngăn kéo W×D×H từ z=0.
// =============================================================================
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, EdgesGeometry, Group } from 'three';
import type { TriMesh } from '@/engine/geometry/types';
import { findColor, previewHexOf } from '@/engine/palette';
import type { KhaySheet, PieceEntry } from './useKhaySheet';

/** Khoảng nhấc mỗi tầng phía trên tầng đang chỉnh (mm) — đủ thấy lòng tầng dưới. */
export const LIFT_GAP = 55;

/** TriMesh engine → BufferGeometry non-indexed (flat normals). */
function buildGeometry(mesh: TriMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(mesh.positions), 3));
  g.setIndex(mesh.indices);
  const flat = g.toNonIndexed(); // tách vertex → normal per-face, cạnh sắc
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

/**
 * Geometry CHIA SẺ theo TriMesh identity: cache pieces của hook dedup theo
 * hình dạng nên hàng trăm khay trùng hình trỏ CÙNG TriMesh — chỉ dựng 1
 * BufferGeometry/hình (924 khay ~18 hình ≈ 18 geometry thay vì 924 bản
 * non-indexed nặng MB → hết cạn RAM ở config lớn). Dispose sau commit cho
 * hình không còn dùng.
 */
function useSharedGeometries(pieces: PieceEntry[]): Map<TriMesh, BufferGeometry> {
  const cacheRef = useRef(new Map<TriMesh, BufferGeometry>());
  const geos = useMemo(() => {
    const cache = cacheRef.current;
    const live = new Map<TriMesh, BufferGeometry>();
    for (const pe of pieces) {
      const mesh = pe.piece.mesh;
      if (live.has(mesh)) continue;
      let g = cache.get(mesh);
      if (!g) {
        g = buildGeometry(mesh);
        cache.set(mesh, g); // idempotent — StrictMode render đôi không tạo trùng
      }
      live.set(mesh, g);
    }
    return live;
  }, [pieces]);
  useEffect(() => {
    const cache = cacheRef.current;
    for (const [mesh, geo] of cache) {
      if (!geos.has(mesh)) {
        geo.dispose();
        cache.delete(mesh);
      }
    }
  }, [geos]);
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const geo of cache.values()) geo.dispose();
      cache.clear();
    };
  }, []);
  return geos;
}

/** Màu preview: tầng non-active nhuộm xám giấy 22% để dồn focus (vẫn ĐẶC). */
function levelHex(colorId: string, active: boolean): string {
  const base = previewHexOf(findColor(colorId));
  if (active) return base;
  return '#' + new Color(base).lerp(new Color('#8a877f'), 0.22).getHexString();
}

function PieceMesh({ entry, geo, active }: { entry: PieceEntry; geo: BufferGeometry; active: boolean }) {
  const { tray } = entry;
  const hex = levelHex(tray.color, active); // previewHexOf bên trong: clamp hex cực đoan (#000/#FFF)
  return (
    <mesh
      geometry={geo}
      position={[tray.rect.x, tray.rect.y, tray.zBase]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={hex} roughness={0.65} metalness={0} />
    </mesh>
  );
}

/** Group 1 tầng — animate z tới độ nhấc đích (damp ~150ms, snap khi sát). */
function LevelGroup({ lift, children }: { lift: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const next = g.position.z + (lift - g.position.z) * Math.min(1, dt * 10);
    g.position.z = Math.abs(next - lift) < 0.05 ? lift : next;
  });
  return <group ref={ref}>{children}</group>;
}

/** Khung edges mảnh (ink 30%) thể hiện LÒNG ngăn kéo W×D×H, đáy tại z=0. */
export function DrawerGhost({ w, d, h }: { w: number; d: number; h: number }) {
  const geo = useMemo(() => {
    const box = new BoxGeometry(w, d, h); // hệ engine: x=W, y=D, z=H
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [w, d, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position={[w / 2, d / 2, h / 2]}>
      <lineBasicMaterial color="#1c1a17" transparent opacity={0.3} />
    </lineSegments>
  );
}

export function TrayMeshes({ sheet }: { sheet: KhaySheet }) {
  const { drawer } = sheet.layout;
  const geos = useSharedGeometries(sheet.pieces);
  // Gom mảnh theo tầng để nhấc cả tầng bằng 1 group (exploded view).
  const byLevel = useMemo(() => {
    const m = new Map<number, PieceEntry[]>();
    for (const pe of sheet.pieces) {
      const arr = m.get(pe.tray.levelIdx) ?? [];
      arr.push(pe);
      m.set(pe.tray.levelIdx, arr);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [sheet.pieces]);
  return (
    <>
      <DrawerGhost w={drawer.w} d={drawer.d} h={drawer.h} />
      {byLevel.map(([levelIdx, entries]) => {
        const above = levelIdx - sheet.activeLevel;
        const lift = above > 0 ? above * LIFT_GAP : 0;
        return (
          <LevelGroup key={levelIdx} lift={lift}>
            {entries.map((pe) => {
              const geo = geos.get(pe.piece.mesh);
              if (!geo) return null; // không xảy ra — geos dựng từ chính pieces
              return (
                <PieceMesh key={pe.key} entry={pe} geo={geo} active={levelIdx === sheet.activeLevel} />
              );
            })}
          </LevelGroup>
        );
      })}
    </>
  );
}
