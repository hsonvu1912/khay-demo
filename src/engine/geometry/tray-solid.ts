// =============================================================================
// tray-solid — dựng TriMesh watertight cho MỘT khay từ TraySpec.
//
// Cơ chế watertight: VERTEX POOL. Mỗi cặp (tham chiếu path, z) chỉ sinh đỉnh
// đúng MỘT lần (loopAt); mọi mặt (nắp/thành/vát) tham chiếu lại cùng bộ index
// → hai mặt kề nhau LUÔN chia sẻ đúng cạnh, không bao giờ có đỉnh trùng toạ
// độ mà khác index. Điều kiện bắt buộc: path dùng cho nắp tại z nào thì thành
// đứng tại z đó phải dùng CÙNG một tham chiếu mảng.
// =============================================================================

import type { TriMesh, TraySpec, Vec2 } from './types';
import earcut from './earcut';
import { roundedRectPath, insetRoundedRect, reversePath, MIN_R } from './rounded-rect';
import { triArea2 } from './vec';

/**
 * ε-inset cho pocket chạm biên lòng trong khi dividerDrop > 0: đẩy lỗ vào
 * trong 0.05mm để nắp đỉnh vách là polygon-with-holes HỢP LỆ (lỗ nằm hẳn
 * trong viền, không chạm) — lỗ chạm viền sẽ phá earcut và phá manifold.
 */
export const EPS_POCKET_INSET = 0.05;

/** Pocket đã quy về dạng tâm + kích thước + bán kính bo (đã clamp). */
export interface ResolvedPocket {
  cx: number;
  cy: number;
  w: number;
  d: number;
  r: number;
}

const EPS = 1e-6;

/**
 * Bo của ring lòng trong (nắp miệng khi hạ vách) = MIN(pocketR, bo các ô):
 * ring bo nhỏ hơn ⇒ ôm góc sát hơn ⇒ mọi lỗ ô (bo ≥ ring) nằm hẳn trong ring
 * — nắp đỉnh vách luôn hợp lệ kể cả khi ô ở góc bị clamp bo nhỏ hơn pocketR.
 * Dùng CHUNG bởi buildTraySolid và analyticTrayVolumeMm3 (phải khớp nhau).
 */
export function interiorRingR(pocketR: number, resolved: ResolvedPocket[]): number {
  return resolved.length ? Math.min(pocketR, ...resolved.map((p) => p.r)) : pocketR;
}

/**
 * Quy đổi PocketRect → ResolvedPocket: clamp r, ε-inset cạnh chạm biên lòng
 * trong (chỉ khi dividerDrop > 0), rồi kiểm tra lề wallT + khe hở giữa các ô.
 */
export function resolvePockets(spec: TraySpec): ResolvedPocket[] {
  const { w, d, wallT, dividerDrop } = spec;

  const boxes = spec.pockets.map((p, k) => {
    let { x0, y0, x1, y1 } = p;
    if (!(x1 - x0 > 0) || !(y1 - y0 > 0)) {
      throw new Error(`Pocket ${k}: kích thước không dương (x0=${x0}, x1=${x1}, y0=${y0}, y1=${y1}).`);
    }
    // r tính trên kích thước GỐC (trước ε-inset), floor MIN_R
    const r = Math.max(MIN_R, Math.min(spec.pocketR, (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01));
    if (dividerDrop > 0) {
      // Cạnh trùng biên lòng trong → thụt ε để lỗ không chạm viền nắp đỉnh vách
      if (Math.abs(x0 - wallT) < EPS) x0 += EPS_POCKET_INSET;
      if (Math.abs(x1 - (w - wallT)) < EPS) x1 -= EPS_POCKET_INSET;
      if (Math.abs(y0 - wallT) < EPS) y0 += EPS_POCKET_INSET;
      if (Math.abs(y1 - (d - wallT)) < EPS) y1 -= EPS_POCKET_INSET;
    }
    return { x0, y0, x1, y1, r };
  });

  // Lề tối thiểu wallT tính từ mép ngoài khay
  boxes.forEach((b, k) => {
    if (b.x0 < wallT - EPS || b.x1 > w - wallT + EPS || b.y0 < wallT - EPS || b.y1 > d - wallT + EPS) {
      throw new Error(
        `Pocket ${k}: lòng ô phải cách mép khay tối thiểu wallT=${wallT}mm ` +
          `(nhận [${b.x0}, ${b.y0}]–[${b.x1}, ${b.y1}] trong khay ${w}×${d}).`,
      );
    }
  });

  // Khe hở AABB từng cặp ≥ wallT (vách giữa 2 ô phải đủ dày)
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const gx = Math.max(b.x0 - a.x1, a.x0 - b.x1);
      const gy = Math.max(b.y0 - a.y1, a.y0 - b.y1);
      if (Math.max(gx, gy) < wallT - EPS) {
        throw new Error(
          `Pocket ${i} và ${j}: khe hở giữa 2 lòng ô là ${Math.max(gx, gy).toFixed(3)}mm, ` +
            `nhỏ hơn wallT=${wallT}mm.`,
        );
      }
    }
  }

  return boxes.map((b) => ({
    cx: (b.x0 + b.x1) / 2,
    cy: (b.y0 + b.y1) / 2,
    w: b.x1 - b.x0,
    d: b.y1 - b.y0,
    r: b.r,
  }));
}

/** Dựng khối đặc của khay: đáy (± plug/vát 45°) + thành ngoài + ô + vách hạ. */
export function buildTraySolid(spec: TraySpec): TriMesh {
  const { w, d, h, wallT, floorT, outerR, pocketR, arcSegs, plug, dividerDrop } = spec;

  if (plug && (plug.inset < 0 || plug.height <= 0 || plug.chamferH < 0)) {
    throw new Error(
      `Plug không hợp lệ (inset=${plug.inset}, height=${plug.height}, chamferH=${plug.chamferH}): ` +
        `height phải > 0, inset/chamferH phải ≥ 0.`,
    );
  }

  const resolved = resolvePockets(spec);

  // Bo góc ngoài quá lớn so với bo của lỗ ở góc → trên đường chéo góc hết vật
  // liệu, cung lỗ lòi ra NGOÀI cung viền, nắp vỡ manifold. Điều kiện an toàn
  // (suy từ khoảng cách 2 cung trên đường chéo): outerR ≤ rLỗ + (2+√2)·wallT.
  const CORNER_K = 2 + Math.SQRT2;
  const assertCornerClearance = (rHole: number, what: string): void => {
    if (outerR > rHole + CORNER_K * wallT - 0.01) {
      throw new Error(
        `Bo góc ngoài outerR=${outerR}mm quá lớn so với ${what} — tối đa ` +
          `${(rHole + CORNER_K * wallT).toFixed(1)}mm với vách ${wallT}mm. Giảm outerR hoặc tăng pocketR.`,
      );
    }
  };
  spec.pockets.forEach((p, k) => {
    const touchX = Math.abs(p.x0 - wallT) < EPS || Math.abs(p.x1 - (w - wallT)) < EPS;
    const touchY = Math.abs(p.y0 - wallT) < EPS || Math.abs(p.y1 - (d - wallT)) < EPS;
    if (touchX && touchY) assertCornerClearance(resolved[k].r, `bo lòng ô ${k} (${resolved[k].r.toFixed(1)}mm)`);
  });

  // --- Path 2D: mỗi path tạo ĐÚNG MỘT lần, giữ 1 tham chiếu duy nhất ---
  const outerSpec = { cx: w / 2, cy: d / 2, w, d, r: outerR, segs: arcSegs };
  const outer = roundedRectPath(outerSpec); // CCW
  const plugPath = plug ? insetRoundedRect(outerSpec, plug.inset) : null; // CCW, cùng số điểm với outer
  const pocketPaths = resolved.map((p) =>
    reversePath(roundedRectPath({ cx: p.cx, cy: p.cy, w: p.w, d: p.d, r: p.r, segs: arcSegs })),
  ); // CW (lỗ)
  const ringR = interiorRingR(pocketR, resolved);
  if (dividerDrop > 0) assertCornerClearance(ringR, `bo lòng viền trong (${ringR.toFixed(1)}mm)`);
  const interiorPath =
    dividerDrop > 0
      ? reversePath(
          roundedRectPath({ cx: w / 2, cy: d / 2, w: w - 2 * wallT, d: d - 2 * wallT, r: ringR, segs: arcSegs }),
        )
      : null; // CW (lỗ của nắp miệng)

  // --- Trạm Z ---
  const zPlugTop = plug ? plug.height : 0;
  const zChamTop = plug ? zPlugTop + plug.chamferH : 0;
  const floorBase = plug ? zChamTop : 0;
  const floorTop = floorBase + floorT;
  const wallTop = h - dividerDrop;
  const rim = h;
  if (!(floorTop < wallTop && wallTop <= rim)) {
    throw new Error(
      `Trạm Z không hợp lệ: cần floorTop (${floorTop}) < wallTop (${wallTop}) ≤ rim (${rim}) — ` +
        `kiểm tra lại h / floorT / dividerDrop / plug.`,
    );
  }

  const positions: number[] = [];
  const indices: number[] = [];

  // --- VERTEX POOL: (tham chiếu path, z) → index toàn cục, tạo 1 lần duy nhất ---
  const pool = new Map<readonly Vec2[], Map<number, number[]>>();
  function loopAt(path: readonly Vec2[], z: number): number[] {
    let byZ = pool.get(path);
    if (!byZ) {
      byZ = new Map();
      pool.set(path, byZ);
    }
    let loop = byZ.get(z);
    if (loop) return loop;
    loop = new Array<number>(path.length);
    for (let i = 0; i < path.length; i++) {
      loop[i] = positions.length / 3;
      positions.push(path[i][0], path[i][1], z);
    }
    byZ.set(z, loop);
    return loop;
  }

  /**
   * Dải mặt nối 2 loop CÙNG SỐ ĐIỂM, tương ứng đỉnh 1:1. pathLow === pathHigh
   * → thành đứng; khác nhau (plug → outer) → vát 45°. Path CCW cho pháp tuyến
   * hướng ra ngoài, path CW (lỗ) hướng vào lòng lỗ — đều là "ra khỏi vật liệu".
   */
  function zipBand(pathLow: readonly Vec2[], zLow: number, pathHigh: readonly Vec2[], zHigh: number): void {
    const a = loopAt(pathLow, zLow);
    const b = loopAt(pathHigh, zHigh);
    const n = pathLow.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(a[i], a[j], b[j]);
      indices.push(a[i], b[j], b[i]);
    }
  }

  /**
   * Nắp phẳng tại z: earcut viền + lỗ rồi remap về index pool. `ringReversed`
   * = duyệt viền theo chiều NGƯỢC khi đưa vào earcut (CW → CCW) nhưng vẫn map
   * về CÙNG loop của path gốc — nhờ vậy nắp đỉnh vách chia sẻ đỉnh với thành
   * trong mà không cần tạo mảng đảo chiều mới. `up`: true = pháp tuyến +Z.
   */
  function emitCap(z: number, up: boolean, ring: readonly Vec2[], ringReversed: boolean, holes: readonly (readonly Vec2[])[]): void {
    const flat: number[] = [];
    const map: number[] = [];
    const pushPath = (path: readonly Vec2[], reversed: boolean): void => {
      const loop = loopAt(path, z);
      const n = path.length;
      for (let k = 0; k < n; k++) {
        const i = reversed ? n - 1 - k : k;
        flat.push(path[i][0], path[i][1]);
        map.push(loop[i]);
      }
    };
    pushPath(ring, ringReversed);
    const holeStarts: number[] = [];
    let off = ring.length;
    for (const hole of holes) {
      holeStarts.push(off);
      pushPath(hole, false);
      off += hole.length;
    }
    const tris = earcut(flat, holeStarts.length ? holeStarts : undefined, 2);
    for (let t = 0; t < tris.length; t += 3) {
      let i0 = tris[t];
      let i1 = tris[t + 1];
      let i2 = tris[t + 2];
      const area = triArea2(
        [flat[2 * i0], flat[2 * i0 + 1]],
        [flat[2 * i1], flat[2 * i1 + 1]],
        [flat[2 * i2], flat[2 * i2 + 1]],
      );
      // Ép winding theo pháp tuyến mong muốn: +Z cần diện tích dương, −Z âm
      if (up ? area < 0 : area > 0) {
        const tmp = i1;
        i1 = i2;
        i2 = tmp;
      }
      indices.push(map[i0], map[i1], map[i2]);
    }
  }

  // 1. Nắp đáy z=0, pháp tuyến −Z (viền là plug nếu có, không lỗ)
  emitCap(0, false, plugPath ?? outer, false, []);

  // 2. Plug: thành plug 0→zPlugTop + vát 45° plug→outer (cùng số điểm, zip 1:1)
  if (plugPath) {
    zipBand(plugPath, 0, plugPath, zPlugTop);
    zipBand(plugPath, zPlugTop, outer, zChamTop);
  }

  // 3. Thành ngoài lên tới miệng
  zipBand(outer, plug ? zChamTop : 0, outer, rim);

  // 4 + 5. Từng ô: nắp đáy ô (+Z) + thành ô floorTop→wallTop
  for (const pp of pocketPaths) {
    emitCap(floorTop, true, pp, false, []);
    zipBand(pp, floorTop, pp, wallTop);
  }

  if (interiorPath) {
    // 6a. Nắp đỉnh vách tại wallTop: viền = interiorPath duyệt ngược (CCW), lỗ = các ô
    emitCap(wallTop, true, interiorPath, true, pocketPaths);
    // 6b. Thành trong wallTop→rim
    zipBand(interiorPath, wallTop, interiorPath, rim);
    // 6c. Nắp miệng tại rim: viền outer, lỗ interiorPath
    emitCap(rim, true, outer, false, [interiorPath]);
  } else {
    // 7. Không hạ vách: nắp miệng tại rim, lỗ = các ô
    emitCap(rim, true, outer, false, pocketPaths);
  }

  return { positions, indices };
}
