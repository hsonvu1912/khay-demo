// Toán vector 2D/3D thuần — không phụ thuộc gì ngoài types.ts.

import type { Vec2, Vec3 } from './types';

/**
 * Diện tích shoelace CÓ DẤU của path đóng (không lặp điểm đầu ở cuối).
 * CCW (nhìn từ +Z) → dương. Dùng để assert winding trước khi dựng band.
 */
export function pathArea(path: Vec2[]): number {
  let sum = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = path[i];
    const [x1, y1] = path[(i + 1) % n];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/**
 * GẤP ĐÔI diện tích có dấu của tam giác a→b→c (cross 2D chuẩn "Area2").
 * >0 khi a→b→c CCW nhìn từ +Z. Đủ cho test hướng, khỏi chia 2.
 */
export function triArea2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
