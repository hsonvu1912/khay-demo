// =============================================================================
// stl.ts — Ghi/đọc Binary STL (little-endian). Đơn vị mm theo hợp đồng types.ts
// (STL không có metadata đơn vị — slicer mặc định hiểu mm).
// Header KHÔNG được bắt đầu bằng "solid" (slicer sẽ nhận nhầm ASCII STL)
// → prefix "khay ".
// =============================================================================

import type { TriMesh, Vec3 } from './types';

const HEADER_BYTES = 80;
const TRI_BYTES = 50; // 12 f32 (normal + 3 đỉnh) + uint16 attribute

/** Pháp tuyến đơn vị của tam giác (a,b,c) theo winding; suy biến → [0,0,0]. */
function triNormal(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): Vec3 {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return [0, 0, 0];
  return [nx / len, ny / len, nz / len];
}

/** Xuất TriMesh → Binary STL. Giữ nguyên thứ tự winding của mesh. */
export function writeBinaryStl(mesh: TriMesh, name: string): ArrayBuffer {
  const triCount = mesh.indices.length / 3;
  const buf = new ArrayBuffer(HEADER_BYTES + 4 + triCount * TRI_BYTES);
  const view = new DataView(buf);

  // Header 80 byte: "khay <name>" ASCII, phần dư = 0 (ArrayBuffer đã zero sẵn).
  const header = new Uint8Array(buf, 0, HEADER_BYTES);
  const label = `khay ${name}`;
  for (let i = 0; i < Math.min(label.length, HEADER_BYTES); i++) {
    header[i] = label.charCodeAt(i) & 0x7f;
  }

  view.setUint32(HEADER_BYTES, triCount, true);

  const pos = mesh.positions;
  const idx = mesh.indices;
  let off = HEADER_BYTES + 4;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2];
    const bx = pos[i1], by = pos[i1 + 1], bz = pos[i1 + 2];
    const cx = pos[i2], cy = pos[i2 + 1], cz = pos[i2 + 2];

    const n = triNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    view.setFloat32(off, n[0], true);
    view.setFloat32(off + 4, n[1], true);
    view.setFloat32(off + 8, n[2], true);
    view.setFloat32(off + 12, ax, true);
    view.setFloat32(off + 16, ay, true);
    view.setFloat32(off + 20, az, true);
    view.setFloat32(off + 24, bx, true);
    view.setFloat32(off + 28, by, true);
    view.setFloat32(off + 32, bz, true);
    view.setFloat32(off + 36, cx, true);
    view.setFloat32(off + 40, cy, true);
    view.setFloat32(off + 44, cz, true);
    view.setUint16(off + 48, 0, true); // attribute byte count = 0
    off += TRI_BYTES;
  }
  return buf;
}

/**
 * Đọc ngược Binary STL (bỏ qua normal) → positions phẳng 9 số/tam giác theo
 * thứ tự trong file. Dùng cho test round-trip.
 */
export function parseBinaryStl(buf: ArrayBuffer): { triCount: number; positions: number[] } {
  const view = new DataView(buf);
  const triCount = view.getUint32(HEADER_BYTES, true);
  const positions: number[] = [];
  let off = HEADER_BYTES + 4;
  for (let t = 0; t < triCount; t++) {
    off += 12; // bỏ normal
    for (let k = 0; k < 9; k++) {
      positions.push(view.getFloat32(off, true));
      off += 4;
    }
    off += 2; // bỏ attribute
  }
  return { triCount, positions };
}
