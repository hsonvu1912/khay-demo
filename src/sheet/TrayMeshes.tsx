// =============================================================================
// TrayMeshes — render mỗi PlacedTray từ TriMesh của engine (WYSIWYG với STL):
// BufferGeometry indexed → toNonIndexed() + computeVertexNormals() cho flat
// shading sắc cạnh. Material matte PLA (roughness 0.65). Tầng non-active mờ
// 0.25. Đặt THEO HỆ ENGINE [tile.x, tile.y, zBase] — nằm trong group mapping
// của Scene3D. Kèm DrawerGhost: khung edges LÒNG ngăn kéo W×D×H từ z=0.
// =============================================================================
import { useEffect, useMemo } from 'react';
import type {} from '@react-three/fiber';
import { BoxGeometry, BufferAttribute, BufferGeometry, EdgesGeometry } from 'three';
import type { PlacedTray } from '@/engine/layout';
import type { TriMesh } from '@/engine/geometry/types';
import { findColor, previewHexOf } from '@/engine/palette';
import type { KhaySheet } from './useKhaySheet';

/** TriMesh engine → BufferGeometry non-indexed (flat normals). */
function useTrayGeometry(mesh: TriMesh): BufferGeometry {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(mesh.positions), 3));
    g.setIndex(mesh.indices);
    const flat = g.toNonIndexed(); // tách vertex → normal per-face, cạnh sắc
    flat.computeVertexNormals();
    g.dispose();
    return flat;
  }, [mesh]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

function TrayMesh({
  tray,
  mesh,
  active,
}: {
  tray: PlacedTray;
  mesh: TriMesh;
  active: boolean;
}) {
  const geo = useTrayGeometry(mesh);
  // previewHexOf: clamp hex cực đoan (#000000/#FFFFFF) để 3D còn diffuse shading;
  // swatch UI vẫn dùng hex gốc (đúng thiết kế).
  const hex = previewHexOf(findColor(tray.color));
  return (
    <mesh
      geometry={geo}
      position={[tray.tile.x, tray.tile.y, tray.zBase]}
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
  return (
    <>
      <DrawerGhost w={drawer.w} d={drawer.d} h={drawer.h} />
      {sheet.built.trays.map((t) => {
        const key = `${t.levelIdx}-${t.trayIdx}`;
        const mesh = sheet.meshes.get(key);
        if (!mesh) return null;
        return (
          <TrayMesh
            key={key}
            tray={t}
            mesh={mesh}
            active={t.levelIdx === sheet.activeLevel}
          />
        );
      })}
    </>
  );
}
