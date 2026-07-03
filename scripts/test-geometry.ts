// =============================================================================
// test-geometry.ts — integration test cho engine hình học khay.
// Chạy: pnpm typecheck && pnpm test-geometry
// 6 case cố định + 20 case property (mulberry32 seed 42). KHÔNG nới assertion.
// =============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PocketRect, TraySpec, TriMesh } from '../src/engine/geometry/types';
import { buildTraySolid } from '../src/engine/geometry/tray-solid';
import { validateManifold } from '../src/engine/geometry/validate';
import { meshVolumeMm3, analyticTrayVolumeMm3 } from '../src/engine/geometry/volume';
import { writeBinaryStl, parseBinaryStl } from '../src/engine/geometry/stl';
import { createZip } from '../src/engine/geometry/zip';

// ---- Hằng số dùng chung ------------------------------------------------------
const WALL_T = 1.6;
const FLOOR_T = 1.6;
const OUTER_R = 6;
const POCKET_R = 3;
const ARC_SEGS = 16;
const PLUG = { inset: 1.9, height: 2.5, chamferH: 1.9 } as const;
const DROP = 3.1;
const PLA_G_PER_CM3 = 1.24;

const SAMPLES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'samples');

// ---- Helpers -----------------------------------------------------------------

/** Lưới cols×rows pocket trong lòng [wallT..w−wallT]×[wallT..d−wallT], vách wallT giữa các ô. */
function gridPockets(w: number, d: number, cols: number, rows: number, wallT: number): PocketRect[] {
  const innerW = w - 2 * wallT;
  const innerD = d - 2 * wallT;
  const cw = (innerW - (cols - 1) * wallT) / cols;
  const cd = (innerD - (rows - 1) * wallT) / rows;
  const out: PocketRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = wallT + c * (cw + wallT);
      const y0 = wallT + r * (cd + wallT);
      out.push({ x0, y0, x1: x0 + cw, y1: y0 + cd });
    }
  }
  return out;
}

/** PRNG mulberry32 — thuần, deterministic, KHÔNG Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Thể tích mm³ từ positions phẳng 9 số/tam giác (thứ tự file STL). */
function volumeFromFlatTris(positions: number[]): number {
  let vol6 = 0;
  for (let t = 0; t + 8 < positions.length; t += 9) {
    const ax = positions[t], ay = positions[t + 1], az = positions[t + 2];
    const bx = positions[t + 3], by = positions[t + 4], bz = positions[t + 5];
    const cx = positions[t + 6], cy = positions[t + 7], cz = positions[t + 8];
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return vol6 / 6;
}

function bbox(mesh: TriMesh): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

// ---- Khung assert ------------------------------------------------------------
let failCount = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (!ok) {
    failCount++;
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

interface CaseResult {
  name: string;
  triangles: number;
  volumeMeshMm3: number;
  volumeAnalyticMm3: number;
  diffPct: number;
  manifoldOk: boolean;
}

/** Chạy trọn bộ assertion cho 1 spec; trả kết quả cho bảng + StructuredOutput. */
function runCase(spec: TraySpec, opts: { stl?: boolean } = {}): { result: CaseResult; stl?: ArrayBuffer } {
  const mesh = buildTraySolid(spec);

  // 0. Không NaN trong mesh
  const hasNaN = mesh.positions.some((v) => !Number.isFinite(v));
  check(`${spec.name}: positions không NaN/Infinity`, !hasNaN);

  // 1. Manifold
  const v = validateManifold(mesh);
  if (!v.ok) {
    console.error(`  [${spec.name}] manifold problems:`);
    for (const p of v.problems) console.error(`    - ${p}`);
    console.error(
      `    stats: V=${v.stats.vertices} E=${v.stats.edges} F=${v.stats.triangles} χ=${v.stats.euler}`,
    );
  }
  check(`${spec.name}: validateManifold(mesh).ok`, v.ok);

  // 2. Thể tích mesh vs giải tích
  const volMesh = meshVolumeMm3(mesh);
  const volAnalytic = analyticTrayVolumeMm3(spec);
  const relDiff = Math.abs(volMesh - volAnalytic) / volAnalytic;
  check(
    `${spec.name}: |mesh−analytic|/analytic < 0.001`,
    relDiff < 0.001,
    `mesh=${volMesh.toFixed(3)} analytic=${volAnalytic.toFixed(3)} rel=${relDiff.toExponential(3)}`,
  );

  // 3. Bbox đúng (w, d, h) trong 1e-6
  const { min, max } = bbox(mesh);
  const bboxOk =
    Math.abs(min[0]) < 1e-6 && Math.abs(min[1]) < 1e-6 && Math.abs(min[2]) < 1e-6 &&
    Math.abs(max[0] - spec.w) < 1e-6 && Math.abs(max[1] - spec.d) < 1e-6 && Math.abs(max[2] - spec.h) < 1e-6;
  check(
    `${spec.name}: bbox === (w,d,h) trong 1e-6`,
    bboxOk,
    `min=[${min.map((x) => x.toExponential(2)).join(', ')}] max=[${max.join(', ')}] kỳ vọng (${spec.w}, ${spec.d}, ${spec.h})`,
  );

  // 4. STL round-trip
  const stlBuf = writeBinaryStl(mesh, spec.name);
  const parsed = parseBinaryStl(stlBuf);
  check(
    `${spec.name}: STL triCount === indices.length/3`,
    parsed.triCount === mesh.indices.length / 3,
    `stl=${parsed.triCount} mesh=${mesh.indices.length / 3}`,
  );
  const parsedNaN = parsed.positions.some((x) => !Number.isFinite(x));
  check(`${spec.name}: STL parse không NaN`, !parsedNaN);
  const volParsed = volumeFromFlatTris(parsed.positions);
  const stlRel = Math.abs(volParsed - volMesh) / Math.abs(volMesh);
  check(
    `${spec.name}: thể tích STL round-trip khớp 1e-6 tương đối`,
    stlRel < 1e-6,
    `parsed=${volParsed.toFixed(6)} mesh=${volMesh.toFixed(6)} rel=${stlRel.toExponential(3)}`,
  );

  return {
    result: {
      name: spec.name,
      triangles: mesh.indices.length / 3,
      volumeMeshMm3: volMesh,
      volumeAnalyticMm3: volAnalytic,
      diffPct: relDiff * 100,
      manifoldOk: v.ok,
    },
    stl: opts.stl ? stlBuf : undefined,
  };
}

// ---- 6 case cố định ------------------------------------------------------------
function fixedSpec(
  name: string, w: number, d: number, h: number,
  cols: number, rows: number, plug: boolean, drop: number,
): TraySpec {
  return {
    name, w, d, h,
    wallT: WALL_T, floorT: FLOOR_T, outerR: OUTER_R, pocketR: POCKET_R, arcSegs: ARC_SEGS,
    pockets: gridPockets(w, d, cols, rows, WALL_T),
    plug: plug ? { ...PLUG } : undefined,
    dividerDrop: drop,
  };
}

const CASES: TraySpec[] = [
  fixedSpec('don-1-o', 148, 98, 25, 1, 1, false, 0),
  fixedSpec('luoi-2x3', 170, 110, 35, 3, 2, false, 0), // 2 hàng × 3 cột
  fixedSpec('tang-tren', 176, 176, 27.8, 1, 1, true, 0), // 25 + 2.8 seat
  fixedSpec('tang-duoi', 176, 176, 35, 2, 2, false, DROP),
  fixedSpec('tang-giua', 150, 150, 37.8, 2, 1, true, DROP), // plug VÀ drop
  fixedSpec('24-o', 176, 140, 50, 6, 4, false, 0),
];

console.log('=== khay geometry integration test ===\n');
console.log('--- 6 case cố định ---');

const caseResults: CaseResult[] = [];
const stlFiles: { name: string; data: Uint8Array }[] = [];

for (const spec of CASES) {
  const { result, stl } = runCase(spec, { stl: true });
  caseResults.push(result);
  if (stl) stlFiles.push({ name: `${spec.name}.stl`, data: new Uint8Array(stl) });
}

// ---- Bảng kết quả ---------------------------------------------------------------
const pad = (s: string, n: number): string => s.padStart(n);
console.log('\n  case         tam giác     mm³ mesh    mm³ analytic    diff%      gram');
for (const r of caseResults) {
  console.log(
    `  ${r.name.padEnd(12)}${pad(String(r.triangles), 9)}${pad(r.volumeMeshMm3.toFixed(1), 13)}` +
      `${pad(r.volumeAnalyticMm3.toFixed(1), 16)}${pad(r.diffPct.toFixed(4), 9)}` +
      `${pad(((r.volumeMeshMm3 / 1000) * PLA_G_PER_CM3).toFixed(1), 10)}`,
  );
}

// ---- Property test: 20 spec pseudo-random (mulberry32 seed 42) -------------------
console.log('\n--- property test: 20 spec ngẫu nhiên (seed 42) ---');
const rnd = mulberry32(42);
for (let i = 0; i < 20; i++) {
  const w = 60 + rnd() * 116; // 60–176
  const d = 60 + rnd() * 116;
  const cols = 1 + Math.floor(rnd() * 4); // 1..4
  const rows = 1 + Math.floor(rnd() * 4);
  const plug = rnd() < 0.5;
  const drop = rnd() < 0.5 ? DROP : 0;
  const h = 20 + rnd() * 36; // đủ cao cho floorTop(+plug) < wallTop
  const spec = fixedSpec(`rand-${String(i).padStart(2, '0')}`, w, d, h, cols, rows, plug, drop);
  const { result } = runCase(spec);
  console.log(
    `  ${spec.name}  ${w.toFixed(1)}×${d.toFixed(1)}×${h.toFixed(1)}  ${cols}×${rows}` +
      `${plug ? ' +plug' : ''}${drop ? ' +drop' : ''}  diff=${result.diffPct.toFixed(5)}%` +
      `  ${result.manifoldOk ? 'ok' : 'MANIFOLD FAIL'}`,
  );
}

// ---- Ghi STL mẫu + ZIP -------------------------------------------------------------
mkdirSync(SAMPLES_DIR, { recursive: true });
const stlPaths: string[] = [];
for (const f of stlFiles) {
  const p = join(SAMPLES_DIR, f.name);
  writeFileSync(p, f.data);
  stlPaths.push(p);
}
const zipPath = join(SAMPLES_DIR, 'khay-samples.zip');
writeFileSync(zipPath, createZip(stlFiles));
console.log(`\nĐã ghi ${stlFiles.length} STL + ZIP vào ${SAMPLES_DIR}`);

// ---- Kết luận ------------------------------------------------------------------------
if (failCount > 0) {
  console.error(`\n✗ ${failCount} assertion FAIL`);
  process.exit(1);
}
console.log('\n✓ Tất cả assertion PASS (6 case cố định + 20 property)');
