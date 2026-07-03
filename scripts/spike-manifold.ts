// Spike: xác nhận API manifold-3d chạy trong node (tsx) — nền cho engine v2.
import Module from 'manifold-3d';
import { roundedRectPath } from '../src/engine/geometry/rounded-rect';

async function main(): Promise<void> {
  const wasm = await Module();
  wasm.setup();
  const { Manifold, CrossSection } = wasm;

  // CrossSection từ rounded rect points (Vec2[])
  const outerPts = roundedRectPath({ cx: 0, cy: 0, w: 120, d: 90, r: 11, segs: 16 }).map(
    (p) => [p[0], p[1]] as [number, number],
  );
  const outer = new CrossSection([outerPts]);
  console.log('CrossSection area:', outer.area().toFixed(1));

  const inset = outer.offset(-4, 'Round', 2, 16);
  console.log('offset -4 area:', inset.area().toFixed(1));

  const body = outer.extrude(30);
  const cavity = inset.extrude(28).translate([0, 0, 3]);
  const tray = body.subtract(cavity);
  console.log('tray volume mm3:', tray.volume().toFixed(0), 'genus:', tray.genus(), 'status:', tray.status());

  // hull 2 extrusion lồi (vát 45° chính xác)
  const plugPts = roundedRectPath({ cx: 0, cy: 0, w: 120 - 8.6, d: 90 - 8.6, r: 11 - 4.3, segs: 16 }).map(
    (p) => [p[0], p[1]] as [number, number],
  );
  const a = new CrossSection([plugPts]).extrude(0.01);
  const b = outer.extrude(0.01).translate([0, 0, 4.3]);
  const cham = Manifold.hull([a, b]);
  console.log('hull chamfer volume:', cham.volume().toFixed(0));

  const mesh = tray.getMesh();
  console.log('mesh: numProp', mesh.numProp, 'verts', mesh.vertProperties.length / mesh.numProp, 'tris', mesh.triVerts.length / 3);

  // boolean 2D cho jigsaw
  const cutBox = CrossSection.square([70, 100], false).translate([-10, -50]);
  const piece = outer.intersect(cutBox);
  console.log('2D intersect area:', piece.area().toFixed(1));
  console.log('SPIKE OK');
}

main().catch((e) => {
  console.error('SPIKE FAIL:', e);
  process.exit(1);
});
