// =============================================================================
// Scene3D — Canvas R3F: nền giấy ấm (--color-paper), ánh sáng mềm (ambient +
// key directional có bóng + fill), OrbitControls damping, FitCamera nhìn
// trước-trên (0, 0.5, 1) fit theo kích thước ngăn kéo (re-fit khi w/d đổi).
//
// Coordinate mapping: engine z-up mm → group rotation.x=-π/2, position
// (-W/2, 0, D/2) ⇒ điểm engine (x,y,z) → world (x−W/2, z, D/2−y); mặt trước
// ngăn kéo (y=0) quay về +z world (camera). children đặt TRONG group này và
// dùng thẳng toạ độ engine.
// =============================================================================
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { NeutralToneMapping, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { KhaySheet } from './useKhaySheet';
import { LIFT_GAP } from './TrayMeshes';

const _fitDir = new Vector3();
const _fitTarget = new Vector3();

/** DEV-only: lộ store R3F ra window.__khayR3F cho verify tự động (như debugApi). */
function ExposeR3F() {
  const state = useThree();
  useLayoutEffect(() => {
    (window as unknown as Record<string, unknown>).__khayR3F = state;
  });
  return null;
}

/** Camera tự fit khung: lần đầu nhìn trước-trên (0, 0.5, 1); các lần re-fit
 *  sau giữ hướng user đang xem, chỉ chỉnh khoảng cách + target. */
function FitCamera({ w, d, h }: { w: number; d: number; h: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as
    | { target: Vector3; update: () => void }
    | null;
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (!controls) return;
    const radius = 0.5 * Math.hypot(w, d, h);
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / size.height || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // Đệm 1.5: chừa vùng cho chrome nổi (TopBar trên, dock dưới).
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.5;
    _fitTarget.set(0, h * 0.35, 0);
    if (fitted.current) {
      _fitDir.copy(camera.position).sub(controls.target);
      if (_fitDir.lengthSq() < 1) _fitDir.set(0, 0.5, 1);
    } else {
      _fitDir.set(0, 0.5, 1); // trước-trên: thấy cả miệng khay lẫn mặt trước
    }
    _fitDir.normalize();
    camera.position.copy(_fitTarget).addScaledVector(_fitDir, dist);
    controls.target.copy(_fitTarget);
    controls.update();
    fitted.current = true;
  }, [w, d, h, size.width, size.height, camera, controls]);
  return null;
}

export function Scene3D({
  sheet,
  children,
  onPointerMissed,
}: {
  sheet: KhaySheet;
  children: ReactNode;
  onPointerMissed?: () => void;
}) {
  const { w, d, h } = sheet.layout.drawer;
  // Exploded view: tầng phía trên tầng active được TrayMeshes nhấc LIFT_GAP/tầng
  // — camera phải fit theo chiều cao HIỂN THỊ, không thì tầng nhấc bị cắt khung.
  const liftLevels = Math.max(0, sheet.layout.levels.length - 1 - sheet.activeLevel);
  const fitH = h + liftLevels * LIFT_GAP;
  return (
    <Canvas
      shadows="percentage" /* PCF — three mới deprecate PCFSoft ("soft"/true), fallback PCF + spam warn mỗi frame */
      onPointerMissed={onPointerMissed}
      camera={{ position: [0, 300, 620], fov: 35, near: 1, far: 20000 }}
      gl={{ preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
    >
      {/* Nền giấy ấm — khớp token --color-paper của UI chrome. */}
      <color attach="background" args={['#eceae5']} />
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[350, 700, 450]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
        shadow-camera-near={100}
        shadow-camera-far={2500}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-420, 320, -260]} intensity={0.35} />
      {/* Sàn hứng bóng mềm — chỉ nhận shadow, không đổi màu nền giấy. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[8000, 8000]} />
        <shadowMaterial opacity={0.13} />
      </mesh>
      {/* Group coordinate mapping engine→world (xem header). */}
      <group rotation-x={-Math.PI / 2} position={[-w / 2, 0, d / 2]}>
        {children}
      </group>
      <FitCamera w={w} d={d} h={fitH} />
      {import.meta.env.DEV && <ExposeR3F />}
      <OrbitControls
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.05}
        minDistance={120}
        maxDistance={6000}
      />
    </Canvas>
  );
}
