// =============================================================================
// validateManifold — kiểm tra mesh kín/định hướng đúng TRƯỚC khi xuất STL.
// Gom TẤT CẢ lỗi (không dừng ở lỗi đầu). Chuẩn manifold dùng ở đây:
// mỗi cạnh CÓ HƯỚNG a→b xuất hiện đúng 1 lần và cạnh ngược b→a đúng 1 lần
// → mesh watertight + winding nhất quán. Kèm Euler χ=2 (genus 0) + volume>0.
// =============================================================================

import type { TriMesh, ValidateResult } from './types';

/** Số ví dụ tối đa liệt kê trong mỗi thông báo lỗi. */
const MAX_EXAMPLES = 3;

/** Diện tích tam giác dưới ngưỡng này (mm²) coi là suy biến. */
const DEGENERATE_AREA = 1e-9;

export function validateManifold(mesh: TriMesh): ValidateResult {
  const problems: string[] = [];
  const { positions, indices } = mesh;

  // ---- 1. Kiểm tra cấu trúc mảng ------------------------------------------
  if (positions.length % 3 !== 0) {
    problems.push(`positions.length=${positions.length} không chia hết cho 3`);
  }
  if (indices.length % 3 !== 0) {
    problems.push(`indices.length=${indices.length} không chia hết cho 3`);
  }

  let badCoordCount = 0;
  let firstBadCoord = -1;
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) {
      badCoordCount++;
      if (firstBadCoord < 0) firstBadCoord = i;
    }
  }
  if (badCoordCount > 0) {
    problems.push(
      `${badCoordCount} toạ độ NaN/Infinity (đầu tiên tại positions[${firstBadCoord}])`,
    );
  }

  const vCount = Math.floor(positions.length / 3);
  let badIndexCount = 0;
  let firstBadIndex = -1;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= vCount) {
      badIndexCount++;
      if (firstBadIndex < 0) firstBadIndex = i;
    }
  }
  if (badIndexCount > 0) {
    problems.push(
      `${badIndexCount} index ngoài phạm vi [0..${vCount - 1}] hoặc không nguyên ` +
        `(đầu tiên tại indices[${firstBadIndex}])`,
    );
  }

  // Chỉ các tam giác đủ 3 index hợp lệ mới vào được các bước hình học,
  // tránh NaN lan truyền khi cấu trúc đã hỏng.
  const tris: number[] = []; // phẳng [a,b,c, a,b,c, …]
  const triTotal = Math.floor(indices.length / 3);
  for (let t = 0; t < triTotal; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    if (
      Number.isInteger(a) && a >= 0 && a < vCount &&
      Number.isInteger(b) && b >= 0 && b < vCount &&
      Number.isInteger(c) && c >= 0 && c < vCount
    ) {
      tris.push(a, b, c);
    }
  }
  const triCount = tris.length / 3;

  if (triCount === 0) {
    problems.push('mesh rỗng (0 tam giác hợp lệ)');
  }

  // ---- 2. Tam giác suy biến -------------------------------------------------
  let degenCount = 0;
  const degenExamples: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = tris[t * 3] * 3;
    const b = tris[t * 3 + 1] * 3;
    const c = tris[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    if (!(area >= DEGENERATE_AREA)) {
      degenCount++;
      if (degenExamples.length < MAX_EXAMPLES) degenExamples.push(t);
    }
  }
  if (degenCount > 0) {
    problems.push(
      `${degenCount} tam giác suy biến (diện tích < ${DEGENERATE_AREA} mm²), ` +
        `vd tri #${degenExamples.join(', #')}`,
    );
  }

  // ---- 3. Cạnh có hướng ------------------------------------------------------
  // key = a * vCount + b (an toàn tới ~94 triệu đỉnh trong Number).
  const dirEdges = new Map<number, number>();
  for (let t = 0; t < triCount; t++) {
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p * vCount + q;
      dirEdges.set(key, (dirEdges.get(key) ?? 0) + 1);
    }
  }

  let boundaryCount = 0;
  const boundaryExamples: string[] = [];
  let multiCount = 0;
  const multiExamples: string[] = [];
  const undirected = new Set<number>();
  for (const [key, count] of dirEdges) {
    const a = Math.floor(key / vCount);
    const b = key % vCount;
    undirected.add(Math.min(a, b) * vCount + Math.max(a, b));
    if (count > 1) {
      multiCount++;
      if (multiExamples.length < MAX_EXAMPLES) multiExamples.push(`${a}→${b}×${count}`);
    }
    if (!dirEdges.has(b * vCount + a)) {
      boundaryCount++;
      if (boundaryExamples.length < MAX_EXAMPLES) boundaryExamples.push(`${a}→${b}`);
    }
  }
  if (multiCount > 0) {
    problems.push(
      `${multiCount} cạnh chia sẻ >2 mặt (cạnh có hướng lặp lại), vd ${multiExamples.join(', ')}`,
    );
  }
  if (boundaryCount > 0) {
    problems.push(
      `${boundaryCount} cạnh biên (không có cạnh ngược chiều), vd ${boundaryExamples.join(', ')}`,
    );
  }

  // ---- 4. Đỉnh trùng toạ độ (nguy cơ T-junction/seam) -----------------------
  // Builder phải share vertex theo index — 2 index khác nhau cùng (x,y,z)
  // đều được tam giác tham chiếu là dấu hiệu loop không share.
  const referenced = new Set<number>();
  for (let i = 0; i < tris.length; i++) referenced.add(tris[i]);

  const coordMap = new Map<string, number>();
  let dupCount = 0;
  const dupExamples: string[] = [];
  for (const idx of referenced) {
    const key = `${positions[idx * 3]},${positions[idx * 3 + 1]},${positions[idx * 3 + 2]}`;
    const first = coordMap.get(key);
    if (first === undefined) {
      coordMap.set(key, idx);
    } else {
      dupCount++;
      if (dupExamples.length < MAX_EXAMPLES) dupExamples.push(`${first}≡${idx}`);
    }
  }
  if (dupCount > 0) {
    problems.push(
      `${dupCount} cặp đỉnh trùng toạ độ nhưng khác index (nguy cơ T-junction), ` +
        `vd ${dupExamples.join(', ')}`,
    );
  }

  // ---- 5. Liên thông (union-find trên đỉnh được tham chiếu) -----------------
  const parent = new Array<number>(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (let t = 0; t < triCount; t++) {
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const roots = new Set<number>();
  for (const idx of referenced) roots.add(find(idx));
  if (triCount > 0 && roots.size !== 1) {
    problems.push(`mesh có ${roots.size} khối rời nhau (kỳ vọng 1)`);
  }

  // ---- 6. Đặc trưng Euler ----------------------------------------------------
  const V = referenced.size;
  const E = undirected.size;
  const F = triCount;
  const euler = V - E + F;
  if (euler !== 2) {
    problems.push(`Euler χ = V−E+F = ${V}−${E}+${F} = ${euler} (kỳ vọng 2 cho khối genus 0)`);
  }

  // ---- 7. Thể tích có dấu ----------------------------------------------------
  let vol6 = 0;
  for (let t = 0; t < triCount; t++) {
    const a = tris[t * 3] * 3;
    const b = tris[t * 3 + 1] * 3;
    const c = tris[t * 3 + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  const volume = vol6 / 6;
  if (triCount > 0 && !(volume > 0)) {
    problems.push(`mesh lộn trái (thể tích có dấu = ${volume.toFixed(3)} mm³, kỳ vọng > 0)`);
  }

  return {
    ok: problems.length === 0,
    problems,
    stats: { vertices: V, edges: E, triangles: F, euler },
  };
}
