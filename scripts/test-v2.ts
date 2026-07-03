// =============================================================================
// test-v2.ts — nghiệm thu engine V2 (khay module rời + cắt mảnh mộng puzzle).
// Chạy: pnpm test. In ✓/✗ từng assert, exit 1 nếu có fail.
// A. GEOMETRY: buildTrayPieces (manifold CSG) + validateManifold + tetra volume.
// B. MODEL: layout/pricing/export thuần TS.
// Cuối cùng ghi STL mẫu vào samples/v2/.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTrayPieces } from '../src/engine/geometry/solid2';
import { getManifold, type ManifoldTop } from '../src/engine/geometry/csg';
import { validateManifold } from '../src/engine/geometry/validate';
import { meshVolumeMm3 } from '../src/engine/geometry/volume2';
import { writeBinaryStl } from '../src/engine/geometry/stl';
import type { TriMesh } from '../src/engine/geometry/types';
import type { TraySpec2, TrayPiece } from '../src/engine/geometry/solid2-types';
import { DEFAULT_KHAY_CATALOG, stackingDims } from '../src/engine/catalog';
import {
  buildAllTrays,
  decodeBlocks2,
  defaultLayout,
  encodeBlocks,
  fullGridBlocks,
  mergeRect,
  setBlockColor,
  setGrid,
  trayRectOf,
  unmergeAt,
  type Block2,
  type KhayLayout,
} from '../src/engine/layout';
import { computeKhayPrice } from '../src/engine/pricing';
import { buildOrderZip } from '../src/engine/export';

// ── assert helper ────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
function ok(name: string, cond: boolean, extra = ''): void {
  const tail = extra ? ` — ${extra}` : '';
  if (cond) {
    passCount++;
    console.log(`  ✓ ${name}${tail}`);
  } else {
    failCount++;
    console.log(`  ✗ ${name}${tail}`);
  }
}
function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// ── helpers hình học cho test ────────────────────────────────────────────────

/** Phủ bì mặt cắt z≈0 (đo footprint chân đế/chân cắm từ đỉnh mesh). */
function footprintAtZ0(mesh: TriMesh): { w: number; d: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 2] <= 1e-4) {
      if (p[i] < minX) minX = p[i];
      if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1];
      if (p[i + 1] > maxY) maxY = p[i + 1];
    }
  }
  return { w: maxX - minX, d: maxY - minY };
}

/**
 * Đếm tam giác úp xuống dốc hơn 45° (pháp tuyến đơn vị nz < −0.71) mà lại nằm
 * TRÊN vùng đáy/chân (max z đỉnh > zAllow) — overhang treo giữa thân = lỗi in.
 */
function overhangViolations(mesh: TriMesh, zAllow: number): number {
  const { positions, indices } = mesh;
  let bad = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue; // suy biến — validateManifold đã bắt riêng
    if (nz / len < -0.71) {
      const zMax = Math.max(positions[a + 2], positions[b + 2], positions[c + 2]);
      if (zMax > zAllow) bad++;
    }
  }
  return bad;
}

/** Dựng lại Manifold từ TriMesh đã xuất (kiểm tách rời 2 mảnh bằng intersect). */
function meshToManifold(wasm: ManifoldTop, mesh: TriMesh): InstanceType<ManifoldTop['Manifold']> {
  const m = new wasm.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(mesh.positions),
    triVerts: Uint32Array.from(mesh.indices),
  });
  let solid = new wasm.Manifold(m);
  if (solid.status() !== 'NoError') {
    m.merge(); // vá merge-vector nếu round-trip làm mất
    solid = new wasm.Manifold(m);
  }
  return solid;
}

type Solid = InstanceType<ManifoldTop['Manifold']>;

/**
 * Ray +z tại (x,y): trả các z giao với mesh (sắp tăng dần). Cột ĐẶC → cặp
 * [zVào, zRa] cách nhau > 0; màng 0-dày → cặp z TRÙNG NHAU; cột rỗng → [].
 * Dùng bắt lỗi màng 0-dày bịt miệng hốc mộng trên mảnh cái.
 */
function rayZHits(mesh: TriMesh, x: number, y: number): number[] {
  const { positions: P, indices: I } = mesh;
  const zs: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ax = P[a] - x, ay = P[a + 1] - y;
    const bx = P[b] - x, by = P[b + 1] - y;
    const cx = P[c] - x, cy = P[c + 1] - y;
    const d1 = ax * by - ay * bx;
    const d2 = bx * cy - by * cx;
    const d3 = cx * ay - cy * ax;
    const inside = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
    if (!inside) continue;
    const area2 = d1 + d2 + d3;
    if (Math.abs(area2) < 1e-12) continue;
    zs.push((d2 * P[a + 2] + d3 * P[b + 2] + d1 * P[c + 2]) / area2);
  }
  return zs.sort((p, q) => p - q);
}

/** Tổng diện tích tam giác úp gần-phẳng (nz<−0.9) có cả 3 đỉnh tại z≈z0, trong dải x∈[x0,x1]. */
function downFaceAreaAtZ(mesh: TriMesh, z0: number, x0: number, x1: number): number {
  const { positions: P, indices: I } = mesh;
  let area = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    if (Math.abs(P[a + 2] - z0) > 1e-4 || Math.abs(P[b + 2] - z0) > 1e-4 || Math.abs(P[c + 2] - z0) > 1e-4) continue;
    const xs = [P[a], P[b], P[c]];
    if (Math.min(...xs) < x0 - 1e-6 || Math.max(...xs) > x1 + 1e-6) continue;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    if (nz / len < -0.9) area += len / 2;
  }
  return area;
}

/**
 * Worst thể tích giao ĐÔI MỘT giữa các mảnh (mm³). shift ≠ null → dịch LẦN
 * LƯỢT từng mảnh trước khi giao (đo khe lắp hiệu dụng: dịch g mà chưa chạm
 * nghĩa là khe ≥ ~g theo hướng đó).
 */
function worstPairIntersect(solids: Solid[], shift: [number, number, number] | null): number {
  let worst = 0;
  for (let i = 0; i < solids.length; i++) {
    const a = shift ? solids[i].translate(shift) : solids[i];
    for (let j = 0; j < solids.length; j++) {
      if (j === i || (!shift && j < i)) continue;
      const v = a.intersect(solids[j]).volume();
      if (v > worst) worst = v;
    }
  }
  return worst;
}

// ── chạy toàn bộ ─────────────────────────────────────────────────────────────
const cat = DEFAULT_KHAY_CATALOG;
const style = cat.style;
const IVORY = 'matte-ivory-white';

async function main(): Promise<void> {
  // ========================== A. GEOMETRY ====================================

  console.log('\nA1. Khay đơn 120×90×35 (style mặc định)');
  const specDon: TraySpec2 = { name: 'DON', w: 120, d: 90, h: 35, style };
  const donPieces = await buildTrayPieces(specDon, []);
  ok('1 mảnh', donPieces.length === 1, `${donPieces.length} mảnh`);
  const don = donPieces[0];
  const donCheck = validateManifold(don.mesh);
  ok('validateManifold ok', donCheck.ok, donCheck.problems.join('; '));
  const donTetra = meshVolumeMm3(don.mesh);
  const donRel = Math.abs(donTetra - don.volumeMm3) / don.volumeMm3;
  ok('tetra khớp manifold.volume() <1e-6', donRel < 1e-6, `rel=${donRel.toExponential(2)}`);
  ok(
    'bbox ≈ [120,90,35] ±0.05',
    approx(don.bbox[0], 120, 0.05) && approx(don.bbox[1], 90, 0.05) && approx(don.bbox[2], 35, 0.05),
    don.bbox.map((v) => v.toFixed(3)).join('×'),
  );
  ok('volume hợp lý 60k–140k mm³', don.volumeMm3 > 60_000 && don.volumeMm3 < 140_000, `${don.volumeMm3.toFixed(0)} mm³`);

  console.log('\nA2. Khay plug (stack) 120×90×37.8');
  const sd = stackingDims(style, cat.limits);
  ok('plugInset = 4.3, seatDepth = 2.8', approx(sd.plugInset, 4.3, 1e-9) && approx(sd.seatDepth, 2.8, 1e-9));
  const specPlug: TraySpec2 = {
    name: 'PLUG',
    w: 120,
    d: 90,
    h: 35 + sd.seatDepth,
    style,
    plug: { inset: sd.plugInset, height: cat.limits.lipH, chamferH: sd.chamferH },
  };
  const plugPieces = await buildTrayPieces(specPlug, []);
  ok('1 mảnh', plugPieces.length === 1);
  const plug = plugPieces[0];
  const plugCheck = validateManifold(plug.mesh);
  ok('validateManifold ok', plugCheck.ok, plugCheck.problems.join('; '));
  ok(
    'bbox ≈ [120,90,37.8] ±0.05',
    approx(plug.bbox[0], 120, 0.05) && approx(plug.bbox[1], 90, 0.05) && approx(plug.bbox[2], 37.8, 0.05),
    plug.bbox.map((v) => v.toFixed(3)).join('×'),
  );
  // Footprint đáy = mặt cắt z=0: plug thụt 4.3 mỗi cạnh → (120−8.6)×(90−8.6).
  const fp = footprintAtZ0(plug.mesh);
  ok(
    'footprint đáy plug ≈ 111.4×81.4 ±0.05',
    approx(fp.w, 120 - 2 * sd.plugInset, 0.05) && approx(fp.d, 90 - 2 * sd.plugInset, 0.05),
    `${fp.w.toFixed(3)}×${fp.d.toFixed(3)}`,
  );

  console.log('\nA3. Khay cắt 2 mảnh 300×90×35 (cut x tại 150)');
  const specCat: TraySpec2 = { name: 'CAT', w: 300, d: 90, h: 35, style };
  const wholePieces = await buildTrayPieces(specCat, []);
  const whole = wholePieces[0];
  const cutPieces = await buildTrayPieces(specCat, [{ axis: 'x', at: 150 }]);
  ok('2 mảnh', cutPieces.length === 2, cutPieces.map((p) => p.name).join(', '));
  for (const p of cutPieces) {
    const c = validateManifold(p.mesh);
    ok(`${p.name} validate ok + genus 0 (χ=2)`, c.ok && c.stats.euler === 2, c.ok ? `χ=${c.stats.euler}` : c.problems.join('; '));
    ok(`${p.name} bbox ≤ 176 mọi chiều`, p.bbox.every((v) => v <= 176), p.bbox.map((v) => v.toFixed(1)).join('×'));
  }
  const sumCut = cutPieces.reduce((s, p) => s + p.volumeMm3, 0);
  ok(
    'Σ volume 2 mảnh < khay nguyên (mất khe) và > 95%',
    sumCut < whole.volumeMm3 && sumCut > 0.95 * whole.volumeMm3,
    `Σ=${sumCut.toFixed(0)} vs nguyên=${whole.volumeMm3.toFixed(0)}`,
  );
  // Tách rời: dựng lại 2 Manifold từ TriMesh đã xuất, intersect phải rỗng.
  const wasm = await getManifold();
  const mA = meshToManifold(wasm, cutPieces[0].mesh);
  const mB = meshToManifold(wasm, cutPieces[1].mesh);
  ok('dựng lại Manifold từ mesh ok', mA.status() === 'NoError' && mB.status() === 'NoError');
  const interVol = mA.intersect(mB).volume();
  ok('2 mảnh TÁCH RỜI (intersect < 1mm³)', interVol < 1, `${interVol.toFixed(4)} mm³`);

  // Chốt lỗi màng 0-dày: mảnh CÁI từng bị intersect giữ lại mảng tam giác thể
  // tích 0 bịt miệng MỌI hốc mộng tại z=floorTopZ (slicer đắp bậy 1 layer →
  // mộng đực không cắm được; preview z-fighting). Fix: mảnh cái = subtract.
  console.log('\nA3b. Mảnh cái KHÔNG màng 0-dày bịt miệng hốc mộng');
  const floorTopZ = style.baseInset + style.baseH + style.floorT; // 7 với style mặc định
  // Cut x@150, khay sâu 90 → 2 bầu mộng tại y=22.5/67.5, tab x∈[150..157].
  // Điểm dò lệch nhẹ khỏi trục đối xứng bầu để không đâm trúng cạnh tam giác.
  for (const [bx, by] of [[153.4, 22.9], [153.4, 67.1]] as const) {
    const hitsF = rayZHits(cutPieces[1].mesh, bx, by);
    ok(
      `cột hốc (${bx},${by}) mảnh cái RỖNG suốt (0 giao — không màng)`,
      hitsF.length === 0,
      hitsF.length ? `z=[${hitsF.map((z) => z.toFixed(4)).join(', ')}]` : '',
    );
    const hitsM = rayZHits(cutPieces[0].mesh, bx, by);
    ok(
      `cột tab (${bx},${by}) mảnh đực ĐẶC [0..${floorTopZ}]`,
      hitsM.length === 2 && approx(hitsM[0], 0, 1e-3) && approx(hitsM[1], floorTopZ, 1e-3),
      `z=[${hitsM.map((z) => z.toFixed(4)).join(', ')}]`,
    );
  }
  // Không còn mặt úp nằm ngang tại z=sàn trên vùng miệng hốc (x ≥ at+0.2 để
  // loại bậc 0.1mm hợp lệ ở chân vách; màng cũ ~170mm² nằm trọn trong dải này).
  const membArea = downFaceAreaAtZ(cutPieces[1].mesh, floorTopZ, 150.2, 158);
  ok('0 mm² mặt úp tại z=sàn trên miệng hốc (x∈[150.2,158])', membArea < 0.01, `${membArea.toFixed(3)} mm²`);

  // Khoá TOẠ ĐỘ vách mặt cắt trên mesh XUẤT (đo BỀ MẶT thật bằng CSG: giao
  // mảnh với hộp probe quanh mặt cắt rồi đọc bbox) — chống mọi hậu-xử-lý mesh
  // kéo trôi vách (kiểu tolerance-simplify cũ lệch tới ~7mm). Trên sàn: đực
  // at−0.05 / cái at+0.05; dưới sàn (dò GIỮA các bầu mộng): đực at / cái at+0.15.
  const wallLock = (
    label: string,
    solid: InstanceType<ManifoldTop['Manifold']>,
    side: 'max' | 'min',
    want: number,
    yBox: [number, number],
    zBox: [number, number],
  ): void => {
    const probe = wasm.CrossSection.square([10, yBox[1] - yBox[0]], false)
      .translate([want - 5, yBox[0]])
      .extrude(zBox[1] - zBox[0])
      .translate([0, 0, zBox[0]]);
    const bb = solid.intersect(probe).boundingBox();
    const got = side === 'max' ? bb.max[0] : bb.min[0];
    ok(`vách ${label} đúng thiết kế ±1e-3`, Math.abs(got - want) <= 1e-3, `x=${got.toFixed(5)}`);
  };
  wallLock('đực trên sàn @149.95', mA, 'max', 149.95, [-1, 91], [10, 30]);
  wallLock('cái trên sàn @150.05', mB, 'min', 150.05, [-1, 91], [10, 30]);
  wallLock('đực dưới sàn @150.00', mA, 'max', 150.0, [32, 58], [1, 6]);
  wallLock('cái dưới sàn @150.15', mB, 'min', 150.15, [32, 58], [1, 6]);

  // LƯU Ý: đề gốc ghi 360×360 nhưng 360/2 = 180 > maxPieceMm 168 → mâu thuẫn
  // chuẩn bbox ≤ 176; dùng 336×336 = cỡ lớn nhất còn chia 2×2 đúng luật layout
  // (cuts tại 168 y hệt buildAllTrays sinh ra).
  console.log('\nA4. Khay cắt 2 trục 336×336×25 → 4 mảnh (2×2)');
  const specBig: TraySpec2 = { name: 'BIG', w: 336, d: 336, h: 25, style };
  const bigPieces = await buildTrayPieces(specBig, [
    { axis: 'x', at: 168 },
    { axis: 'y', at: 168 },
  ]);
  ok('4 mảnh', bigPieces.length === 4, bigPieces.map((p) => p.name).join(', '));
  for (const p of bigPieces) {
    const c = validateManifold(p.mesh);
    ok(`${p.name} validate ok`, c.ok, c.ok ? '' : c.problems.join('; '));
    ok(`${p.name} bbox ≤ 176`, p.bbox.every((v) => v <= 176), p.bbox.map((v) => v.toFixed(1)).join('×'));
  }
  const bigSolids = bigPieces.map((p) => meshToManifold(wasm, p.mesh));
  const bigWorst = worstPairIntersect(bigSolids, null);
  ok('4 mảnh đôi một TÁCH RỜI (worst < 0.01 mm³)', bigWorst < 0.01, `${bigWorst.toFixed(4)} mm³`);

  // Chốt lỗi cleanup biến dạng: pipeline "làm sạch" cũ (simplify 0.01 + Mesh
  // tolerance 0.005 + simplify) kéo vách ổ mộng cái lệch tới ~7mm → mảnh chồng
  // lấn (336×150: 188.7mm³; 200×200 2×2: 18.2mm³) hoặc khe 0.15 gặm còn 0.05
  // (336×200 2×2) — toàn case buildAllTrays SINH RA THẬT. Đo trên mesh XUẤT.
  console.log('\nA4b. Khe lắp mảnh giữ đúng thiết kế sau xuất mesh (336×150 cut@168)');
  const layFit: KhayLayout = {
    v: 2,
    drawer: { w: 338, d: 152, h: 40 },
    fit: 'chuan',
    grid: { rows: 1, cols: 1 },
    levels: [{ h: 35, blocks: fullGridBlocks(1, 1, IVORY) }],
  };
  const tFit = buildAllTrays(layFit, cat).trays[0];
  ok(
    'ngăn kéo 338×152 → khay 336×150, cut x@168',
    approx(tFit.spec.w, 336, 1e-9) && approx(tFit.spec.d, 150, 1e-9) &&
      tFit.cuts.length === 1 && tFit.cuts[0].axis === 'x' && approx(tFit.cuts[0].at, 168, 1e-9),
    `w=${tFit.spec.w} cuts=${JSON.stringify(tFit.cuts)}`,
  );
  const fitPieces = await buildTrayPieces(tFit.spec, tFit.cuts);
  for (const p of fitPieces) {
    const c = validateManifold(p.mesh);
    ok(`${p.name} validate ok`, c.ok, c.ok ? '' : c.problems.join('; '));
  }
  const fitSolids = fitPieces.map((p) => meshToManifold(wasm, p.mesh));
  const fitW0 = worstPairIntersect(fitSolids, null);
  ok('2 mảnh tách rời (từng chồng 188.7mm³)', fitW0 < 0.01, `${fitW0.toFixed(4)} mm³`);
  // Khe hiệu dụng: dịch 0.09 (< hở mặt phẳng trên 0.1) mọi hướng vẫn KHÔNG chạm.
  const fitW9 = Math.max(
    worstPairIntersect(fitSolids, [0.09, 0, 0]),
    worstPairIntersect(fitSolids, [0, 0.09, 0]),
  );
  ok('dịch ±0.09mm (x/y) chưa chạm → khe lắp không bị gặm', fitW9 < 0.05, `${fitW9.toFixed(4)} mm³`);
  // Khoá vách mặt cắt @168 (3 bầu tại y=25/75/125 → dò dưới sàn giữa bầu y∈[38,62]).
  wallLock('336×150 đực trên sàn @167.95', fitSolids[0], 'max', 167.95, [-1, 151], [10, 30]);
  wallLock('336×150 cái trên sàn @168.05', fitSolids[1], 'min', 168.05, [-1, 151], [10, 30]);
  wallLock('336×150 đực dưới sàn @168.00', fitSolids[0], 'max', 168.0, [38, 62], [1, 6]);
  wallLock('336×150 cái dưới sàn @168.15', fitSolids[1], 'min', 168.15, [38, 62], [1, 6]);
  const touch25 = fitSolids[0].translate([0.25, 0, 0]).intersect(fitSolids[1]).volume();
  ok('dịch +0.25mm CHẠM → 2 mảnh thật sự kề nhau, khe không nở quá đà', touch25 > 1, `${touch25.toFixed(1)} mm³`);

  console.log('\nA4c. Khay 2 trục qua buildAllTrays: 200×200 + 336×200 (2×2)');
  for (const [dw, dd] of [[202, 202], [338, 202]] as const) {
    const lay2: KhayLayout = {
      v: 2,
      drawer: { w: dw, d: dd, h: 40 },
      fit: 'chuan',
      grid: { rows: 1, cols: 1 },
      levels: [{ h: 35, blocks: fullGridBlocks(1, 1, IVORY) }],
    };
    const t2 = buildAllTrays(lay2, cat).trays[0];
    const p2 = await buildTrayPieces(t2.spec, t2.cuts);
    const label = `${t2.spec.w}×${t2.spec.d}`;
    ok(`${label}: 4 mảnh, validate ok hết`, p2.length === 4 && p2.every((p) => validateManifold(p.mesh).ok));
    const s2 = p2.map((p) => meshToManifold(wasm, p.mesh));
    const w0 = worstPairIntersect(s2, null);
    ok(`${label}: đôi một tách rời`, w0 < 0.01, `${w0.toFixed(4)} mm³`);
    const w9 = Math.max(
      worstPairIntersect(s2, [0.09, 0, 0]),
      worstPairIntersect(s2, [0, 0.09, 0]),
    );
    ok(`${label}: dịch ±0.09mm chưa chạm → khe không bị gặm`, w9 < 0.05, `${w9.toFixed(4)} mm³`);
  }

  console.log('\nA5. Overhang audit khay đơn (không tam giác úp >45° treo giữa thân)');
  const zBody0 = style.baseH + style.baseInset; // 4 — trên mức này cấm úp dốc
  const badTris = overhangViolations(don.mesh, zBody0 + 0.01);
  ok('mọi mặt úp dốc hơn 45° đều ở vùng chân (z < 4.01)', badTris === 0, `${badTris} tam giác vi phạm`);

  // ========================== B. MODEL =======================================

  console.log('\nB6. defaultLayout 400×300×120');
  const dl = defaultLayout({ w: 400, d: 300, h: 120 }, 'chuan', cat);
  ok('cols ~3-4', dl.grid.cols >= 3 && dl.grid.cols <= 4, `cols=${dl.grid.cols}`);
  ok('rows ~2-3', dl.grid.rows >= 2 && dl.grid.rows <= 3, `rows=${dl.grid.rows}`);
  ok('1 tầng cao 65', dl.levels.length === 1 && dl.levels[0].h === 65, `${dl.levels.length} tầng, h=${dl.levels[0]?.h}`);
  const dlBlocks = decodeBlocks2(dl.levels[0].blocks, dl.grid.rows, dl.grid.cols);
  ok(
    'mọi block 1×1 phủ kín lưới',
    dlBlocks.length === dl.grid.rows * dl.grid.cols && dlBlocks.every((b) => b.rs === 1 && b.cs === 1),
    `${dlBlocks.length} block`,
  );

  console.log('\nB7. mergeRect/unmerge giữ màu + setGrid reset + codec round-trip');
  let l7 = defaultLayout({ w: 302, d: 202, h: 80 }, 'chuan', cat);
  l7 = setGrid(l7, 2, 2, cat);
  l7 = setBlockColor(l7, 0, 0, 0, 'matte-caramel'); // anchor (0,0) caramel, còn lại ivory
  l7 = mergeRect(l7, 0, 0, 0, 1, 1);
  const merged = decodeBlocks2(l7.levels[0].blocks, 2, 2);
  ok(
    'mergeRect → 1 block 2×2 giữ màu anchor',
    merged.length === 1 && merged[0].rs === 2 && merged[0].cs === 2 && merged[0].color === 'matte-caramel',
    merged.map((b) => `${b.rs}×${b.cs}:${b.color}`).join(', '),
  );
  const l7u = unmergeAt(l7, 0, 0, 0);
  const unmerged = decodeBlocks2(l7u.levels[0].blocks, 2, 2);
  ok(
    'unmerge → 4 block 1×1 giữ màu',
    unmerged.length === 4 && unmerged.every((b) => b.rs === 1 && b.cs === 1 && b.color === 'matte-caramel'),
  );
  // setGrid reset blocks MỌI tầng, giữ màu chủ đạo từng tầng.
  const l7b: KhayLayout = {
    v: 2,
    drawer: { w: 302, d: 202, h: 120 },
    fit: 'chuan',
    grid: { rows: 2, cols: 2 },
    levels: [
      { h: 35, blocks: fullGridBlocks(2, 2, 'matte-caramel') },
      { h: 35, blocks: fullGridBlocks(2, 2, 'matte-plum') },
    ],
  };
  const l7g = setGrid(l7b, 3, 3, cat);
  const g1 = decodeBlocks2(l7g.levels[0].blocks, 3, 3);
  const g2 = decodeBlocks2(l7g.levels[1].blocks, 3, 3);
  ok(
    'setGrid 3×3 reset cả 2 tầng về 1×1, giữ màu chủ đạo',
    l7g.grid.rows === 3 && l7g.grid.cols === 3 &&
      g1.length === 9 && g1.every((b) => b.rs === 1 && b.cs === 1 && b.color === 'matte-caramel') &&
      g2.length === 9 && g2.every((b) => b.rs === 1 && b.cs === 1 && b.color === 'matte-plum'),
  );
  const bs: Block2[] = [
    { r: 0, c: 0, rs: 1, cs: 2, color: 'matte-charcoal' },
    { r: 1, c: 0, rs: 1, cs: 1, color: 'matte-caramel' },
    { r: 1, c: 1, rs: 1, cs: 1, color: IVORY },
  ];
  const rt = decodeBlocks2(encodeBlocks(bs), 2, 2);
  ok('codec round-trip giữ colorId', JSON.stringify(rt) === JSON.stringify(bs));

  console.log('\nB8. trayRect: khe 0.5 giữa khay kề, cạnh biên không co');
  const l8: KhayLayout = {
    v: 2,
    drawer: { w: 302, d: 202, h: 40 },
    fit: 'chuan', // clear 1.0 mỗi cạnh
    grid: { rows: 2, cols: 2 },
    levels: [{ h: 35, blocks: fullGridBlocks(2, 2, IVORY) }],
  };
  const r00 = trayRectOf(l8, cat, { r: 0, c: 0, rs: 1, cs: 1 });
  const r01 = trayRectOf(l8, cat, { r: 0, c: 1, rs: 1, cs: 1 });
  ok('khe 0.5 giữa 2 khay kề', approx(r00.x + r00.w + 0.5, r01.x, 1e-9), `${(r01.x - r00.x - r00.w).toFixed(3)}mm`);
  ok('cạnh biên trái = fitClear (không co)', approx(r00.x, 1.0, 1e-9), `x=${r00.x}`);
  ok('cạnh biên phải = drawer.w − fitClear', approx(r01.x + r01.w, 302 - 1.0, 1e-9), `${(r01.x + r01.w).toFixed(3)}`);

  console.log('\nB9. Split plan theo maxPieceMm 168 / trần 4 mảnh');
  const mk1x1 = (w: number): KhayLayout => ({
    v: 2,
    drawer: { w, d: 102, h: 40 },
    fit: 'chuan',
    grid: { rows: 1, cols: 1 },
    levels: [{ h: 35, blocks: fullGridBlocks(1, 1, IVORY) }],
  });
  const t200 = buildAllTrays(mk1x1(202), cat).trays[0]; // khay 200mm
  ok('200mm → 1 cut (2 mảnh)', t200.cuts.length === 1 && t200.cuts[0].axis === 'x' && approx(t200.cuts[0].at, 100, 1e-9),
    `cuts=${JSON.stringify(t200.cuts)}`);
  const t500 = buildAllTrays(mk1x1(502), cat).trays[0]; // khay 500mm
  ok('500mm → 2 cut (3 mảnh ≤ trần 4)', t500.cuts.length === 2 && t500.cuts.every((c) => c.axis === 'x'),
    `cuts=${JSON.stringify(t500.cuts)}`);
  let thrown = '';
  try {
    buildAllTrays(mk1x1(900), cat); // 898mm → 6 mảnh > 4 → throw tiếng Việt
  } catch (e) {
    thrown = e instanceof Error ? e.message : String(e);
  }
  ok('900mm full-span → throw tiếng Việt "vượt trần"', /vượt trần/.test(thrown), thrown);

  console.log('\nB10. Stack: plug khi partition trùng, warning khi lệch');
  const l10: KhayLayout = {
    v: 2,
    drawer: { w: 302, d: 202, h: 120 },
    fit: 'chuan',
    grid: { rows: 2, cols: 2 },
    levels: [
      { h: 35, blocks: fullGridBlocks(2, 2, 'matte-caramel') },
      { h: 35, blocks: fullGridBlocks(2, 2, 'matte-plum') },
    ],
  };
  const b10 = buildAllTrays(l10, cat);
  const lv2 = b10.trays.filter((t) => t.levelIdx === 1);
  ok('tầng 2 (partition trùng): 4/4 khay có plug', lv2.length === 4 && lv2.every((t) => t.spec.plug !== undefined));
  ok('tầng 2 zBase = h1 − 2.8', lv2.every((t) => approx(t.zBase, 35 - sd.seatDepth, 1e-9)), `zBase=${lv2[0]?.zBase}`);
  ok('tầng 2 spec.h = 35 + 2.8', lv2.every((t) => approx(t.spec.h, 35 + sd.seatDepth, 1e-9)), `h=${lv2[0]?.spec.h}`);
  ok('tầng 1 không plug, zBase 0', b10.trays.filter((t) => t.levelIdx === 0).every((t) => !t.spec.plug && t.zBase === 0));
  // Tầng 2 merge thêm → block (0,0,1,2) không khớp dưới → không plug + warning.
  const l10m: KhayLayout = {
    ...l10,
    levels: [
      l10.levels[0],
      {
        h: 35,
        blocks: encodeBlocks([
          { r: 0, c: 0, rs: 1, cs: 2, color: 'matte-plum' },
          { r: 1, c: 0, rs: 1, cs: 1, color: 'matte-plum' },
          { r: 1, c: 1, rs: 1, cs: 1, color: 'matte-plum' },
        ]),
      },
    ],
  };
  const b10m = buildAllTrays(l10m, cat);
  const t1l2 = b10m.trays.find((t) => t.name === 'T1-L2');
  const rest = b10m.trays.filter((t) => t.levelIdx === 1 && t.name !== 'T1-L2');
  ok('block lệch: T1-L2 KHÔNG plug', !!t1l2 && t1l2.spec.plug === undefined && t1l2.zBase === 35);
  ok('block còn khớp: T2/T3-L2 vẫn plug', rest.length === 2 && rest.every((t) => t.spec.plug !== undefined));
  ok('có warning "gác lên nhiều khay dưới"', b10m.warnings.some((w) => w.includes('gác lên nhiều khay dưới')), b10m.warnings.join(' | '));

  console.log('\nB11. Pricing khớp tính tay');
  const priced = computeKhayPrice(
    [
      { name: 'T1-L1', color: 'matte-charcoal', volumeMm3: 100_000 },
      { name: 'T2-L1', color: 'matte-caramel', volumeMm3: 50_000 },
    ],
    cat,
  );
  // Tay: gram = vol/1000 × 1.24 × 1.05; fee 15k/mảnh; tổng làm tròn 1000, sàn 99k.
  const gA = 100 * 1.24 * 1.05;
  const gB = 50 * 1.24 * 1.05;
  const handTotal = Math.max(99_000, Math.round(((gA + gB) * 800 + 2 * 15_000) / 1000) * 1000);
  ok('gram từng mảnh khớp', approx(priced.lines[0].grams, gA, 1e-9) && approx(priced.lines[1].grams, gB, 1e-9),
    `${priced.lines[0].grams.toFixed(2)}g + ${priced.lines[1].grams.toFixed(2)}g`);
  ok('totalGrams khớp', approx(priced.totalGrams, gA + gB, 1e-9));
  ok('baseFees = 15k × 2 mảnh', priced.baseFees === 30_000 && priced.pieceCount === 2);
  ok('total khớp tính tay', priced.total === handTotal, `${priced.total} vs ${handTotal}`);

  console.log('\nB12. Export ZIP');
  const layA: KhayLayout = {
    v: 2,
    drawer: { w: 150, d: 100, h: 40 },
    fit: 'chuan',
    grid: { rows: 1, cols: 1 },
    levels: [{ h: 35, blocks: fullGridBlocks(1, 1, 'matte-charcoal') }],
  };
  const expA = await buildOrderZip(buildAllTrays(layA, cat).trays, cat);
  ok('khay nhỏ → 1 STL', expA.files.length === 1 && expA.pieceCount === 1, expA.files.join(', '));
  ok('ZIP có dữ liệu + manifest gom lô theo màu',
    expA.zip.length > 1000 && expA.manifest.includes('GOM LÔ THEO MÀU') && !expA.manifest.includes('KHAY NHIỀU MẢNH'));
  const layB: KhayLayout = {
    v: 2,
    drawer: { w: 302, d: 102, h: 40 },
    fit: 'chuan',
    grid: { rows: 1, cols: 1 },
    levels: [{ h: 35, blocks: fullGridBlocks(1, 1, IVORY) }],
  };
  const expB = await buildOrderZip(buildAllTrays(layB, cat).trays, cat);
  ok('khay 300 → 2 STL -M1/-M2',
    expB.files.length === 2 && expB.files.some((f) => f.includes('-M1')) && expB.files.some((f) => f.includes('-M2')),
    expB.files.join(', '));
  ok('manifest có hướng dẫn ghép mộng', expB.manifest.includes('KHAY NHIỀU MẢNH') && expB.manifest.includes('mộng'));

  // ── STL mẫu v2 ─────────────────────────────────────────────────────────────
  console.log('\nGhi STL mẫu → samples/v2/');
  const outDir = fileURLToPath(new URL('../samples/v2', import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const writeStl = (file: string, piece: TrayPiece): void => {
    writeFileSync(join(outDir, file), new Uint8Array(writeBinaryStl(piece.mesh, piece.name)));
    console.log(`  → ${file} (${piece.bbox.map((v) => v.toFixed(1)).join('×')}mm, ${piece.volumeMm3.toFixed(0)} mm³)`);
  };
  const mergePieces = await buildTrayPieces({ name: 'MERGE', w: 160, d: 160, h: 50, style }, []);
  writeStl('khay-don_120x90x35.stl', don);
  writeStl('khay-merge_160x160x50.stl', mergePieces[0]);
  writeStl('khay-cat-M1_300x90x35.stl', cutPieces[0]);
  writeStl('khay-cat-M2_300x90x35.stl', cutPieces[1]);
  writeStl('khay-plug_120x90x37.8.stl', plug);

  // ── tổng kết ───────────────────────────────────────────────────────────────
  console.log(`\n${failCount === 0 ? 'PASS' : 'FAIL'}: ${passCount} ✓ / ${failCount} ✗`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('TEST CRASH:', e);
  process.exit(1);
});
