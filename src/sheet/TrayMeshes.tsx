// =============================================================================
// TrayMeshes — render theo sheet.pieces (PieceEntry): mỗi MẢNH CSG 1 mesh,
// WYSIWYG với STL. BufferGeometry indexed → toNonIndexed() +
// computeVertexNormals() cho flat shading sắc cạnh. Material matte PLA
// (roughness 0.65) màu THEO KHAY chứa mảnh. Tầng non-active mờ 0.25. Mảnh nằm
// NGUYÊN VỊ trong toạ độ local khay → đặt cả nhóm tại [rect.x, rect.y, zBase]
// (hệ engine, trong group mapping của Scene3D). Kèm DrawerGhost: khung edges
// LÒNG ngăn kéo W×D×H từ z=0.
// =============================================================================
import { useEffect, useMemo, useRef } from 'react';
import type {} from '@react-three/fiber';
import { BoxGeometry, BufferAttribute, BufferGeometry, EdgesGeometry } from 'three';
import type { TriMesh } from '@/engine/geometry/types';
import { findColor, previewHexOf } from '@/engine/palette';
import type { KhaySheet, PieceEntry } from './useKhaySheet';

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

function PieceMesh({
  entry,
  geo,
  active,
}: {
  entry: PieceEntry;
  geo: BufferGeometry;
  active: boolean;
}) {
  const { tray } = entry;
  // previewHexOf: clamp hex cực đoan (#000000/#FFFFFF) để 3D còn diffuse shading;
  // swatch UI vẫn dùng hex gốc (đúng thiết kế).
  const hex = previewHexOf(findColor(tray.color));
  return (
    <mesh
      geometry={geo}
      position={[tray.rect.x, tray.rect.y, tray.zBase]}
      castShadow={active}
      receiveShadow
    >
      {/* Chất matte Bambu PLA — tầng non-active mờ như "bản nháp". */}
      <meshStandardMaterial
        color={hex}
        roughness={0.65}
        metalness={0}
        transparent={!active}
        opacity={active ? 1 : 0.25}
        depthWrite={active}
      />
    </mesh>
  );
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
  return (
    <>
      <DrawerGhost w={drawer.w} d={drawer.d} h={drawer.h} />
      {sheet.pieces.map((pe) => {
        const geo = geos.get(pe.piece.mesh);
        if (!geo) return null; // không xảy ra — geos dựng từ chính pieces
        return (
          <PieceMesh
            key={pe.key}
            entry={pe}
            geo={geo}
            active={pe.tray.levelIdx === sheet.activeLevel}
          />
        );
      })}
    </>
  );
}
