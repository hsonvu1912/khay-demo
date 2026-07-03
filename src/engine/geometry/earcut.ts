// =============================================================================
// earcut.ts — port TypeScript của mapbox/earcut v2.2.4 (thuật toán giữ nguyên).
//
// Nguồn: https://github.com/mapbox/earcut — ISC License.
// Copyright (c) 2016, Mapbox
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
// Ear clipping trên danh sách liên kết vòng + hash đường cong z-order khi
// polygon lớn; lỗ được nối vào viền ngoài bằng cạnh cầu (bridge). KHÔNG được
// "đơn giản hoá" — độ bền trên polygon có lỗ là lý do tồn tại của file này.
// Quy ước khớp types.ts: outer CCW, holes CW (earcut tự đảo nếu input ngược).
// =============================================================================

/** Node của danh sách liên kết vòng đôi (theo chu vi) kèm liên kết z-order. */
class Node {
  /** Chỉ số vertex trong mảng input PHẲNG (bội của dim, không phải chỉ số điểm). */
  i: number;
  x: number;
  y: number;
  prev: Node;
  next: Node;
  /** Giá trị z-order; 0 = chưa tính (điểm đúng tại (minX,minY) tính lại — vô hại). */
  z: number;
  prevZ: Node | null;
  nextZ: Node | null;
  /** Đỉnh Steiner (ring lỗ suy biến 1 điểm) — filterPoints không được xoá. */
  steiner: boolean;

  constructor(i: number, x: number, y: number) {
    this.i = i;
    this.x = x;
    this.y = y;
    // prev/next luôn được insertNode/splitPolygon gán lại ngay sau khi tạo;
    // tự trỏ vào mình để thoả strict mà không cần null-check rải rác.
    this.prev = this;
    this.next = this;
    this.z = 0;
    this.prevZ = null;
    this.nextZ = null;
    this.steiner = false;
  }
}

/**
 * Triangulate polygon (có thể kèm lỗ).
 * @param vertices mảng phẳng [x0,y0, x1,y1, …]
 * @param holeIndices chỉ số ĐIỂM (không phải chỉ số float) nơi mỗi ring lỗ bắt đầu
 * @param dim số thành phần mỗi vertex (mặc định 2; thành phần >2 bị bỏ qua)
 * @returns mảng phẳng chỉ số ĐIỂM của các tam giác [a0,b0,c0, a1,b1,c1, …]
 */
export default function earcut(vertices: number[], holeIndices?: number[], dim: number = 2): number[] {
  const hasHoles = !!holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0] * dim : vertices.length;
  let outerNode: Node | null = linkedList(vertices, 0, outerLen, dim, true);
  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  let minX = 0;
  let minY = 0;
  let invSize = 0;

  if (hasHoles) outerNode = eliminateHoles(vertices, holeIndices, outerNode, dim);

  // Polygon đủ lớn mới đáng trả chi phí index z-order → tính bbox để scale toạ độ.
  if (vertices.length > 80 * dim) {
    minX = vertices[0];
    minY = vertices[1];
    let maxX = minX;
    let maxY = minY;

    for (let i = dim; i < outerLen; i += dim) {
      const x = vertices[i];
      const y = vertices[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // minX/minY/invSize dùng để đưa toạ độ về nguyên 15-bit cho z-order.
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

  return triangles;
}

/** Dựng danh sách liên kết vòng từ một ring; đảo chiều nếu winding sai. */
function linkedList(data: number[], start: number, end: number, dim: number, clockwise: boolean): Node | null {
  let last: Node | null = null;

  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (let i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
  } else {
    for (let i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
  }

  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }

  return last;
}

/** Xoá đỉnh trùng và đỉnh thẳng hàng (trừ Steiner). Trả về node còn sống. */
function filterPoints(start: Node | null, end?: Node | null): Node | null {
  if (!start) return start;
  if (!end) end = start;

  let p = start;
  let again: boolean;
  do {
    again = false;

    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);

  return end;
}

/** Vòng lặp chính: cắt tai từng cái; hết tai thì leo thang 3 nấc cứu hộ (pass). */
function earcutLinked(
  ear: Node | null,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
  pass: number,
): void {
  if (!ear) return;

  // Lần đầu + polygon lớn: xâu chuỗi node theo z-order để isEarHashed tra nhanh.
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

  // node giữ kiểu Node (không null) trong suốt vòng lặp — thay cho biến `ear`
  // bị tái gán Node|null trong bản gốc JS.
  let node: Node = ear;
  let stop: Node = ear;

  while (node.prev !== node.next) {
    const prev: Node = node.prev;
    const next: Node = node.next;

    if (invSize ? isEarHashed(node, minX, minY, invSize) : isEar(node)) {
      // Cắt tam giác tai (đổi chỉ số float → chỉ số điểm).
      triangles.push(prev.i / dim);
      triangles.push(node.i / dim);
      triangles.push(next.i / dim);

      removeNode(node);

      // Nhảy qua 1 đỉnh giúp giảm tam giác dăm (sliver).
      node = next.next;
      stop = next.next;

      continue;
    }

    node = next;

    // Đi hết vòng mà không còn tai nào → cứu hộ theo pass.
    if (node === stop) {
      if (!pass) {
        // Nấc 1: lọc đỉnh suy biến rồi thử lại.
        earcutLinked(filterPoints(node), triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        // Nấc 2: chữa các tự-cắt cục bộ nhỏ.
        const cured = cureLocalIntersections(filterPoints(node), triangles, dim);
        earcutLinked(cured, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        // Nấc 3 (cuối): bổ đôi polygon bằng một đường chéo hợp lệ.
        splitEarcut(node, triangles, dim, minX, minY, invSize);
      }

      break;
    }
  }
}

/** Đỉnh có phải tai hợp lệ: lồi và không chứa đỉnh nào khác bên trong. */
function isEar(ear: Node): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) return false; // đỉnh lõm (reflex) — không thể là tai

  const ax = a.x, bx = b.x, cx = c.x;
  const ay = a.y, by = b.y, cy = c.y;

  // bbox tam giác (viết tay thay Math.min/max cho nhanh — giữ nguyên bản gốc).
  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

  let p = c.next;
  while (p !== a) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.next;
  }

  return true;
}

/** Như isEar nhưng chỉ duyệt các node trong khoảng z-order của bbox tam giác. */
function isEarHashed(ear: Node, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) return false;

  const ax = a.x, bx = b.x, cx = c.x;
  const ay = a.y, by = b.y, cy = c.y;

  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

  // Khoảng z-order phủ bbox của tam giác.
  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);

  let p = ear.prevZ;
  let n = ear.nextZ;

  // Duyệt hai chiều đồng thời quanh ear.
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.prevZ;

    if (
      n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) return false;
    n = n.nextZ;
  }

  // Vét phần còn lại theo chiều z giảm dần.
  while (p && p.z >= minZ) {
    if (
      p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) return false;
    p = p.prevZ;
  }

  // Vét phần còn lại theo chiều z tăng dần.
  while (n && n.z <= maxZ) {
    if (
      n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) return false;
    n = n.nextZ;
  }

  return true;
}

/** Cắt các tam giác nhỏ do cạnh tự-cắt cục bộ tạo ra rồi vá lại vòng. */
function cureLocalIntersections(start: Node | null, triangles: number[], dim: number): Node | null {
  if (!start) return null;

  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;

    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim);
      triangles.push(p.i / dim);
      triangles.push(b.i / dim);

      // Bỏ 2 node dính giao cắt.
      removeNode(p);
      removeNode(p.next);

      p = start = b;
    }
    p = p.next;
  } while (p !== start);

  return filterPoints(p);
}

/** Cứu hộ cuối: tìm đường chéo hợp lệ bổ polygon làm đôi, earcut từng nửa. */
function splitEarcut(
  start: Node,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        // Bổ đôi qua đường chéo a-b.
        let c: Node | null = splitPolygon(a, b);

        // Lọc đỉnh thẳng hàng quanh vết cắt.
        const a2 = filterPoints(a, a.next);
        c = filterPoints(c, c.next);

        earcutLinked(a2, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

/** Nối tất cả ring lỗ vào viền ngoài bằng cạnh cầu → một polygon đơn. */
function eliminateHoles(data: number[], holeIndices: number[], outerNode: Node, dim: number): Node | null {
  const queue: Node[] = [];

  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim;
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (!list) continue; // ring rỗng — bản gốc JS sẽ crash, ta bỏ qua
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }

  queue.sort(compareX);

  // Xử lý lỗ từ trái sang phải.
  let result: Node | null = outerNode;
  for (let i = 0; i < queue.length; i++) {
    if (!result) break;
    result = eliminateHole(queue[i], result);
  }

  return result;
}

function compareX(a: Node, b: Node): number {
  return a.x - b.x;
}

/** Tìm cạnh cầu nối lỗ vào viền ngoài rồi split; trả về outer node còn hiệu lực. */
function eliminateHole(hole: Node, outerNode: Node): Node | null {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;

  const bridgeReverse = splitPolygon(bridge, hole);

  // Lọc đỉnh thẳng hàng quanh 2 mép vết cắt.
  const filteredBridge = filterPoints(bridge, bridge.next);
  filterPoints(bridgeReverse, bridgeReverse.next);

  // outerNode có thể vừa bị filter xoá → trả node thay thế.
  return outerNode === bridge ? filteredBridge : outerNode;
}

/** David Eberly: tìm đỉnh viền ngoài nhìn thấy điểm trái-nhất của lỗ. */
function findHoleBridge(hole: Node, outerNode: Node): Node | null {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: Node | null = null;

  // Bắn tia sang trái từ điểm lỗ; đoạn nào bị cắt thì đầu mút x nhỏ hơn là
  // điểm nối tiềm năng.
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m; // lỗ chạm đúng cạnh ngoài — nối luôn
      }
    }
    p = p.next;
  } while (p !== outerNode);

  if (!m) return null;

  // Kiểm tam giác (điểm lỗ, giao điểm tia, đầu mút): nếu có đỉnh khác nằm trong
  // thì chọn đỉnh có góc với tia nhỏ nhất làm điểm nối (đảm bảo không cắt cạnh).
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;

  p = m;

  do {
    if (
      hx >= p.x && p.x >= mx && hx !== p.x &&
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)
    ) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);

      if (
        locallyInside(p, hole) &&
        (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))
      ) {
        m = p;
        tanMin = tan;
      }
    }

    p = p.next;
  } while (p !== stop);

  return m;
}

/** Quạt (sector) tại m có chứa quạt tại p không (m, p trùng toạ độ). */
function sectorContainsSector(m: Node, p: Node): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

/** Gán z-order cho từng node và sort danh sách z bằng merge sort. */
function indexCurve(start: Node, minX: number, minY: number, invSize: number): void {
  let p = start;
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);

  // Cắt vòng thành danh sách thẳng trước khi sort (prevZ vừa gán, chắc chắn non-null).
  p.prevZ!.nextZ = null;
  p.prevZ = null;

  sortLinked(p);
}

/** Merge sort danh sách liên kết theo z (Simon Tatham) — O(n log n), không đệ quy. */
function sortLinked(list: Node | null): Node | null {
  let numMerges: number;
  let inSize = 1;

  do {
    let p = list;
    list = null;
    let tail: Node | null = null;
    numMerges = 0;

    while (p) {
      numMerges++;
      let q: Node | null = p;
      let pSize = 0;
      for (let i = 0; i < inSize; i++) {
        pSize++;
        q = q.nextZ;
        if (!q) break;
      }
      let qSize = inSize;

      while (pSize > 0 || (qSize > 0 && q)) {
        let e: Node;
        // pSize > 0 ⇒ p non-null (bất biến của thuật toán, TS không tự suy được).
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p!;
          p = p!.nextZ;
          pSize--;
        } else {
          e = q!;
          q = q!.nextZ;
          qSize--;
        }

        if (tail) tail.nextZ = e;
        else list = e;

        e.prevZ = tail;
        tail = e;
      }

      p = q;
    }

    if (tail) tail.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);

  return list;
}

/** Toạ độ → z-order (Morton code) trên lưới nguyên 15-bit. */
function zOrder(x: number, y: number, minX: number, minY: number, invSize: number): number {
  // Interleave bit x, y sau khi đưa về khoảng nguyên không âm 15-bit.
  let ix = ((x - minX) * invSize) | 0;
  let iy = ((y - minY) * invSize) | 0;

  ix = (ix | (ix << 8)) & 0x00ff00ff;
  ix = (ix | (ix << 4)) & 0x0f0f0f0f;
  ix = (ix | (ix << 2)) & 0x33333333;
  ix = (ix | (ix << 1)) & 0x55555555;

  iy = (iy | (iy << 8)) & 0x00ff00ff;
  iy = (iy | (iy << 4)) & 0x0f0f0f0f;
  iy = (iy | (iy << 2)) & 0x33333333;
  iy = (iy | (iy << 1)) & 0x55555555;

  return ix | (iy << 1);
}

/** Đỉnh trái-nhất của một ring (tie-break theo y để ổn định). */
function getLeftmost(start: Node): Node {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);

  return leftmost;
}

function pointInTriangle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  px: number, py: number,
): boolean {
  return (
    (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
    (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
    (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0
  );
}

/** Đường chéo a-b có hợp lệ: không cắt cạnh nào và nằm trong lòng polygon. */
function isValidDiagonal(a: Node, b: Node): boolean {
  return (
    a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // không cắt cạnh khác
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // nhìn thấy nhau cục bộ
      (area(a.prev, a, b) !== 0 || area(a, b, b.next) !== 0)) || // không tạo 2 quạt đối đỉnh
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0)) // case độ dài 0
  );
}

/** Diện tích có dấu ×2 của tam giác pqr (>0 = CW theo quy ước earcut). */
function area(p: Node, q: Node, r: Node): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p1: Node, p2: Node): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

/** Hai đoạn p1q1 và p2q2 có cắt nhau không (gồm cả case thẳng hàng chồng nhau). */
function intersects(p1: Node, q1: Node, p2: Node, q2: Node): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));

  if (o1 !== o2 && o3 !== o4) return true; // case tổng quát

  if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p2 thẳng hàng và nằm trên p1q1
  if (o2 === 0 && onSegment(p1, q2, q1)) return true; // q2 thẳng hàng và nằm trên p1q1
  if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p1 thẳng hàng và nằm trên p2q2
  if (o4 === 0 && onSegment(p2, q1, q2)) return true; // q1 thẳng hàng và nằm trên p2q2

  return false;
}

/** q (đã biết thẳng hàng với pr) có nằm trong bbox đoạn pr không. */
function onSegment(p: Node, q: Node, r: Node): boolean {
  return (
    q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
  );
}

function sign(num: number): number {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}

/** Đoạn a-b có cắt cạnh nào của polygon không (bỏ qua cạnh kề a, b). */
function intersectsPolygon(a: Node, b: Node): boolean {
  let p = a;
  do {
    if (
      p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
      intersects(p, p.next, a, b)
    ) return true;
    p = p.next;
  } while (p !== a);

  return false;
}

/** Đoạn a-b có nằm phía trong polygon xét cục bộ tại đỉnh a không. */
function locallyInside(a: Node, b: Node): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

/** Trung điểm a-b có nằm trong polygon không (ray casting). */
function middleInside(a: Node, b: Node): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (
      p.y > py !== p.next.y > py && p.next.y !== p.y &&
      px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x
    ) inside = !inside;
    p = p.next;
  } while (p !== a);

  return inside;
}

/**
 * Nối polygon với chính nó (khi a, b thuộc cùng ring) hoặc nối lỗ vào viền
 * ngoài (khác ring) qua cạnh cầu a-b; sinh 2 node bản sao a2/b2 cho mép kia
 * của vết cắt. Trả về b2 (node trên nửa mới).
 */
function splitPolygon(a: Node, b: Node): Node {
  const a2 = new Node(a.i, a.x, a.y);
  const b2 = new Node(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;

  a.next = b;
  b.prev = a;

  a2.next = an;
  an.prev = a2;

  b2.next = a2;
  a2.prev = b2;

  bp.next = b2;
  b2.prev = bp;

  return b2;
}

/** Chèn node mới sau `last` (hoặc khởi tạo vòng mới nếu last = null). */
function insertNode(i: number, x: number, y: number, last: Node | null): Node {
  const p = new Node(i, x, y);

  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: Node): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;

  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

/** Diện tích có dấu ×2 của một ring trong mảng phẳng (>0 = CW). */
function signedArea(data: number[], start: number, end: number, dim: number): number {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

/**
 * Sai lệch tương đối giữa tổng diện tích tam giác và diện tích polygon —
 * metric sanity-check của thư viện gốc (0 = triangulation phủ kín hoàn hảo).
 */
export function deviation(
  vertices: number[],
  holeIndices: number[] | undefined,
  dim: number,
  triangles: number[],
): number {
  const hasHoles = !!holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0] * dim : vertices.length;

  let polygonArea = Math.abs(signedArea(vertices, 0, outerLen, dim));
  if (hasHoles) {
    for (let i = 0, len = holeIndices.length; i < len; i++) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : vertices.length;
      polygonArea -= Math.abs(signedArea(vertices, start, end, dim));
    }
  }

  let trianglesArea = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * dim;
    const b = triangles[i + 1] * dim;
    const c = triangles[i + 2] * dim;
    trianglesArea += Math.abs(
      (vertices[a] - vertices[c]) * (vertices[b + 1] - vertices[a + 1]) -
        (vertices[a] - vertices[b]) * (vertices[c + 1] - vertices[a + 1]),
    );
  }

  return polygonArea === 0 && trianglesArea === 0 ? 0 : Math.abs((trianglesArea - polygonArea) / polygonArea);
}
