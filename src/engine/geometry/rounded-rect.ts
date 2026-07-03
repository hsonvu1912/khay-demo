// Sinh path chữ nhật bo góc — nguồn duy nhất của mọi viền ngoài / lỗ pocket.

import type { Vec2 } from './types';

/** Sàn bán kính bo: tránh r=0 làm 4 điểm arc trùng toạ độ (vỡ weld mesh). */
export const MIN_R = 0.05;

export interface RoundedRectSpec {
  cx: number;
  cy: number;
  w: number;
  d: number;
  r: number;
  segs: number;
}

/** Kẹp r vào [MIN_R, w/2−0.01, d/2−0.01] — chừa 0.01 để 2 arc kề nhau không chạm. */
function clampR(w: number, d: number, r: number): number {
  return Math.max(MIN_R, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
}

/**
 * Path chữ nhật bo góc tâm (cx,cy), cỡ w×d, CCW nhìn từ +Z
 * (pathArea() > 0 — BẮT BUỘC, mọi module band dựa vào đó).
 * Mỗi cung 90° lấy (segs+1) điểm GỒM cả 2 đầu mút; 4 góc nối theo thứ tự
 * CCW: dưới-phải → trên-phải → trên-trái → dưới-trái. Cạnh thẳng ngầm định
 * giữa 2 cung liên tiếp, KHÔNG lặp điểm đầu ở cuối → đúng 4*(segs+1) điểm.
 * Thuần hàm theo spec: 2 lần gọi cùng spec cho mảng giống hệt nhau.
 */
export function roundedRectPath(s: RoundedRectSpec): Vec2[] {
  const r = clampR(s.w, s.d, s.r);
  const hw = s.w / 2 - r;
  const hd = s.d / 2 - r;
  // Tâm 4 cung theo thứ tự CCW, góc bắt đầu mỗi cung (quét +90° mỗi cung).
  const corners: Array<[number, number, number]> = [
    [s.cx + hw, s.cy - hd, -Math.PI / 2], // dưới-phải: −90° → 0°
    [s.cx + hw, s.cy + hd, 0],            // trên-phải:   0° → 90°
    [s.cx - hw, s.cy + hd, Math.PI / 2],  // trên-trái:  90° → 180°
    [s.cx - hw, s.cy - hd, Math.PI],      // dưới-trái: 180° → 270°
  ];
  const pts: Vec2[] = [];
  for (const [ax, ay, a0] of corners) {
    for (let i = 0; i <= s.segs; i++) {
      const t = a0 + (i / s.segs) * (Math.PI / 2);
      pts.push([ax + r * Math.cos(t), ay + r * Math.sin(t)]);
    }
  }
  return pts;
}

/**
 * Path thu vào `inset` mỗi phía, CÙNG segs → cùng số điểm và tương ứng
 * góc 1:1 với path chưa thu — tính chất này được dùng để "zip" vát 45°
 * giữa 2 loop (mỗi cặp điểm cùng index tạo 1 quad). r giảm đúng inset
 * để cung trong đồng tâm với cung ngoài (offset đều).
 */
export function insetRoundedRect(s: RoundedRectSpec, inset: number): Vec2[] {
  return roundedRectPath({
    ...s,
    w: s.w - 2 * inset,
    d: s.d - 2 * inset,
    r: Math.max(s.r - inset, MIN_R),
  });
}

/** Mảng MỚI đảo thứ tự — biến path CCW thành CW để làm lỗ. */
export function reversePath(p: Vec2[]): Vec2[] {
  const out = p.slice();
  out.reverse();
  return out;
}

/**
 * Diện tích giải tích w*d − (4−π)·r². r được kẹp cùng luật với
 * roundedRectPath để khớp diện tích path thực sinh ra (dùng đối chiếu test).
 */
export function roundedRectArea(w: number, d: number, r: number): number {
  const rc = clampR(w, d, r);
  return w * d - (4 - Math.PI) * rc * rc;
}
